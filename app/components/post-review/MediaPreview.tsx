
import React, { useEffect, useRef, useState } from 'react';

import {

  View,

  StyleSheet,

  Text,

  TextInput,

  FlatList,

  Image,

  KeyboardAvoidingView,

  Platform,

  TouchableOpacity,

  TouchableWithoutFeedback,

  Keyboard,

  ActivityIndicator,

  Alert,

  Modal,

  Pressable,

  Animated,

} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MediaContent, { MediaContentHandle } from './media-preview/MediaContent';

import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../../constants/api';
import { getPersistedCache, setPersistedCache, deletePersistedCache } from '../../../lib/persistedCache';



// Interfaces remain the same

interface MediaPreviewProps {

  media: { uri: string; type: 'image' | 'video' };

  onPost: (reviewData: any) => Promise<void>;

  onClose?: () => void;

  initialReviewData?: ReviewData;

  isEditing?: boolean;

}



interface ReviewData {

  rating: number;

  review: string;

  title: string;

  overlayText?: string;

  overlayTextPosition?: { x: number; y: number };

  // Optional: attached movie metadata (used when picking from search)
  movieId?: number;
  moviePosterUrl?: string | null;
  movieReleaseYear?: string | null;

}

const REVIEW_DRAFT_KEY = '__movieflix_review_draft_v1';

interface MovieSearchResult {
  id: number;
  title: string;
  year: string | null;
  posterUrl: string | null;
}



// A more reusable StarRating component

function StarRating({ onRatingChange, totalStars = 5, initialRating = 0 }: { onRatingChange: (rating: number) => void; totalStars?: number, initialRating?: number }) {

    const [rating, setRating] = useState(initialRating);

    const handlePress = (index: number) => { const newRating = index + 1; setRating(newRating); onRatingChange(newRating); };

    return (

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 }}>

        {Array.from({ length: totalStars }, (_, index) => (

          <Pressable key={index} onPress={() => handlePress(index)} hitSlop={10}>

            <Ionicons name={index < rating ? 'star' : 'star-outline'} size={34} color={index < rating ? '#FFD700' : '#ddd'} style={{ marginHorizontal: 6 }}/>

          </Pressable>

        ))}

      </View>

    );

}



export default function MediaPreview({

  media,

  onPost,

  onClose,

  initialReviewData,

  isEditing = false,

}: MediaPreviewProps) {

  const [reviewData, setReviewData] = useState<ReviewData>(

    initialReviewData || { rating: 0, review: '', title: '' }

  );

  const [originalReviewData] = useState<ReviewData | null>(initialReviewData || null);

  const [isPosting, setIsPosting] = useState(false);

  const [draftOverlayPosition, setDraftOverlayPosition] = useState<{ x: number; y: number } | undefined>(
    initialReviewData?.overlayTextPosition,
  );
  const insets = useSafeAreaInsets();



  const [overlayText, setOverlayText] = useState((initialReviewData && initialReviewData.overlayText) || '');

  const mediaContentRef = useRef<MediaContentHandle | null>(null);



  const [isRatingModalVisible, setRatingModalVisible] = useState(false);

  const [isTitleModalVisible, setTitleModalVisible] = useState(false);

  const [movieResults, setMovieResults] = useState<MovieSearchResult[]>([]);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);

  useEffect(() => {
    if (!isTitleModalVisible) {
      setMovieResults([]);
      setMovieSearchLoading(false);
      setMovieSearchError(null);
      try {
        searchAbortRef.current?.abort();
      } catch {}
      searchAbortRef.current = null;
      return;
    }

    const q = (reviewData.title || '').trim();
    if (q.length < 2) {
      setMovieResults([]);
      setMovieSearchLoading(false);
      setMovieSearchError(null);
      return;
    }

    if (!API_KEY) {
      setMovieResults([]);
      setMovieSearchLoading(false);
      setMovieSearchError('Movie search is not configured.');
      return;
    }

    setMovieSearchError(null);
    setMovieSearchLoading(true);

    const timer = setTimeout(() => {
      try {
        searchAbortRef.current?.abort();
      } catch {}

      const controller = new AbortController();
      searchAbortRef.current = controller;

      void fetch(
        `${API_BASE_URL}/search/movie?api_key=${encodeURIComponent(API_KEY)}&query=${encodeURIComponent(q)}&include_adult=false`,
        { signal: controller.signal },
      )
        .then((res) => res.json())
        .then((json) => {
          const results: any[] = Array.isArray(json?.results) ? json.results : [];
          setMovieResults(
            results.slice(0, 20).map((r) => {
              const title = String(r?.title || r?.name || '').trim();
              const releaseDate = String(r?.release_date || r?.first_air_date || '').trim();
              const year = releaseDate ? releaseDate.slice(0, 4) : null;
              const posterPath = r?.poster_path ? String(r.poster_path) : '';
              const posterUrl = posterPath ? `${IMAGE_BASE_URL}${posterPath}` : null;
              return {
                id: Number(r?.id),
                title,
                year,
                posterUrl,
              } satisfies MovieSearchResult;
            }),
          );
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setMovieSearchError('Unable to search right now.');
          setMovieResults([]);
        })
        .finally(() => {
          setMovieSearchLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      try {
        searchAbortRef.current?.abort();
      } catch {}
    };
  }, [isTitleModalVisible, reviewData.title]);

  useEffect(() => {
    if (initialReviewData) return;
    let cancelled = false;
    void (async () => {
      const cached = await getPersistedCache<any>(REVIEW_DRAFT_KEY);
      if (cancelled || !cached?.value) return;
      const draft = cached.value;
      setReviewData(draft.reviewData || { rating: 0, review: '', title: '' });
      setOverlayText(draft.overlayText || '');
      if (draft.overlayTextPosition) setDraftOverlayPosition(draft.overlayTextPosition);
      setDraftSavedAt(cached.savedAtMs || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialReviewData]);



  const handlePost = async () => {

    if (isPosting) return;

    setIsPosting(true);

    try {

      const currentTextPosition =
        (mediaContentRef.current &&
        typeof (mediaContentRef.current as any).getOverlayTextPosition === 'function'
          ? (mediaContentRef.current as any).getOverlayTextPosition()
          : null) || { x: 0, y: 0 };

      await onPost({

        ...reviewData,

        overlayText,

        overlayTextPosition: { x: currentTextPosition.x, y: currentTextPosition.y },

      });
      await deletePersistedCache(REVIEW_DRAFT_KEY);
      setDraftSavedAt(null);

    } catch (e: any) {

      console.warn('post/update failed', e);

      Alert.alert('Error', e && (e as any).message ? String((e as any).message) : 'An unknown error occurred.');

    } finally {

      setIsPosting(false);

    }

  };

  const handleClose = () => {
    const currentTextPosition =
      (mediaContentRef.current &&
      typeof (mediaContentRef.current as any).getOverlayTextPosition === 'function'
        ? (mediaContentRef.current as any).getOverlayTextPosition()
        : null) || { x: 0, y: 0 };
    const originalTextPosition = (originalReviewData && originalReviewData.overlayTextPosition) || { x: 0, y: 0 };

    const hasTextPositionChanged =
      Math.abs(currentTextPosition.x - originalTextPosition.x) > 0.5 ||
      Math.abs(currentTextPosition.y - originalTextPosition.y) > 0.5;

    const hasChanges = Boolean(
      isEditing &&
        originalReviewData &&
        (originalReviewData.title !== reviewData.title ||
          originalReviewData.review !== reviewData.review ||
          originalReviewData.rating !== reviewData.rating ||
          (originalReviewData.overlayText != null ? originalReviewData.overlayText : '') !== overlayText ||
          hasTextPositionChanged)
    );

    const isNewAndDirty = Boolean(!isEditing && (reviewData.title || reviewData.review || reviewData.rating > 0 || overlayText));

    if (isNewAndDirty || hasChanges) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Continue editing', style: 'cancel' },
          { text: 'Discard', onPress: onClose, style: 'destructive' },
        ]
      );
      return;
    }

    if (onClose) onClose();
  };

  const handleSaveDraft = async () => {
    if (draftSaving) return;
    setDraftSaving(true);
    try {
      const currentTextPosition =
        (mediaContentRef.current &&
        typeof (mediaContentRef.current as any).getOverlayTextPosition === 'function'
          ? (mediaContentRef.current as any).getOverlayTextPosition()
          : null) || { x: 0, y: 0 };

      await setPersistedCache(REVIEW_DRAFT_KEY, {
        media,
        reviewData,
        overlayText,
        overlayTextPosition: currentTextPosition,
      });
      setDraftOverlayPosition(currentTextPosition);
      setDraftSavedAt(Date.now());
      Alert.alert('Draft saved', 'You can resume this review draft from the feed.');
    } catch (e) {
      console.warn('Failed to save draft', e);
      Alert.alert('Could not save draft', 'Please try again.');
    } finally {
      setDraftSaving(false);
    }
  };



  return (

    <View style={styles.fullScreenWrapper}>

      <LinearGradient
        colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.85)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

          <View style={styles.container}>

            <MediaContent

              ref={mediaContentRef}

              media={media}

              overlayText={overlayText}

              setOverlayText={setOverlayText}

              initialOverlayTextPosition={draftOverlayPosition}

              isEditingText={false}

              setIsEditingText={() => {}}

              onMediaScaleChange={new Animated.Value(1)}

            />



            <View style={[styles.headerWrap, { top: insets.top + 8 }]}>
              <LinearGradient
                colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGlow}
              />
              <View style={styles.headerBar}>
                <TouchableOpacity onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Back">
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                  <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                    {isEditing ? 'Edit Review' : 'New Review'}
                  </Text>
                </View>
                <View style={styles.iconBtnPlaceholder} />
              </View>
            </View>



            <View style={[styles.formContainer, { bottom: Math.max(92, insets.bottom + 96) }]}>

                <View style={styles.captionContainer}>

                    <TextInput

                        style={styles.captionInput}

                        placeholder="Write a caption..."

                        placeholderTextColor="#aaa"

                        multiline

                        value={reviewData.review}

                        onChangeText={text => setReviewData(d => ({ ...d, review: text }))}

                    />

                </View>



                <View style={styles.optionsContainer}>

                    <TouchableOpacity style={styles.optionButton} onPress={() => setTitleModalVisible(true)}>

                        <Ionicons name="film-outline" size={20} color="#fff" />

                        <Text style={styles.optionText} numberOfLines={1}>{reviewData.title || 'Add Movie Title'}</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionButton} onPress={() => setRatingModalVisible(true)}>

                        <Ionicons name="star-outline" size={20} color="#fff" />

                        <Text style={styles.optionText}>{reviewData.rating > 0 ? `${reviewData.rating} / 5 Stars` : 'Rate'}</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionButton} onPress={() => {}}>

                        <Ionicons name="trending-up" size={20} color="#fff" />

                        <Text style={styles.optionText}>Boost to Trends</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionButton} onPress={() => {}}>

                        <Ionicons name="at" size={20} color="#fff" />

                        <Text style={styles.optionText}>Tag Users</Text>

                    </TouchableOpacity>

                </View>

            </View>



            <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
                <View style={styles.footerRow}>
                  <TouchableOpacity onPress={handleSaveDraft} disabled={draftSaving || isPosting} style={styles.draftButton}>
                    {draftSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.draftButtonText}>{draftSavedAt ? 'Save again' : 'Save draft'}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handlePost} disabled={isPosting} style={styles.postButton}>
                      <LinearGradient colors={["#ff8a00", "#e50914"]} style={styles.postButtonGradient}>
                          {isPosting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postButtonText}>{isEditing ? 'Update' : 'Post'}</Text>}
                      </LinearGradient>
                  </TouchableOpacity>
                </View>

                {draftSavedAt ? (
                  <Text style={styles.draftHint} numberOfLines={1}>
                    Draft saved • tap &quot;Save draft&quot; to update before posting
                  </Text>
                ) : null}

            </View>

          </View>

        </TouchableWithoutFeedback>

      </KeyboardAvoidingView>



      <Modal visible={isTitleModalVisible} transparent animationType="fade">

        <Pressable onPress={() => setTitleModalVisible(false)} style={styles.modalContainer}>

            <Pressable style={styles.modalContent}>

                <Text style={styles.modalTitle}>Pick a movie</Text>

                <View style={styles.movieSearchRow}>
                  <Ionicons name="search" size={16} color="rgba(255,255,255,0.7)" />
                  <TextInput
                      style={[styles.modalInput, styles.movieSearchInput]}
                      placeholder="Search movies"
                      placeholderTextColor="#888"
                      value={reviewData.title}
                      onChangeText={title => setReviewData(d => ({ ...d, title }))}
                      autoFocus
                  />
                  {reviewData.title ? (
                    <TouchableOpacity
                      onPress={() => setReviewData((d) => ({ ...d, title: '', movieId: undefined, moviePosterUrl: null, movieReleaseYear: null }))}
                      style={styles.movieSearchClear}
                    >
                      <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {movieSearchLoading ? (
                  <View style={styles.movieSearchStatus}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.movieSearchStatusText}>Searching…</Text>
                  </View>
                ) : movieSearchError ? (
                  <Text style={styles.movieSearchErrorText}>{movieSearchError}</Text>
                ) : null}

                {movieResults.length > 0 ? (
                  <FlatList
                    data={movieResults}
                    keyExtractor={(item) => String(item.id)}
                    style={styles.movieResultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.movieResultRow}
                        onPress={() => {
                          setReviewData((d) => ({
                            ...d,
                            title: item.title,
                            movieId: item.id,
                            moviePosterUrl: item.posterUrl,
                            movieReleaseYear: item.year,
                          }));
                          setTitleModalVisible(false);
                        }}
                      >
                        {item.posterUrl ? (
                          <Image source={{ uri: item.posterUrl }} style={styles.moviePoster} />
                        ) : (
                          <View style={styles.moviePosterFallback}>
                            <Ionicons name="film-outline" size={18} color="rgba(255,255,255,0.65)" />
                          </View>
                        )}

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.movieResultTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {item.year ? (
                            <Text style={styles.movieResultMeta}>{item.year}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.movieResultSep} />}
                  />
                ) : null}

                <TouchableOpacity onPress={() => setTitleModalVisible(false)} style={styles.modalButton}>

                    <Text style={styles.modalButtonText}>Done</Text>

                </TouchableOpacity>

            </Pressable>

        </Pressable>

      </Modal>



      <Modal visible={isRatingModalVisible} transparent animationType="fade">

         <Pressable onPress={() => setRatingModalVisible(false)} style={styles.modalContainer}>

            <Pressable style={styles.modalContent}>

                <Text style={styles.modalTitle}>Rate this movie</Text>

                <StarRating

                    initialRating={reviewData.rating}

                    onRatingChange={r => setReviewData(d => ({ ...d, rating: r }))}

                />

                <TouchableOpacity onPress={() => setRatingModalVisible(false)} style={styles.modalButton}>

                    <Text style={styles.modalButtonText}>Done</Text>

                </TouchableOpacity>

            </Pressable>

        </Pressable>

      </Modal>

    </View>

  );

}



const styles = StyleSheet.create({

    fullScreenWrapper: { flex: 1, backgroundColor: 'transparent' },

    container: { flex: 1 },

    headerWrap: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 10,
        borderRadius: 18,
        overflow: 'hidden',
    },
    headerGlow: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.7,
    },
    headerBar: {
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitleWrap: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    iconBtnPlaceholder: {
        width: 40,
        height: 40,
    },

    headerTitle: {

        color: 'white',

        fontSize: 18,

        fontWeight: '600',

    },

    formContainer: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 10,
        gap: 12,
    },

    captionContainer: {

        backgroundColor: 'rgba(5,6,15,0.7)',

        borderRadius: 16,

        padding: 12,

        minHeight: 72,

        borderWidth: 1,

        borderColor: 'rgba(255,255,255,0.12)',

    },

    captionInput: {

        color: 'white',

        fontSize: 15,

        flex: 1,

    },

    hashtagText: {

        color: '#8ef',

        fontWeight: '600'

    },

    mentionText: {

        color: '#ffbde6',

        fontWeight: '600'

    },

    optionsContainer: {

        flexDirection: 'row',

        flexWrap: 'wrap',

        gap: 10,

    },

    optionButton: {

        flexDirection: 'row',

        alignItems: 'center',

        backgroundColor: 'rgba(5,6,15,0.66)',

        paddingHorizontal: 12,

        paddingVertical: 10,

        borderRadius: 16,

        gap: 8,

        flexGrow: 1,

        flexBasis: '48%',

        minWidth: 150,

        borderWidth: 1,

        borderColor: 'rgba(255,255,255,0.12)',

    },

    optionText: {

        color: 'white',

        fontWeight: '600',

        flex: 1,

    },

    footer: {

        position: 'absolute',

        bottom: 0,

        left: 12,

        right: 12,

        zIndex: 10,

    },

    postButton: {

        height: 54,

        borderRadius: 18,

        overflow: 'hidden',

    },

    postButtonGradient: {

        borderRadius: 18,

        height: '100%',

        alignItems: 'center',

        justifyContent: 'center',

    },

    postButtonText: {

        color: 'white',

        fontWeight: '700',

        fontSize: 16,

    },

    modalContainer: {

        flex: 1,

        backgroundColor: 'rgba(0,0,0,0.7)',

        justifyContent: 'center',

        alignItems: 'center',

        padding: 24,

    },

    modalContent: {

        backgroundColor: 'rgba(5,6,15,0.96)',

        borderRadius: 16,

        padding: 20,

        width: '100%',

        borderWidth: 1,

        borderColor: 'rgba(255,255,255,0.12)',

    },

    modalTitle: {

        color: 'white',

        fontSize: 18,

        fontWeight: '600',

        marginBottom: 16,

        textAlign: 'center',

    },

    modalInput: {

        backgroundColor: 'rgba(255,255,255,0.06)',

        color: 'white',

        borderRadius: 10,

        padding: 12,

        fontSize: 16,

        marginBottom: 20,

    },

    movieSearchRow: {

        flexDirection: 'row',

        alignItems: 'center',

        gap: 10,

        paddingHorizontal: 12,

        backgroundColor: 'rgba(255,255,255,0.06)',

        borderRadius: 10,

        marginBottom: 12,

    },

    movieSearchInput: {

        flex: 1,

        minWidth: 0,

        backgroundColor: 'transparent',

        color: 'white',

        padding: 0,

        marginBottom: 0,

    },

    movieSearchClear: {

        padding: 4,

    },

    movieSearchStatus: {

        flexDirection: 'row',

        alignItems: 'center',

        gap: 8,

        marginBottom: 10,

    },

    movieSearchStatusText: {

        color: 'rgba(255,255,255,0.75)',

        fontSize: 12,

        fontWeight: '600',

    },

    movieSearchErrorText: {

        color: 'rgba(255,80,80,0.95)',

        fontSize: 12,

        fontWeight: '700',

        marginBottom: 10,

    },

    movieResultsList: {

        maxHeight: 280,

        marginBottom: 12,

    },

    movieResultRow: {

        flexDirection: 'row',

        alignItems: 'center',

        gap: 12,

        paddingVertical: 8,

        paddingHorizontal: 6,

        borderRadius: 12,

    },

    movieResultSep: {

        height: 1,

        backgroundColor: 'rgba(255,255,255,0.08)',

        marginVertical: 6,

    },

    moviePoster: {

        width: 40,

        height: 56,

        borderRadius: 10,

        backgroundColor: 'rgba(255,255,255,0.08)',

    },

    moviePosterFallback: {

        width: 40,

        height: 56,

        borderRadius: 10,

        backgroundColor: 'rgba(255,255,255,0.08)',

        alignItems: 'center',

        justifyContent: 'center',

    },

    movieResultTitle: {

        color: 'white',

        fontSize: 14,

        fontWeight: '700',

    },

    movieResultMeta: {

        color: 'rgba(255,255,255,0.65)',

        fontSize: 12,

        marginTop: 2,

    },

    modalButton: {

        backgroundColor: '#e50914',

        borderRadius: 10,

        padding: 14,

        alignItems: 'center',

    },

    modalButtonText: {

        color: 'white',

        fontWeight: '700',

        fontSize: 16,

    }

});
