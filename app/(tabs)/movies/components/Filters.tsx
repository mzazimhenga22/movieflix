import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Genre } from '../../../../types/index';

interface FiltersProps {
  genres: Genre[];
  activeGenreId: number | null;
  setActiveGenreId: (id: number | null | ((current: number | null) => number | null)) => void;
  activeFilter: 'All' | 'TopRated' | 'New' | 'ForYou';
  setActiveFilter: (filter: 'All' | 'TopRated' | 'New' | 'ForYou') => void;
}

const Filters: React.FC<FiltersProps> = ({
  genres,
  activeGenreId,
  setActiveGenreId,
  activeFilter,
  setActiveFilter,
}) => {
  return (
    <>
      {/* Browse by genre above stories */}
      {genres.length > 0 && (
        <View style={styles.genreSection}>
          <Text style={styles.genreLabel}>Browse by genre</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genreRow}
          >
            <TouchableOpacity
              style={[styles.genreChip, activeGenreId == null && styles.genreChipActive]}
              onPress={() => setActiveGenreId(null)}
            >
              <Text
                style={[
                  styles.genreChipText,
                  activeGenreId == null && styles.genreChipTextActive,
                ]}
              >
                All genres
              </Text>
            </TouchableOpacity>
            {genres.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.genreChip, activeGenreId === g.id && styles.genreChipActive]}
                onPress={() =>
                  setActiveGenreId((current) => (current === g.id ? null : g.id))
                }
              >
                <Text
                  style={[
                    styles.genreChipText,
                    activeGenreId === g.id && styles.genreChipTextActive,
                  ]}
                >
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main filter chips below stories */}
      <View style={styles.filterRow}>
        {['All', 'TopRated', 'New', 'ForYou'].map((key) => {
          const labelMap: Record<string, string> = {
            All: 'All',
            TopRated: 'Top Rated',
            New: 'New',
            ForYou: 'For You',
          };
          const isActive = activeFilter === (key as any);
          return (
            <TouchableOpacity
              key={key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(key as any)}
            >
              <Text
                style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
              >
                {labelMap[key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  genreSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  genreLabel: {
    paddingHorizontal: 16,
    marginBottom: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  genreRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginRight: 8,
  },
  genreChipActive: {
    backgroundColor: 'rgba(229,9,20,0.9)',
    borderColor: '#e50914',
  },
  genreChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  genreChipTextActive: {
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterChipActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  filterChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
});

export default Filters;
