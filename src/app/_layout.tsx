import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/theme';
import { ConnectionsStateProvider } from '../connections/ConnectionsStateContext';
import { AppStateProvider } from '../state/AppStateContext';
import { CheckInProvider } from '../state/CheckInContext';
import { FocusSessionProvider } from '../state/FocusSessionContext';
import { HabitStateProvider } from '../state/HabitStateContext';
import { HourlyStateProvider } from '../state/HourlyStateContext';
import { PrepStateProvider } from '../state/PrepStateContext';
import { ProjectStateProvider } from '../state/ProjectStateContext';
import { ReminderStateProvider } from '../state/ReminderStateContext';

function CloseHeaderButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12}>
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Close</Text>
    </Pressable>
  );
}

const darkHeaderOptions = {
  headerStyle: { backgroundColor: colors.backgroundAlt },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text, fontWeight: '700' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function modalScreen(name: string, title: string) {
  return (
    <Stack.Screen
      key={name}
      name={name}
      options={{
        ...darkHeaderOptions,
        headerShown: true,
        title,
        presentation: 'modal',
        headerLeft: () => <CloseHeaderButton />,
      }}
    />
  );
}

function pushedScreen(name: string, title: string) {
  return (
    <Stack.Screen
      key={name}
      name={name}
      options={{ ...darkHeaderOptions, headerShown: true, title, headerLeft: () => <CloseHeaderButton /> }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* FocusSessionProvider wraps AppStateProvider (not the other way around) so
          AppStateContext can read the active session directly via useFocusSessions() —
          needed to pin an in-session task's block during a replan. */}
      <FocusSessionProvider>
        <AppStateProvider>
          {/* ProjectStateProvider is nested inside AppStateProvider (and FocusSessionProvider)
              precisely so it can call useAppState()/useFocusSessions() — capacity checks and
              task linking both read the same task/plan/session state those own. */}
          <ProjectStateProvider>
            <CheckInProvider>
              <HabitStateProvider>
                <PrepStateProvider>
                  <ReminderStateProvider>
                    <HourlyStateProvider>
                      <ConnectionsStateProvider>
                        <StatusBar style="light" />
                        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                          <Stack.Screen name="index" />
                          <Stack.Screen name="welcome" />
                          <Stack.Screen name="onboarding" />
                          <Stack.Screen name="(tabs)" />
                          {modalScreen('capture', 'Quick capture')}
                          {modalScreen('daily-briefing', 'Tell SortMe about my day')}
                          {modalScreen('task-new', 'New task')}
                          {modalScreen('replan-review', 'Revised plan')}
                          {modalScreen('history', 'Plan history')}
                          {modalScreen('checkin-morning', 'Morning check-in')}
                          {modalScreen('checkin-evening', 'Evening review')}
                          {modalScreen('session', 'Focus session')}
                          {pushedScreen('session-history', 'Session history')}
                          {pushedScreen('weekly-review', 'Weekly review')}
                          {pushedScreen('week', 'Next 7 days')}
                          {pushedScreen('day/[date]', 'Day plan')}
                          {pushedScreen('hourly/[date]', 'Hourly plan')}
                          {modalScreen('hourly-checkin', 'Hourly check-in')}
                          {pushedScreen('interviews/index', 'Interviews')}
                          {modalScreen('interviews/new', 'New interview')}
                          {pushedScreen('interviews/[id]', 'Interview')}
                          {pushedScreen('notes/index', 'Notes')}
                          {modalScreen('notes/new', 'New note')}
                          {pushedScreen('notes/[id]', 'Note')}
                          {modalScreen('practice', "Today's practice")}
                          {modalScreen('habit-new', 'Habit')}
                          {pushedScreen('habit/[id]', 'Habit')}
                          {pushedScreen('projects/index', 'Projects')}
                          {modalScreen('projects/new', 'New project')}
                          {pushedScreen('projects/[id]', 'Project')}
                          {pushedScreen('connections/google-docs', 'Google Docs')}
                          {modalScreen('connections/google-docs-picker', 'Select documents')}
                          {modalScreen('connections/google-docs-questions', 'Generate questions')}
                          {pushedScreen('connections/gmail', 'Gmail')}
                          {modalScreen('connections/gmail-task-suggestions', 'Suggested tasks')}
                          {pushedScreen('connections/gmail-needs-reply', 'Needs your reply')}
                          {pushedScreen('connections/github', 'GitHub')}
                          {pushedScreen('connections/imported-items', 'Imported items')}
                          {pushedScreen('prep-priorities', 'Prep priorities')}
                        </Stack>
                      </ConnectionsStateProvider>
                    </HourlyStateProvider>
                  </ReminderStateProvider>
                </PrepStateProvider>
              </HabitStateProvider>
            </CheckInProvider>
          </ProjectStateProvider>
        </AppStateProvider>
      </FocusSessionProvider>
    </SafeAreaProvider>
  );
}
