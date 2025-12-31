import { Stack } from 'expo-router';

export default function MarketplaceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="tickets" />
      <Stack.Screen name="tickets/[id]" />
      <Stack.Screen name="scan-ticket" />
      <Stack.Screen name="sell" />
      <Stack.Screen name="promote" />
      <Stack.Screen name="seller/[id]" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
