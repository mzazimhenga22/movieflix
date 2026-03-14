import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function WatchPartyPlayerRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({ pathname: '/video-player', params: params as any });
  }, [params, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}
