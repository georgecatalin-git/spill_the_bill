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

/** One concept per step, in the order an admin actually meets them. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to Split the Bill 👋',
    subtitle: 'Split your restaurant bill with friends in seconds.',
    description:
      'Create a table, invite your friends, add the bill, and let everyone choose what they consumed.',
    visual: <WelcomeVisual />,
  },
  {
    title: '1. Create your table',
    description:
      'Start a new table for your restaurant visit. You will become the Admin of the table.',
    visual: <CreateTableVisual />,
  },
  {
    title: '2. Add your bill',
    description:
      'Add the products manually or scan your restaurant receipt to add them automatically.',
    visual: <AddBillVisual />,
  },
  {
    title: '3. Invite your friends',
    description:
      "Send one invitation link to everyone at the table. Guests don't need to create an account.",
    visual: <InviteVisual />,
  },
  {
    title: '4. Everyone picks what they had',
    description:
      'Guests simply tap the products they consumed. Their selections are synchronized in real time.',
    visual: <PickItemsVisual />,
  },
  {
    title: '5. See the bill update live',
    description: 'Everyone can see who selected what and exactly how much they owe.',
    visual: <LiveBillVisual />,
  },
  {
    title: '6. Settle the bill',
    description:
      'Once everyone has paid their share, the Admin can see that the entire bill has been collected and complete the restaurant payment.',
    visual: <SettleVisual />,
  },
  {
    title: "You're ready! 🎉",
    subtitle: "Let's split your first bill.",
    description: 'Create a table and invite your friends to get started.',
    visual: <ReadyVisual />,
  },
];
