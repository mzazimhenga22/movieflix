import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface NameStepProps {
  onNext: (data: { name: string }) => void;
}

const NameStep = ({ onNext }: NameStepProps) => {
  const [name, setName] = useState('');

  const handleNext = () => {
    if (!name) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    onNext({ name });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What is your name?</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
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

export default NameStep;
