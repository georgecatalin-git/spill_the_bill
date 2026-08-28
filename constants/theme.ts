/**
 * The design system.
 *
 * Monochrome by choice: this app shows people what they owe each other, and a
 * colourful interface makes a number look like an opinion. Colour is spent only
 * where it carries meaning — paid, outstanding, wrong — and everything else is
 * built out of surface, depth and spacing.
 *
 * Light and dark share one key set so `useThemeColor` can index either with a
 * single name. **Every key added here must be added to both**, or the type stops
 * matching and half the app loses its colour at once.
 */

export const Colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F6F6F7',
    text: '#111114',
    textSecondary: '#8A8A8E',
    border: '#E6E6E9',
    accent: '#111114',
    accentText: '#FFFFFF',
    success: '#22A06B',
    warning: '#B0700A',

    /** A surface that sits above `surface` — a card on a grouped background. */
    surfaceRaised: '#FFFFFF',
    /** A surface pressed into the page: an input, a well, a disabled field. */
    surfaceSunken: '#EFEFF1',
    /** For a border that has to be seen rather than felt. */
    borderStrong: '#D6D6DA',
    /** The accent at low weight: a selected chip, a highlighted row. */
    accentSoft: 'rgba(17, 17, 20, 0.06)',
    /** Something has gone wrong, as opposed to something needing attention. */
    danger: '#C4402E',
    /** Behind a modal. */
    overlay: 'rgba(11, 11, 13, 0.35)',
    /** The travelling highlight on a skeleton. */
    shimmer: 'rgba(255, 255, 255, 0.65)',
  },
  dark: {
    background: '#0B0B0D',
    surface: '#1C1C1E',
    text: '#F5F5F7',
    textSecondary: '#9A9AA0',
    border: '#2C2C2E',
    accent: '#FFFFFF',
    accentText: '#0B0B0D',
    success: '#3DD68C',
    warning: '#E8A33D',

    // Depth in the dark is made of lighter surfaces, not darker shadows: a
    // black shadow on a near-black page is invisible, so raised things lift by
    // getting paler and sunken things by getting darker.
    surfaceRaised: '#232326',
    surfaceSunken: '#151517',
    borderStrong: '#3A3A3E',
    accentSoft: 'rgba(245, 245, 247, 0.09)',
    danger: '#F0705C',
    overlay: 'rgba(0, 0, 0, 0.55)',
    shimmer: 'rgba(255, 255, 255, 0.08)',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  /** Sheets and anything meeting the edge of the screen. */
  xl: 28,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * Sizes people actually need rather than every size that exists: a screen
 * title, a section title, a card title, a body, a caption, and money. Money is
 * its own entry because it is the thing being read, and it is always tabular so
 * a column of amounts lines up on the decimal point.
 */
export const Type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  secondary: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.7 },
  money: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  moneyLarge: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
} as const;

/**
 * Three depths, and no more.
 *
 * 1 is a card resting on the page, 2 is something raised for attention, 3 is
 * something floating over everything. A fourth would only ever be used because
 * the third stopped feeling special.
 *
 * Android takes `elevation` and ignores the rest; iOS takes the shadow and
 * ignores `elevation`. Both are given so neither platform is the afterthought.
 */
export const Elevation = {
  light: {
    1: {
      shadowColor: '#0B0B0D',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    2: {
      shadowColor: '#0B0B0D',
      shadowOpacity: 0.09,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    3: {
      shadowColor: '#0B0B0D',
      shadowOpacity: 0.14,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
  },
  dark: {
    1: {
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    2: {
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    3: {
      shadowColor: '#000000',
      shadowOpacity: 0.6,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
  },
} as const;

/**
 * Timings and springs, in one place so the whole app moves at the same speed.
 *
 * The rule behind the numbers: a response to a touch has to be quicker than the
 * user can notice waiting for it, and anything that changes what is on screen
 * has to be slow enough to be followed. Everything else is a taste applied
 * consistently.
 */
export const Motion = {
  /** A press, a toggle, an icon. Felt, not watched. */
  instant: 130,
  fast: 170,
  /** A card arriving, a value changing, a sheet opening. */
  base: 240,
  slow: 320,

  /** The default: responsive, settles without wobbling. */
  spring: { damping: 16, stiffness: 180, mass: 0.8 },
  /** For larger things, where a snappy spring reads as a twitch. */
  springSoft: { damping: 18, stiffness: 140, mass: 0.9 },
  /** For a button returning under a finger. */
  springSnappy: { damping: 15, stiffness: 220, mass: 0.7 },

  /** Between items in a list. Small enough that nobody waits for the last one. */
  stagger: 45,
  /** After this many items, everything else arrives together. */
  staggerCap: 8,

  /** How far a pressed control sinks, and how small it gets. */
  pressScale: 0.97,
  pressLift: 1.5,
} as const;
