import { Stack } from 'expo-router';

export default function MessagingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="group-details" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="chat/media-viewer" />
    </Stack>
  );
}
