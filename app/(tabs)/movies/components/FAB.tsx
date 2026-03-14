import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import LiquidGlass from '../../../../components/app-components/LiquidGlass';

interface FABProps {
  fabExpanded: boolean;
  setFabExpanded: (expanded: boolean) => void;
  handleShuffle: () => void;
  router: any;
}

const FAB: React.FC<FABProps> = ({ fabExpanded, setFabExpanded, handleShuffle, router }) => {
  return (
    <>
      {/* Sub FABs */}
      {fabExpanded && (() => {
        const MAIN_FAB_BOTTOM = 120;
        const firstOffset = 120; // first sub FAB sits farther from main FAB
        const spacing = 60; // spacing between subsequent sub FABs
        const items = [
          { key: 'shuffle', icon: 'shuffle', onPress: async () => { await handleShuffle(); } },
          { key: 'mylist', icon: 'list-sharp', onPress: () => router.push('/my-list') },
          { key: 'search', icon: 'search', onPress: () => router.push('/search') },
          { key: 'watchparty', icon: 'people-outline', onPress: () => router.push('/watchparty') },
        ];

        return (
          <>
            {items.map((it, idx) => {
              const bottom = MAIN_FAB_BOTTOM + firstOffset + idx * spacing;
              return (
                <TouchableOpacity
                  key={it.key}
                  style={[styles.subFab, { bottom }]}
                  onPress={() => {
                    try {
                      it.onPress();
                    } finally {
                      setFabExpanded(false);
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <LiquidGlass
                    cornerRadius={32}
                    tintOpacity={0.3}
                    borderOpacity={0.5}
                    glowColor="#ffffff"
                    glowIntensity={0.4}
                    style={styles.subFabGradient}
                  >
                    <Ionicons name={it.icon as any} size={20} color="#FFFFFF" />
                  </LiquidGlass>
                </TouchableOpacity>
              );
            })}
          </>
        );
      })()}

      {/* Main FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 120 }]}
        onPress={() => setFabExpanded(!fabExpanded)}
        activeOpacity={0.9}
      >
        <LiquidGlass
          cornerRadius={36}
          tintOpacity={0.4}
          borderOpacity={0.5}
          glowColor="#ffffff"
          glowIntensity={0.5}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </LiquidGlass>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 64,
    height: 64,
    right: 18,
    bottom: 150,
  },
  subFab: {
    position: 'absolute',
    width: 64,
    height: 64,
    right: 18,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  subFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
});

export default FAB;
