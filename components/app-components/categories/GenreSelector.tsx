import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Genre } from '../../../types';

interface Props {
  genres: Genre[];
  selectedGenre: number | null;
  onSelectGenre: (id: number) => void;
}

const GenreSelector: React.FC<Props> = ({ genres, selectedGenre, onSelectGenre }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Or by Genre</Text>
      <FlatList
        data={genres}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, selectedGenre === item.id && styles.selectedChip]}
            onPress={() => onSelectGenre(item.id)}
          >
            <Text style={[styles.chipText, selectedGenre === item.id && styles.selectedChipText]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  listContainer: {
    paddingHorizontal: 15,
  },
  chip: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginRight: 10,
  },
  selectedChip: {
    backgroundColor: '#1e90ff',
  },
  chipText: {
    color: 'white',
    fontSize: 14,
  },
  selectedChipText: {
    fontWeight: 'bold',
  },
});

export default GenreSelector;
