
import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../components/ScreenWrapper';
import { ThemedText } from '../components/themed-text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Media } from '../types';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IMAGE_BASE_URL } from '../constants/api';
import { getAccentFromPosterPath } from '../constants/theme';
import { getProfileScopedKey } from '../lib/profileStorage';

const MyListScreen = () => {
  const [myList, setMyList] = useState<Media[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchMyList = async () => {
        try {
          const key = await getProfileScopedKey('myList');
          const list = await AsyncStorage.getItem(key);
          if (!isActive) return;
          setMyList(list ? JSON.parse(list) : []);
        } catch (error) {
          if (isActive) {
            console.error('Error fetching My List:', error);
            setMyList([]);
          }
        }
      };

      fetchMyList();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const accentColor = getAccentFromPosterPath(myList[0]?.poster_path);
  const tonightPick = myList.length
    ? myList.reduce((best, item) => {
        if (!best) return item;
        const bestScore = (best.vote_average ?? 0) + (best.popularity ?? 0) * 0.01;
        const currentScore = (item.vote_average ?? 0) + (item.popularity ?? 0) * 0.01;
        return currentScore > bestScore ? item : best;
      }, myList[0] as Media)
    : null;

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(113,0,255,0.16)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />

        <View style={styles.container}>
          {/* Glassy header similar to Movies tab */}
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <View style={styles.titleRow}>
                <View style={styles.accentDot} />
                <View>
                  <Text style={styles.headerEyebrow}>Saved for later</Text>
                  <Text style={styles.headerText}>My List</Text>
                </View>
              </View>

              <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="chevron-back" size={22} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {tonightPick && (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/details/${tonightPick.id}?mediaType=${tonightPick.media_type || 'movie'}`
                )
              }
            >
              <BlurView intensity={70} tint="dark" style={styles.tonightCard}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.26)', 'rgba(255,255,255,0.06)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.glassSheen}
                />
                <View style={styles.tonightRow}>
                  <View style={styles.tonightPosterWrap}>
                    <Image
                      source={{ uri: `${IMAGE_BASE_URL}${tonightPick.poster_path}` }}
                      style={styles.tonightPoster}
                    />
                  </View>
                  <View style={styles.tonightTextWrap}>
                    <Text style={styles.tonightLabel}>Tonight&apos;s Pick</Text>
                    <Text style={styles.tonightTitle} numberOfLines={2}>
                      {tonightPick.title || tonightPick.name}
                    </Text>
                    <Text style={styles.tonightSubtitle} numberOfLines={1}>
                      Based on your list & ratings
                    </Text>
                  </View>
                  <View style={styles.tonightIconWrap}>
                    <Ionicons name="play-circle" size={30} color="#ffffff" />
                  </View>
                </View>
              </BlurView>
            </TouchableOpacity>
          )}

          <FlatList
            data={myList}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => router.push(`/details/${item.id}?mediaType=${item.media_type || 'movie'}`)}>
                <BlurView intensity={70} tint="dark" style={styles.itemGlass}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.06)', 'rgba(229,9,20,0.14)']}
                    start={{ x: 0.05, y: 0 }}
                    end={{ x: 0.95, y: 1 }}
                    style={styles.glassSheen}
                  />
                  <View style={styles.movieRow}>
                    <View style={styles.posterWrap}>
                      <Image
                        source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
                        style={styles.moviePoster}
                      />
                    </View>
                    <View style={styles.movieContainer}>
                      <Text style={styles.movieTitle} numberOfLines={1}>
                        {item.title || item.name}
                      </Text>
                      <Text style={styles.movieMeta} numberOfLines={1}>
                        {item.media_type === 'tv' ? 'Series' : 'Movie'} • In your list
                      </Text>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <BlurView intensity={70} tint="dark" style={styles.emptyCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.06)', 'rgba(229,9,20,0.14)']}
                  start={{ x: 0.05, y: 0 }}
                  end={{ x: 0.95, y: 1 }}
                  style={styles.glassSheen}
                />
                <Text style={styles.emptyTitle}>Nothing saved yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap the plus icon on any movie or show to add it here.
                </Text>
              </BlurView>
            }
          />
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -60,
    left: -40,
    opacity: 0.6,
    transform: [{ rotate: '15deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -90,
    right: -20,
    opacity: 0.55,
    transform: [{ rotate: '-12deg' }],
  },
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  headerWrap: {
    marginHorizontal: 12,
    marginTop: 18,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  glassSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 160,
  },
  tonightCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    backgroundColor: 'rgba(10,12,24,0.9)',
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tonightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tonightPosterWrap: {
    width: 70,
    marginRight: 10,
  },
  tonightPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 10,
  },
  tonightTextWrap: {
    flex: 1,
  },
  tonightLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginBottom: 2,
  },
  tonightTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  tonightSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
  },
  tonightIconWrap: {
    marginLeft: 8,
  },
  itemGlass: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    shadowColor: '#7dd8ff',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  movieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  posterWrap: {
    width: 70,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#111',
    marginRight: 12,
  },
  moviePoster: {
    width: '100%',
    height: '100%',
  },
  movieContainer: {
    flex: 1,
  },
  movieTitle: {
    color: '#fefefe',
    fontSize: 16,
    fontWeight: '700',
  },
  movieMeta: {
    color: 'rgba(230,230,230,0.78)',
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    marginTop: 40,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    shadowColor: '#7dd8ff',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  emptyTitle: {
    color: '#fefefe',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  emptySubtitle: {
    color: '#e4e6f0',
    fontSize: 14,
    marginTop: 4,
  },
});

export default MyListScreen;
