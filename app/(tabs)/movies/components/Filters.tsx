import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LiquidGlass from '../../../../components/app-components/LiquidGlass';
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
              onPress={() => setActiveGenreId(null)}
              activeOpacity={0.8}
            >
              <LiquidGlass
                cornerRadius={999}
                tintOpacity={activeGenreId == null ? 0.9 : 0.02}
                borderOpacity={activeGenreId == null ? 0.3 : 0.16}
                style={[styles.genreChip, activeGenreId == null && styles.genreChipActive]}
              >
                <Text
                  style={[
                    styles.genreChipText,
                    activeGenreId == null && styles.genreChipTextActive,
                  ]}
                >
                  All genres
                </Text>
              </LiquidGlass>
            </TouchableOpacity>
            {genres.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() =>
                  setActiveGenreId((current) => (current === g.id ? null : g.id))
                }
                activeOpacity={0.8}
              >
                <LiquidGlass
                  cornerRadius={999}
                  tintOpacity={activeGenreId === g.id ? 0.9 : 0.02}
                  borderOpacity={activeGenreId === g.id ? 0.3 : 0.16}
                  style={[styles.genreChip, activeGenreId === g.id && styles.genreChipActive]}
                >
                  <Text
                    style={[
                      styles.genreChipText,
                      activeGenreId === g.id && styles.genreChipTextActive,
                    ]}
                  >
                    {g.name}
                  </Text>
                </LiquidGlass>
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
              onPress={() => setActiveFilter(key as any)}
              activeOpacity={0.8}
            >
              <LiquidGlass
                cornerRadius={999}
                tintOpacity={isActive ? 0.9 : 0.04}
                borderOpacity={isActive ? 0.3 : 0.16}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text
                  style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                >
                  {labelMap[key]}
                </Text>
              </LiquidGlass>
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
    marginRight: 8,
  },
  genreChipActive: {
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
  },
  filterChipActive: {
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
