import { LinearTransition } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/**
 * Movement that belongs to a list rather than to one component.
 *
 * Entrances live in `components/ui/appear.tsx` instead of here, for the reasons
 * given there. `LinearTransition` stays: it only moves things and never touches
 * opacity, so its worst failure is a row that jumps rather than a row that
 * cannot be seen.
 */

/**
 * For a list that reorders or grows under its own steam — somebody joining, a
 * line being claimed. Rows slide to their new places instead of jumping.
 */
export const settle = LinearTransition.duration(Motion.base)
  .springify()
  .damping(Motion.springSoft.damping)
  .stiffness(Motion.springSoft.stiffness);
