import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const WalkthroughStep3 = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{`You're All Set!`}</Text>
      <Text style={styles.subtitle}>{`Click "Finish" to start exploring.`}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
});

export default WalkthroughStep3;
