import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Media } from '@/types';
import TvPosterCard from './TvPosterCard';

type Props = {
  title: string;
  items: Media[];
  variant?: 'poster' | 'landscape';
  cardWidth?: number;
  showTitle?: boolean;
  showProgress?: boolean;
  onPressItem?: (item: Media) => void;
  onFocusItem?: (item: Media) => void;
};

export default function TvRail({
  title,
  items,
  variant = 'poster',
  cardWidth,
  showTitle,
  showProgress,
  onPressItem,
  onFocusItem,
}: Props) {
  if (!items?.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={items}
        keyExtractor={(it, idx) => String(it.id ?? idx)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <TvPosterCard
            item={item}
            width={cardWidth}
            variant={variant}
            showTitle={showTitle}
            showProgress={showProgress}
            onPress={onPressItem}
            onFocus={onFocusItem}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  row: { gap: 14, paddingRight: 30 },
});
