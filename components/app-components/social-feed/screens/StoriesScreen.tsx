import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  StatusBar,
} from 'react-native';
import ScreenWrapper from '../../../../components/ScreenWrapper';
import { useAccent } from '../../AccentContext';
import { getPersistedCache } from '@/lib/persistedCache';
import { useUser } from '../../../../hooks/use-user';
import LiquidGlass from '../../LiquidGlass';
import StoriesRow from '../StoriesRow';

export default function StoriesScreen() {
  const router = useRouter();
  const { accentColor, setAccentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const { user } = useUser();
  const [archivedStories, setArchivedStories] = useState<any[]>([]);
  const viewerId = (user as any)?.uid ? String((user as any).uid) : 'anon';
  const archiveCacheKey = useMemo(() => `__movieflix_stories_archive_v1:${viewerId}`, [viewerId]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const orbPulse = useRef(new Animated.Value(1)).current;
  
  // Aurora particles
  const auroraParticles = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      x: new Animated.Value(Math.random() * 400),
      y: new Animated.Value(50 + Math.random() * 100),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
      hue: new Animated.Value(Math.random() * 360),
    }))
  ).current;

  useEffect(() => {
    setAccentColor('#e50914');
    
    // Entrance animation
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    
    // Orb pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1.15, duration: 1500, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
    
    // Holographic shimmer
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    
    // Aurora particles
    auroraParticles.forEach((particle, i) => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
            Animated.timing(particle.opacity, { toValue: 0.2, duration: 1500, useNativeDriver: true }),
          ]),
          Animated.timing(particle.y, { toValue: -30, duration: 4000 + i * 500, useNativeDriver: true }),
          Animated.timing(particle.hue, { toValue: 360, duration: 6000 + i * 300, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [setAccentColor]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await getPersistedCache<any[]>(archiveCacheKey, { maxAgeMs: 1000 * 60 * 60 * 24 * 7 });
      if (!active) return;
      if (cached?.value?.length) setArchivedStories(cached.value as any);
    })();
    return () => {
      active = false;
    };
  }, [archiveCacheKey]);

  const headerOpacityAnim = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />
        
        {/* Cinematic Immersive Background */}
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={['#1a0f1f', '#0b0512', '#050509', '#030307']}
            locations={[0, 0.3, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          
          {/* Aurora particles */}
          {auroraParticles.map((particle, i) => (
            <Animated.View
              key={`aurora-${i}`}
              pointerEvents="none"
              style={[
                styles.auroraParticle,
                {
                  left: particle.x,
                  top: particle.y,
                  opacity: particle.opacity,
                  transform: [{ scale: particle.scale }],
                  shadowColor: `hsl(${particle.hue}, 100%, 60%)`,
                  backgroundColor: `hsl(${particle.hue}, 80%, 65%)`,
                },
              ]}
            />
          ))}
          
          {/* Animated orb */}
          <Animated.View 
            style={[
              styles.animatedOrb,
              { 
                transform: [{ scale: orbPulse }],
                opacity: orbPulse.interpolate({ inputRange: [1, 1.15], outputRange: [0.3, 0.5] }),
              }
            ]}
          >
            <LinearGradient
              colors={[accent, '#7dd8ff', '#a855f7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          {/* Prismatic shimmer */}
          <Animated.View 
            style={[
              styles.prismaticShimmer,
              {
                opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.2, 0.1] }),
                transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-300, 300] }) }],
              }
            ]}
          >
            <LinearGradient
              colors={['transparent', accent + '20', 'rgba(125,216,255,0.15)', 'rgba(168,85,247,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <Animated.View style={[styles.header, { opacity: Animated.multiply(headerOpacityAnim, headerOpacity), transform: [{ scale: headerScale }] }]}>
          <View style={styles.headerLeft}>
            <Animated.View style={{ transform: [{ scale: orbPulse }] }}>
              <LiquidGlass 
                cornerRadius={16} 
                tintOpacity={0.2}
                tintColor={accent}
                glowColor={accent}
                glowIntensity={0.5}
                chromaticAberration
                breathingEffect
                style={styles.headerDotGlass}
              >
                <Ionicons name="camera" size={20} color={accent} />
              </LiquidGlass>
            </Animated.View>
            <View>
              <Text style={styles.eyebrow}>STORIES</Text>
              <Text style={styles.title}>Cinematic Moments</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerActionBtn} 
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push('/story-upload');
              }}
            >
              <LiquidGlass 
                cornerRadius={22} 
                tintOpacity={0.15} 
                tintColor={accent}
                glowColor={accent}
                glowIntensity={0.4}
                chromaticAberration
                interactive
                style={styles.actionGlass}
              >
                <Ionicons name="camera" size={22} color="#fff" />
              </LiquidGlass>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.headerActionBtn}
              onPress={() => {
                if (archivedStories.length === 0) {
                  Alert.alert('Archive empty', 'Watch more stories to build your archive.');
                  return;
                }
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push({
                  pathname: '/story-viewer',
                  params: {
                    stories: JSON.stringify(archivedStories),
                    initialStoryId: String(archivedStories[0]?.id || ''),
                  },
                } as any);
              }}
            >
              <LiquidGlass 
                cornerRadius={22} 
                tintOpacity={0.15} 
                glowColor="#7dd8ff"
                glowIntensity={0.4}
                chromaticAberration
                interactive
                style={styles.actionGlass}
              >
                <MaterialCommunityIcons name="history" size={22} color="#7dd8ff" />
              </LiquidGlass>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          <View style={styles.sectionWrap}>
            <LiquidGlass 
              cornerRadius={32} 
              tintOpacity={0.08}
              glowColor={accent}
              glowIntensity={0.15}
              borderOpacity={0.2}
              breathingEffect
              style={styles.sectionGlass}
            >
              <StoriesRow showAddStory title="Your Circle" limit={12} />
            </LiquidGlass>
          </View>

          <View style={styles.sectionWrap}>
            <LiquidGlass 
              cornerRadius={32} 
              tintOpacity={0.06}
              glowColor="#7dd8ff"
              glowIntensity={0.15}
              borderOpacity={0.15}
              breathingEffect
              style={styles.sectionGlass}
            >
              <StoriesRow title="Archive Highlights" seedStories={archivedStories} disableLiveFetch hideSeeAll emptyHint="No archived stories yet" />
            </LiquidGlass>
          </View>

          <View style={styles.sectionWrap}>
            <LiquidGlass 
              cornerRadius={32} 
              tintOpacity={0.06}
              glowColor="#a855f7"
              glowIntensity={0.15}
              borderOpacity={0.15}
              breathingEffect
              style={styles.sectionGlass}
            >
              <StoriesRow title="Recommended" offset={12} limit={12} hideSeeAll emptyHint="More stories coming soon" />
            </LiquidGlass>
          </View>
        </ScrollView>
      </ScreenWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030307' },
  
  // Aurora particles
  auroraParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Animated orb
  animatedOrb: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  
  // Prismatic shimmer
  prismaticShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    overflow: 'hidden',
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerDotGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerActionBtn: { width: 44, height: 44 },
  actionGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  contentContainer: { paddingBottom: 120, paddingHorizontal: 14 },
  sectionWrap: { marginBottom: 16 },
  sectionGlass: { paddingVertical: 16, paddingHorizontal: 4, borderRadius: 32 },
});
