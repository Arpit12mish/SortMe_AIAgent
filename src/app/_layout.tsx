import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/theme';
import { AppStateProvider } from '../state/AppStateContext';

function CloseHeaderButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12}>
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Close</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="task-new"
            options={{
              headerShown: true,
              title: 'New task',
              presentation: 'modal',
              headerLeft: () => <CloseHeaderButton />,
            }}
          />
          <Stack.Screen
            name="replan-review"
            options={{
              headerShown: true,
              title: 'Revised plan',
              presentation: 'modal',
              headerLeft: () => <CloseHeaderButton />,
            }}
          />
          <Stack.Screen
            name="history"
            options={{
              headerShown: true,
              title: 'Plan history',
              presentation: 'modal',
              headerLeft: () => <CloseHeaderButton />,
            }}
          />
        </Stack>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
