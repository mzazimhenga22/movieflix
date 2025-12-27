import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useSubscription } from '../providers/SubscriptionProvider';
import { injectAdsWithPattern } from '../lib/ads/sequence';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { useUser } from '../hooks/use-user';
import { findOrCreateConversation, sendMessage, type Profile } from './messaging/controller';

const { width } = Dimensions.get('window');

const STORY_VIEW_DURATION = 30000; // 30 seconds per media item

type StoryMedia = {
  type: 'image' | 'video';
  uri: string;
  storyId?: string | number;
  caption?: string;
  overlayText?: string;
};

type Story = {
  id: string | number;
  title: string;
  image?: string;
  avatar?: string | null;
  userId?: string | null;
  username?: string | null;
  media: StoryMedia[];
};
type AdStory = { id: string; kind: 'ad'; title: string; media: StoryMedia[]; productId: string };
type StoryItem = Story | AdStory;

const StoryViewerScreen = () => {
  const router = useRouter();
  const { stories: storiesParam, initialStoryId: initialStoryIdParam, initialMediaId: initialMediaIdParam } =
    useLocalSearchParams();
  const isWeb = Platform.OS === 'web';
  const { currentPlan } = useSubscription();
  const { products: promoted } = usePromotedProducts({ placement: 'story', limit: 30 });
  const adPatternStartRef = useRef(Math.floor(Math.random() * 3));
  const { user } = useUser();

  const storiesRaw: Story[] = useMemo(() => {
    if (!storiesParam) return [];
    try {
      const parsed = JSON.parse(storiesParam as string);
      return Array.isArray(parsed) ? (parsed as Story[]) : [];
    } catch {
      return [];
    }
  }, [storiesParam]);

  const stories: StoryItem[] = useMemo(() => {
    if (currentPlan !== 'free') return storiesRaw;
    if (!promoted.length) return storiesRaw;

    // Instagram-like: ads appear BETWEEN users' story sets (never in the middle of a user's media).
    // Here each `storiesRaw` item is a user story set, so pattern-based insertion is already between users.
    return injectAdsWithPattern(storiesRaw, {
      pattern: [3, 2, 4],
      startPatternIndex: adPatternStartRef.current,
      isCountedItem: () => true,
      createAdItem: (seq) => {
        const product = promoted[seq % promoted.length];
        const img = String(product.imageUrl || '');
        return {
          id: `ad-${seq}`,
          kind: 'ad',
          title: 'Sponsored',
          productId: String(product.id || ''),
          image: img,
          avatar: img,
          media: [{ type: 'image', uri: img }],
        };
      },
    });
  }, [storiesRaw, currentPlan, promoted]);

  const initialStoryId = useMemo(() => {
    return initialStoryIdParam ? String(initialStoryIdParam) : undefined;
  }, [initialStoryIdParam]);

  const initialMediaId = useMemo(() => {
    return initialMediaIdParam ? String(initialMediaIdParam) : undefined;
  }, [initialMediaIdParam]);

  const initialStoryIndex = useMemo(() => {
    if (!stories.length) return 0;
    if (!initialStoryId) return 0;
    const idx = stories.findIndex((s: any) => String((s as any).id) === String(initialStoryId));
    return Math.max(0, idx);
  }, [stories, initialStoryId]);

  const initialMediaIndex = useMemo(() => {
    if (!initialMediaId) return 0;
    const story = stories[initialStoryIndex] as any;
    if (!story || story.kind === 'ad') return 0;
    const list: StoryMedia[] = Array.isArray(story.media) ? story.media : [];
    const idx = list.findIndex((m) => String((m as any).storyId ?? '') === String(initialMediaId));
    return idx >= 0 ? idx : 0;
  }, [initialMediaId, initialStoryIndex, stories]);

  const [currentStoryIndex, setCurrentStoryIndex] = useState(initialStoryIndex);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(initialMediaIndex);
  const [videoLoading, setVideoLoading] = useState(true);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const replyInputRef = useRef<TextInput | null>(null);

  const PagerView = useMemo(() => {
    if (isWeb) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-pager-view').default;
  }, [isWeb]);
  const pagerRef = useRef<any>(null);
  const videoRef = useRef<Video>(null);
  const webviewRef = useRef<any>(null);
  const handleNextMediaRef = useRef<(() => void) | null>(null);

  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Defensive currentStory / currentMedia access
  const currentStory = stories[currentStoryIndex] ?? stories[0];
  const currentMedia =
    currentStory && Array.isArray(currentStory.media) && currentStory.media.length > 0
      ? currentStory.media[currentMediaIndex] ?? currentStory.media[0]
      : undefined;

  // Helpers to detect YouTube links/IDs
  const extractYouTubeId = (uri: string | undefined) => {
    if (!uri) return null;
    const maybeId = uri.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(maybeId)) return maybeId;
    const short = maybeId.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (short && short[1]) return short[1];
    const long = maybeId.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (long && long[1]) return long[1];
    const embed = maybeId.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (embed && embed[1]) return embed[1];
    return null;
  };

  const stopProgress = useCallback(() => {
    try {
      progress.stopAnimation((value) => {
        progressValueRef.current = typeof value === 'number' ? value : 0;
      });
    } catch {
      progressValueRef.current = 0;
    }
    try {
      progressAnimRef.current?.stop?.();
    } catch {
      // ignore
    }
  }, [progress]);

  const startProgress = useCallback(
    (fromValue = 0) => {
      if (replyOpen) return;
      progressValueRef.current = fromValue;
      progress.setValue(fromValue);
      progressAnimRef.current?.stop?.();
      const remaining = Math.max(80, (1 - fromValue) * STORY_VIEW_DURATION);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      progressAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) handleNextMediaRef.current?.();
      });
    },
    [progress, replyOpen]
  );

  const pausePlayback = useCallback(() => {
    if (replyOpen) return;
    stopProgress();

    try {
      videoRef.current?.pauseAsync?.();
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__pauseStory && window.__pauseStory(); true;');
    } catch {
      // ignore
    }
  }, [replyOpen, stopProgress]);

  const resumePlayback = useCallback(() => {
    if (replyOpen) return;
    startProgress(progressValueRef.current);

    try {
      if (currentMedia?.type === 'video') {
        videoRef.current?.playAsync?.();
      }
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__resumeStory && window.__resumeStory(); true;');
    } catch {
      // ignore
    }
  }, [currentMedia?.type, replyOpen, startProgress]);

  const canReply = useMemo(() => {
    const s: any = currentStory;
    return !!s && s.kind !== 'ad' && !!s.userId;
  }, [currentStory]);

  const openReply = useCallback(() => {
    if (!canReply) return;
    stopProgress();
    try {
      videoRef.current?.pauseAsync?.();
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__pauseStory && window.__pauseStory(); true;');
    } catch {
      // ignore
    }

    setReplyOpen(true);
    setTimeout(() => replyInputRef.current?.focus?.(), 80);
  }, [canReply, stopProgress]);

  const closeReply = useCallback(
    (options: { clearText?: boolean } = {}) => {
      setReplyOpen(false);
      Keyboard.dismiss();
      if (options.clearText) setReplyText('');
      // resume where we paused
      setTimeout(() => resumePlayback(), 60);
    },
    [resumePlayback]
  );

  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    const story: any = currentStory;
    const targetUserId = story?.userId ? String(story.userId) : null;
    if (!text || !targetUserId) return;

    try {
      const target: Profile = {
        id: targetUserId,
        displayName: story?.username || story?.title || 'Story',
        photoURL: story?.avatar || story?.image || '',
      } as any;
      const conversationId = await findOrCreateConversation(target);
      await sendMessage(conversationId, { text });
      setReplyText('');
      closeReply({ clearText: true });
    } catch (e) {
      console.warn('Failed to send story reply', e);
    }
  }, [closeReply, currentStory, replyText]);

  const panResponder = useMemo(() => {
    let startX = 0;
    let startY = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        // only claim for a clear vertical swipe
        return absDy > 18 && absDy > absDx * 1.2;
      },
      onPanResponderGrant: (evt) => {
        startX = evt.nativeEvent.pageX;
        startY = evt.nativeEvent.pageY;
      },
      onPanResponderRelease: (_evt, gesture) => {
        const dy = gesture.dy;
        const dx = gesture.dx;

        // Swipe up to reply
        if (!replyOpen && dy < -55 && Math.abs(dx) < 80) {
          openReply();
          return;
        }

        // Swipe down to close reply
        if (replyOpen && dy > 55 && Math.abs(dx) < 80) {
          closeReply();
          return;
        }
      },
    });
  }, [closeReply, openReply, replyOpen]);

  useEffect(() => {
    if (!currentStory) return;
    if (replyOpen) {
      stopProgress();
      return;
    }
    startProgress(progressValueRef.current || 0);
    return () => {
      stopProgress();
    };
  }, [currentStoryIndex, currentMediaIndex, replyOpen, startProgress, stopProgress]);

  const handleNextStory = useCallback(() => {
    if (currentStoryIndex < stories.length - 1) {
      progressValueRef.current = 0;
      pagerRef.current?.setPage(currentStoryIndex + 1);
      setCurrentStoryIndex((p) => p + 1);
      setCurrentMediaIndex(0);
    } else {
      router.back();
    }
  }, [currentStoryIndex, router, stories.length]);

  const handlePreviousStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      progressValueRef.current = 0;
      pagerRef.current?.setPage(currentStoryIndex - 1);
      setCurrentStoryIndex((p) => p - 1);
      setCurrentMediaIndex(0);
    } else {
      router.back();
    }
  }, [currentStoryIndex, router]);

  const handleNextMedia = useCallback(() => {
    if (!currentStory) return;

    const mediaLen = Array.isArray(currentStory.media) ? currentStory.media.length : 0;
    if (currentMediaIndex < mediaLen - 1) {
      progressValueRef.current = 0;
      setCurrentMediaIndex((p) => p + 1);
    } else {
      handleNextStory();
    }
  }, [currentMediaIndex, currentStory, handleNextStory]);

  const handlePreviousMedia = useCallback(() => {
    if (!currentStory) return;
    if (currentMediaIndex > 0) {
      progressValueRef.current = 0;
      setCurrentMediaIndex((p) => p - 1);
    } else {
      handlePreviousStory();
    }
  }, [currentMediaIndex, currentStory, handlePreviousStory]);

  const handleTap = useCallback(
    (evt: any) => {
      if (replyOpen) return;
      const x = evt?.nativeEvent?.locationX ?? 0;
      if (x < width / 2) handlePreviousMedia();
      else handleNextMedia();
    },
    [handleNextMedia, handlePreviousMedia, replyOpen]
  );

  useEffect(() => {
    handleNextMediaRef.current = handleNextMedia;
  }, [handleNextMedia]);

  useEffect(() => {
    setCurrentStoryIndex(initialStoryIndex);
    setCurrentMediaIndex(initialMediaIndex);
    try {
      pagerRef.current?.setPage?.(initialStoryIndex);
    } catch {
      // ignore
    }
  }, [initialStoryIndex, initialMediaIndex]);

  const onPageSelected = useCallback(
    (e: any) => {
      const newIndex = e.nativeEvent.position;
      setReplyOpen(false);
      Keyboard.dismiss();
      progressValueRef.current = 0;
      setCurrentStoryIndex(newIndex);
      setCurrentMediaIndex(0);
    },
    []
  );

  const onVideoPlaybackStatusUpdate = useCallback(
    (status: any) => {
      if (status?.isLoaded) {
        setVideoLoading(false);
        if (status.didJustFinish) handleNextMedia();
      } else {
        setVideoLoading(true);
      }
    },
    [handleNextMedia]
  );

  const onWebViewMessage = useCallback(
    (event: any) => {
      const data = event.nativeEvent?.data;
      if (data === 'ended') {
        handleNextMedia();
      } else if (data === 'playing') {
        setVideoLoading(false);
      }
    },
    [handleNextMedia]
  );

  const youtubeEmbedHtml = (videoId: string) => `
    <!doctype html><html><head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
    <style>html,body,#player{margin:0;padding:0;height:100%;background:#000}body{display:flex;align-items:center;justify-content:center;height:100%}iframe{width:100%;height:100%;border:0}</style>
    </head><body>
    <div id="player"></div>
    <script>
      var tag=document.createElement('script');tag.src="https://www.youtube.com/iframe_api";document.body.appendChild(tag);
      var player;
      function onYouTubeIframeAPIReady(){
        player=new YT.Player('player',{height:'100%',width:'100%',videoId:'${videoId}',playerVars:{controls:0,autoplay:1,playsinline:1,modestbranding:1,rel:0,fs:0,enablejsapi:1,iv_load_policy:3},events:{onReady:function(e){try{e.target.playVideo()}catch(e){}window.ReactNativeWebView.postMessage('playing')},onStateChange:function(event){if(event.data===0){window.ReactNativeWebView.postMessage('ended')}else if(event.data===1){window.ReactNativeWebView.postMessage('playing')}}}});
      }

      window.__pauseStory = function(){ try{ player && player.pauseVideo && player.pauseVideo(); }catch(e){} };
      window.__resumeStory = function(){ try{ player && player.playVideo && player.playVideo(); }catch(e){} };
    </script>
    </body></html>
  `;

  // If no stories passed, show loader and avoid any indexing
  if (!stories || stories.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  // Web fallback: avoid native pager-view; show simple first story view
  if (isWeb) {
    const webStory = stories[initialStoryIndex] ?? stories[0];
    const webMedia = webStory?.media?.[0];
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            {webStory?.title || 'Story'}
          </Text>
          {(webStory as any)?.kind === 'ad' ? (
            <Text style={{ color: '#aaa' }}>Sponsored</Text>
          ) : webMedia?.type === 'image' ? (
            <Image source={{ uri: webMedia.uri }} style={{ width: '100%', height: 320 }} resizeMode="cover" />
          ) : webMedia?.type === 'video' ? (
            <Video
              source={{ uri: webMedia.uri }}
              style={{ width: '100%', height: 320, backgroundColor: '#000' }}
              resizeMode="contain"
              useNativeControls
              shouldPlay
            />
          ) : (
            <Text style={{ color: '#aaa' }}>No media to show.</Text>
          )}
          <Text style={{ color: '#aaa', marginTop: 12 }}>Stories carousel is disabled on web.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If still no media for the current story, show loader
  if (!currentMedia) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={initialStoryIndex}
        onPageSelected={onPageSelected}
      >
        {stories.map((story, storyIdx) => {
          const mediaList = Array.isArray(story.media) ? story.media : [];
          const isActiveStory = storyIdx === currentStoryIndex;
          const activeMediaIndexForThisStory = isActiveStory ? currentMediaIndex : 0;
          const mediaItem = mediaList[activeMediaIndexForThisStory];
          const isAdStory = (story as any)?.kind === 'ad';
          const adProduct = isAdStory
            ? promoted.find((p) => String(p.id) === String((story as any).productId))
            : null;

          return (
            <View key={String((story as any).id)} style={styles.page}>
              <SafeAreaView style={styles.header} pointerEvents="box-none">
                <View style={styles.progressBarContainer}>
                  {mediaList.map((_, mediaIdx) => {
                    const widthValue =
                      storyIdx < currentStoryIndex
                        ? '100%'
                        : storyIdx > currentStoryIndex
                          ? '0%'
                          : mediaIdx < currentMediaIndex
                            ? '100%'
                            : mediaIdx > currentMediaIndex
                              ? '0%'
                              : progress.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0%', '100%'],
                                });

                    return (
                      <View key={mediaIdx} style={styles.progressBarBackground}>
                        <Animated.View style={[styles.progressBarFill, { width: widthValue }]} />
                      </View>
                    );
                  })}
                </View>

                <View style={styles.headerRow} pointerEvents="box-none">
                  <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <Ionicons name="close" size={28} color="white" />
                  </TouchableOpacity>

                  <View style={styles.headerCenter} pointerEvents="none">
                    <View style={styles.headerUserRow}>
                      {(story as any)?.avatar || (story as any)?.image ? (
                        <Image
                          source={{ uri: String((story as any).avatar || (story as any).image) }}
                          style={styles.headerAvatar}
                        />
                      ) : (
                        <View style={styles.headerAvatarFallback} />
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.storyTitle} numberOfLines={1}>
                          {(story as any)?.username || story.title || 'Story'}
                        </Text>
                        <Text style={styles.storyMeta} numberOfLines={1}>
                          {`${Math.min(currentMediaIndex + 1, mediaList.length)}/${mediaList.length}`}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.headerRightSpacer} pointerEvents="none" />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbRow}
                  style={styles.thumbRowWrap}
                >
                  {stories.map((s, idx) => {
                    const isActive = idx === currentStoryIndex;
                    const uri = String((s as any)?.avatar || (s as any)?.image || (s as any)?.media?.[0]?.uri || '');
                    const isAd = (s as any)?.kind === 'ad';
                    return (
                      <TouchableOpacity
                        key={String((s as any).id)}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (replyOpen) return;
                          progressValueRef.current = 0;
                          pagerRef.current?.setPage?.(idx);
                          setCurrentStoryIndex(idx);
                          setCurrentMediaIndex(0);
                        }}
                        style={[styles.thumbBtn, isActive && styles.thumbBtnActive]}
                      >
                        {isAd ? (
                          <View style={[styles.thumbImg, styles.thumbAd]}>
                            <Text style={styles.thumbAdText}>AD</Text>
                          </View>
                        ) : uri ? (
                          <Image source={{ uri }} style={styles.thumbImg} />
                        ) : (
                          <View style={[styles.thumbImg, styles.thumbFallback]} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </SafeAreaView>

              <View style={styles.mediaContainer}>
                {isAdStory ? (
                  <View style={styles.adStory}>
                    <Text style={styles.adBadge}>Sponsored</Text>
                    <Text style={styles.adTitle}>Ad</Text>
                    <Text style={styles.adSubtitle} numberOfLines={2}>
                      {adProduct?.name || 'Sponsored'}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        if (adProduct?.id) router.push((`/marketplace/${adProduct.id}`) as any);
                      }}
                      style={styles.adCta}
                    >
                      <Text style={styles.adCtaText}>Shop</Text>
                    </TouchableOpacity>

                    {adProduct?.imageUrl ? (
                      <Image source={{ uri: adProduct.imageUrl }} style={styles.adImage} resizeMode="cover" />
                    ) : null}

                    <View style={styles.touchOverlay} pointerEvents="box-none">
                      <Pressable
                        style={[styles.touchZone, styles.touchZoneNarrow]}
                        onPress={handlePreviousMedia}
                        onPressIn={pausePlayback}
                        onPressOut={resumePlayback}
                        {...panResponder.panHandlers}
                      />
                      <View style={styles.touchZoneSpacer} pointerEvents="none" />
                      <Pressable
                        style={[styles.touchZone, styles.touchZoneNarrow]}
                        onPress={handleNextMedia}
                        onPressIn={pausePlayback}
                        onPressOut={resumePlayback}
                        {...panResponder.panHandlers}
                      />
                    </View>
                  </View>
                ) : !isActiveStory ? (
                  <View style={styles.mediaFrame}>
                    <Image
                      source={{ uri: String((story as any)?.image || mediaList?.[0]?.uri || '') }}
                      style={styles.media}
                      resizeMode="cover"
                    />
                  </View>
                ) : mediaItem?.type === 'image' ? (
                  <View style={styles.mediaFrame}>
                    <Image source={{ uri: mediaItem.uri }} style={styles.media} resizeMode="contain" />
                    <View style={styles.touchOverlay} pointerEvents="box-none">
                      <Pressable
                        style={styles.touchZone}
                        onPress={handlePreviousMedia}
                        onPressIn={pausePlayback}
                        onPressOut={resumePlayback}
                        {...panResponder.panHandlers}
                      />
                      <Pressable
                        style={styles.touchZone}
                        onPress={handleNextMedia}
                        onPressIn={pausePlayback}
                        onPressOut={resumePlayback}
                        {...panResponder.panHandlers}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.videoWrapper}>
                    {mediaItem?.type === 'video' ? (
                      (() => {
                        const ytId = extractYouTubeId(mediaItem.uri);
                        if (ytId) {
                          return (
                            <>
                              {videoLoading && <ActivityIndicator size="large" color="#FFF" style={styles.videoLoader} />}
                              <WebView
                                ref={(r) => (webviewRef.current = r)}
                                source={{ html: youtubeEmbedHtml(ytId) }}
                                style={styles.media}
                                javaScriptEnabled
                                domStorageEnabled
                                allowsInlineMediaPlayback
                                mediaPlaybackRequiresUserAction={false}
                                onMessage={onWebViewMessage}
                                originWhitelist={['*']}
                                startInLoadingState
                                automaticallyAdjustContentInsets={false}
                                containerStyle={{ backgroundColor: 'black' }}
                              />
                              <View style={styles.touchOverlay} pointerEvents="box-none">
                                <Pressable
                                  style={styles.touchZone}
                                  onPress={handlePreviousMedia}
                                  onPressIn={pausePlayback}
                                  onPressOut={resumePlayback}
                                  {...panResponder.panHandlers}
                                />
                                <Pressable
                                  style={styles.touchZone}
                                  onPress={handleNextMedia}
                                  onPressIn={pausePlayback}
                                  onPressOut={resumePlayback}
                                  {...panResponder.panHandlers}
                                />
                              </View>
                            </>
                          );
                        } else {
                          return (
                            <>
                              {videoLoading && <ActivityIndicator size="large" color="#FFF" style={styles.videoLoader} />}
                              <Video
                                ref={videoRef}
                                style={styles.media}
                                source={{ uri: mediaItem.uri }}
                                useNativeControls={false}
                                resizeMode="contain"
                                isLooping={false}
                                shouldPlay={isActiveStory && !replyOpen}
                                onPlaybackStatusUpdate={onVideoPlaybackStatusUpdate}
                                onLoadStart={() => setVideoLoading(true)}
                                onReadyForDisplay={() => setVideoLoading(false)}
                              />
                              <View style={styles.touchOverlay} pointerEvents="box-none">
                                <Pressable
                                  style={styles.touchZone}
                                  onPress={handlePreviousMedia}
                                  onPressIn={pausePlayback}
                                  onPressOut={resumePlayback}
                                  {...panResponder.panHandlers}
                                />
                                <Pressable
                                  style={styles.touchZone}
                                  onPress={handleNextMedia}
                                  onPressIn={pausePlayback}
                                  onPressOut={resumePlayback}
                                  {...panResponder.panHandlers}
                                />
                              </View>
                            </>
                          );
                        }
                      })()
                    ) : null}
                  </View>
                )}
              </View>

              {isActiveStory && !isAdStory && (mediaItem as any)?.overlayText ? (
                <View style={styles.overlayTextChip} pointerEvents="none">
                  <Text style={styles.overlayText} numberOfLines={3}>
                    {String((mediaItem as any).overlayText)}
                  </Text>
                </View>
              ) : null}

              {isActiveStory && !isAdStory && (mediaItem as any)?.caption ? (
                <View style={styles.captionBar} pointerEvents="none">
                  <Text style={styles.captionText} numberOfLines={3}>
                    {String((mediaItem as any).caption)}
                  </Text>
                </View>
              ) : null}

              {isActiveStory && !isAdStory && !!(story as any)?.userId ? (
                replyOpen ? (
                  <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.replyOverlay}
                  >
                    <Pressable style={styles.replyBackdrop} onPress={() => closeReply()} />
                    <View style={styles.replyBar}>
                      <TextInput
                        ref={(r) => (replyInputRef.current = r)}
                        style={styles.replyInput}
                        placeholder="Reply..."
                        placeholderTextColor="rgba(255,255,255,0.55)"
                        value={replyText}
                        onChangeText={setReplyText}
                        returnKeyType="send"
                        onSubmitEditing={handleSendReply}
                        autoFocus
                      />
                      <TouchableOpacity style={styles.replySendBtn} onPress={handleSendReply}>
                        <Ionicons name="send" size={20} color="#25D366" />
                      </TouchableOpacity>
                    </View>
                  </KeyboardAvoidingView>
                ) : (
                  <View style={styles.replyHint} pointerEvents="none">
                    <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.replyHintText}>Swipe up to reply</Text>
                  </View>
                )
              ) : null}
            </View>
          );
        })}
      </PagerView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  pagerView: { flex: 1 },
  page: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, paddingTop: 10, paddingHorizontal: 10 },
  progressBarContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressBarBackground: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 2, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.9)' },
  activeProgressBar: { backgroundColor: 'white' },
  closeButton: { position: 'absolute', top: 30, right: 10, padding: 10, zIndex: 4 },
  storyTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
  mediaContainer: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  media: { width: '100%', height: '100%', backgroundColor: 'black' },
  videoWrapper: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  videoLoader: { position: 'absolute', zIndex: 5, alignSelf: 'center', top: '48%' },
  touchOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 6, flexDirection: 'row' },
  leftTouch: { flex: 1 },
  rightTouch: { flex: 1 },
  adStory: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#05060f',
  },
  adBadge: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  adTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  adSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  adCta: {
    backgroundColor: 'rgba(229,9,20,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  adCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  adImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

export default StoryViewerScreen;
