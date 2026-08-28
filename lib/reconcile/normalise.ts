/**
 * Turning a name into something comparable.
 *
 * A tab is typed while the order is happening — "bere", "ciorba", "cola" — and
 * a receipt is printed by a till that knows the full product: "BERE URSUS 0.5",
 * "CIORBA DE VACUTA 400ML", "COCA-COLA ZERO 0,33". The two are the same thing
 * and share almost no characters, so nothing here compares raw strings.
 *
 * The job is to reduce both sides to the same shape: a set of meaningful
 * tokens, plus the size if the name carried one. Size is pulled out rather than
 * left among the tokens because it is the one part that *distinguishes*
 * products — "BERE 0.33" and "BERE 0.5" are two different lines at two
 * different prices, and treating "0" and "5" as words would make them identical.
 */

export type ItemSize = { amount: number; unit: 'ml' | 'g' };

export type NormalisedName = {
  /** Exactly what was typed or printed. Shown to the human, never compared. */
  raw: string;
  /** Lowercase, diacritic-free, noise removed. This is what is compared. */
  tokens: string[];
  /** The size printed in the name, in ml or g. "0.5" becomes 500 ml. */
  size: ItemSize | null;
  /**
   * What the scanner said the line *is* — "bere" for a URSUS — normalised the
   * same way, so it can be compared like any other name. Null on the tab side:
   * a person typing during the meal writes the category already.
   */
  kind: NormalisedName | null;
};

/**
 * Romanian diacritics plus the cedilla variants that older tills still print,
 * and the handful of accents that reach us through imported product names.
 *
 * Written out rather than using `normalize('NFD')`: the same folding already
 * exists in Postgres as `normalise_business_name`, and two normalisers that
 * disagree about "ș" is exactly the kind of drift this project has been bitten
 * by before.
 */
const FOLD: Record<string, string> = {
  ă: 'a', â: 'a', î: 'i', ș: 's', ț: 't', ş: 's', ţ: 't',
  á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', ë: 'e', í: 'i', ì: 'i', ï: 'i',
  ó: 'o', ò: 'o', ö: 'o', ú: 'u', ù: 'u', ü: 'u', ç: 'c', ñ: 'n', ß: 's',
};

/**
 * Lowercase and diacritic-free, with the original words still in place.
 *
 * Exported because the charge classifier reads whole phrases — "taxa de
 * serviciu" — and tokenising would have dropped the "de" that makes it one.
 */
export function foldName(value: string) {
  return value
    .toLowerCase()
    .replace(/[ăâîșțşţáàäéèëíìïóòöúùüçñß]/g, (char) => FOLD[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words that carry no identity in a dish name.
 *
 * Dropping them is what stops "PUI LA GRATAR" and "CEAFA LA GRATAR" from
 * looking two-thirds identical. Kept deliberately short: every word removed
 * here is a word that can no longer tell two products apart.
 */
const STOPWORDS = new Set([
  'la', 'cu', 'de', 'din', 'si', 'in', 'pe', 'al', 'ale', 'a',
  'the', 'and', 'with', 'of',
]);

/** Counting words. A till prints them, a person types them, neither means anything. */
const NOISE = new Set([
  'buc', 'bucata', 'bucati', 'bc', 'portie', 'portii', 'pcs', 'pc', 'set', 'x',
]);

/**
 * Names the same product goes by on the two sides.
 *
 * This is a starting point, not the answer. The real answer is a per-restaurant
 * table learned from confirmed matches — a place that prints "AQUA CARPATICA"
 * for what everyone types as "apa plata" should only have to be told once. Until
 * that exists, these are the ones common enough to be worth hard-coding.
 */
const SYNONYMS: Record<string, string> = {
  mititei: 'mici',
  aqua: 'apa',
  minerale: 'minerala',
  expresso: 'espresso',
  capucino: 'cappuccino',
  frites: 'cartofi',
  fries: 'cartofi',
};

const SIZE_PATTERNS: { re: RegExp; toSize: (value: number) => ItemSize }[] = [
  { re: /(\d+(?:[.,]\d+)?)\s*(?:ml|mililitri)\b/, toSize: (n) => ({ amount: n, unit: 'ml' }) },
  { re: /(\d+(?:[.,]\d+)?)\s*cl\b/, toSize: (n) => ({ amount: n * 10, unit: 'ml' }) },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:litri|litru|l)\b/, toSize: (n) => ({ amount: n * 1000, unit: 'ml' }) },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:kg|kilograme)\b/, toSize: (n) => ({ amount: n * 1000, unit: 'g' }) },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:grame|gr|g)\b/, toSize: (n) => ({ amount: n, unit: 'g' }) },
];

/** A bare decimal in a drink name is litres: "BERE URSUS 0.5", "COLA 0,33". */
const BARE_LITRES = /\b(\d(?:[.,]\d{1,2}))\b/;

/** Above this, a bare decimal is a price the parser left in the name, not a size. */
const MAX_BARE_LITRES = 5;

function toNumber(value: string) {
  return Number(value.replace(',', '.'));
}

function extractSize(value: string): { size: ItemSize | null; rest: string } {
  for (const { re, toSize } of SIZE_PATTERNS) {
    const match = re.exec(value);
    if (match) {
      return { size: toSize(toNumber(match[1])), rest: value.replace(match[0], ' ') };
    }
  }

  const bare = BARE_LITRES.exec(value);
  if (bare) {
    const litres = toNumber(bare[1]);
    if (litres > 0 && litres <= MAX_BARE_LITRES) {
      return { size: { amount: litres * 1000, unit: 'ml' }, rest: value.replace(bare[0], ' ') };
    }
  }

  return { size: null, rest: value };
}

function tokenise(value: string) {
  const words = value.split(/[^a-z0-9]+/).filter(Boolean);
  const mapped = words.map((word) => SYNONYMS[word] ?? word);

  const kept = mapped.filter(
    (word) => !STOPWORDS.has(word) && !NOISE.has(word) && !/^\d+$/.test(word)
  );

  // A line that is nothing but numbers and stopwords still has to be comparable
  // to itself, so never hand back an empty set.
  return kept.length > 0 ? kept : mapped;
}

export function normaliseName(raw: string, kind?: string | null): NormalisedName {
  const folded = foldName(raw);

  // "3 x 8,00" and "2X" are the till spelling out the multiplication. The
  // quantity is a column of its own; here it is only noise.
  const withoutMultiplier = folded.replace(/\b\d+\s*[x×]\s*/g, ' ');

  // Some tills run the line total into the name. Only strip amounts too large
  // to be a size, so "COLA 0,50" keeps its half litre.
  const withoutPrice = withoutMultiplier.replace(/\b\d+[.,]\d{2}\b/g, (match) =>
    toNumber(match) >= MAX_BARE_LITRES ? ' ' : match
  );

  const { size, rest } = extractSize(withoutPrice);

  return {
    raw: raw.trim(),
    tokens: tokenise(rest),
    size,
    // One level only. A category has no category of its own, and the recursion
    // would have nowhere to stop.
    kind: kind && kind.trim() ? normaliseName(kind) : null,
  };
}

/** True when both names name a size and the sizes are not the same product. */
export function sizesContradict(a: NormalisedName, b: NormalisedName) {
  if (!a.size || !b.size) return false;
  if (a.size.unit !== b.size.unit) return true;

  // A tolerance, because "0.33" and "330 ml" are the same bottle and a till may
  // round either way.
  const larger = Math.max(a.size.amount, b.size.amount);
  return Math.abs(a.size.amount - b.size.amount) / larger > 0.05;
}
