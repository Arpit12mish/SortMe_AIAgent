import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../components/theme';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={styles.icon}>{symbol}</Text>
    </View>
  );
}

function tabIcon(symbol: string) {
  function BoundTabIcon({ focused }: { focused: boolean }) {
    return <TabIcon symbol={symbol} focused={focused} />;
  }
  return BoundTabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('🗓️') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: tabIcon('✅') }} />
      <Tabs.Screen name="prep" options={{ title: 'Prep', tabBarIcon: tabIcon('🎯') }} />
      <Tabs.Screen name="habits" options={{ title: 'Habits', tabBarIcon: tabIcon('🔥') }} />
      <Tabs.Screen name="connections" options={{ title: 'Connect', tabBarIcon: tabIcon('🔗') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('⚙️') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: 86,
    paddingTop: 10,
  },
  tabItem: { paddingTop: 2 },
  tabLabel: { ...typography.micro, textTransform: 'none', marginTop: 4 },
  iconWrap: {
    width: 36,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.tintPrimary,
  },
  icon: { fontSize: 17 },
});
