import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { authPromise, firestore } from '../../../constants/firebase';

export default function SocialHeader({ title = 'Feeds', compact = false }: { title?: string; compact?: boolean }) {
  const router = useRouter();
  const [userName, setUserName] = useState('streamer');
  const navInFlightRef = React.useRef(false);
  const deferNav = React.useCallback((action: () => void) => {
    if (navInFlightRef.current) return;
    navInFlightRef.current = true;
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        try {
          action();
        } finally {
          navInFlightRef.current = false;
        }
      });
    });
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const loadFromStorage = async () => {
      try {
        const stored = await AsyncStorage.getItem('activeProfile');
        if (stored) {
          const parsed = JSON.parse(stored) as any;
          if (parsed?.name) {
            setUserName(parsed.name);
            return true;
          }
        }
      } catch (err) {
        // ignore and fallback
      }
      return false;
    };

    const init = async () => {
      try {
        const auth = await authPromise;

        // prefer activeProfile from AsyncStorage
        const found = await loadFromStorage();
        if (found) return;

        // initial fetch of current user profile (if any)
        const user = auth.currentUser;
        if (user) {
          try {
            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
            if (userDoc.exists()) {
              const data = userDoc.data() as any;
              setUserName(data?.name ?? 'streamer');
            }
          } catch (err) {
            console.error('SocialHeader: failed to fetch user doc', err);
          }
        }

        // subscribe to auth changes and update name when user changes
        unsub = onAuthStateChanged(auth, async (u) => {
          if (!u) {
            setUserName('streamer');
            return;
          }

          // check AsyncStorage again (active profile may have been selected)
          const foundNow = await loadFromStorage();
          if (foundNow) return;

          try {
            const userDoc = await getDoc(doc(firestore, 'users', u.uid));
            if (userDoc.exists()) {
              const data = userDoc.data() as any;
              setUserName(data?.name ?? 'streamer');
            } else {
              setUserName('streamer');
            }
          } catch (err) {
            console.error('SocialHeader: failed to fetch user on auth change', err);
            setUserName('streamer');
          }
        });
      } catch (err) {
        console.warn('SocialHeader: auth initialization failed', err);
        setUserName('streamer');
      }
    };

    init();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={['#e50914', '#b20710']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <View style={styles.headerBar}>
        <LinearGradient
          colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerSheen}
        />

        <View style={styles.leftGroup}>
          <TouchableOpacity onPress={() => deferNav(() => router.back())} style={styles.leftIcon}>
            <Ionicons name="arrow-back" size={28} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.accentDot} />
          <View>
            {compact ? (
              <Text style={styles.titleText}>{title || 'Social'}</Text>
            ) : (
              <>
                <Text style={styles.eyebrow}>Social</Text>
                <Text style={styles.titleText}>Welcome, {userName}</Text>
                <Text style={styles.subtitle}>{title}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/messaging'))}>
            <LinearGradient
              colors={['#e50914', '#b20710']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBg}
            >
              <Ionicons name="chatbubble-outline" size={22} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/search'))}>
            <LinearGradient
              colors={['#e50914', '#b20710']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBg}
            >
              <Ionicons name="search" size={22} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 80 : 50,
    marginBottom: 6,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  headerSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  leftGroup: {
    width: 56,
    alignItems: 'flex-start',
  },
  leftIcon: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5f84ff',
    marginRight: 8,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  titleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 4,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  iconBg: {
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

