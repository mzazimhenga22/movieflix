import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ScreenWrapper from '../components/ScreenWrapper';

const PALETTES = [
  ['#ff9966', '#ff5e62'],
  ['#70e1f5', '#ffd194'],
  ['#c471f5', '#fa71cd'],
  ['#1db954', '#0f172a'],
];

export default function SongsScreen() {
  const router = useRouter();
  const [paletteIndex, setPaletteIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPaletteIndex((prev) => (prev + 1) % PALETTES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const palette = useMemo(() => PALETTES[paletteIndex], [paletteIndex]);

  return (
    <ScreenWrapper>
      <View style={styles.root}>
        <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(5,6,15,0.8)', 'rgba(5,6,15,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Movie soundtrack</Text>
            <Text style={styles.title}>Let It Go · Frozen</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/search')}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.playerCard}>
          <LinearGradient colors={palette} style={styles.albumArt}>
            <Feather name="music" size={42} color="rgba(255,255,255,0.9)" />
            <Text style={styles.albumMovie}>Frozen</Text>
          </LinearGradient>
          <View style={styles.trackMeta}>
            <Text style={styles.trackTitle}>Let It Go</Text>
            <Text style={styles.trackArtist}>Idina Menzel · Original Motion Picture Soundtrack</Text>
            <Text style={styles.trackContext}>Scene: Elsa crowns herself queen of Arendelle</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={styles.progressFill} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>01:12</Text>
            <Text style={styles.timeText}>03:44</Text>
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlGhost}>
              <Ionicons name="shuffle" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlGhost}>
              <Ionicons name="play-skip-back" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.playBtn}>
              <Ionicons name="pause" size={26} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlGhost}>
              <Ionicons name="play-skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlGhost}>
              <Ionicons name="repeat" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonPill}>
            <Ionicons name="musical-notes" size={16} color="#0c111f" />
            <Text style={styles.comingSoonPillText}>Spotlight</Text>
          </View>
          <Text style={styles.comingSoonTitle}>Songs coming soon</Text>
          <Text style={styles.comingSoonCopy}>
            Soon you&apos;ll be able to queue iconic soundtrack moments (like Let It Go) directly inside MovieFlix. Sing along,
            loop the bridge, and pin scenes to your profile once the sound studio launches.
          </Text>
          <TouchableOpacity style={styles.notifyBtn} onPress={() => router.push('/profile')}>
            <Text style={styles.notifyBtnText}>Notify me</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  playerCard: {
    marginTop: 40,
    borderRadius: 32,
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  albumArt: {
    height: 260,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 18,
  },
  albumMovie: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  trackMeta: {
    gap: 6,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  trackContext: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
  },
  progressBar: {
    height: 6,
    marginTop: 20,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '40%',
    borderRadius: 3,
    backgroundColor: '#1db954',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  controlGhost: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  playBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1db954',
    shadowColor: '#1db954',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  comingSoonCard: {
    marginTop: 32,
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  comingSoonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1db954',
  },
  comingSoonPillText: {
    color: '#0c111f',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  comingSoonTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 14,
  },
  comingSoonCopy: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  notifyBtn: {
    marginTop: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  notifyBtnText: {
    color: '#05060f',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
