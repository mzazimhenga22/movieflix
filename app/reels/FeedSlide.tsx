import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    GestureResponderEvent,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

import { Feather, Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ResizeMode, Video } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import {
    addDoc,
    collection,
    deleteField,
    doc,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore'

import { useStoryAudio } from '@/hooks/use-story-audio'
import { firestore } from '../../constants/firebase'
import { useActiveProfilePhoto } from '../../hooks/use-active-profile-photo'
import { useUser } from '../../hooks/use-user'
import { logInteraction } from '../../lib/algo'
import { getProfileScopedKey } from '../../lib/profileStorage'
import { FeedReelItem } from './types'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

export const FeedSlide = React.memo(function FeedSlide({
    item,
    active,
    mounted,
    autoPlayReels,
    onAutoPlayNext,
}: {
    item: FeedReelItem
    active: boolean
    mounted: boolean
    autoPlayReels: boolean
    onAutoPlayNext: () => void
}) {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [muted, setMuted] = useState(false)
    const mutedKeyRef = useRef<string | null>(null)

    const [liked, setLiked] = useState(false)
    const [likesCount, setLikesCount] = useState<number>(item.likes ?? 0)
    const likeInFlightRef = useRef(false)

    const { user } = useUser()
    const activeProfilePhoto = useActiveProfilePhoto()

    const isOwnItem = user?.uid === item.userId
    const fallbackAvatar =
        'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3'
    const avatarUri = (isOwnItem ? activeProfilePhoto : null) || item.avatar || fallbackAvatar

    const [commentsVisible, setCommentsVisible] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [comments, setComments] = useState<any[]>([])
    const [replyTo, setReplyTo] = useState<{ id: string; userDisplayName?: string } | null>(null)

    // ✅ Play/Pause state
    const [paused, setPaused] = useState(false);
    const [showPlayIcon, setShowPlayIcon] = useState(false);
    const playIconAnim = useRef(new Animated.Value(0)).current;

    useStoryAudio({
        musicTrack: item.musicTrack,
        active: active && autoPlayReels && !paused,
        muted: muted,
    });

    // Reset paused state when slide changes
    useEffect(() => {
        if (!active) {
            setPaused(false);
            setShowPlayIcon(false);
        }
    }, [active]);

    // ✅ spinning disc
    const spinningAnim = useRef(new Animated.Value(0)).current
    const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null)

    useEffect(() => {
        if (active) {
            console.log(`[Reels] Active Slide: ${item.id}, Type: ${item.mediaType}, URL: ${item.videoUrl}, Headers:`, (item as any).headers);
            spinLoopRef.current?.stop()
            spinLoopRef.current = Animated.loop(
                Animated.timing(spinningAnim, {
                    toValue: 1,
                    duration: 4000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            )
            spinLoopRef.current.start()
        } else {
            spinLoopRef.current?.stop()
            spinningAnim.setValue(0)
        }
    }, [active])

    const spin = spinningAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    })

    useEffect(() => setLikesCount(item.likes ?? 0), [item.likes])

    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    const key = await getProfileScopedKey('socialSettings:reelsMuted')
                    if (!alive) return
                    mutedKeyRef.current = key
                    const raw = await AsyncStorage.getItem(key)
                    if (!alive) return
                    if (raw == null) return
                    if (raw === 'true') setMuted(true)
                    else if (raw === 'false') setMuted(false)
                    else {
                        try {
                            const parsed = JSON.parse(raw)
                            if (typeof parsed === 'boolean') setMuted(parsed)
                        } catch {
                            // ignore
                        }
                    }
                } catch {
                    // ignore
                }
            })()
        return () => {
            alive = false
        }
    }, [])

    useEffect(() => {
        const key = mutedKeyRef.current
        if (!key) return
        try {
            void AsyncStorage.setItem(key, JSON.stringify(muted))
        } catch {
            // ignore
        }
    }, [muted])

    const handleLike = useCallback(async () => {
        if (likeInFlightRef.current) return
        likeInFlightRef.current = true

        const uid = (user as any)?.uid ? String((user as any).uid) : null
        const docId = item.docId ? String(item.docId) : null
        if (!uid || !docId) {
            likeInFlightRef.current = false
            return
        }

        const prevLiked = liked
        const prevLikesCount = likesCount
        const nextLiked = !prevLiked

        // optimistic
        setLiked(nextLiked)
        setLikesCount((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)))

        try {
            const reviewRef = doc(firestore, 'reviews', docId)
            const result = await runTransaction(firestore, async (tx) => {
                const snap = await tx.get(reviewRef)
                if (!snap.exists()) return null
                const data = snap.data() as any

                const likerIds = Array.isArray(data?.likerIds) ? data.likerIds.map(String) : []
                const currentlyLiked = likerIds.includes(uid)

                if (currentlyLiked === nextLiked) {
                    const likesRaw = Number(data?.likes)
                    const safeLikes = Number.isFinite(likesRaw) ? likesRaw : likerIds.length
                    return { liked: currentlyLiked, likes: Math.max(0, safeLikes) }
                }

                const nextLikerIds = nextLiked
                    ? Array.from(new Set([...likerIds, uid]))
                    : likerIds.filter((x: string) => x !== uid)

                const likesRaw = Number(data?.likes)
                const baseLikes = Number.isFinite(likesRaw) ? likesRaw : likerIds.length
                const nextLikes = Math.max(0, baseLikes + (nextLiked ? 1 : -1))

                tx.update(reviewRef, {
                    likes: nextLikes,
                    likerIds: nextLikerIds,
                    updatedAt: serverTimestamp(),
                })

                return { liked: nextLiked, likes: nextLikes }
            })

            if (result) {
                setLiked(result.liked)
                setLikesCount(result.likes)
            }

            if (!prevLiked && (result?.liked ?? nextLiked)) {
                try {
                    void logInteraction({
                        type: 'like',
                        actorId: uid,
                        targetId: item.id,
                        targetUserId: item.userId ?? null,
                    })
                } catch { }
            }
        } catch (err) {
            console.warn('Failed to persist like', err)
            setLiked(prevLiked)
            setLikesCount(prevLikesCount)
        } finally {
            setTimeout(() => {
                likeInFlightRef.current = false
            }, 250)
        }
    }, [item.docId, item.id, item.userId, liked, likesCount, user])

    const submitComment = async () => {
        const trimmed = commentText.trim()
        if (!trimmed) return

        setCommentText('')

        if (item.docId) {
            try {
                const reviewRef = doc(firestore, 'reviews', String(item.docId))
                const commentsRef = collection(reviewRef, 'comments')
                await addDoc(commentsRef, {
                    userDisplayName: (user as any)?.displayName || 'You',
                    avatar: (user as any)?.photoURL ?? activeProfilePhoto ?? null,
                    text: trimmed,
                    spoiler: false,
                    parentId: replyTo?.id ?? null,
                    likesCount: 0,
                    likedBy: {},
                    createdAt: serverTimestamp(),
                })
                await updateDoc(reviewRef, {
                    commentsCount: increment(1),
                    updatedAt: serverTimestamp(),
                })
                setReplyTo(null)
            } catch (err) {
                console.warn('Failed to persist comment', err)
            }
        }

        try {
            void logInteraction({
                type: 'comment',
                actorId: (user as any)?.uid ?? null,
                targetId: item.id,
                targetUserId: item.userId ?? null,
            })
        } catch { }
    }

    useEffect(() => {
        if (!commentsVisible) return
        if (!item.docId) return

        setCommentsLoading(true)
        const reviewRef = doc(firestore, 'reviews', String(item.docId))
        const commentsRef = collection(reviewRef, 'comments')
        const q = query(commentsRef, orderBy('createdAt', 'asc'), limit(250))

        const unsub = onSnapshot(
            q,
            (snap) => {
                const uid = (user as any)?.uid ? String((user as any).uid) : null
                const next = snap.docs.map((d) => {
                    const data = d.data() as any
                    const likedBy = data?.likedBy && typeof data.likedBy === 'object' ? data.likedBy : {}
                    return {
                        id: d.id,
                        ...data,
                        liked: uid ? !!likedBy?.[uid] : false,
                        likesCount: typeof data?.likesCount === 'number' ? data.likesCount : 0,
                        parentId: data?.parentId ?? null,
                    }
                })
                setComments(next)
                setCommentsLoading(false)
            },
            () => {
                setComments([])
                setCommentsLoading(false)
            },
        )

        return () => {
            unsub()
        }
    }, [commentsVisible, item.docId, user])

    const threadedComments = useMemo(() => {
        const byParent = new Map<string, any[]>()
        const roots: any[] = []
        comments.forEach((c) => {
            const parent = c?.parentId ? String(c.parentId) : null
            if (!parent) roots.push(c)
            else {
                const list = byParent.get(parent) ?? []
                list.push(c)
                byParent.set(parent, list)
            }
        })
        const flattened: any[] = []
        roots.forEach((root) => {
            flattened.push({ ...root, __depth: 0 })
            const replies = byParent.get(String(root.id)) ?? []
            replies.forEach((r) => flattened.push({ ...r, __depth: 1, __parent: root.id }))
        })
        return flattened
    }, [comments])

    const toggleCommentLike = useCallback(
        async (comment: any) => {
            if (!item.docId) return
            const uid = (user as any)?.uid ? String((user as any).uid) : null
            if (!uid) return

            const nextLiked = !comment?.liked
            try {
                const reviewRef = doc(firestore, 'reviews', String(item.docId))
                const commentRef = doc(collection(reviewRef, 'comments'), String(comment.id))
                await updateDoc(commentRef, {
                    likesCount: increment(nextLiked ? 1 : -1),
                    [`likedBy.${uid}`]: nextLiked ? true : deleteField(),
                } as any)
            } catch (err) {
                console.warn('Failed to like comment', err)
            }
        },
        [item.docId, user],
    )

    useEffect(() => {
        if (!active) return
        try {
            void logInteraction({
                type: 'reel_play' as any,
                actorId: (user as any)?.uid ?? null,
                targetId: item.id,
                meta: { source: 'feed_reels' },
            })
        } catch { }
    }, [active, item.id, user])

    const renderDescription = (text: string) => {
        const parts = text.split(/([#@]\w+)/g)
        return (
            <Text style={styles.descriptionText} numberOfLines={2}>
                {parts.map((part, index) => {
                    if (part.startsWith('#')) return <Text key={index} style={styles.hashtagText}>{part}</Text>
                    if (part.startsWith('@')) return <Text key={index} style={styles.mentionText}>{part}</Text>
                    return part
                })}
            </Text>
        )
    }

    const lastTapRef = useRef(0)
    const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const heartAnim = useRef(new Animated.Value(0)).current
    const [heartPos, setHeartPos] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 })

    const playHeartBurst = () => {
        heartAnim.setValue(0)
        Animated.timing(heartAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
        }).start()
    }

    const heartScale = heartAnim.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [0.2, 1.2, 1],
    })

    const heartOpacity = heartAnim.interpolate({
        inputRange: [0, 0.15, 0.8, 1],
        outputRange: [0, 1, 1, 0],
    })

    const handleTap = (e: GestureResponderEvent) => {
        const now = Date.now()

        if (now - lastTapRef.current < 280) {
            if (tapTimeout.current) {
                clearTimeout(tapTimeout.current)
                tapTimeout.current = null
            }
            lastTapRef.current = 0

            const { locationX, locationY } = e.nativeEvent
            setHeartPos({ x: locationX, y: locationY })
            if (!liked) void handleLike()
            playHeartBurst()
            return
        }

        lastTapRef.current = now
        tapTimeout.current = setTimeout(() => {
            setPaused((prev) => !prev)
            setShowPlayIcon(true)
            playIconAnim.setValue(0)
            Animated.sequence([
                Animated.timing(playIconAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(playIconAnim, {
                    toValue: 0,
                    duration: 300,
                    delay: 400,
                    useNativeDriver: true,
                }),
            ]).start(() => setShowPlayIcon(false))
            tapTimeout.current = null
        }, 280)
    }

    const goToPosterProfile = () => {
        const uid = item.userId
        if (!uid) return
        router.push(`/profile?from=social-feed&userId=${encodeURIComponent(String(uid))}`)
    }

    const hasVideo = Boolean(item.videoUrl)
    const canRenderVideo = mounted && hasVideo
    const isLive = String(item.mediaType || '') === 'live' && Boolean(item.liveStreamId)
    const isClip = String(item.mediaType || '') === 'clip' || String(item.mediaType || '') === 'trailer'

    useEffect(() => {
        if (!canRenderVideo) {
            setLoading(true)
        }
    }, [canRenderVideo])

    const handleStatusUpdate = useCallback(
        (status: any) => {
            if (!active) return
            if (item.mediaType === 'clip') return
            if (status?.didJustFinish) onAutoPlayNext()
        },
        [active, item.mediaType, onAutoPlayNext],
    )

    const handleLoadStart = useCallback(() => setLoading(true), [])
    const handleLoad = useCallback(() => setLoading(false), [])

    if (!hasVideo) {
        if (isLive) {
            return (
                <View style={styles.slide}>
                    {item.coverUrl ? (
                        <Image source={{ uri: String(item.coverUrl) }} style={styles.video} resizeMode="cover" />
                    ) : (
                        <View style={styles.videoPlaceholder} />
                    )}

                    <View style={styles.overlay} pointerEvents="box-none">
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                            style={styles.bottomGradient}
                        />

                        <View style={styles.bottomContainer}>
                            <View style={styles.bottomLeft}>
                                <Text style={styles.usernameText}>@{item.username ?? item.user ?? item.userId ?? 'unknown'}</Text>
                                {renderDescription(item.title)}
                                <TouchableOpacity
                                    style={styles.liveJoinBtn}
                                    onPress={() => router.push({ pathname: '/social-feed/live/[id]', params: { id: String(item.liveStreamId) } } as any)}
                                >
                                    <Ionicons name="radio" size={16} color="#fff" />
                                    <Text style={styles.liveJoinText}>Join Live</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.actionsColumn}>
                                <TouchableOpacity style={styles.avatarAction} onPress={goToPosterProfile}>
                                    {item.avatar ? (
                                        <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
                                    ) : (
                                        <View style={styles.avatarFallback} />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            )
        }

        return (
            <View style={styles.slide}>
                <View style={styles.center}>
                    <Text style={styles.errorText}>No video available</Text>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.slide}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

            {showPlayIcon && (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}>
                    <Animated.View style={{ transform: [{ scale: playIconAnim }], opacity: playIconAnim }}>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: 20, borderRadius: 50 }}>
                            <Ionicons name={paused ? "play" : "pause"} size={48} color="#fff" />
                        </View>
                    </Animated.View>
                </View>
            )}

            {canRenderVideo ? (
                <Video
                    source={{ uri: String(item.videoUrl), headers: (item as any).headers }}
                    style={[styles.video, isClip && { backgroundColor: '#000' }]}
                    resizeMode={isClip ? ResizeMode.CONTAIN : ResizeMode.COVER}
                    shouldPlay={active && autoPlayReels && !paused}
                    isLooping
                    isMuted={muted}
                    volume={muted ? 0 : 1}
                    progressUpdateIntervalMillis={active ? 250 : 1000}
                    onLoadStart={handleLoadStart}
                    onLoad={handleLoad}
                    onPlaybackStatusUpdate={handleStatusUpdate}
                />
            ) : (
                item.avatar ? (
                    <Image
                        source={{ uri: String(item.avatar) }}
                        style={styles.video}
                        resizeMode="cover"
                        blurRadius={10}
                    />
                ) : (
                    <View style={styles.videoPlaceholder} />
                )
            )}

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.heartBurst,
                    {
                        left: heartPos.x - 48,
                        top: heartPos.y - 48,
                        opacity: heartOpacity,
                        transform: [{ scale: heartScale }],
                    },
                ]}
            >
                <Ionicons name="heart" size={96} color="#ff2d55" />
            </Animated.View>

            {loading && (
                <View style={[styles.center, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            )}

            <View style={styles.overlay} pointerEvents="box-none">
                <View style={styles.topControls}>
                    <TouchableOpacity
                        style={styles.muteButton}
                        onPress={() => setMuted((m) => !m)}
                    >
                        <Ionicons
                            name={muted ? 'volume-mute' : 'volume-high'}
                            size={24}
                            color="#fff"
                        />
                    </TouchableOpacity>
                </View>

                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
                    style={styles.bottomGradient}
                />

                <View style={styles.bottomContainer}>
                    <View style={styles.bottomLeft}>
                        <Text style={styles.usernameText}>@{item.username ?? item.user ?? item.userId ?? 'unknown'}</Text>
                        {renderDescription(item.title)}
                        <View style={styles.musicTicker}>
                            <Ionicons name="musical-notes-outline" size={16} color="#fff" />
                            <Text style={styles.musicText} numberOfLines={1}>
                                {item.musicTrack ? `${item.musicTrack.title} • ${item.musicTrack.artist}` : (item.music || 'Original Audio')}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.actionsColumn}>
                    <TouchableOpacity style={styles.avatarAction} onPress={goToPosterProfile}>
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatarFallback} />
                        )}
                        <View style={styles.followPlus}>
                            <Feather name="plus" size={14} color="#fff" />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                        <Ionicons
                            name={liked ? 'heart' : 'heart-outline'}
                            size={32}
                            color={liked ? '#ff2d55' : '#fff'}
                        />
                        <Text style={styles.actionCount}>{likesCount}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsVisible(true)}>
                        <Ionicons name="chatbubble-outline" size={32} color="#fff" />
                        <Text style={styles.actionCount}>
                            {item.commentsCount ?? (item.comments?.length ?? 0)}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => Alert.alert('Share', 'Share action')}
                    >
                        <Ionicons name="arrow-redo-outline" size={32} color="#fff" />
                        <Text style={styles.actionCount}>Share</Text>
                    </TouchableOpacity>

                    <Animated.View style={[styles.musicIconContainer, { transform: [{ rotate: spin }] }]}>
                        <Image source={{ uri: item.avatar || undefined }} style={styles.musicIcon} />
                    </Animated.View>
                </View>
            </View>

            <Modal
                visible={commentsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setCommentsVisible(false)
                    setReplyTo(null)
                }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        onPress={() => {
                            setCommentsVisible(false)
                            setReplyTo(null)
                        }}
                    />
                    <View style={styles.commentSheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>{item.commentsCount} Comments</Text>
                            <TouchableOpacity onPress={() => setCommentsVisible(false)}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={threadedComments}
                            keyExtractor={(c) => String(c.id)}
                            renderItem={({ item: comment }) => (
                                <View style={[styles.commentRow, comment.__depth ? styles.commentRowReply : undefined]}>
                                    <Image source={{ uri: comment.avatar || undefined }} style={styles.commentAvatar} />
                                    <View style={styles.commentTextContainer}>
                                        <View style={styles.commentTopRow}>
                                            <Text style={styles.commentUser}>{comment.userDisplayName}</Text>
                                            <View style={styles.commentActionsInline}>
                                                <TouchableOpacity
                                                    onPress={() => toggleCommentLike(comment)}
                                                    style={styles.commentLikeBtn}
                                                    activeOpacity={0.85}
                                                >
                                                    <Ionicons
                                                        name={comment.liked ? 'heart' : 'heart-outline'}
                                                        size={16}
                                                        color={comment.liked ? '#ff2d55' : 'rgba(255,255,255,0.9)'}
                                                    />
                                                    <Text style={styles.commentLikeCount}>{comment.likesCount || 0}</Text>
                                                </TouchableOpacity>
                                                {comment.__depth ? null : (
                                                    <TouchableOpacity
                                                        onPress={() => setReplyTo({ id: String(comment.id), userDisplayName: comment.userDisplayName })}
                                                        style={styles.commentReplyBtn}
                                                        activeOpacity={0.85}
                                                    >
                                                        <Text style={styles.commentReplyText}>Reply</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                        <Text style={styles.commentText}>{comment.text}</Text>
                                    </View>
                                </View>
                            )}
                            style={styles.commentList}
                            ListEmptyComponent={
                                commentsLoading ? (
                                    <View style={{ paddingVertical: 24 }}>
                                        <ActivityIndicator color="#fff" />
                                    </View>
                                ) : (
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', paddingVertical: 24, textAlign: 'center' }}>
                                        No comments yet.
                                    </Text>
                                )
                            }
                        />

                        <View style={styles.commentInputContainer}>
                            <TextInput
                                style={styles.commentInput}
                                value={commentText}
                                onChangeText={setCommentText}
                                placeholder={replyTo ? `Reply to ${replyTo.userDisplayName ?? 'comment'}...` : 'Add a comment...'}
                                placeholderTextColor="#888"
                            />
                            {replyTo ? (
                                <TouchableOpacity
                                    style={styles.emojiButton}
                                    onPress={() => setReplyTo(null)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>×</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.emojiButton}>
                                    <Text>😊</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={submitComment} style={styles.sendButton}>
                                <Ionicons name="arrow-up-circle" size={32} color="#7dd8ff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    )
}, (prev, next) => {
    if (prev.active !== next.active) return false
    if (prev.mounted !== next.mounted) return false
    if (prev.autoPlayReels !== next.autoPlayReels) return false
    const a = prev.item
    const b = next.item
    return (
        a.id === b.id &&
        a.videoUrl === b.videoUrl &&
        a.coverUrl === b.coverUrl &&
        a.liveStreamId === b.liveStreamId &&
        a.title === b.title &&
        a.user === b.user &&
        a.avatar === b.avatar &&
        a.likes === b.likes &&
        a.commentsCount === b.commentsCount &&
        a.music === b.music
    )
})

const styles = StyleSheet.create({
    slide: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' },
    center: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: { width: '100%', height: '100%' },
    videoPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
    },

    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    bottomGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT * 0.4,
    },
    bottomContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingBottom: Platform.OS === 'ios' ? 90 : 70,
    },
    bottomLeft: { flex: 1, gap: 12 },
    usernameText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    descriptionText: { color: '#fff', fontSize: 14 },
    hashtagText: { color: '#8ef', fontWeight: '600' },
    mentionText: { color: '#ffbde6', fontWeight: '600' },
    musicTicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    musicText: { color: '#fff', fontSize: 13 },

    liveJoinBtn: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(229,9,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    liveJoinText: { color: '#fff', fontSize: 14, fontWeight: '800' },

    actionsColumn: {
        position: 'absolute',
        right: 8,
        bottom: Platform.OS === 'ios' ? 90 : 70,
        width: 60,
        alignItems: 'center',
        gap: 20,
    },
    avatarAction: { alignItems: 'center', position: 'relative' },
    avatarImage: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff' },
    avatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e50914', borderWidth: 2, borderColor: '#fff' },
    followPlus: {
        position: 'absolute',
        bottom: -8,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#ff2d55',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtn: { alignItems: 'center' },
    actionCount: { color: '#fff', marginTop: 4, fontSize: 12, fontWeight: '600' },

    musicIconContainer: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
    musicIcon: { width: 30, height: 30, borderRadius: 15 },

    heartBurst: {
        position: 'absolute',
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
    },

    modalBackdrop: { flex: 1, backgroundColor: 'transparent' },
    commentSheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT * 0.6,
        backgroundColor: '#181818',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 12,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
    commentList: { marginTop: 10 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
    commentAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#333',
        marginRight: 10,
    },
    commentTextContainer: { flex: 1, gap: 4 },
    commentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    commentActionsInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    commentLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    commentLikeCount: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
    commentReplyBtn: { paddingVertical: 2, paddingHorizontal: 6 },
    commentReplyText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
    commentUser: { color: '#aaa', fontWeight: '600', fontSize: 12 },
    commentText: { color: '#fff', fontSize: 14 },
    commentRowReply: { paddingLeft: 18, opacity: 0.98 },
    commentInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    commentInput: {
        flex: 1,
        backgroundColor: '#2c2c2c',
        color: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    emojiButton: { paddingHorizontal: 8 },
    sendButton: { paddingLeft: 8 },
    errorText: { color: '#fff' },
    topControls: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        right: 16,
        zIndex: 25,
        flexDirection: 'row',
        alignItems: 'center',
    },
    muteButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
})
