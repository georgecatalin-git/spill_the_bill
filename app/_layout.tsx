import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/providers/auth-provider';
import { GuestProvider } from '@/providers/guest-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  /** Bare header: just a back arrow, title lives in the screen body. */
  const backOnlyHeader = {
    headerShown: true,
    headerTitle: '',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
  };

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <GuestProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="login" options={backOnlyHeader} />
            <Stack.Screen name="register" options={backOnlyHeader} />
            <Stack.Screen name="new-table" options={backOnlyHeader} />
            <Stack.Screen name="table" options={backOnlyHeader} />
            <Stack.Screen name="bill" options={backOnlyHeader} />
            <Stack.Screen name="table-overview" options={backOnlyHeader} />
            <Stack.Screen name="scan-receipt" options={backOnlyHeader} />
            <Stack.Screen name="review-receipt" options={backOnlyHeader} />
            <Stack.Screen name="review-items" options={backOnlyHeader} />
            <Stack.Screen name="join/index" options={backOnlyHeader} />
            <Stack.Screen name="join/[code]" options={backOnlyHeader} />
            <Stack.Screen name="joined" />
            <Stack.Screen name="participant/[id]" options={backOnlyHeader} />
            <Stack.Screen name="receipt-photo" options={backOnlyHeader} />
            <Stack.Screen name="finish-bill" options={backOnlyHeader} />
          </Stack>
        </GuestProvider>
      </AuthProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
