/**
 * Every shape a receipt and a tab can disagree in, run against the matcher.
 *
 * This is the specification, not a smoke test. Each case here is a thing that
 * actually happens at a table — a round typed as three rows and printed as one
 * line, a beer that was poured but never charged, a bare "vin" against a red
 * and a white — and the expectation is the behaviour that case is owed. When a
 * case fails, read the case before touching the thresholds: the last time an
 * expectation was bent to make the code pass, the test was measuring its own
 * bug.
 *
 *   npm run check:reconcile
 *
 * Nothing imports this file, so it never reaches the bundle.
 */
import { planReconciliation, type ApplyPlan } from '@/lib/reconcile/plan';
import {
  reconcile,
  type DecisionId,
  type ReconGroup,
  type ReconKind,
  type ReceiptLine,
  type TabLine,
} from '@/lib/reconcile/reconcile';

let seq = 0;
const t = (name: string, quantity = 1, unitPriceCents = 0, claimedUnits = 0): TabLine => ({
  id: `t${++seq}`, name, quantity, unitPriceCents, claimedUnits,
});
const r = (name: string, quantity = 1, unitPriceCents = 0, kind?: string): ReceiptLine => ({
  id: `r${++seq}`, name, quantity, unitPriceCents, kind,
});

let passed = 0;
let failed = 0;

function scenario(
  title: string,
  tab: TabLine[],
  receipt: ReceiptLine[],
  expect: (g: ReconGroup[]) => [string, boolean][]
) {
  const result = reconcile(tab, receipt);
  const checks = expect(result.groups);
  const bad = checks.filter(([, ok]) => !ok);

  if (bad.length === 0) {
    passed++;
    console.log(`  ok   ${title}`);
  } else {
    failed++;
    console.log(`  FAIL ${title}`);
    for (const [what] of bad) console.log(`         expected: ${what}`);
    for (const g of result.groups) {
      console.log(
        `         [${g.kind}/${g.confidence}] "${g.label}" tab ${g.tabQuantity}×=${g.tabTotalCents} ` +
          `receipt ${g.receiptQuantity}×=${g.receiptTotalCents} Δ${g.deltaCents} -> ${g.defaultDecision}`
      );
    }
  }
}

const only = (g: ReconGroup[], kind: string) => g.filter((x) => x.kind === kind);
const one = (g: ReconGroup[], kind: string) => only(g, kind)[0];

console.log('\n— A round of drinks, however the till prints it —');

scenario('3 rows of "bere" on the tab vs one printed line of 3',
  [t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800)],
  [r('BERE URSUS 0.5', 3, 800)],
  (g) => [['one agreed group of 3', g.length === 1 && g[0].kind === 'agreed' && g[0].tabQuantity === 3]]);

scenario('one row of 3 on the tab vs 3 printed lines',
  [t('bere ursus', 3, 800)],
  [r('BERE URSUS 0.5', 1, 800), r('BERE URSUS 0.5', 1, 800), r('BERE URSUS 0.5', 1, 800)],
  (g) => [['one agreed group', g.length === 1 && g[0].kind === 'agreed' && g[0].receiptQuantity === 3]]);

scenario('"3 X BERE URSUS 0,5" — the multiplier is in the name',
  [t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800)],
  [r('3 X BERE URSUS 0,5', 3, 800)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

scenario('a product code printed in front of the name',
  [t('bere', 1, 800)],
  [r('1024 BERE URSUS 0.5', 1, 800)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

console.log('\n— Quantities that disagree —');

scenario('one more beer on the paper than on the tab',
  [t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800)],
  [r('BERE URSUS 0.5', 4, 800)],
  (g) => {
    const q = one(g, 'quantity_differs');
    return [['missing 1, +800, take the receipt',
      !!q && q.missingUnits === 1 && q.deltaCents === 800 && q.defaultDecision === 'take_receipt']];
  });

scenario('one beer on the tab that was never charged, nobody claimed it',
  [t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800)],
  [r('BERE URSUS 0.5', 3, 800)],
  (g) => {
    const q = one(g, 'quantity_differs');
    return [['surplus 1, −800, take the receipt',
      !!q && q.surplusUnits === 1 && q.deltaCents === -800 && q.defaultDecision === 'take_receipt']];
  });

scenario('the same, but every beer is already claimed',
  [t('bere', 1, 800, 1), t('bere', 1, 800, 1), t('bere', 1, 800, 1), t('bere', 1, 800, 1)],
  [r('BERE URSUS 0.5', 3, 800)],
  (g) => {
    const q = one(g, 'quantity_differs');
    return [['keeps the tab and says why', !!q && q.defaultDecision === 'keep_tab' && !!q.note]];
  });

console.log('\n— Prices that disagree —');

scenario('happy hour ended: 8.00 noted, 12.00 charged',
  [t('bere', 1, 800)],
  [r('BERE URSUS 0.5', 1, 1200)],
  (g) => {
    const p = one(g, 'price_differs');
    return [['price_differs, +400', !!p && p.deltaCents === 400 && p.defaultDecision === 'take_receipt']];
  });

scenario('a line total that does not divide by 3 is rounding, not a disagreement',
  [t('cola', 3, 834)],
  [r('COCA-COLA 0.33', 3, 833)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

scenario('a comped item printed at 0.00',
  [t('cola', 1, 250)],
  [r('COCA-COLA 0.33', 1, 0)],
  (g) => [['price_differs, −250', one(g, 'price_differs')?.deltaCents === -250]]);

console.log('\n— The size is what tells two of the same drink apart —');

scenario('a small beer must not match the large one',
  [t('bere 0.33', 1, 600)],
  [r('BERE URSUS 0.5', 1, 800), r('BERE URSUS 0.33', 1, 600)],
  (g) => [
    ['the 0.33 matched and agrees', one(g, 'agreed')?.receipt[0].name === 'BERE URSUS 0.33'],
    ['the 0.5 is left on the receipt', one(g, 'only_on_receipt')?.receipt[0].name === 'BERE URSUS 0.5'],
  ]);

scenario('"0.33" and "330 ml" are the same bottle',
  [t('cola 330 ml', 1, 700)],
  [r('COCA-COLA ZERO 0,33', 1, 700)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

console.log('\n— Names that are the same thing —');

scenario('diacritics and case',
  [t('ciorbă de burtă', 1, 2200)],
  [r('CIORBA DE BURTA 400ML', 1, 2200)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

scenario('a Romanian plural',
  [t('cartofi prajiti', 1, 1500)],
  [r('CARTOF PRAJIT', 1, 1500)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

scenario('a typo, and a spelling the synonym table knows',
  [t('capucino', 1, 1200), t('mititei', 6, 300)],
  [r('CAPPUCCINO', 1, 1200), r('MICI', 6, 300)],
  (g) => [['both agreed', only(g, 'agreed').length === 2]]);

scenario('the brand on the paper, the nickname on the tab',
  [t('cola', 1, 700), t('apa plata', 1, 500)],
  [r('COCA-COLA ZERO 0.33', 1, 700), r('AQUA CARPATICA PLATA 0.5', 1, 500)],
  (g) => [['both agreed', only(g, 'agreed').length === 2]]);

scenario('two letters swapped — "beer" for "bere"',
  [t('beer', 1, 800)],
  [r('BERE', 1, 800)],
  (g) => [['matched', g.length === 1 && g[0].kind === 'agreed']]);

scenario('a genuinely different language is NOT matched, and should not be',
  [t('chicken', 1, 3500)],
  [r('PUI LA GRATAR', 1, 3500)],
  (g) => [['left as two sides for a human',
    !!one(g, 'only_on_tab') && !!one(g, 'only_on_receipt')]]);

console.log('\n— Names that are NOT the same thing —');

scenario('two dishes that share "la gratar"',
  [t('pui la gratar', 1, 3500)],
  [r('PUI LA GRATAR', 1, 3500), r('CEAFA DE PORC LA GRATAR', 1, 3800)],
  (g) => [
    ['the chicken matched', one(g, 'agreed')?.receipt[0].name === 'PUI LA GRATAR'],
    ['the pork is only on the receipt', one(g, 'only_on_receipt')?.receipt[0].name === 'CEAFA DE PORC LA GRATAR'],
  ]);

scenario('a bare "vin" against a red and a white — the app must ask',
  [t('vin', 1, 1500)],
  [r('VIN ALB CASA 250ML', 1, 1500), r('VIN ROSU CASA 250ML', 1, 1500)],
  (g) => [['ambiguous, matched by hand', one(g, 'ambiguous')?.defaultDecision === 'match_by_hand']]);

scenario('one typed line against a dish and its garnish printed apart',
  [t('snitel cu cartofi', 1, 3000)],
  [r('SNITEL DE PUI', 1, 2500), r('GARNITURA CARTOFI PRAJITI', 1, 500)],
  (g) => {
    const guess = g.find((x) => x.confidence === 'likely');
    return [
      ['the dish is only a guess, so the app asks',
        !!guess && guess.defaultDecision === 'match_by_hand'],
      ['the garnish is offered on its own', !!one(g, 'only_on_receipt')],
      ['nothing here is settled without a human', g.every((x) => x.needsAnswer)],
    ];
  });

console.log('\n— Lines that are not something anybody ordered —');

scenario('service, tip, deposit, discount and a totals line',
  [t('bere', 1, 800)],
  [
    r('BERE URSUS 0.5', 1, 800),
    r('TAXĂ DE SERVICIU 10%', 1, 80),
    r('BACSIS', 1, 500),
    r('GARANTIE SGR AMBALAJ', 3, 50),
    r('REDUCERE FIDELITATE', 1, -1000),
    r('TOTAL DE PLATA', 1, 43000),
  ],
  (g) => {
    const kinds = only(g, 'not_an_item').map((x) => x.charge);
    return [
      ['five charges recognised', only(g, 'not_an_item').length === 5],
      ['service routed', kinds.includes('service')],
      ['tip routed', kinds.includes('tip')],
      ['deposit goes on the bill',
        only(g, 'not_an_item').find((x) => x.charge === 'packaging')?.defaultDecision === 'add_to_bill'],
      ['discount cannot be an item',
        only(g, 'not_an_item').find((x) => x.charge === 'discount')?.defaultDecision === 'ignore'],
      ['totals line ignored', kinds.includes('total_line')],
      ['the beer still agreed', !!one(g, 'agreed')],
    ];
  });

console.log('\n— Lines on one side only —');

scenario('on the tab, never charged, nobody claimed it',
  [t('bere', 1, 800), t('tuica', 2, 900)],
  [r('BERE URSUS 0.5', 1, 800)],
  (g) => [['removed by default', one(g, 'only_on_tab')?.defaultDecision === 'remove_from_bill']]);

scenario('on the tab, never charged, but somebody claimed it',
  [t('bere', 1, 800), t('tuica', 2, 900, 2)],
  [r('BERE URSUS 0.5', 1, 800)],
  (g) => [['kept, with a warning', one(g, 'only_on_tab')?.defaultDecision === 'keep_on_bill']]);

scenario('two stray beers on the tab read as one row',
  [t('bere', 1, 800), t('bere', 1, 800)],
  [r('CAFEA', 1, 900)],
  (g) => [['one only_on_tab group of 2', one(g, 'only_on_tab')?.tabQuantity === 2]]);

scenario('nothing was noted — the first scan of the evening',
  [],
  [r('BERE URSUS 0.5', 3, 800), r('CIORBA', 2, 2200)],
  (g) => [['everything is only_on_receipt', g.length === 2 && only(g, 'only_on_receipt').length === 2]]);

scenario('the receipt has no products at all',
  [t('bere', 1, 800)],
  [r('TOTAL', 1, 800)],
  (g) => [['the beer is only on the tab', !!one(g, 'only_on_tab')]]);

console.log('\n— The two that actually happen, at the bar —');

// Five beers noted while the round was being poured, fifteen on the paper by
// the end of the night. The count is the whole point here: nobody is going to
// remember, and the tab is only ever a partial record of a busy table.
scenario('5 beers noted, "15 x 15 Beri Ursus 0.5" printed',
  [t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('Beri Ursus 0.5', 15, 1500)],
  (g) => {
    const q = one(g, 'quantity_differs');
    return [
      ['matched despite the plural', !!q && q.confidence === 'certain'],
      ['ten missing, +150.00', !!q && q.missingUnits === 10 && q.deltaCents === 15000],
      ['take the receipt', q?.defaultDecision === 'take_receipt'],
    ];
  });

scenario('the same, with the tab typed in the plural too',
  [t('beri', 1, 1500), t('beri', 1, 1500), t('beri', 1, 1500), t('beri', 1, 1500), t('beri', 1, 1500)],
  [r('Beri Ursus 0.5', 15, 1500)],
  (g) => [['one certain group', g.length === 1 && g[0].confidence === 'certain']]);

scenario('the same, with the multiplier left in the printed name',
  [t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('15 x 15 Beri Ursus 0.5', 15, 1500)],
  (g) => [['still one certain group', g.length === 1 && g[0].confidence === 'certain']]);

// A cocktail nobody spells the way the till does. Token by token this is one
// word against three; glued together it is a prefix.
scenario('3 "pornstar" noted, "PORN STAR MARTINI" printed',
  [t('pornstar', 1, 3500), t('pornstar', 1, 3500), t('pornstar', 1, 3500)],
  [r('PORN STAR MARTINI', 3, 3500)],
  (g) => [['one certain agreed group of 3',
    g.length === 1 && g[0].kind === 'agreed' && g[0].confidence === 'certain' && g[0].tabQuantity === 3]]);

scenario('the same cocktail typed as two words',
  [t('porn star', 1, 3500), t('porn star', 1, 3500), t('porn star', 1, 3500)],
  [r('PORN STAR MARTINI', 3, 3500)],
  (g) => [['agreed', g.length === 1 && g[0].kind === 'agreed']]);

scenario('the same cocktail, and the price went up',
  [t('pornstar', 1, 3500), t('pornstar', 1, 3500), t('pornstar', 1, 3500)],
  [r('PORN STAR MARTINI', 3, 3900)],
  (g) => [['price_differs, +12.00', one(g, 'price_differs')?.deltaCents === 1200]]);

scenario('a glued name must not swallow a whole dish',
  [t('pui', 1, 3500)],
  [r('PUI LA GRATAR', 1, 3500), r('PUI LA CEAUN', 1, 3800)],
  (g) => [['still ambiguous', !!one(g, 'ambiguous')]]);

// Both at once, which is the real evening: the drinks people order round after
// round are exactly the ones the tab loses count of.
scenario('the bar tab: beers undercounted and a cocktail spelled differently',
  [
    t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500), t('bere', 1, 1500),
    t('bere', 1, 1500, 1),
    t('pornstar', 1, 3500), t('pornstar', 1, 3500), t('pornstar', 1, 3500),
  ],
  [r('Beri Ursus 0.5', 15, 1500), r('PORN STAR MARTINI', 3, 3500)],
  (g) => [
    ['two groups', g.length === 2],
    ['the beers need answering', one(g, 'quantity_differs')?.missingUnits === 10],
    ['the cocktails agree', !!one(g, 'agreed')],
    ['the claimed beer is reported', one(g, 'quantity_differs')?.claimedUnits === 1],
  ]);

console.log('\n— The writes those answers turn into —');

/** Runs the matcher, answers each group, and returns the writes that follow. */
function planFor(
  tab: TabLine[],
  receipt: ReceiptLine[],
  override: Partial<Record<ReconKind, DecisionId>> = {}
): ApplyPlan {
  const result = reconcile(tab, receipt);
  return planReconciliation(
    result.groups.map((group) => ({
      group,
      decision: override[group.kind] ?? group.defaultDecision,
    }))
  );
}

const counts = (plan: ApplyPlan) => ({
  deletes: plan.items.filter((w) => w.action === 'delete').length,
  updates: plan.items.filter((w) => w.action === 'update').length,
  creates: plan.items.filter((w) => w.action === 'create').length,
  total: plan.items.reduce(
    (sum, w) => (w.action === 'delete' ? sum : sum + w.quantity * w.unitPriceCents),
    0
  ),
});

function planned(title: string, plan: ApplyPlan, expect: [string, boolean][]) {
  const bad = expect.filter(([, ok]) => !ok);
  if (bad.length === 0) {
    passed++;
    console.log(`  ok   ${title}`);
  } else {
    failed++;
    console.log(`  FAIL ${title}`);
    for (const [what] of bad) console.log(`         expected: ${what}`);
    for (const w of plan.items) console.log(`         ${JSON.stringify(w)}`);
  }
}

{
  // The live test table, exactly: five beers noted, fifteen printed, one of the
  // five already claimed by George.
  const tab = [
    t('bere', 1, 1500, 1), t('bere', 1, 1500), t('bere', 1, 1500),
    t('bere', 1, 1500), t('bere', 1, 1500),
  ];
  const plan = planFor(tab, [r('Beri Ursus 0.5', 15, 1500)]);
  const c = counts(plan);

  planned('5 beers become 15 without deleting a single row', plan, [
    ['nothing is deleted, so no claim can be lost', c.deletes === 0],
    ['the five existing rows are updated in place', c.updates === 5],
    ['ten more are added', c.creates === 10],
    ['the rows add up to the receipt', c.total === 22500],
  ]);
}

{
  // A tab that counted: one row of five, not five rows of one. This is the
  // shape the add form produces now that it asks for a quantity again.
  const plan = planFor([t('bere', 5, 1500, 1)], [r('Beri Ursus 0.5', 15, 1500)]);
  const c = counts(plan);
  const update = plan.items.find((w) => w.action === 'update');

  planned('a counted row counts higher, rather than growing a second row', plan, [
    ['one write, and it is an update', plan.items.length === 1 && c.updates === 1],
    ['the row now reads fifteen', update?.action === 'update' && update.quantity === 15],
    ['at the printed name and price',
      update?.action === 'update' && update.name === 'Beri Ursus 0.5' && update.unitPriceCents === 1500],
  ]);
}

{
  // Four on the tab, three charged, and every one of them claimed. The matcher
  // would not offer this; the admin can still choose it, and it must not take a
  // beer off somebody.
  const tab = [
    t('bere', 1, 800, 1), t('bere', 1, 800, 1), t('bere', 1, 800, 1), t('bere', 1, 800, 1),
  ];
  const plan = planFor(tab, [r('BERE URSUS 0.5', 3, 800)], { quantity_differs: 'take_receipt' });

  planned('a surplus that is entirely claimed is kept, and reported', plan, [
    ['nothing is deleted', counts(plan).deletes === 0],
    ['the unit that could not be shed is reported', plan.keptClaimedSurplus === 1],
  ]);
}

{
  const tab = [t('bere', 1, 800), t('bere', 1, 800, 1), t('bere', 1, 800)];
  const plan = planFor(tab, [r('BERE URSUS 0.5', 2, 800)]);
  const deleted = plan.items.filter((w) => w.action === 'delete').map((w) => w.id);

  planned('a surplus is shed from a row nobody claimed', plan, [
    ['exactly one row goes', deleted.length === 1],
    ['and it is not the claimed one', deleted[0] !== tab[1].id],
  ]);
}

{
  // 25.00 over three single-unit rows: 8.34 + 8.33 + 8.33, never 8.33 × 3.
  const tab = [t('cola', 1, 700), t('cola', 1, 700), t('cola', 1, 700)];
  const plan = planFor(tab, [r('COCA-COLA 0.33', 3, 833)]);

  planned('an odd line total is split by largest remainder, to the cent', plan, [
    ['the rows add up to the receipt exactly', counts(plan).total === 2499],
    ['one row carries the spare cent',
      plan.items.filter((w) => w.action !== 'delete' && w.unitPriceCents === 833).length === 3],
  ]);
}

{
  const plan = planFor(
    [t('vin', 1, 1500)],
    [r('VIN ALB CASA 250ML', 1, 1500), r('VIN ROSU CASA 250ML', 1, 1600)],
    { ambiguous: 'take_receipt' }
  );
  const c = counts(plan);

  planned('an ambiguous group replaces the vague row with the printed lines', plan, [
    ['the vague row goes', c.deletes === 1],
    ['both printed lines arrive', c.creates === 2],
    ['nothing is updated in place', c.updates === 0],
  ]);
}

{
  const plan = planFor(
    [t('bere', 1, 800)],
    [r('BERE URSUS 0.5', 1, 800), r('TAXA DE SERVICIU', 1, 1000), r('BACSIS', 1, 500)]
  );

  planned('service and tip go to the bill, not onto the items', plan, [
    ['nothing is created or deleted', counts(plan).creates === 0 && counts(plan).deletes === 0],
    ['service is routed', plan.bill?.serviceChargeCents === 1000],
    ['the tip is routed', plan.bill?.tipCents === 500],
  ]);
}

{
  // The figures agreed, so nobody was asked anything — and the row still ends
  // up called what the receipt calls it.
  const tab = [t('pornstar', 1, 3500), t('pornstar', 1, 3500), t('pornstar', 1, 3500)];
  const plan = planFor(tab, [r('PORN STAR MARTINI', 3, 3500)]);
  const writes = plan.items.filter((w) => w.action === 'update');

  planned('a group that agrees still takes the printed name', plan, [
    ['every row is renamed', writes.length === 3],
    ['to the printed name', writes.every((w) => w.action === 'update' && w.name === 'PORN STAR MARTINI')],
    ['and nothing else moves',
      writes.every((w) => w.action === 'update' && w.quantity === 1 && w.unitPriceCents === 3500)],
    ['nothing is created or deleted', counts(plan).creates === 0 && counts(plan).deletes === 0],
  ]);
}

{
  const plan = planFor([t('CAFEA', 1, 900)], [r('CAFEA', 1, 900)]);

  planned('a row already named right is not written for nothing', plan, [
    ['no writes at all', plan.items.length === 0],
  ]);
}

{
  // Keeping the tab is a person saying the receipt is wrong about this group.
  // Its name is not adopted either.
  const plan = planFor(
    [t('pornstar', 1, 3500)],
    [r('PORN STAR MARTINI', 1, 3900)],
    { price_differs: 'keep_tab' }
  );

  planned('keeping the tab keeps its name too', plan, [
    ['no writes at all', plan.items.length === 0],
  ]);
}

console.log('\n— When the receipt prints only the brand —');

// The scanner is asked what each line *is*, because a receipt prints "URSUS"
// and the person keeping the tab typed "bere". The two share no letters.
scenario('"bere" and "URSUS" have nothing in common without the scanner',
  [t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('URSUS', 15, 1500)],
  (g) => [
    ['nothing links them', !!one(g, 'only_on_tab') && !!one(g, 'only_on_receipt')],
  ]);

scenario('the scanner says a URSUS is a bere, so the app asks',
  [t('bere', 1, 1500, 1), t('bere', 1, 1500, 1), t('bere', 1, 1500),
   t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('URSUS', 15, 1500, 'bere')],
  (g) => {
    const group = g[0];
    return [
      ['one group, not two', g.length === 1],
      ['a guess, so it asks', group?.confidence === 'likely' && group.defaultDecision === 'match_by_hand'],
      ['and it knows ten are missing, not fifteen', group?.missingUnits === 10],
    ];
  });

scenario('a category never outranks a size that disagrees',
  [t('bere 0.33', 1, 600)],
  [r('URSUS 0.5', 4, 800, 'bere')],
  (g) => [['still two sides', !!one(g, 'only_on_tab') && !!one(g, 'only_on_receipt')]]);

scenario('two brands of the same category: the app asks which',
  [t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('URSUS', 3, 1500, 'bere'), r('TIMISOREANA', 2, 1500, 'bere')],
  (g) => [['ambiguous', !!one(g, 'ambiguous')]]);

scenario('a real name match still beats the category, and stays certain',
  [t('bere', 1, 1500), t('bere', 1, 1500)],
  [r('BERE URSUS 0.5', 2, 1500, 'bere')],
  (g) => [['agreed and certain',
    g.length === 1 && g[0].kind === 'agreed' && g[0].confidence === 'certain']]);

scenario('gin, the same way round',
  [t('gin tonic', 1, 3000)],
  [r('MALFY', 1, 3000, 'gin')],
  (g) => [['matched as a guess', g.length === 1 && g[0].confidence === 'likely']]);

console.log('\n— A whole table —');
{
  const tab = [
    t('bere', 1, 800), t('bere', 1, 800), t('bere', 1, 800, 1),
    t('cola', 1, 700),
    t('ciorba de burta', 1, 2200, 1),
    t('pui la gratar', 1, 3500),
    t('vin', 1, 1500),
    t('tuica', 2, 900, 2),
  ];
  const receipt = [
    r('BERE URSUS 0.5', 4, 800),
    r('COCA-COLA ZERO 0.33', 1, 750),
    r('CIORBA DE BURTA 400ML', 1, 2200),
    r('PUI LA GRATAR', 1, 3500),
    r('VIN ALB CASA 250ML', 1, 1500),
    r('VIN ROSU CASA 250ML', 1, 1500),
    r('CARTOFI PRAJITI', 1, 1200),
    r('TAXA DE SERVICIU', 1, 1000),
  ];
  const result = reconcile(tab, receipt, { printedTotalCents: 15250 });
  console.log(`  tab ${result.tabTotalCents} · receipt ${result.receiptTotalCents} · charges ${result.chargesTotalCents}`);
  console.log(`  ${result.needsDecision} to answer, ${result.agreedCount} agreed`);
  for (const g of result.groups) {
    console.log(
      `   [${g.kind}${g.needsAnswer ? '' : ' ·quiet'}] ${g.label} — tab ${g.tabQuantity}=${g.tabTotalCents} ` +
        `/ receipt ${g.receiptQuantity}=${g.receiptTotalCents} Δ${g.deltaCents} → ${g.defaultDecision}`
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  throw new Error(`${failed} reconciliation case(s) failed.`);
}
