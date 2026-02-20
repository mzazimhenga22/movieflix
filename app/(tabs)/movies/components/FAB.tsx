import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native';

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
                  <LinearGradient
                    colors={['#ff8a00', '#e50914']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.subFabGradient}
                  >
                    <Ionicons name={it.icon as any} size={20} color="#FFFFFF" />
                  </LinearGradient>
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
        <LinearGradient
          colors={['#ff8a00', '#e50914']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    right: 18,
    bottom: 150,
    // Bold movie-red FAB
    backgroundColor: '#e50914',
    borderRadius: 36,
    borderWidth: 0,
    borderColor: 'transparent',
    elevation: 12,
    shadowColor: '#e50914',
    shadowOpacity: 0.36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  subFab: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    right: 18,
    backgroundColor: '#e50914',
    borderRadius: 32,
    elevation: 10,
    shadowColor: '#e50914',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FAB;
