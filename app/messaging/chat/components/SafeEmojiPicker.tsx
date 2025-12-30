import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  InteractionManager,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type EmojiDataItem = {
  unified: string;
  short_names: string[];
  obsoleted_by?: string;
};

type EmojiItem = {
  unified: string;
  short_names: string[];
  glyph: string;
};

let cachedEmojiItems: EmojiItem[] | null = null;

const PRELOAD_BATCH = 700;

const PEOPLE_HINTS = [
  'grinning',
  'smile',
  'laugh',
  'joy',
  'wink',
  'heart_eyes',
  'kissing',
  'blush',
  'thinking',
  'sunglasses',
  'cry',
  'sob',
  'angry',
  'rage',
  'neutral_face',
  'thumbsup',
  '+1',
  'clap',
  'wave',
];

const peopleSortKey = (e: EmojiItem) => {
  const names = e.short_names || [];
  for (const hint of PEOPLE_HINTS) {
    const idx = names.indexOf(hint);
    if (idx !== -1) return 0;
  }
  // A lot of people emojis start with these prefixes in emoji-datasource.
  if (names.some((n) => n.startsWith('person') || n.startsWith('man') || n.startsWith('woman') || n.startsWith('face'))) {
    return 0;
  }
  return 1;
};

const charFromUtf16 = (utf16: string) =>
  String.fromCodePoint(...utf16.split('-').map((u) => Number(`0x${u}`)));

export type SafeEmojiPickerProps = {
  onEmojiSelected: (emoji: string) => void;
  columns?: number;
  showSearchBar?: boolean;
  placeholder?: string;
};

export default function SafeEmojiPicker({
  onEmojiSelected,
  columns = 9,
  showSearchBar = true,
  placeholder = 'Search…',
}: SafeEmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [items, setItems] = useState<EmojiItem[] | null>(cachedEmojiItems);

  useEffect(() => {
    let cancelled = false;
    if (cachedEmojiItems) {
      setItems(cachedEmojiItems);
      return;
    }

    try {
      // Load synchronously to avoid showing a loader; then backfill the full list after interactions.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const emojiData = require('emoji-datasource') as EmojiDataItem[];
      const preparedUnsorted: EmojiItem[] = emojiData
        .filter((e) => !e.obsoleted_by)
        .map((e) => ({
          unified: e.unified,
          short_names: Array.isArray(e.short_names) ? e.short_names : [],
          glyph: charFromUtf16(e.unified),
        }));

      // Ensure we "start with people" instead of ending with it.
      const prepared = preparedUnsorted.slice().sort((a, b) => {
        const ka = peopleSortKey(a);
        const kb = peopleSortKey(b);
        if (ka !== kb) return ka - kb;
        return a.unified.localeCompare(b.unified);
      });
      cachedEmojiItems = prepared;
      setItems(prepared.slice(0, PRELOAD_BATCH));

      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) setItems(prepared);
      });

      return () => {
        cancelled = true;
        (task as any)?.cancel?.();
      };
    } catch {
      setItems([]);
      return () => {
        cancelled = true;
      };
    }
  }, []);

  const colSize = useMemo(() => {
    const safeColumns = Math.max(1, columns);
    const w = Math.max(0, layoutWidth);
    // Keep a reasonable hit target even in narrow layouts.
    return Math.max(34, Math.floor(w / safeColumns) || 34);
  }, [columns, layoutWidth]);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return [];
    if (!q) return items;
    return items.filter((e) => e.short_names?.some((n) => n.includes(q)));
  }, [items, query]);

  return (
    <View
      style={styles.frame}
      onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      {showSearchBar && (
        <View style={styles.searchbar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.searchInput}
            returnKeyType="done"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      )}

      {/* No loading state: emoji data is bundled and should render immediately. */}

      <FlatList
        data={data}
        keyExtractor={(item) => item.unified}
        numColumns={Math.max(1, columns)}
        keyboardShouldPersistTaps="always"
        removeClippedSubviews
        initialNumToRender={48}
        maxToRenderPerBatch={48}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onEmojiSelected(item.glyph)}
            style={[styles.cell, { width: colSize, height: colSize }]}
          >
            <Text
              style={{
                fontSize: Math.max(16, Math.floor(colSize * 0.62)),
                color: '#fff',
              }}
            >
              {item.glyph}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    width: '100%',
  },
  searchbar: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
