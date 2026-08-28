import { normaliseName, sizesContradict, type NormalisedName } from '@/lib/reconcile/normalise';

/**
 * How alike two item names are, from 0 to 1.
 *
 * Three things have to be true at once for this to be useful:
 *
 *  - "bere" must match "BERE URSUS 0.5". The typed name is almost always a
 *    fragment of the printed one, so a plain overlap ratio is wrong — a single
 *    word against three would score 0.33 and be discarded.
 *  - "bere" must NOT match "BERE URSUS 0.5" *more* than it matches
 *    "BERE TIMISOREANA 0.5" when both are on the receipt. It doesn't; it ties,
 *    and a tie is reported as an ambiguity rather than resolved by a coin toss.
 *  - "PUI LA GRATAR" must not match "CEAFA LA GRATAR". Two of three words are
 *    shared, and they are the two words that appear on half the menu.
 *
 * The first is why containment carries most of the weight. The third is why
 * every token is weighted by how rare it is across the lines being compared:
 * "gratar" printed on six lines says almost nothing, "ceafa" printed on one
 * says everything.
 */

/**
 * Edit distance, counting a swapped pair of letters as one mistake.
 *
 * Plain Levenshtein charges two for a transposition, which is the wrong price
 * for by far the commonest typing error: "bere" and "beer" are one slip apart
 * and score as two, far enough to be called different drinks. Names here are
 * four to six letters, where that single point decides everything.
 */
function distance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0 || b.length === 0) return Math.max(a.length, b.length);

  // Three rows, because a transposition looks two back in both strings.
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      let best = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, twoBack[j - 2] + 1);
      }

      current[j] = best;
    }

    twoBack = previous;
    previous = current;
  }

  return previous[b.length];
}

/**
 * How far apart two words may be and still be the same word.
 *
 * A three-letter word gets no slack at all, because at that length one letter
 * is the whole difference between two real drinks: "vin" and "gin" are one
 * edit apart and are not each other. Longer words can afford more, and that is
 * where the typos actually are.
 */
function tolerance(length: number) {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * 1 for the same word, a little less for a plural or a typo, 0 for a different
 * word.
 *
 * The near-miss score is high on purpose. It multiplies through both halves of
 * the name comparison, so a stingy value compounds: at 0.85 a typed "bere"
 * against a printed "BERI URSUS" came out below the confident threshold, and a
 * plural on the commonest drink in the country is not something to ask about
 * every time.
 */
const NEAR_MISS = 0.92;

export function tokenSimilarity(a: string, b: string) {
  if (a === b) return 1;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];

  // "cartof" / "cartofi", "sarmal" / "sarmale" — a Romanian plural is usually a
  // suffix, so a shared stem of four characters is stronger evidence than the
  // edit distance between them.
  if (shorter.length >= 4 && longer.startsWith(shorter)) return 0.95;

  if (distance(a, b) <= tolerance(shorter.length)) return NEAR_MISS;

  return 0;
}

/**
 * How much each token is worth, from how many of the lines under comparison use
 * it. Both sides go into the count, so the tab and the receipt agree on which
 * words are common at this table tonight.
 */
export function tokenWeights(names: NormalisedName[]) {
  const frequency = new Map<string, number>();

  for (const name of names) {
    for (const token of new Set(name.tokens)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  const total = Math.max(1, names.length);

  return (token: string) => Math.log(1 + total / (frequency.get(token) ?? 1));
}

export type TokenWeight = (token: string) => number;

/** Weighted share of `from`'s tokens that have a partner in `to`. */
function containment(from: string[], to: string[], weightOf: TokenWeight) {
  let matched = 0;
  let total = 0;

  for (const token of from) {
    const weight = weightOf(token);
    total += weight;

    let best = 0;
    for (const other of to) {
      best = Math.max(best, tokenSimilarity(token, other));
      if (best === 1) break;
    }
    matched += weight * best;
  }

  return total === 0 ? 0 : matched / total;
}

/**
 * Containment carries the weight so a typed fragment still finds its printed
 * name; coverage is kept in the mix so a fragment does not score as highly as
 * the full name would.
 */
const CONTAINMENT_WEIGHT = 0.7;

/**
 * What a match on the category alone is worth.
 *
 * Deliberately inside the band where the app asks rather than decides. A
 * receipt that prints only "URSUS" shares no word at all with a tab that says
 * "bere", and the scanner telling us it is a beer is good evidence — but it is
 * evidence about a kind of thing, not about this line, and the difference
 * between five beers and fifteen is a hundred and fifty lei. The name stays the
 * only witness that can close a match on its own.
 */
const KIND_MATCH = 0.62;

/** How well the category has to match before it is worth anything at all. */
const KIND_CONFIDENCE = 0.75;

export function nameSimilarity(a: NormalisedName, b: NormalisedName, weightOf: TokenWeight) {
  // Two sizes that disagree are two products. No amount of name overlap
  // outranks that: a small beer and a large one share every letter. It
  // outranks the category too — "bere 0.33" and a 0.5 URSUS are not the same
  // line however sure the scanner is about what a URSUS is.
  if (sizesContradict(a, b)) return 0;

  const direct = directSimilarity(a, b, weightOf);
  if (direct >= KIND_MATCH) return direct;

  // Nothing in the names. Ask what the scanner said the line is.
  const viaKind = Math.max(
    b.kind ? directSimilarity(a, b.kind, weightOf) : 0,
    a.kind ? directSimilarity(a.kind, b, weightOf) : 0
  );

  return viaKind >= KIND_CONFIDENCE ? KIND_MATCH : direct;
}

function directSimilarity(a: NormalisedName, b: NormalisedName, weightOf: TokenWeight) {
  if (a.tokens.length === 0 || b.tokens.length === 0) return 0;
  if (a.tokens.join(' ') === b.tokens.join(' ')) return 1;

  const [shorter, longer] =
    a.tokens.length <= b.tokens.length ? [a.tokens, b.tokens] : [b.tokens, a.tokens];

  const inner = containment(shorter, longer, weightOf);
  const outer = containment(longer, shorter, weightOf);

  return Math.max(CONTAINMENT_WEIGHT * inner + (1 - CONTAINMENT_WEIGHT) * outer, glued(a, b));
}

/**
 * The same name with the spaces taken out.
 *
 * Word boundaries are the one thing the two sides never agree on. A cocktail is
 * typed "pornstar" and printed "PORN STAR MARTINI"; a drink is typed "cocacola"
 * and printed "COCA COLA". Token by token those look like one word against
 * three, and the weighting that correctly separates "PUI LA GRATAR" from
 * "CEAFA LA GRATAR" pushes them below the line. Glued together they are a
 * prefix, which is much better evidence than the tokens were.
 */
const MIN_GLUE = 6;

function glued(a: NormalisedName, b: NormalisedName) {
  const left = a.tokens.join('');
  const right = b.tokens.join('');

  if (left === right) return 1;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];

  // Six characters, so a short common word cannot swallow a whole dish: "pui"
  // must not become "PUI LA GRATAR" on the strength of three letters.
  return shorter.length >= MIN_GLUE && longer.startsWith(shorter) ? 0.9 : 0;
}

/** Same thing, for callers holding raw strings — used by the tests and by tooling. */
export function compareNames(a: string, b: string, bKind?: string) {
  const left = normaliseName(a);
  const right = normaliseName(b, bKind);
  return nameSimilarity(left, right, tokenWeights([left, right]));
}
