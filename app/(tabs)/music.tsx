
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Animated,
  RefreshControl,
  Platform,
  FlatList,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { usePStream } from '../../src/pstream/usePStream';
import LiquidGlass from '../../components/app-components/LiquidGlass';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useGlobalMusicPlayer } from '../../components/app-components/GlobalMusicPlayer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, Timestamp } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 60) / 2;

const CATEGORIES = ['All', 'Trending', 'Relax', 'Workout', 'Party', 'Focus', 'Meditation'];
const MOODS = [
  { name: 'Deep Focus', color: '#4facfe', icon: 'brain' },
  { name: 'Late Night', color: '#667eea', icon: 'weather-night' },
  { name: 'Pure Energy', color: '#f093fb', icon: 'lightning-bolt' },
  { name: 'Chilled Vibe', color: '#84fab0', icon: 'leaf' },
];
const PLAYLISTS = [
  { name: 'Global Top 50', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400', tracks: '50 songs' },
  { name: 'Lo-fi Beats', image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400', tracks: '120 songs' },
  { name: 'Glow Up Pop', image: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400', tracks: '85 songs' },
];

// Equalizer Presets
const EQ_PRESETS = [
  { name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', bands: [6, 5, 3, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', bands: [0, 0, 0, 0, 2, 4, 5, 6] },
  { name: 'Vocal', bands: [-2, -1, 0, 3, 4, 3, 0, -1] },
  { name: 'Rock', bands: [5, 3, -1, -2, -1, 2, 4, 5] },
  { name: 'Electronic', bands: [4, 2, 0, -2, -1, 2, 4, 5] },
  { name: 'Jazz', bands: [3, 2, 0, 2, 3, 3, 2, 3] },
  { name: 'Classical', bands: [4, 3, 2, 1, -1, 2, 3, 4] },
];

const FAVORITES_KEY = '@movieflix_music_favorites';
const RECENT_KEY = '@movieflix_music_recent';

const MusicScreen = () => {
  const { searchMusic } = usePStream();
  const { playTrack, playerActive, downloadTrack, accentColor: playerAccent, isPlaying: isPlayerPlaying, activeTrack: currentPlayerTrack, togglePlay, progress, duration } = useGlobalMusicPlayer();
  const accentColor = useThemeColor({}, 'primary');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [songs, setSongs] = useState<any[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const [customBands, setCustomBands] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFavorites, setShowFavorites] = useState(false);
  const [recommendedTracks, setRecommendedTracks] = useState<any[]>([]);
  
  // Animations
  const scrollY = useRef(new Animated.Value(0)).current;
  const visualizerAnim = useRef(new Animated.Value(0)).current;

  // Firestore refs
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;

  // Load persisted data and Firestore history
  useEffect(() => {
    const loadData = async () => {
      try {
        const [favData, recentData] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(RECENT_KEY),
        ]);
        if (favData) setFavorites(JSON.parse(favData));
        if (recentData) setRecentlyPlayed(JSON.parse(recentData));
      } catch (e) {
        console.warn('Failed to load persisted music data:', e);
      }
    };
    loadData();

    // Subscribe to Firestore music history for curated recommendations
    if (user) {
      const historyRef = doc(collection(db, 'users'), user.uid);
      const unsubscribe = onSnapshot(historyRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const musicHistory = data.musicHistory || [];
          // Use last 10 played tracks for recommendations
          if (musicHistory.length > 0) {
            const recentArtists = musicHistory.slice(0, 5).map((h: any) => h.artist).filter(Boolean);
            // Fetch recommendations based on recent artists
            if (recentArtists.length > 0) {
              fetchRecommendations(recentArtists);
            }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Fetch recommendations based on listening history
  const fetchRecommendations = async (artists: string[]) => {
    try {
      const queries = artists.slice(0, 3).map(a => searchMusic(`${a} similar`));
      const results = await Promise.all(queries);
      const combined = results.flat().slice(0, 10);
      setRecommendedTracks(combined);
    } catch (e) {
      console.warn('Failed to fetch recommendations:', e);
    }
  };

  // Animate visualizer when playing
  useEffect(() => {
    if (isPlayerPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(visualizerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(visualizerAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      visualizerAnim.setValue(0);
    }
  }, [isPlayerPlaying]);

  const fetchMusic = useCallback(async (query: string = 'trending music 2026') => {
    setLoading(true);
    try {
      const results = await searchMusic(query);
      setSongs(results);
      if (recentlyPlayed.length === 0 && results.length > 4) {
          setRecentlyPlayed(results.slice(4, 10));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchMusic, recentlyPlayed]);

  useEffect(() => {
    fetchMusic();
  }, [fetchMusic]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMusic();
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 2) fetchMusic(text);
    else if (text.length === 0) fetchMusic();
  };

  const handlePlayTrack = async (track: any) => {
    playTrack(track, songs, accentColor);
    const newRecent = [track, ...recentlyPlayed.filter(s => String(s.videoId || s.id) !== String(track.videoId || track.id))].slice(0, 20);
    setRecentlyPlayed(newRecent);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(newRecent)).catch(() => {});

    // Save to Firestore for curated algorithm
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const historyEntry = {
          id: track.videoId || track.id,
          title: track.title,
          artist: track.artist || track.uploaderName || 'Unknown',
          thumbnail: track.thumbnail,
          playedAt: Timestamp.now(),
          duration: track.duration || 0,
        };
        
        // Add to music history array (keep last 100)
        await updateDoc(userRef, {
          musicHistory: arrayUnion(historyEntry),
        }).catch(async () => {
          // If doc doesn't exist, create it
          await setDoc(userRef, {
            musicHistory: [historyEntry],
            musicFavorites: [],
          }, { merge: true });
        });

        // Trim history to last 100 entries (run periodically)
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const history = userSnap.data()?.musicHistory || [];
          if (history.length > 100) {
            const trimmed = history.slice(-100);
            await updateDoc(userRef, { musicHistory: trimmed });
          }
        }
      } catch (e) {
        console.warn('Failed to save music history to Firestore:', e);
      }
    }
  };

  const toggleFavorite = async (track: any) => {
    const trackId = String(track.videoId || track.id);
    const isFav = favorites.some(f => String(f.videoId || f.id) === trackId);
    const newFavs = isFav 
      ? favorites.filter(f => String(f.videoId || f.id) !== trackId)
      : [...favorites, track];
    setFavorites(newFavs);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavs));
    
    // Sync to Firestore
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const favEntry = {
          id: trackId,
          title: track.title,
          artist: track.artist || track.uploaderName || 'Unknown',
          thumbnail: track.thumbnail,
          addedAt: Timestamp.now(),
        };
        
        if (isFav) {
          await updateDoc(userRef, {
            musicFavorites: arrayRemove(favEntry),
          });
        } else {
          await updateDoc(userRef, {
            musicFavorites: arrayUnion(favEntry),
          });
        }
      } catch (e) {
        console.warn('Failed to sync favorites to Firestore:', e);
      }
    }
    
    Alert.alert(isFav ? 'Removed from Favorites' : 'Added to Favorites', track.title);
  };

  const isFavorite = (track: any) => favorites.some(f => String(f.videoId || f.id) === String(track.videoId || track.id));

  const handleEqualizerPreset = (index: number) => {
    setActivePreset(index);
    setCustomBands(EQ_PRESETS[index].bands);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  // Dynamic Island Animations
  const islandTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  const islandOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });

  const headerTextOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Background with mesh gradient feel */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['#0a0b1e', '#000']} style={StyleSheet.absoluteFill} />
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />
      </View>

      <Animated.View style={[
        styles.dynamicIsland,
        {
          transform: [{ translateY: islandTranslateY }],
          opacity: islandOpacity,
        }
      ]}>
        <LiquidGlass
          tintOpacity={0.18}
          tintColor="#000000"
          cornerRadius={32}
          borderOpacity={0.25}
          glowIntensity={0.2}
          glowColor={accentColor || '#e50914'}
          chromaticAberration={true}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.islandContent}>
          <View style={styles.islandLeft}>
            <View style={[styles.accentDot, { backgroundColor: accentColor || '#e50914', shadowColor: accentColor || '#e50914' }]} />
            <Animated.View style={{ opacity: headerTextOpacity, marginLeft: 8 }}>
              <Text style={styles.islandEyebrow}>DISCOVER VIBE</Text>
              <Text style={styles.islandTitle}>Music Pro</Text>
            </Animated.View>
          </View>
          <View style={styles.islandActions}>
            <TouchableOpacity style={styles.islandIconBtn} onPress={() => setShowEqualizer(true)}>
              <Ionicons name="options-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.islandIconBtn} onPress={() => setShowFavorites(!showFavorites)}>
              <Ionicons name={showFavorites ? "heart" : "heart-outline"} size={20} color={showFavorites ? accentColor : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Mini Player - Shows when track is playing */}
      {playerActive && currentPlayerTrack && (
        <TouchableOpacity 
          style={styles.miniPlayer} 
          activeOpacity={0.9}
          onPress={() => {/* Could open full player modal */}}
        >
          <LiquidGlass cornerRadius={20} tintOpacity={0.25} tintColor="#000" style={StyleSheet.absoluteFill} />
          <Image source={{ uri: currentPlayerTrack.thumbnail }} style={styles.miniThumb} />
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>{currentPlayerTrack.title}</Text>
            <Text style={styles.miniArtist} numberOfLines={1}>{currentPlayerTrack.artist || 'Unknown'}</Text>
          </View>
          <View style={styles.miniProgress}>
            <View style={[styles.miniProgressFill, { width: `${(progress / duration) * 100}%`, backgroundColor: accentColor }]} />
          </View>
          <TouchableOpacity style={styles.miniPlayBtn} onPress={togglePlay}>
            <Ionicons name={isPlayerPlaying ? "pause" : "play"} size={24} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <Animated.ScrollView 
        contentContainerStyle={[styles.scrollContent, playerActive && { paddingBottom: 180 }]} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
        onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <View style={styles.searchSection}>
            <LiquidGlass 
            cornerRadius={24} 
            tintOpacity={0.1} 
            dynamicHighlight 
            style={styles.searchBarContainer}
            >
            <View style={styles.searchInner}>
                <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
                <TextInput
                style={styles.searchInput}
                placeholder="Artists, songs, or genres..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={searchQuery}
                onChangeText={handleSearch}
                />
                {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
                )}
            </View>
            </LiquidGlass>
        </View>

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recently Played</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                    {recentlyPlayed.map((item, i) => (
                        <TouchableOpacity key={i} style={styles.recentCard} onPress={() => handlePlayTrack(item)}>
                            <View style={styles.recentThumbContainer}>
                                <Image source={{ uri: item.thumbnail }} style={styles.recentThumb} />
                                <View style={styles.recentPlayBtn}>
                                    <Ionicons name="play" size={14} color="#fff" />
                                </View>
                            </View>
                            <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        )}

        {/* For You - Curated based on listening history */}
        {recommendedTracks.length > 0 && (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>For You</Text>
                    <Text style={styles.curatedBadge}>Based on your history</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                    {recommendedTracks.map((item, i) => (
                        <TouchableOpacity key={i} style={styles.recentCard} onPress={() => handlePlayTrack(item)}>
                            <View style={styles.recentThumbContainer}>
                                <Image source={{ uri: item.thumbnail }} style={styles.recentThumb} />
                                <View style={styles.aiBadge}>
                                    <Ionicons name="sparkles" size={10} color="#FFD700" />
                                </View>
                                <View style={styles.recentPlayBtn}>
                                    <Ionicons name="play" size={14} color="#fff" />
                                </View>
                            </View>
                            <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.recentArtist} numberOfLines={1}>{item.artist || 'Artist'}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        )}

        {/* Categories */}
        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>Categories</Text>
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity 
              key={cat} 
              onPress={() => setActiveCategory(cat)}
              activeOpacity={0.8}
            >
              <LiquidGlass 
                cornerRadius={12} 
                tintOpacity={activeCategory === cat ? 0.4 : 0.08}
                tintColor={activeCategory === cat ? accentColor : undefined}
                borderOpacity={activeCategory === cat ? 0.5 : 0.1}
                style={styles.catGlass}
              >
                <Text style={[styles.catText, activeCategory === cat && styles.catTextActive]}>{cat}</Text>
              </LiquidGlass>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Mood Radio */}
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Mood</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodScroll}>
            {MOODS.map((mood, i) => (
                <TouchableOpacity key={i} activeOpacity={0.8}>
                    <LiquidGlass cornerRadius={20} tintColor={mood.color} tintOpacity={0.15} style={styles.moodGlass}>
                        <MaterialCommunityIcons name={mood.icon as any} size={24} color={mood.color} />
                        <Text style={styles.moodText}>{mood.name}</Text>
                    </LiquidGlass>
                </TouchableOpacity>
            ))}
        </ScrollView>

        {/* Hero Card */}
        {songs.length > 0 && !loading && (
          <TouchableOpacity 
            style={styles.heroContainer} 
            onPress={() => handlePlayTrack(songs[0])}
            activeOpacity={0.9}
          >
            <LiquidGlass 
                cornerRadius={32} 
                tintOpacity={0.15} 
                breathingEffect 
                style={styles.heroGlass}
            >
                <Image source={{ uri: songs[0].thumbnail }} style={styles.heroImage} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
                <View style={styles.heroContent}>
                    <View style={styles.heroBadge}>
                        <Text style={styles.heroBadgeText}>TRENDING NOW • OFFLINE ENABLED</Text>
                    </View>
                    <Text style={styles.heroTitle} numberOfLines={2}>{songs[0].title}</Text>
                    <Text style={styles.heroArtist}>{songs[0].artist || 'Featured Artist'}</Text>
                    
                    <View style={styles.heroActions}>
                        <View style={[styles.playBtnLarge, { backgroundColor: accentColor }]}>
                            <Ionicons name="play" size={24} color="#fff" />
                        </View>
                        <View style={styles.heroStats}>
                             <Ionicons name="headset-outline" size={14} color="rgba(255,255,255,0.6)" />
                             <Text style={styles.heroStatsText}>42k listeners</Text>
                        </View>
                    </View>
                </View>
            </LiquidGlass>
          </TouchableOpacity>
        )}

        {/* Playlists */}
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Playlists</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodScroll}>
            {PLAYLISTS.map((pl, i) => (
                <TouchableOpacity key={i} activeOpacity={0.8}>
                    <View style={styles.plCard}>
                        <Image source={{ uri: pl.image }} style={styles.plThumb} />
                        <Text style={styles.plTitle}>{pl.name}</Text>
                        <Text style={styles.plMeta}>{pl.tracks}</Text>
                    </View>
                </TouchableOpacity>
            ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{showFavorites ? 'Your Favorites' : `${activeCategory} Picks`}</Text>
            <View style={styles.viewToggle}>
              <TouchableOpacity style={styles.viewBtn} onPress={() => setViewMode('grid')}>
                <Ionicons name="grid-outline" size={20} color={viewMode === 'grid' ? accentColor : 'rgba(255,255,255,0.4)'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.viewBtn} onPress={() => setViewMode('list')}>
                <Ionicons name="list-outline" size={20} color={viewMode === 'list' ? accentColor : 'rgba(255,255,255,0.4)'} />
              </TouchableOpacity>
            </View>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={styles.loadingText}>Tuning your frequencies...</Text>
          </View>
        ) : (
          <View style={viewMode === 'grid' ? styles.grid : styles.listView}>
            {(showFavorites ? favorites : songs).map((item, index) => (
              <View key={index} style={viewMode === 'grid' ? styles.card : styles.listCard}>
                <TouchableOpacity 
                    style={viewMode === 'grid' ? styles.cardImageContainer : styles.listImageContainer} 
                    onPress={() => handlePlayTrack(item)}
                    activeOpacity={0.8}
                >
                    <Image source={{ uri: item.thumbnail }} style={viewMode === 'grid' ? styles.cardImage : styles.listImage} />
                    <LiquidGlass 
                        cornerRadius={viewMode === 'grid' ? 15 : 12} 
                        tintOpacity={0.2} 
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.cardPlayOverlay}>
                        <View style={[styles.miniPlayBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                            <Ionicons name="play" size={18} color="#fff" />
                        </View>
                    </View>
                </TouchableOpacity>
                <View style={styles.cardBottomRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={viewMode === 'grid' ? styles.cardTitle : styles.listTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={viewMode === 'grid' ? styles.cardArtist : styles.listArtist} numberOfLines={1}>{item.artist || 'Artist'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleFavorite(item)} style={styles.cardDownload}>
                        <Ionicons name={isFavorite(item) ? "heart" : "heart-outline"} size={18} color={isFavorite(item) ? accentColor : "rgba(255,255,255,0.4)"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => downloadTrack(item)} style={styles.cardDownload}>
                        <Ionicons name="cloud-download-outline" size={18} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {/* Equalizer Modal */}
      <Modal visible={showEqualizer} transparent animationType="slide" onRequestClose={() => setShowEqualizer(false)}>
        <View style={styles.eqOverlay}>
          <LinearGradient colors={['#1a1b2e', '#0d0e1a']} style={styles.eqSheet}>
            <View style={styles.eqHeader}>
              <Text style={styles.eqTitle}>Equalizer</Text>
              <TouchableOpacity onPress={() => setShowEqualizer(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {/* Presets */}
            <View style={styles.eqPresets}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eqPresetScroll}>
                {EQ_PRESETS.map((preset, i) => (
                  <TouchableOpacity 
                    key={preset.name} 
                    style={[styles.eqPreset, activePreset === i && styles.eqPresetActive]}
                    onPress={() => handleEqualizerPreset(i)}
                  >
                    <Text style={[styles.eqPresetText, activePreset === i && styles.eqPresetTextActive]}>{preset.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Bands */}
            <View style={styles.eqBands}>
              {['60Hz', '170Hz', '400Hz', '1kHz', '3kHz', '6kHz', '12kHz', '16kHz'].map((label, i) => (
                <View key={label} style={styles.eqBand}>
                  <Slider
                    style={styles.eqSlider}
                    minimumValue={-10}
                    maximumValue={10}
                    value={customBands[i]}
                    onValueChange={(val) => {
                      const newBands = [...customBands];
                      newBands[i] = val;
                      setCustomBands(newBands);
                    }}
                    minimumTrackTintColor={accentColor}
                    maximumTrackTintColor="rgba(255,255,255,0.1)"
                    thumbTintColor="#fff"
                    vertical
                  />
                  <Text style={styles.eqLabel}>{label.replace('Hz', '')}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgCircle1: { 
    position: 'absolute', 
    top: -100, 
    right: -100, 
    width: 300, 
    height: 300, 
    borderRadius: 150, 
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    filter: 'blur(80px)' as any,
  },
  bgCircle2: { 
    position: 'absolute', 
    bottom: height * 0.3, 
    left: -150, 
    width: 400, 
    height: 400, 
    borderRadius: 200, 
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    filter: 'blur(100px)' as any,
  },
  dynamicIsland: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    height: 56,
    zIndex: 100,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  islandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  islandEyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  islandTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  islandActions: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 4,
  },
  islandIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    marginBottom: 10,
    marginTop: 20,
  },
  searchBarContainer: { height: 56 },
  searchInner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    height: '100%', 
    paddingHorizontal: 20 
  },
  searchInput: { flex: 1, color: '#fff', marginLeft: 12, fontSize: 16, fontWeight: '500' },
  scrollContent: { paddingHorizontal: 25, paddingTop: 120, paddingBottom: 150 },
  section: { marginBottom: 10 },
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end',
    marginBottom: 15,
    marginTop: 25,
  },
  curatedBadge: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  aiBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentArtist: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  seeAll: { fontSize: 14, fontWeight: '700' },
  recentScroll: { gap: 15, paddingRight: 25 },
  recentCard: { width: 110 },
  recentThumbContainer: { width: 110, height: 110, borderRadius: 15, overflow: 'hidden' },
  recentThumb: { width: 110, height: 110, borderRadius: 15, backgroundColor: '#111' },
  recentPlayBtn: { position: 'absolute', right: 8, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  recentTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 8 },
  catScroll: { gap: 12, paddingBottom: 5 },
  catGlass: { paddingHorizontal: 20, paddingVertical: 10 },
  catText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  catTextActive: { color: '#fff' },
  moodScroll: { gap: 15 },
  moodGlass: { paddingHorizontal: 20, paddingVertical: 15, width: 140, gap: 10 },
  moodText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  plCard: { width: 160 },
  plThumb: { width: 160, height: 160, borderRadius: 24, backgroundColor: '#111' },
  plTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 10 },
  plMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  heroContainer: { marginTop: 25, height: 260 },
  heroGlass: { flex: 1 },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject },
  heroContent: { flex: 1, justifyContent: 'flex-end', padding: 25 },
  heroBadge: { 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 8, 
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  heroBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  heroTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 5 },
  heroArtist: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 15 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  playBtnLarge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroStatsText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  listView: { marginTop: 10 },
  card: { width: COLUMN_WIDTH, marginBottom: 25 },
  listCard: { marginBottom: 16, marginHorizontal: 0 },
  cardImageContainer: { 
    width: '100%', 
    height: COLUMN_WIDTH, 
    borderRadius: 22, 
    overflow: 'hidden', 
    backgroundColor: '#111',
    marginBottom: 12,
  },
  listImageContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  listImage: { width: 70, height: 70, borderRadius: 12 },
  listTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  listArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  cardImage: { width: '100%', height: '100%' },
  cardPlayOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)'
  },
  miniPlayBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  cardDownload: { padding: 8 },
  loader: { marginTop: 60, alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.5)', marginTop: 15, fontWeight: '600' },
  // Mini Player
  miniPlayer: {
    position: 'absolute',
    bottom: 80,
    left: 12,
    right: 12,
    height: 72,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  miniThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#111' },
  miniInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  miniTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  miniArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  miniProgress: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  miniProgressFill: { height: '100%' },
  miniPlayBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // View Toggle
  viewToggle: { flexDirection: 'row', gap: 8 },
  viewBtn: { padding: 8 },
  // Equalizer Modal
  eqOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  eqSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  eqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  eqTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  eqPresets: { marginBottom: 30 },
  eqPresetScroll: { gap: 12 },
  eqPreset: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  eqPresetText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  eqPresetActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  eqPresetTextActive: { color: '#fff' },
  eqBands: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  eqBand: { alignItems: 'center', width: 40 },
  eqSlider: { height: 150, width: 30 },
  eqLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 8, fontWeight: '600' },
});

export default MusicScreen;
