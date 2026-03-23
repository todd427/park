import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Colors } from '../constants/theme';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.ATU_BLUE },
        headerTintColor: Colors.TEXT_PRIMARY,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: Colors.BG_CARD, borderTopColor: Colors.BG_DARK },
        tabBarActiveTintColor: Colors.ATU_GOLD,
        tabBarInactiveTintColor: Colors.TEXT_SECONDARY,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => (
            <TabIcon name="map" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'List',
          tabBarIcon: ({ color }) => (
            <TabIcon name="list" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: 'About',
          tabBarIcon: ({ color }) => (
            <TabIcon name="about" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="onboarding"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

// Minimal text-based icons to avoid extra deps
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = { map: '🗺', list: '📋', about: 'ℹ️' };
  return <_TabText color={color}>{icons[name] ?? '?'}</_TabText>;
}

function _TabText({ color, children }: { color: string; children: React.ReactNode }) {
  return <Text style={{ fontSize: 20, color }}>{children}</Text>;
}
