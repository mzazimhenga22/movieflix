import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Media; index: number }) => {
      const key = String(item?.id ?? index);
      const isActive = activeKey === key;
      return (
        <TvPosterCard
          item={item}
          width={effectiveWidth}
          variant={variant}
          showTitle={showTitle}
          showProgress={showProgress}
          onPress={onPressItem}
          spotlightActive={isActive}
          onFocus={(focused) => {
            onFocusItem?.(focused);
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            activeKeyRef.current = key;
            setActiveKey(key);

            if (lastScrollIndexRef.current === index) return;
            lastScrollIndexRef.current = index;

            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
              } catch {}
            }, 60);
          }}
          onBlur={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            blurTimerRef.current = setTimeout(() => {
              if (activeKeyRef.current === key) {
                activeKeyRef.current = null;
                setActiveKey(null);
              }
            }, 120);
          }}
        />
      );
    },
    [
      effectiveWidth,
      onFocusItem,
      onPressItem,
      showProgress,
      showTitle,
      variant,
      activeKey,
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
        extraData={activeKey}
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
  section: { 
    marginTop: 22,
    paddingVertical: 40, // Extra space for card expansion
    marginVertical: -20, // Compensate so layout stays tight
    overflow: 'visible',
    zIndex: 1,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12, marginLeft: 4 },
  row: { paddingRight: 30, paddingVertical: 30, overflow: 'visible' },
});
