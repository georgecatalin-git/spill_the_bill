import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, router } from 'expo-router';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/providers/auth-provider';
import { useOnboarding } from '@/providers/onboarding-provider';

export default function AdminLayout() {
  const { user, role, restoring } = useAuth();
  const { shouldAutoStart, claimAutoStart } = useOnboarding();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  // First run only, and only here: guests never mount the admin area, so this
  // is the boundary the tutorial belongs behind. Claiming it before navigating
  // keeps a tab change from opening it a second time.
  useEffect(() => {
    if (!shouldAutoStart) return;

    claimAutoStart();
    router.push('/onboarding');
  }, [shouldAutoStart, claimAutoStart]);

  // Admin area is signed-in only. Guests never reach it.
  if (restoring) return null;

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: 'Tables',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="owner"
        options={{
          title: 'Owner',
          // `href: null` keeps the route registered but out of the tab bar, so
          // an admin never sees it. The screen redirects too, and the database
          // refuses the reads regardless.
          href: role === 'owner' ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
