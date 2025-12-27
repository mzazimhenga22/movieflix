import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MainVideoPlayer } from '../../components/MainVideoPlayer';
import AdBanner from '../../components/ads/AdBanner';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { getAccentFromPosterPath } from '../../constants/theme';
import { CastMember, Media } from '../../types';
import NewChatSheet from '../messaging/components/NewChatSheet';
import { Profile, findOrCreateConversation, getFollowing } from '../messaging/controller';
import MovieDetailsView from './MovieDetailsView';

interface Video {
  key: string;
  name: string;
  site: string;
  type: string;
}

const ACCENT = '#E50914';

const MovieDetailsContainer: React.FC = () => {
  const { id, mediaType } = useLocalSearchParams();
  const router = useRouter();
  const [movie, setMovie] = useState<Media | null>(null);
  const [trailers, setTrailers] = useState<Video[]>([]);
  const [relatedMovies, setRelatedMovies] = useState<Media[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [isChatSheetVisible, setIsChatSheetVisible] = useState(false);
  const [following, setFollowing] = useState<Profile[]>([]);
  const accentColor = getAccentFromPosterPath(movie?.poster_path);

  useEffect(() => {
    let mounted = true;
    if (!id || !mediaType) {
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        // Fetch primary details first so the UI can render immediately
        const detailsRes = await fetch(`${API_BASE_URL}/${mediaType}/${id}?api_key=${API_KEY}&append_to_response=external_ids`);
        const detailsData = await detailsRes.json();

        if (!mounted) return;

        const normalizedDetails = detailsData
          ? {
              ...detailsData,
              imdb_id: detailsData.imdb_id ?? detailsData.external_ids?.imdb_id ?? null,
            }
          : null;

        // Set the main movie object right away so the view appears fast
        setMovie(normalizedDetails);
        // mark main loading complete (we'll load ancillary data in background)
        if (mounted) setIsLoading(false);

        // Lazy-load trailers, related items and credits in background
        (async () => {
          try {
            const [videosRes, relatedRes, creditsRes] = await Promise.all([
              fetch(`${API_BASE_URL}/${mediaType}/${id}/videos?api_key=${API_KEY}`),
              fetch(`${API_BASE_URL}/${mediaType}/${id}/recommendations?api_key=${API_KEY}`),
              fetch(`${API_BASE_URL}/${mediaType}/${id}/credits?api_key=${API_KEY}`),
            ]);

            const videosData = await videosRes.json();
            const relatedData = await relatedRes.json();
            const creditsData = await creditsRes.json();

            if (!mounted) return;

            setTrailers(
              (videosData?.results || []).filter(
                (video: Video) => video.site === 'YouTube' && video.type === 'Trailer'
              )
            );
            setRelatedMovies(relatedData?.results || []);
            setCast(creditsData?.cast || []);

            // For TV shows, fetch season details but do not block initial render
            if (mediaType === 'tv' && detailsData?.seasons) {
              try {
                const seasonsData = await Promise.all(
                  detailsData.seasons.map((season: any) =>
                    fetch(`${API_BASE_URL}/tv/${id}/season/${season.season_number}?api_key=${API_KEY}`).then(res => res.json())
                  )
                );
                if (mounted) setSeasons(seasonsData);
              } catch (seasonErr) {
                console.warn('Failed to fetch seasons:', seasonErr);
              }
            }
          } catch (err) {
            console.warn('Background fetch for trailers/related/credits failed', err);
          }
        })();

      } catch (error) {
        console.error('Error fetching details:', error);
        if (mounted) {
          setMovie(null);
          setTrailers([]);
          setRelatedMovies([]);
          setSeasons([]);
          setCast([]);
          setIsLoading(false);
        }
      }
    };

    // small delay to smoothen transitions (keeps same behavior as before)
    const t = setTimeout(fetchDetails, 120);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [id, mediaType]);

  useEffect(() => {
    const fetchFollowing = async () => {
      try {
        const list = await getFollowing();
        setFollowing(list);
      } catch (e) {
        console.error('Error fetching following list:', e);
        setFollowing([]);
      }
    };
    fetchFollowing();
  }, []);

  const handleOpenChatSheet = () => {
    setIsChatSheetVisible(true);
  };

  const handleCloseChatSheet = () => {
    setIsChatSheetVisible(false);
  };

  const handleStartChat = async (person: Profile) => {
    try {
      const conversationId = await findOrCreateConversation(person);
      setIsChatSheetVisible(false);
      router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } });
    } catch (error) {
      console.error('Error starting chat: ', error);
    }
  };

  const handleWatchTrailer = () => {
    setIsVideoVisible(true);
  };

  const handleBack = () => {
    router.back();
  };

  const handleAddToMyList = (movie: Media) => {
    // TODO: implement add to my list
    console.log('Add to my list:', movie);
  };

  const handleSelectRelated = (relatedId: number) => {
    const relatedItem = relatedMovies.find((item) => item.id === relatedId);
    if (relatedItem) {
      router.push(`/details/${relatedId}?mediaType=${relatedItem.media_type}`);
    } else {
      router.push(`/details/${relatedId}?mediaType=movie`);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScreenWrapper style={styles.pageWrapper}>
        {/* Beautiful love-themed gradient background */}
        <LinearGradient
          colors={[accentColor || '#ff6b9d', '#ff8fab', '#ffb3d9', '#150a13', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Floating liquid glows - love theme */}
        <LinearGradient
          colors={['rgba(255,107,157,0.25)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(255,143,171,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />

        {/* Additional romantic floating elements */}
        <LinearGradient
          colors={['rgba(255,179,217,0.15)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.7, y: 0.8 }}
          style={styles.bgOrbTertiary}
        />

        <View style={styles.backgroundLayer} />

        <MovieDetailsView
          movie={movie}
          trailers={trailers}
          relatedMovies={relatedMovies}
          isLoading={isLoading}
          onWatchTrailer={handleWatchTrailer}
          onBack={handleBack}
          onSelectRelated={handleSelectRelated}
          onAddToMyList={handleAddToMyList}
          seasons={seasons}
          mediaType={mediaType}
          cast={cast}
          onOpenChatSheet={handleOpenChatSheet}
        />

        <View pointerEvents="box-none" style={styles.adWrap}>
          <AdBanner placement="feed" />
        </View>
      </ScreenWrapper>

      {/* Trailer Modal — glassy player with a close bar */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={isVideoVisible}
        onRequestClose={() => setIsVideoVisible(false)}
      >
        <LinearGradient
          colors={['#050405', '#120206']}
          style={styles.modalContainer}
          start={[0, 0]}
          end={[1, 1]}
        >
          <BlurView intensity={40} tint="dark" style={styles.modalBlur} />

          {/* top bar with back/close button */}
          <View style={styles.modalTopBar}>
            <TouchableOpacity
              onPress={() => setIsVideoVisible(false)}
              style={styles.modalCloseBtn}
              accessibilityLabel="Close video"
            >
              <Ionicons name="chevron-down" size={28} color="#fff" />
            </TouchableOpacity>

            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>{movie?.title || movie?.name || 'Trailer'}</Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Player */}
          <View style={styles.playerWrap}>
            {/* keep the MainVideoPlayer usage — swap source as needed */}
            <MainVideoPlayer videoSource="http://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4" />
          </View>
        </LinearGradient>
      </Modal>

      <NewChatSheet
        isVisible={isChatSheetVisible}
        onClose={handleCloseChatSheet}
        following={following}
        onStartChat={handleStartChat}
        onCreateGroup={() => { /* Not needed for movie details chat for now */ }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  pageWrapper: {
    paddingTop: 0,
  },
  adWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,12,20,0.65)',
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    top: -60,
    left: -80,
    opacity: 0.7,
    transform: [{ rotate: '15deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    bottom: -100,
    right: -60,
    opacity: 0.6,
    transform: [{ rotate: '-15deg' }],
  },
  bgOrbTertiary: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: '40%',
    left: '60%',
    opacity: 0.4,
    transform: [{ rotate: '45deg' }],
  },
  accentSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  modalTopBar: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 24,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  playerWrap: {
    flex: 1,
    marginTop: 0,
    marginHorizontal: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});

export default MovieDetailsContainer;
