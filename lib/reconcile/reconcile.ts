import { classifyCharge, type ChargeKind } from '@/lib/reconcile/charges';
import { foldName, normaliseName, type NormalisedName } from '@/lib/reconcile/normalise';
import { nameSimilarity, tokenWeights, type TokenWeight } from '@/lib/reconcile/similarity';

/**
 * Comparing what was noted during the meal against what the receipt says.
 *
 * The table keeps its own tab — items typed as they are ordered — and the paper
 * arrives at the end. Neither replaces the other. The receipt is what is being
 * charged, so it settles every figure; the tab is what people have already
 * ticked, so it holds every claim. Reconciling means keeping the tab's rows and
 * teaching them the receipt's numbers, and showing a human everything the two
 * disagree about.
 *
 * Two shapes force the whole design:
 *
 *  - **Matching is set to set, never row to row.** Adding an item by hand makes
 *    one row per drink, so a round of three beers is three rows; the till
 *    prints one line reading `3 x 8,00`. Some tills do the opposite. So both
 *    sides are grouped by product and compared as quantities and totals.
 *
 *  - **Claims hang off `bill_items.id`.** Deleting a row to replace it with the
 *    receipt's version silently deletes what somebody picked. Nothing here ever
 *    proposes that; a matched group keeps its tab rows.
 *
 * Nothing in this file talks to the network or the database, and nothing here
 * decides money. It proposes; a person confirms; the confirmed decisions become
 * ordinary item writes, and Postgres computes every total as it always has.
 */

export type TabLine = {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /**
   * Units guests have already claimed on this row. Purely advisory here, and
   * the reason a surplus is not removed by default when somebody owns it.
   */
  claimedUnits?: number;
};

export type ReceiptLine = {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /**
   * What the scanner said this is — "bere" for a URSUS.
   *
   * A receipt prints brands; the person keeping the tab typed a category. When
   * the two share no word at all, this is the only thing linking them, and it
   * is treated as a reason to *ask* rather than a reason to decide.
   */
  kind?: string;
};

export type ReconKind =
  | 'agreed'
  | 'price_differs'
  | 'quantity_differs'
  | 'only_on_receipt'
  | 'only_on_tab'
  | 'ambiguous'
  | 'not_an_item';

export type DecisionId =
  | 'keep'
  | 'take_receipt'
  | 'keep_tab'
  | 'add_to_bill'
  | 'remove_from_bill'
  | 'keep_on_bill'
  | 'route_to_service'
  | 'route_to_tip'
  | 'match_by_hand'
  | 'ignore';

export type ReconGroup = {
  key: string;
  kind: ReconKind;
  /** What this group is about, in the words the human will recognise. */
  label: string;
  tab: TabLine[];
  receipt: ReceiptLine[];
  tabQuantity: number;
  receiptQuantity: number;
  tabTotalCents: number;
  receiptTotalCents: number;
  /** What settling in the receipt's favour does to the bill. Negative takes money off. */
  deltaCents: number;
  /** Units on the tab that guests have already claimed. */
  claimedUnits: number;
  /** Units on the tab the receipt does not account for. */
  surplusUnits: number;
  /** Units on the receipt the tab never noted. */
  missingUnits: number;
  /** `likely` means the match itself is a guess, not just the numbers. */
  confidence: 'certain' | 'likely';
  /** False only for a group that is both certain and in agreement. */
  needsAnswer: boolean;
  charge?: ChargeKind;
  decisions: DecisionId[];
  defaultDecision: DecisionId;
  /** Why this one cannot simply be waved through, when that is the case. */
  note?: string;
};

export type Reconciliation = {
  groups: ReconGroup[];
  /** Sum of the tab's own rows, as they stand now. */
  tabTotalCents: number;
  /** Sum of the receipt's product lines. Charges are counted separately. */
  receiptTotalCents: number;
  /** Service, tip, packaging and anything else that is not an ordered item. */
  chargesTotalCents: number;
  /** The total printed on the paper, when the caller has read one. */
  printedTotalCents: number | null;
  /** How many groups a human still has to answer for. */
  needsDecision: number;
  agreedCount: number;
};

/**
 * Above this a match is taken as fact; below `POSSIBLE` it is not a match at
 * all. In between is where the app asks, and that band exists because the
 * alternative — picking the higher score and moving on — is how "vin" ends up
 * silently attached to the Chardonnay instead of the house red.
 */
const CONFIDENT = 0.75;
const POSSIBLE = 0.45;

/**
 * A receipt prints line totals and the bill stores unit prices, so a line that
 * does not divide evenly cannot round-trip: `3 x 8,33` is 24.99 or 25.01, never
 * 25.00. One cent per unit is that rounding, not a disagreement.
 */
function priceTolerance(quantity: number) {
  return Math.max(2, quantity);
}

function totalOf(lines: { quantity: number; unitPriceCents: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

function quantityOf(lines: { quantity: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Union-find over one combined index space: tab lines first, then receipt lines. */
function componentsAbove(
  score: number[][],
  tabCount: number,
  receiptCount: number,
  threshold: number,
  usedTab: Set<number>,
  usedReceipt: Set<number>
) {
  const parent = Array.from({ length: tabCount + receiptCount }, (_, i) => i);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < tabCount; i++) {
    if (usedTab.has(i)) continue;
    for (let j = 0; j < receiptCount; j++) {
      if (usedReceipt.has(j)) continue;
      if (score[i][j] >= threshold) union(i, tabCount + j);
    }
  }

  const found = new Map<number, { tab: number[]; receipt: number[] }>();

  for (let i = 0; i < tabCount; i++) {
    if (usedTab.has(i)) continue;
    const root = find(i);
    if (!found.has(root)) found.set(root, { tab: [], receipt: [] });
    found.get(root)!.tab.push(i);
  }
  for (let j = 0; j < receiptCount; j++) {
    if (usedReceipt.has(j)) continue;
    const root = find(tabCount + j);
    if (!found.has(root)) found.set(root, { tab: [], receipt: [] });
    found.get(root)!.receipt.push(j);
  }

  return [...found.values()].filter(
    (component) => component.tab.length > 0 && component.receipt.length > 0
  );
}

/**
 * True when every line on one side of a group is confidently the same product
 * as every other.
 *
 * This is what catches the case the grouping cannot: a tab holding a bare "vin"
 * pulls in both "VIN ALB" and "VIN ROSU", because it genuinely matches both.
 * The component is real; what is not real is the idea that we know which one
 * was drunk.
 */
function internallyConsistent(names: NormalisedName[], weightOf: TokenWeight) {
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (nameSimilarity(names[i], names[j], weightOf) < CONFIDENT) return false;
    }
  }
  return true;
}

/** Clusters one side's leftovers among themselves, so three stray beers read as one row. */
function clusterWithin(names: NormalisedName[], indices: number[], weightOf: TokenWeight) {
  const clusters: number[][] = [];

  for (const index of indices) {
    const home = clusters.find((cluster) =>
      cluster.every((other) => nameSimilarity(names[index], names[other], weightOf) >= CONFIDENT)
    );
    if (home) home.push(index);
    else clusters.push([index]);
  }

  return clusters;
}

function describe(tab: TabLine[], receipt: ReceiptLine[]) {
  // The printed name is the fuller one and the one that will be on the paper in
  // the reader's hand, so it leads whenever there is one.
  return receipt[0]?.name ?? tab[0]?.name ?? '';
}

function decideMatched(group: {
  kind: ReconKind;
  surplusUnits: number;
  claimedUnits: number;
  tabQuantity: number;
  confidence: 'certain' | 'likely';
}): Pick<ReconGroup, 'decisions' | 'defaultDecision' | 'note'> {
  if (group.kind === 'ambiguous') {
    // Taking the receipt here means replacing the vague tab row with the
    // printed lines, which cannot be done over a claim — the row somebody
    // ticked would have to go. So it is only offered when nothing is on it.
    return {
      decisions:
        group.claimedUnits === 0
          ? ['match_by_hand', 'take_receipt', 'keep_tab']
          : ['match_by_hand', 'keep_tab'],
      defaultDecision: 'match_by_hand',
      note:
        group.claimedUnits === 0
          ? 'The tab does not say which of these was ordered.'
          : 'The tab does not say which of these was ordered, and somebody has already claimed it. Sort it out on the bill.',
    };
  }

  // A guessed match must be confirmed as a match before any number follows from
  // it. Offering "take the receipt" as the default here would settle a price on
  // the strength of a maybe, and offering "keep the tab" settles it just as
  // firmly in the other direction — a wrong guess is wrong money either way.
  if (group.confidence === 'likely') {
    return {
      decisions: ['match_by_hand', 'take_receipt', 'keep_tab'],
      defaultDecision: 'match_by_hand',
      note: 'These look like the same thing, but the names are not close enough to be sure.',
    };
  }

  if (group.kind === 'agreed') {
    return { decisions: ['keep'], defaultDecision: 'keep' };
  }

  // Removing a surplus unit that somebody has already ticked rewrites their
  // share without them. Only propose it when there are spare unclaimed units to
  // take it out of.
  const spare = group.tabQuantity - group.claimedUnits;
  if (group.surplusUnits > 0 && group.surplusUnits > spare) {
    return {
      decisions: ['take_receipt', 'keep_tab'],
      defaultDecision: 'keep_tab',
      note: 'The receipt charges for fewer of these than were claimed. Removing one takes it off somebody.',
    };
  }

  return { decisions: ['take_receipt', 'keep_tab'], defaultDecision: 'take_receipt' };
}

function decideCharge(kind: ChargeKind): Pick<ReconGroup, 'decisions' | 'defaultDecision' | 'note'> {
  switch (kind) {
    case 'service':
      return {
        decisions: ['route_to_service', 'add_to_bill', 'ignore'],
        defaultDecision: 'route_to_service',
        note: 'The bill has its own service field; adding it as an item would count it twice.',
      };
    case 'tip':
      return {
        decisions: ['route_to_tip', 'ignore'],
        defaultDecision: 'route_to_tip',
        note: 'The tip is split by headcount, not claimed.',
      };
    case 'packaging':
      return {
        decisions: ['add_to_bill', 'ignore'],
        defaultDecision: 'add_to_bill',
        note: 'A deposit is real money on the bill. Added as a shared line, so it divides between everyone.',
      };
    case 'discount':
      return {
        decisions: ['ignore'],
        defaultDecision: 'ignore',
        note: 'An item cannot cost less than nothing. Settle this on the bill total instead.',
      };
    case 'total_line':
      return {
        decisions: ['ignore'],
        defaultDecision: 'ignore',
        note: 'This is part of the receipt’s totals block, not something anybody ordered.',
      };
  }
}

/** Groups needing an answer come first, biggest money first within that. */
const ORDER: Record<ReconKind, number> = {
  ambiguous: 0,
  quantity_differs: 1,
  only_on_receipt: 2,
  only_on_tab: 3,
  price_differs: 4,
  not_an_item: 5,
  agreed: 6,
};

export function reconcile(
  tab: TabLine[],
  receipt: ReceiptLine[],
  options: { printedTotalCents?: number | null } = {}
): Reconciliation {
  const charges: { line: ReceiptLine; kind: ChargeKind }[] = [];
  const products: ReceiptLine[] = [];

  for (const line of receipt) {
    const kind = classifyCharge(foldName(line.name), line.unitPriceCents);
    if (kind) charges.push({ line, kind });
    else products.push(line);
  }

  const tabNames = tab.map((line) => normaliseName(line.name));
  const receiptNames = products.map((line) => normaliseName(line.name, line.kind));
  const weightOf = tokenWeights([...tabNames, ...receiptNames]);

  const score = tabNames.map((left) =>
    receiptNames.map((right) => nameSimilarity(left, right, weightOf))
  );

  const groups: ReconGroup[] = [];
  const usedTab = new Set<number>();
  const usedReceipt = new Set<number>();

  // Certain matches first, so a confident pairing is never stolen by a
  // speculative one that happened to be considered earlier.
  for (const [threshold, confidence] of [
    [CONFIDENT, 'certain'],
    [POSSIBLE, 'likely'],
  ] as const) {
    for (const component of componentsAbove(
      score,
      tab.length,
      products.length,
      threshold,
      usedTab,
      usedReceipt
    )) {
      const tabLines = component.tab.map((i) => tab[i]);
      const receiptLines = component.receipt.map((j) => products[j]);

      const tabQuantity = quantityOf(tabLines);
      const receiptQuantity = quantityOf(receiptLines);
      const tabTotalCents = totalOf(tabLines);
      const receiptTotalCents = totalOf(receiptLines);
      const claimedUnits = tabLines.reduce((sum, line) => sum + (line.claimedUnits ?? 0), 0);

      const consistent =
        internallyConsistent(
          component.tab.map((i) => tabNames[i]),
          weightOf
        ) &&
        internallyConsistent(
          component.receipt.map((j) => receiptNames[j]),
          weightOf
        );

      let kind: ReconKind;
      if (!consistent) kind = 'ambiguous';
      else if (tabQuantity !== receiptQuantity) kind = 'quantity_differs';
      else if (Math.abs(receiptTotalCents - tabTotalCents) > priceTolerance(receiptQuantity))
        kind = 'price_differs';
      else kind = 'agreed';

      const surplusUnits = Math.max(0, tabQuantity - receiptQuantity);
      const missingUnits = Math.max(0, receiptQuantity - tabQuantity);

      groups.push({
        key: `m:${tabLines.map((l) => l.id).join(',')}|${receiptLines.map((l) => l.id).join(',')}`,
        kind,
        label: describe(tabLines, receiptLines),
        tab: tabLines,
        receipt: receiptLines,
        tabQuantity,
        receiptQuantity,
        tabTotalCents,
        receiptTotalCents,
        deltaCents: receiptTotalCents - tabTotalCents,
        claimedUnits,
        surplusUnits,
        missingUnits,
        confidence,
        needsAnswer: kind !== 'agreed' || confidence === 'likely',
        ...decideMatched({ kind, surplusUnits, claimedUnits, tabQuantity, confidence }),
      });

      component.tab.forEach((i) => usedTab.add(i));
      component.receipt.forEach((j) => usedReceipt.add(j));
    }
  }

  const strayTab = tab.map((_, i) => i).filter((i) => !usedTab.has(i));
  for (const cluster of clusterWithin(tabNames, strayTab, weightOf)) {
    const lines = cluster.map((i) => tab[i]);
    const claimedUnits = lines.reduce((sum, line) => sum + (line.claimedUnits ?? 0), 0);
    const tabTotalCents = totalOf(lines);

    groups.push({
      key: `t:${lines.map((l) => l.id).join(',')}`,
      kind: 'only_on_tab',
      label: describe(lines, []),
      tab: lines,
      receipt: [],
      tabQuantity: quantityOf(lines),
      receiptQuantity: 0,
      tabTotalCents,
      receiptTotalCents: 0,
      deltaCents: -tabTotalCents,
      claimedUnits,
      surplusUnits: quantityOf(lines),
      missingUnits: 0,
      confidence: 'certain',
      needsAnswer: true,
      // Removing a row a guest has claimed is refused by the database, and
      // offering a button that always fails is worse than not offering it.
      decisions: claimedUnits === 0 ? ['remove_from_bill', 'keep_on_bill'] : ['keep_on_bill'],
      // Nothing claimed means nobody loses anything and the restaurant is not
      // charging for it either, so it goes. Once somebody has ticked it,
      // removing it silently rewrites their share — and a line missing from the
      // paper is just as likely to be a line the scan missed.
      defaultDecision: claimedUnits === 0 ? 'remove_from_bill' : 'keep_on_bill',
      note:
        claimedUnits === 0
          ? 'Noted during the meal but not on the receipt.'
          : 'Not on the receipt, but somebody has already claimed it. Check the paper before removing it.',
    });
  }

  const strayReceipt = products.map((_, j) => j).filter((j) => !usedReceipt.has(j));
  for (const cluster of clusterWithin(receiptNames, strayReceipt, weightOf)) {
    const lines = cluster.map((j) => products[j]);
    const receiptTotalCents = totalOf(lines);

    groups.push({
      key: `r:${lines.map((l) => l.id).join(',')}`,
      kind: 'only_on_receipt',
      label: describe([], lines),
      tab: [],
      receipt: lines,
      tabQuantity: 0,
      receiptQuantity: quantityOf(lines),
      tabTotalCents: 0,
      receiptTotalCents,
      deltaCents: receiptTotalCents,
      claimedUnits: 0,
      surplusUnits: 0,
      missingUnits: quantityOf(lines),
      confidence: 'certain',
      needsAnswer: true,
      decisions: ['add_to_bill', 'ignore'],
      defaultDecision: 'add_to_bill',
      note: 'On the receipt, never noted on the tab.',
    });
  }

  for (const { line, kind } of charges) {
    groups.push({
      key: `c:${line.id}`,
      kind: 'not_an_item',
      label: line.name,
      tab: [],
      receipt: [line],
      tabQuantity: 0,
      receiptQuantity: line.quantity,
      tabTotalCents: 0,
      receiptTotalCents: line.quantity * line.unitPriceCents,
      deltaCents: line.quantity * line.unitPriceCents,
      claimedUnits: 0,
      surplusUnits: 0,
      missingUnits: 0,
      confidence: 'certain',
      needsAnswer: true,
      charge: kind,
      ...decideCharge(kind),
    });
  }

  groups.sort(
    (a, b) => ORDER[a.kind] - ORDER[b.kind] || Math.abs(b.deltaCents) - Math.abs(a.deltaCents)
  );

  return {
    groups,
    tabTotalCents: totalOf(tab),
    receiptTotalCents: totalOf(products),
    chargesTotalCents: charges.reduce(
      (sum, charge) => sum + charge.line.quantity * charge.line.unitPriceCents,
      0
    ),
    printedTotalCents: options.printedTotalCents ?? null,
    needsDecision: groups.filter((group) => group.needsAnswer).length,
    agreedCount: groups.filter((group) => !group.needsAnswer).length,
  };
}
