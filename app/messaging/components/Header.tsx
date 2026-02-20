import React from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface HeaderProps {
  scrollY: Animated.Value;
  onSettingsPress: () => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  headerHeight: number;
}

const Header = ({ scrollY, onSettingsPress, onSearchChange, searchQuery, headerHeight }: HeaderProps) => {
  return (
    <Animated.View style={[styles.header, { height: headerHeight }]}>
      <LinearGradient
        colors={['rgba(229,9,20,0.28)', 'rgba(10,12,24,0.96)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <BlurView intensity={60} tint="dark" style={styles.headerGlass}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.eyebrow}>Chats</Text>
              <Text style={styles.title}>Messages</Text>
            </View>
            <TouchableOpacity onPress={onSettingsPress} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#a3a3a3" style={{ marginRight: 10 }} />
            <TextInput
              placeholder="Search messages or people"
              placeholderTextColor="#a3a3a3"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={onSearchChange}
              returnKeyType="search"
            />
          </View>
        </BlurView>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  headerGradient: {
    flex: 1,
    borderRadius: 18,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  headerGlass: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingRight: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  iconBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    height: 36,
  },
});

export default Header;
