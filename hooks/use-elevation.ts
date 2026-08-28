import { Elevation } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The shadow for a given depth, in the current theme.
 *
 * A hook rather than a constant because the two themes build depth from
 * opposite materials: light lifts things with a shadow underneath, dark lifts
 * them with a paler surface, and a shadow that works on white is invisible on
 * near-black.
 */
export function useElevation(level: 1 | 2 | 3) {
  const theme = useColorScheme() ?? 'light';
  return Elevation[theme][level];
}
