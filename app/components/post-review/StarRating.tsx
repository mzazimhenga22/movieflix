import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StarRatingProps {
  onRatingChange: (rating: number) => void;
  totalStars?: number;
}

export default function StarRating({ onRatingChange, totalStars = 5 }: StarRatingProps) {
  const [rating, setRating] = useState(0);

  const handlePress = (index: number) => {
    const newRating = index + 1;
    setRating(newRating);
    onRatingChange(newRating);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: totalStars }, (_, index) => (
        <TouchableOpacity key={index} onPress={() => handlePress(index)}>
          <Ionicons
            name={index < rating ? 'star' : 'star-outline'}
            size={40}
            color={index < rating ? '#FFD700' : '#888'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
});
