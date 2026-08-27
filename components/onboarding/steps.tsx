import type { ReactNode } from 'react';

import {
  AddBillVisual,
  CreateTableVisual,
  InviteVisual,
  LiveBillVisual,
  PickItemsVisual,
  ReadyVisual,
  SettleVisual,
  WelcomeVisual,
} from '@/components/onboarding/step-visuals';

export type OnboardingStep = {
  title: string;
  subtitle?: string;
  description: string;
  visual: ReactNode;
};

/**
 * One concept per step, in the order the person running the table meets them.
 *
 * That person is the restaurant's own — a waiter or a manager, signed in to the
 * account the owner linked to this restaurant. It used to read as though the
 * host were one of the diners ("invite your friends"), which stopped being true
 * when the restaurant became a property of the account rather than something
 * picked per table. The guests are still the ones who tick their own items;
 * they simply are not the ones who start.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to Split the Bill 👋',
    subtitle: 'Let your guests split their bill in seconds.',
    description:
      'Open a table, add the bill, share the code. Everyone at the table picks what they had, and the app works out each share.',
    visual: <WelcomeVisual />,
  },
  {
    title: '1. Open a table',
    description:
      'Start a table for the group you are serving and give it a name. The restaurant is already the one this account belongs to, so there is nothing to choose.',
    visual: <CreateTableVisual />,
  },
  {
    title: '2. Add the bill',
    description:
      'Photograph the receipt and the lines are read for you, or type them in by hand. You can correct anything before it is saved.',
    visual: <AddBillVisual />,
  },
  {
    title: '3. Give the guests the code',
    description:
      'One link or one short code for the whole table. Guests join with just a first name — no account, no email, no app store.',
    visual: <InviteVisual />,
  },
  {
    title: '4. Everyone picks what they had',
    description:
      'Each guest taps their own items on their own phone. If somebody has no phone, you can put their order on their share yourself.',
    visual: <PickItemsVisual />,
  },
  {
    title: '5. Watch the bill divide itself',
    description:
      'Everyone at the table sees who took what and exactly what they owe, updating as they tap. Shared plates are divided to the cent.',
    visual: <LiveBillVisual />,
  },
  {
    title: '6. Collect and close',
    description:
      'Mark each person off as they hand you their share. When the whole bill is accounted for, close the table.',
    visual: <SettleVisual />,
  },
  {
    title: "You're ready! 🎉",
    subtitle: 'Open your first table.',
    description: 'The next group that asks to split the bill is a good place to start.',
    visual: <ReadyVisual />,
  },
];
