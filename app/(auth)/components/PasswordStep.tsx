import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface PasswordStepProps {
  onNext: (data: { password: string }) => void;
}

const PasswordStep = ({ onNext }: PasswordStepProps) => {
  const [password, setPassword] = useState('');

  const handleNext = () => {
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }
    onNext({ password });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a password</Text>
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    color: 'white',
    fontSize: 16,
    marginBottom: 16,
  },
  nextButton: {
    backgroundColor: '#e50914',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PasswordStep;
