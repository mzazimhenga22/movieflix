import { Stack } from 'expo-router';

export default function MarketplaceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="sell" />
      <Stack.Screen name="promote" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
