import { useRouter } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useSubscription } from '../providers/SubscriptionProvider';

const PaywallScreen = () => {
  const router = useRouter();
  const { isSubscribed } = useSubscription();

  const handleSubscribe = async () => {
    router.push('/premium?requested=premium');
  };

  if (isSubscribed) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You are subscribed!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upgrade to Premium</Text>
      <Text style={styles.desc}>Subscribe to unlock all features, unlimited streaming, and more.</Text>
      <Button title="Subscribe" onPress={handleSubscribe} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  desc: { color: '#ccc', marginBottom: 24, textAlign: 'center', maxWidth: 300 },
});

export default PaywallScreen;
