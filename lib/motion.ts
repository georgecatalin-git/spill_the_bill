import { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/**
 * The entrances, in one place.
 *
 * A screen full of cards should arrive as a sequence rather than a slab, but
 * only just — the delay is capped so the ninth card does not make somebody wait
 * half a second to tap it. After the cap everything lands together, which
 * nobody notices and everybody benefits from.
 */

export function enterList(index: number) {
  return FadeInDown.duration(Motion.base)
    .delay(Math.min(index, Motion.staggerCap) * Motion.stagger)
    .springify()
    .damping(Motion.springSoft.damping)
    .stiffness(Motion.springSoft.stiffness);
}

/** For a single thing appearing on its own — a header, a total, a message. */
export const enterSoft = FadeIn.duration(Motion.base);

/** For something leaving, which should be quicker than it arrived. */
export const leaveSoft = FadeOut.duration(Motion.fast);

/**
 * For a list that reorders or grows under its own steam — somebody joining,
 * a line being claimed. Rows slide to their new places instead of jumping.
 */
export const settle = LinearTransition.duration(Motion.base)
  .springify()
  .damping(Motion.springSoft.damping)
  .stiffness(Motion.springSoft.stiffness);
