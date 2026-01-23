import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '../../components/AccentContext';
import { darkenColor, lightenColor, withAlpha } from '@/lib/colorUtils';

interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  greeting?: string;
  chatCount?: number;
  followingCount?: number;
  onSearch?: () => void;
  onSettings?: () => void;
  onSnowToggle?: () => void;
  isSnowing?: boolean;
}

export default function GlassHeader({
  title,
  subtitle,
  greeting,
  chatCount = 0,
  followingCount = 0,
  onSearch,
  onSettings,
  onSnowToggle,
  isSnowing,
}: GlassHeaderProps) {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, [pulseAnim, glowAnim]);

  return (
    <View style={styles.container}>
      {/* Background glow effect */}
      <Animated.View style={[styles.glowBg, { opacity: glowAnim }]}>
        <LinearGradient
          colors={[withAlpha(accent, 0.25), 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* Glass card */}
      <View style={styles.glassCard}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.12)',
            'rgba(255,255,255,0.05)',
            'rgba(0,0,0,0.1)',
          ]}
          style={styles.glassGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <View style={styles.innerHighlight} />

        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.titleRow} activeOpacity={0.8} onPress={onSearch}>
            <Animated.View 
              style={[
                styles.accentDot, 
                { 
                  backgroundColor: accent,
                  shadowColor: accent,
                  transform: [{ scale: pulseAnim }],
                }
              ]} 
            />
            
            <View style={styles.titleContent}>
              {greeting && <Text style={styles.eyebrow}>{greeting}</Text>}
              <Text style={styles.title}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.actions}>
            {onSnowToggle && (
              <TouchableOpacity 
                style={[styles.iconBtn, isSnowing && { backgroundColor: withAlpha(accent, 0.3) }]} 
                onPress={onSnowToggle}
              >
                <LinearGradient
                  colors={[withAlpha(accent, 0.2), withAlpha(darkenColor(accent, 0.3), 0.2)]}
                  style={styles.iconGradient}
                >
                  <Ionicons name="snow" size={20} color={isSnowing ? '#fff' : 'rgba(255,255,255,0.8)'} />
                </LinearGradient>
              </TouchableOpacity>
            )}
            
            {onSearch && (
              <TouchableOpacity style={styles.iconBtn} onPress={onSearch}>
                <LinearGradient
                  colors={[withAlpha(accent, 0.2), withAlpha(darkenColor(accent, 0.3), 0.2)]}
                  style={styles.iconGradient}
                >
                  <Ionicons name="search" size={20} color="rgba(255,255,255,0.9)" />
                </LinearGradient>
              </TouchableOpacity>
            )}
            
            {onSettings && (
              <TouchableOpacity style={styles.iconBtn} onPress={onSettings}>
                <LinearGradient
                  colors={[withAlpha(accent, 0.2), withAlpha(darkenColor(accent, 0.3), 0.2)]}
                  style={styles.iconGradient}
                >
                  <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.9)" />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: withAlpha(accent, 0.15) }]}>
            <Ionicons name="chatbubbles" size={14} color={lightenColor(accent, 0.3)} />
            <Text style={[styles.statText, { color: lightenColor(accent, 0.3) }]}>{chatCount} chats</Text>
          </View>
          
          <View style={styles.statPill}>
            <Ionicons name="people" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>{followingCount} following</Text>
          </View>
          
          <View style={[styles.statPill, styles.statPillOutline]}>
            <Ionicons name="call" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statText}>Calls</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  glowBg: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 200,
  },
  glowGradient: {
    flex: 1,
  },
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(20,22,30,0.6)',
  },
  glassGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  titleContent: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  iconGradient: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statPillOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});
