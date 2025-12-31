import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { Media } from '../../types';
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
  const hasItems = Boolean(items?.length);

  const listRef = useRef<FlashListRef<Media> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollIndexRef = useRef<number | null>(null);

  const effectiveWidth = cardWidth ?? 168;
  const separatorWidth = 14;
  const itemLength = effectiveWidth + separatorWidth;

  const Separator = useCallback(() => <View style={{ width: separatorWidth }} />, [separatorWidth]);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Media; index: number }) => (
      <TvPosterCard
        item={item}
        width={effectiveWidth}
        variant={variant}
        showTitle={showTitle}
        showProgress={showProgress}
        onPress={onPressItem}
        onFocus={(focused) => {
          onFocusItem?.(focused);

          if (lastScrollIndexRef.current === index) return;
          lastScrollIndexRef.current = index;

          if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
            } catch {}
          }, 60);
        }}
      />
    ),
    [
      effectiveWidth,
      onFocusItem,
      onPressItem,
      showProgress,
      showTitle,
      variant,
    ],
  );

  const initialNumToRender = useMemo(() => Math.min(8, items?.length ?? 0), [items?.length]);

  if (!hasItems) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <FlashList
        ref={(r) => {
          listRef.current = r;
        }}
        data={items}
        keyExtractor={(it, idx) => String(it.id ?? idx)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        drawDistance={itemLength * 4}
        overrideProps={{ initialDrawBatchSize: initialNumToRender }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  row: { paddingRight: 30 },
});
