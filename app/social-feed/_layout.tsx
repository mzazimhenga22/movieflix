import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import BottomNav from '../components/social-feed/BottomNav';

export default function SocialFeedLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen 
          name="index"
          options={{
            title: 'Feed'
          }}
        />
        <Stack.Screen 
          name="stories"
          options={{
            title: 'Stories'
          }}
        />
        <Stack.Screen
          name="match-swipe"
          options={{
            title: 'Movie Match'
          }}
        />
        <Stack.Screen 
          name="notifications"
          options={{
            title: 'Notifications'
          }}
        />
        <Stack.Screen
          name="streaks"
          options={{
            title: 'Streaks'
          }}
        />
      </Stack>
      <BottomNav />
    </View>
  );
}
