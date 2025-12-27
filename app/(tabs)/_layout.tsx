// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav'; // adjust path if needed

export default function TabLayout(): React.ReactElement {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#ffd600',
          tabBarInactiveTintColor: isDark ? '#fff' : '#fff',
          tabBarShowLabel: false,
          tabBarStyle: { display: 'none' },
        }}
        tabBar={(props) => <BottomNav {...props} insetsBottom={insets.bottom} isDark={isDark} />}
      >
        <Tabs.Screen name="movies" options={{ title: 'Home' }} />
        <Tabs.Screen name="categories" options={{ title: 'Categories' }} />
        <Tabs.Screen name="search" options={{ title: 'Search' }} />
        <Tabs.Screen name="marketplace" options={{ title: 'Marketplace' }} />
        <Tabs.Screen name="interactive" options={{ title: 'More' }} />
      </Tabs>
  );
}
