import { Ionicons } from '@expo/vector-icons'
import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeCache } from '../lib/nativeCache'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

import { useAccent } from '../components/app-components/AccentContext'
import LiquidGlass from '../components/app-components/LiquidGlass'
import ScreenWrapper from '../components/ScreenWrapper'
import { authPromise, firestore } from '../constants/firebase'
import { supabase, supabaseConfigured } from '../constants/supabase'
import { useNavigationGuard } from '../hooks/use-navigation-guard'
import { getLastAuthUid as getLastAuthUidStored, setLastAuthUid as setLastAuthUidStored } from '../lib/profileStorage'
import ProfileModule from '../modules/ProfileModule'
import { useSubscription } from '../providers/SubscriptionProvider'

type PlanTier = 'free' | 'plus' | 'premium'

type HouseholdProfile = {
  id: string
  name: string
  avatarColor: string
  photoURL?: string | null
  photoPath?: string | null
  isKids?: boolean
  hiddenDueToPlan?: boolean
  pin?: string | null
}

const PROFILE_LIMITS: Record<PlanTier, number> = {
  free: 1,
  plus: 3,
  premium: 5,
}

const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  plus: 'Plus',
  premium: 'Premium',
}

const PLAN_PRICES: Record<PlanTier, number> = {
  free: 0,
  plus: 250,
  premium: 500,
}

const normalizePlanTier = (raw: unknown): PlanTier => {
  const v = String(raw ?? '')
    .toLowerCase()
    .trim()
  return v === 'premium' || v === 'plus' || v === 'free' ? (v as PlanTier) : 'free'
}

const palette = ['#e50914', '#ff914d', '#2ec4b6', '#6c5ce7', '#ff6bcb', '#00b8d9']
const PROFILES_BUCKET = 'profiles'

const ProfileCard = memo(function ProfileCard({
  item,
  index,
  locked,
  accentColor,
  onPress,
  onEdit,
  onDelete,
}: {
  item: HouseholdProfile
  index: number
  locked: boolean
  accentColor: string
  onPress: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const scaleAnim = useMemo(() => new Animated.Value(0.9), [])
  const opacityAnim = useMemo(() => new Animated.Value(0), [])
  const glowAnim = useMemo(() => new Animated.Value(0), [])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
        delay: index * 60,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [index, scaleAnim, opacityAnim])

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [focused, glowAnim])

  const cardGlowColor = item.avatarColor || accentColor
  const animatedBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(108,92,231,0.25)', cardGlowColor],
  })

  return (
    <Animated.View
      style={[
        styles.profileCardOuter,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPressIn={() => setFocused(true)}
        onPressOut={() => setFocused(false)}
        onPress={onPress}
      >
        <LiquidGlass
          cornerRadius={24}
          tintColor="#110b1f"
          tintOpacity={locked ? 0.3 : 0.6}
          borderOpacity={0.45}
          blurRadius={focused ? 45 : 35}
          chromaticAberration={focused && !locked}
          depthEffect={focused && !locked}
          refractionAmount={0.3}
          interactive={!locked}
          dynamicHighlight={focused && !locked}
          style={[
            styles.profileCard,
            locked && { opacity: 0.55 },
            // Removed animatedBorderColor from an inner view and apply to the glass itself (if supported) or remove entirely to avoid the inner square.
          ]}
        >
          {focused && !locked && (
            <LinearGradient
              colors={[`${cardGlowColor}35`, 'transparent']}
              style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
          )}

          {!locked && (
            <View style={styles.profileActions} pointerEvents="box-none">
              <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={styles.actionBtnHitbox}>
                <LiquidGlass cornerRadius={16} tintColor="#2ec4b6" tintOpacity={0.25} borderOpacity={0.35} style={styles.actionButton}>
                  <Ionicons name="pencil" size={14} color="#2ec4b6" />
                </LiquidGlass>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.actionBtnHitbox}>
                <LiquidGlass cornerRadius={16} tintColor="#e50914" tintOpacity={0.25} borderOpacity={0.35} style={styles.actionButton}>
                  <Ionicons name="trash" size={14} color="#e50914" />
                </LiquidGlass>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.avatarContainer, { shadowColor: cardGlowColor }]}>
            <LiquidGlass cornerRadius={28} tintOpacity={0.35} borderOpacity={0.55} style={styles.avatar}>
              {item.photoURL ? (
                <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
              ) : (
                <LinearGradient
                  colors={[cardGlowColor, `${cardGlowColor}70`]}
                  style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              )}
              {!item.photoURL && (
                <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
              )}
            </LiquidGlass>
          </View>

          <Text style={styles.profileName} numberOfLines={1}>
            {item.name}
          </Text>

          <View style={styles.tagsContainer}>
            {item.isKids && (
              <LiquidGlass cornerRadius={12} tintColor="#2ec4b6" tintOpacity={0.3} borderOpacity={0.4} style={styles.kidsPillWrap}>
                <Text style={styles.kidsPill}>Kids</Text>
              </LiquidGlass>
            )}
            {item.pin && (
              <LiquidGlass cornerRadius={12} tintColor="#ff914d" tintOpacity={0.3} borderOpacity={0.4} style={styles.kidsPillWrap}>
                <Ionicons name="key" size={10} color="#ff914d" />
              </LiquidGlass>
            )}
          </View>

          {locked && (
            <LiquidGlass cornerRadius={16} tintColor="#ff914d" tintOpacity={0.4} borderOpacity={0.5} style={styles.lockOverlay}>
              <Ionicons name="lock-closed" size={14} color="#ff914d" />
              <Text style={styles.lockText}>Upgrade</Text>
            </LiquidGlass>
          )}
        </LiquidGlass>
      </TouchableOpacity>
    </Animated.View>
  )
})

const SelectProfileScreen = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { accentColor } = useAccent()
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 })

  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [lastAuthUid, setLastAuthUid] = useState<string | null>(null)
  const [lastAuthUidLoaded, setLastAuthUidLoaded] = useState(false)

  const effectiveUid = currentUser?.uid ?? lastAuthUid

  const { currentPlan: planTier, refresh: refreshSubscription, loading: planLoading } = useSubscription()
  const [cachedPlanTier, setCachedPlanTier] = useState<PlanTier | null>(null)

  const [profiles, setProfiles] = useState<HouseholdProfile[]>([])
  const [profilesHydrated, setProfilesHydrated] = useState(false)

  const [savingProfile, setSavingProfile] = useState(false)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<HouseholdProfile | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const sheetTranslateY = useMemo(() => new Animated.Value(1), [])
  const [newProfileName, setNewProfileName] = useState('')
  const [isKidsProfile, setIsKidsProfile] = useState(false)
  const [selectedColor, setSelectedColor] = useState(palette[0])
  const [errorCopy, setErrorCopy] = useState<string | null>(null)
  const [profilePin, setProfilePin] = useState('')
  const [pinEntry, setPinEntry] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [signInSliderProgress, setSignInSliderProgress] = useState(0)
  const keyboardHeightRef = useRef(0)
  const sheetKeyboardOffset = useMemo(() => new Animated.Value(0), [])
  const [pinEntryFocused, setPinEntryFocused] = useState(false)
  const [profilePinFocused, setProfilePinFocused] = useState(false)
  const gradientFade = useMemo(() => new Animated.Value(0), [])
  const [gradientIndex, setGradientIndex] = useState(0)

  const gradientPalettes = useMemo((): [string, string, string][] => {
    const accent = accentColor || '#e50914'
    return [
      [accent, '#0c0714', '#020204'],
      ['#6c5ce7', '#21183b', '#0a0a12'],
      ['#ff4757', '#8e44ad', '#020204'],
    ]
  }, [accentColor])

  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [editingProfile, setEditingProfile] = useState<HouseholdProfile | null>(null)

  const effectivePlanTier = useMemo(() => {
    if (planLoading && cachedPlanTier) return cachedPlanTier
    if (planTier !== 'free') return planTier
    if (cachedPlanTier && cachedPlanTier !== 'free') return cachedPlanTier
    return planTier
  }, [cachedPlanTier, planLoading, planTier])

  const profileLimit = PROFILE_LIMITS[effectivePlanTier]
  const planLabel = PLAN_LABELS[effectivePlanTier]
  const canCreateMore = editingProfile ? true : profiles.length < profileLimit
  const previewAvatarSource = avatarUri || editingProfile?.photoURL || null
  const isEditing = Boolean(editingProfile)
  const profileCacheKey = effectiveUid ? `profileCache:${effectiveUid}` : null
  const planCacheKey = effectiveUid ? `planCache:${effectiveUid}` : null

  useEffect(() => {
    let mounted = true
    getLastAuthUidStored()
      .then((uid) => { if (mounted) setLastAuthUid(uid) })
      .catch(() => { })
      .finally(() => { if (mounted) setLastAuthUidLoaded(true) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    const hydrate = async () => {
      if (planCacheKey) {
        try {
          const cached = await NativeCache.getItem(planCacheKey)
          if (mounted && cached) {
            const tier = normalizePlanTier(cached)
            if (tier !== 'free') {
              setCachedPlanTier(tier)
              return
            }
          }
        } catch { }
      }
      try {
        const raw = await NativeCache.getItem('activeProfile')
        if (mounted && raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.planTier) {
            const tier = normalizePlanTier(parsed.planTier)
            if (tier !== 'free') setCachedPlanTier(tier)
          }
        }
      } catch { }
    }
    hydrate()
    return () => { mounted = false }
  }, [planCacheKey])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (e: any) => {
      const h = Number(e?.endCoordinates?.height ?? 0)
      keyboardHeightRef.current = Number.isFinite(h) ? h : 0
      if (Platform.OS === 'android') {
        Animated.timing(sheetKeyboardOffset, {
          toValue: -keyboardHeightRef.current,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start()
      }
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0
      if (Platform.OS === 'android') {
        Animated.timing(sheetKeyboardOffset, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start()
      }
    })
    return () => { showSub.remove(); hideSub.remove() }
  }, [sheetKeyboardOffset])

  useEffect(() => {
    if (gradientPalettes.length <= 1) return
    const interval = setInterval(() => {
      gradientFade.setValue(0)
      Animated.timing(gradientFade, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setGradientIndex((prev) => (prev + 1) % gradientPalettes.length)
        gradientFade.setValue(0)
      })
    }, 12000)
    return () => clearInterval(interval)
  }, [gradientPalettes.length, gradientFade])

  const handleUpgrade = useCallback(() => {
    deferNav(() => router.push('/premium?source=profiles'))
  }, [deferNav, router])

  const isLockedIndex = useCallback(
    (index: number) => effectivePlanTier === 'free' && index >= 1,
    [effectivePlanTier],
  )

  useEffect(() => {
    let unsub: Unsubscribe | undefined
    let resolved = false
    authPromise
      .then((auth) => {
        unsub = onAuthStateChanged(auth, (user: any) => {
          setCurrentUser(user ?? null)
          if (user?.uid) {
            setLastAuthUid(user.uid)
            void setLastAuthUidStored(user.uid)
          }
          if (!resolved) {
            setAuthChecked(true)
            resolved = true
          }
        })
      })
      .catch(() => {
        setCurrentUser(null)
        setAuthChecked(true)
      })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (authChecked && lastAuthUidLoaded && !currentUser && !effectiveUid) {
      deferNav(() => router.replace('/(auth)/login'))
    }
  }, [authChecked, currentUser, deferNav, effectiveUid, lastAuthUidLoaded, router])

  useEffect(() => {
    if (!profileCacheKey) {
      setProfiles([])
      setProfilesHydrated(true)
      return
    }
    let mounted = true
    NativeCache.getItem(profileCacheKey)
      .then((cached) => {
        if (!mounted) return
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as HouseholdProfile[]
            if (Array.isArray(parsed)) {
              setProfiles(parsed)
              if (parsed.length === 0) setShowCreateCard(true)
            }
          } catch { }
        }
      })
      .finally(() => { if (mounted) setProfilesHydrated(true) })
    return () => { mounted = false }
  }, [profileCacheKey])

  useFocusEffect(useCallback(() => { void refreshSubscription() }, [refreshSubscription]))

  useEffect(() => {
    if (!currentUser || !profileCacheKey) return
    const profilesRef = collection(firestore, 'users', currentUser.uid, 'profiles')
    const q = query(profilesRef, orderBy('createdAt', 'asc'))

    const unsub = onSnapshot(
      q,
      async (snap: any) => {
        const rawDocs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        const fromCache = Boolean(snap.metadata?.fromCache)
        if (fromCache && rawDocs.length === 0) return

        try {
          const parsedJson = await ProfileModule.parseHouseholdProfiles(JSON.stringify(rawDocs), palette[0])
          const next = JSON.parse(parsedJson) as HouseholdProfile[]
          setProfiles(next)
          setErrorCopy(null)
          setShowCreateCard(next.length === 0)
          NativeCache.setItem(profileCacheKey, JSON.stringify(next)).catch(() => { })
        } catch (parseErr) {
          const next: HouseholdProfile[] = rawDocs.map((data: any) => ({
            id: data.id,
            name: (data.name as string)?.trim() || 'Profile',
            avatarColor: (data.avatarColor as string)?.trim() || palette[0],
            photoURL: data.photoURL,
            photoPath: data.photoPath,
            isKids: Boolean(data.isKids),
            hiddenDueToPlan: Boolean(data.hiddenDueToPlan),
            pin: typeof data.pin === 'string' && data.pin.length > 0 ? data.pin : null,
          }))
          setProfiles(next)
          setErrorCopy(null)
          setShowCreateCard(next.length === 0)
          NativeCache.setItem(profileCacheKey, JSON.stringify(next)).catch(() => { })
        }
      },
      (err: any) => {
        if (profiles.length === 0 && profilesHydrated) setErrorCopy('Profiles unavailable (offline?).')
      },
    )
    return () => unsub()
  }, [currentUser, profileCacheKey, profiles.length, profilesHydrated])

  const handleSelectProfile = useCallback(
    async (profile: HouseholdProfile) => {
      const index = profiles.findIndex((p) => p.id === profile.id)
      if (effectivePlanTier === 'free' && index >= 1) {
        Alert.alert('Upgrade required', 'Free plan supports 1 profile.', [{ text: 'Not now', style: 'cancel' }, { text: 'Upgrade', onPress: handleUpgrade }])
        return
      }
      try {
        await NativeCache.setItem('activeProfile', JSON.stringify({
          id: profile.id, name: profile.name, avatarColor: profile.avatarColor,
          photoURL: profile.photoURL ?? null, photoPath: profile.photoPath ?? null,
          isKids: profile.isKids ?? false, planTier: effectivePlanTier,
        }))
        if (planCacheKey && effectivePlanTier !== 'free') {
          await NativeCache.setItem(planCacheKey, effectivePlanTier).catch(() => { })
        }
        if (currentUser?.uid) {
          void setDoc(doc(firestore, 'users', currentUser.uid), {
            displayName: profile.name,
            ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
            activeProfileId: profile.id,
            activeProfileUpdatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => { })
        }
        deferNav(() => router.replace('/(tabs)/movies'))
      } catch (err) {
        Alert.alert('Error', 'Unable to select this profile.')
      }
    },
    [effectivePlanTier, profiles, handleUpgrade, currentUser, deferNav, router, planCacheKey],
  )

  const resetForm = () => {
    Keyboard.dismiss()
    setNewProfileName('')
    setIsKidsProfile(false)
    setSelectedColor(palette[0])
    setProfilePin('')
    setAvatarUri(null)
    setEditingProfile(null)
    setShowCreateCard(false)
    setAvatarUploading(false)
  }

  const openNewProfileForm = () => {
    resetForm()
    setShowCreateCard(true)
  }

  const startEditingProfile = (profile: HouseholdProfile) => {
    setEditingProfile(profile)
    setNewProfileName(profile.name)
    setSelectedColor(profile.avatarColor || palette[0])
    setIsKidsProfile(profile.isKids ?? false)
    setProfilePin(profile.pin ?? '')
    setAvatarUri(null)
    setShowCreateCard(true)
  }

  const handleDeleteProfile = (profile: HouseholdProfile) => {
    if (!authChecked || !currentUser) return
    Alert.alert(
      'Delete profile',
      `Are you sure you want to delete ${profile.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(firestore, 'users', currentUser.uid, 'profiles', profile.id))
              if (supabaseConfigured && profile.photoPath) {
                await supabase.storage.from(PROFILES_BUCKET).remove([profile.photoPath])
              }
              const stored = await NativeCache.getItem('activeProfile')
              if (stored) {
                const parsed = JSON.parse(stored)
                if (parsed?.id === profile.id) await NativeCache.removeItem('activeProfile')
              }
            } catch (err) {
              Alert.alert('Error', 'Unable to delete this profile.')
            }
          },
        },
      ],
      { cancelable: true },
    )
  }

  const uploadAvatarToSupabase = async (): Promise<{ url: string; path: string } | null> => {
    if (!avatarUri || !currentUser || !supabaseConfigured) return null
    try {
      const base64 = await FileSystem.readAsStringAsync(avatarUri, { encoding: 'base64' })
      const arrayBuffer = decode(base64)
      const uriExt = avatarUri.split('.').pop()?.split('?')[0] || 'jpg'
      const safeName = `${currentUser.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uriExt}`
      const { error } = await supabase.storage.from(PROFILES_BUCKET).upload(safeName, arrayBuffer, {
        cacheControl: '3600', upsert: true, contentType: `image/${uriExt === 'jpg' ? 'jpeg' : uriExt}`,
      })
      if (error) throw error
      const { data: urlData } = supabase.storage.from(PROFILES_BUCKET).getPublicUrl(safeName)
      return { url: urlData.publicUrl, path: safeName }
    } catch (err) {
      Alert.alert('Upload failed', 'Unable to upload photo.')
      return null
    }
  }

  const handleCreateProfile = async () => {
    if (!currentUser) return
    if (!editingProfile && profiles.length >= profileLimit) {
      Alert.alert('Upgrade needed', 'Please upgrade to add more profiles.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Upgrade', onPress: handleUpgrade }])
      return
    }
    const trimmedName = newProfileName.trim()
    if (!trimmedName) { Alert.alert('Name required', 'Provide a profile name.'); return }
    const normalizedPin = profilePin.trim()
    if (normalizedPin && !/^\d{4}$/.test(normalizedPin)) { Alert.alert('Invalid PIN', 'PIN must be 4 digits.'); return }

    setSavingProfile(true)
    let uploadResult: { url: string; path: string } | null = null
    if (avatarUri) {
      setAvatarUploading(true)
      uploadResult = await uploadAvatarToSupabase()
    }

    try {
      const chosenColor = selectedColor || palette[0]
      const payload: Record<string, any> = {
        name: trimmedName, avatarColor: chosenColor, isKids: isKidsProfile, pin: normalizedPin.length === 4 ? normalizedPin : null,
      }
      if (!editingProfile) {
        payload.createdAt = serverTimestamp()
        payload.planTierAtCreation = effectivePlanTier
      }
      if (uploadResult) {
        payload.photoURL = uploadResult.url
        payload.photoPath = uploadResult.path
      }

      if (editingProfile) {
        await updateDoc(doc(firestore, 'users', currentUser.uid, 'profiles', editingProfile.id), payload)
        if (profileCacheKey) {
          const next = profiles.map((p) => p.id === editingProfile.id ? { ...p, ...payload, id: p.id } : p) as HouseholdProfile[]
          setProfiles(next)
          NativeCache.setItem(profileCacheKey, JSON.stringify(next)).catch(() => { })
        }
      } else {
        const docRef = await addDoc(collection(firestore, 'users', currentUser.uid, 'profiles'), payload)
        if (profileCacheKey) {
          const created: HouseholdProfile = { id: docRef.id, ...payload } as HouseholdProfile
          const next = [...profiles, created]
          setProfiles(next)
          NativeCache.setItem(profileCacheKey, JSON.stringify(next)).catch(() => { })
        }
      }
      resetForm()
    } catch (err) {
      Alert.alert('Error', 'Could not save profile.')
    } finally {
      setSavingProfile(false)
      setAvatarUploading(false)
    }
  }

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permission needed', 'Access to photos required.'); return }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      if (!result.canceled && result.assets?.length) setAvatarUri(result.assets[0].uri)
    } catch (err) { }
  }

  const handleChoosePlan = (tier: PlanTier) => {
    if (tier === effectivePlanTier) return
    deferNav(() => router.push(`/premium?source=profiles&requested=${tier}`))
  }

  const handleProfileCardPress = useCallback(
    (item: HouseholdProfile, index: number) => {
      if (isLockedIndex(index)) {
        Alert.alert('Upgrade required', 'Free plan supports 1 profile.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Upgrade', onPress: handleUpgrade }])
        return
      }
      setSelectedProfile(item)
      setPinEntry('')
      setPinError(null)
      setSheetVisible(true)
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start()
    },
    [handleUpgrade, isLockedIndex, sheetTranslateY],
  )

  const handleSignInSliderComplete = async (val: number) => {
    if (!selectedProfile) return;
    if (val > 0.9) {
      if (selectedProfile.pin && pinEntry !== selectedProfile.pin) {
        setPinError('Incorrect PIN');
        setSignInSliderProgress(0);
        return;
      }
      try {
        await handleSelectProfile(selectedProfile);
      } finally {
        Animated.timing(sheetTranslateY, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => {
          setSheetVisible(false);
          setSignInSliderProgress(0);
        });
      }
    } else {
      setSignInSliderProgress(0);
    }
  };

  const renderProfile = useCallback(
    ({ item, index }: { item: HouseholdProfile; index: number }) => (
      <ProfileCard
        item={item} index={index} locked={isLockedIndex(index)}
        accentColor={accentColor} onPress={() => handleProfileCardPress(item, index)}
        onEdit={() => startEditingProfile(item)} onDelete={() => handleDeleteProfile(item)}
      />
    ),
    [accentColor, handleDeleteProfile, handleProfileCardPress, isLockedIndex],
  )

  const paletteCount = gradientPalettes.length || 1
  const nextGradientIndex = (gradientIndex + 1) % paletteCount

  return (
    <ScreenWrapper disableTopInset>
      <View style={styles.flex}>
        <View style={styles.glassyBackground} pointerEvents="none">
          <LinearGradient colors={gradientPalettes[gradientIndex]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientLayer} />
          <Animated.View style={[styles.gradientLayer, { opacity: gradientFade }]}>
            <LinearGradient colors={gradientPalettes[nextGradientIndex]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientLayer} />
          </Animated.View>
          <LinearGradient colors={[`${accentColor}60`, 'transparent']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.bgOrbPrimary} />
          <LinearGradient colors={['rgba(108,92,231,0.4)', 'transparent']} start={{ x: 0.8, y: 0 }} end={{ x: 0.2, y: 1 }} style={styles.bgOrbSecondary} />
        </View>

        <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top + 20 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <View style={styles.headerBlock}>
            <Text style={styles.title}>Who's watching?</Text>
            <Text style={styles.subtitle}>Select a profile for personalized content.</Text>
          </View>

          <LiquidGlass
            cornerRadius={20}
            tintColor="#110b1f"
            tintOpacity={0.45}
            borderOpacity={0.4}
            breathingEffect={true}
            style={styles.planContainer}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planHeaderLabel}>Active Plan: {planLabel}</Text>
              <Text style={styles.planUsage}>{profiles.length}/{profileLimit} Profiles</Text>
            </View>
            <View style={styles.planOptionsRow}>
              {(['free', 'plus', 'premium'] as PlanTier[]).map((tier) => {
                const isActive = effectivePlanTier === tier;
                return (
                  <TouchableOpacity key={tier} style={styles.planOptionBtn} onPress={() => handleChoosePlan(tier)} activeOpacity={0.8}>
                    <LiquidGlass
                      cornerRadius={14}
                      tintColor="#1a1130"
                      tintOpacity={isActive ? 0.4 : 0.1}
                      borderOpacity={isActive ? 0.6 : 0.1}
                      style={[
                        styles.planOptionGlass,
                        // Removed inline React Native borders to rely purely on native Liquid Glass borders
                      ]}
                    >
                      <Text style={[styles.planOptionLabel, isActive && { color: accentColor }]}>{PLAN_LABELS[tier]}</Text>
                      <Text style={styles.planOptionPrice}>{PLAN_PRICES[tier]} KSH</Text>
                    </LiquidGlass>
                  </TouchableOpacity>
                )
              })}
            </View>
          </LiquidGlass>

          {!profilesHydrated ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator color={accentColor} size="large" />
              <Text style={styles.loaderText}>Loading your profiles...</Text>
            </View>
          ) : errorCopy ? (
            <Text style={styles.errorText}>{errorCopy}</Text>
          ) : (
            <FlatList
              data={profiles}
              keyExtractor={(item: HouseholdProfile, index: number) => item.id || `temp-${index}`}
              renderItem={renderProfile}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={[styles.profileGrid, profiles.length === 0 && styles.profileGridEmpty]}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <LiquidGlass cornerRadius={24} tintColor="#6c5ce7" tintOpacity={0.25} borderOpacity={0.4} style={styles.emptyCard}>
                    <Ionicons name="people-circle" size={48} color="#6c5ce7" />
                    <Text style={styles.emptyTitle}>Create a Profile</Text>
                    <Text style={styles.emptySubtitle}>Everyone gets their own recommendations and watch history.</Text>
                  </LiquidGlass>
                </View>
              }
            />
          )}

          {!showCreateCard && (
            <View style={styles.footerActions}>
              <TouchableOpacity onPress={openNewProfileForm} disabled={!canCreateMore} activeOpacity={0.8}>
                <LiquidGlass cornerRadius={18} tintColor="#6c5ce7" tintOpacity={0.25} borderOpacity={0.45} style={[styles.mainAddButton, !canCreateMore && styles.disabledOpacity]}>
                  <Ionicons name="add" size={20} color="#6c5ce7" />
                  <Text style={styles.mainAddText}>{canCreateMore ? 'Add New Profile' : 'Profile Limit Reached'}</Text>
                </LiquidGlass>
              </TouchableOpacity>
            </View>
          )}

          {showCreateCard && (
            <LiquidGlass
              cornerRadius={24}
              tintColor="#0a0614"
              tintOpacity={0.75}
              borderOpacity={0.5}
              blurRadius={35}
              chromaticAberration={true}
              depthEffect={true}
              refractionAmount={0.3}
              interactive={true}
              style={styles.createCard}
            >
              <View style={styles.createHeaderRow}>
                <Text style={styles.createTitle}>{isEditing ? 'Edit Profile' : 'New Profile'}</Text>
                <TouchableOpacity onPress={resetForm}>
                  <Ionicons name="close-circle" size={24} color="rgba(200,180,255,0.6)" />
                </TouchableOpacity>
              </View>

              <View style={styles.uploadRow}>
                <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
                  <LiquidGlass cornerRadius={26} tintColor="#00b8d9" tintOpacity={0.25} borderOpacity={0.45} style={styles.avatarUpload}>
                    {avatarUri || previewAvatarSource ? (
                      <Image source={{ uri: avatarUri || previewAvatarSource || '' }} style={styles.avatarUploadImage} />
                    ) : (
                      <View style={styles.uploadPlaceholder}>
                        <Ionicons name="camera" size={28} color="#00b8d9" />
                        <Text style={styles.uploadHint}>{avatarUploading ? 'Wait...' : 'Add Photo'}</Text>
                      </View>
                    )}
                  </LiquidGlass>
                </TouchableOpacity>
              </View>

              <LiquidGlass cornerRadius={14} tintColor="#6c5ce7" tintOpacity={0.15} borderOpacity={0.35} style={styles.inputWrap}>
                <TextInput placeholder="Profile Name" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.textInputRaw} value={newProfileName} onChangeText={setNewProfileName} maxLength={20} />
              </LiquidGlass>

              <LiquidGlass cornerRadius={14} tintColor="#00b8d9" tintOpacity={0.15} borderOpacity={0.35} style={[styles.inputWrap, { marginTop: 12 }]}>
                <TextInput placeholder="4-Digit PIN (Optional)" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.textInputRaw} value={profilePin} onChangeText={(t: string) => setProfilePin(t.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} />
              </LiquidGlass>
              <Text style={styles.pinHint}>Leave blank to skip PIN protection.</Text>

              <View style={styles.colorRow}>
                {palette.map((color) => (
                  <TouchableOpacity key={color} onPress={() => setSelectedColor(color)} style={styles.colorSwatchWrap}>
                    <View style={[styles.colorSwatch, { backgroundColor: color }, selectedColor === color && styles.colorSwatchActive]} />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.kidsRow}>
                <Text style={styles.kidsLabel}>Kids Profile (Filtered Content)</Text>
                <Switch value={isKidsProfile} onValueChange={setIsKidsProfile} thumbColor="#fff" trackColor={{ true: accentColor, false: 'rgba(255,255,255,0.2)' }} />
              </View>

              <TouchableOpacity onPress={handleCreateProfile} disabled={savingProfile} activeOpacity={0.8} style={{ marginTop: 12 }}>
                <LiquidGlass cornerRadius={16} tintColor="#ff914d" tintOpacity={0.35} borderOpacity={0.55} style={styles.saveActionBtn}>
                  {savingProfile ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveActionText}>{isEditing ? 'Save Changes' : 'Create Profile'}</Text>}
                </LiquidGlass>
              </TouchableOpacity>
            </LiquidGlass>
          )}

          {/* Bottom Sheet */}
          {selectedProfile && sheetVisible && (
            <>
              <Animated.View style={[styles.sheetBackdrop, { opacity: sheetTranslateY.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { Animated.timing(sheetTranslateY, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => { setSheetVisible(false); setSelectedProfile(null) }) }} />
              </Animated.View>

              <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: sheetTranslateY.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }) }, { translateY: sheetKeyboardOffset }] }]}>
                <LiquidGlass
                  cornerRadius={32}
                  tintColor="#0a0512"
                  tintOpacity={0.85}
                  borderOpacity={0.55}
                  blurRadius={40}
                  chromaticAberration={true}
                  depthEffect={true}
                  interactive={true}
                  style={styles.sheetContent}
                >
                  <View style={styles.sheetHandle} />

                  <View style={styles.sheetProfileHeader}>
                    <LiquidGlass cornerRadius={24} tintOpacity={0.45} borderOpacity={0.55} style={styles.sheetAvatarLG}>
                      {selectedProfile.photoURL ? (
                        <Image source={{ uri: selectedProfile.photoURL }} style={styles.sheetAvatarImage} />
                      ) : (
                        <Text style={styles.sheetInitialLg}>{selectedProfile.name.charAt(0).toUpperCase()}</Text>
                      )}
                    </LiquidGlass>
                    <View style={styles.sheetHeaderInfo}>
                      <Text style={styles.sheetNameLg}>{selectedProfile.name}</Text>
                      {selectedProfile.isKids && (
                        <LiquidGlass cornerRadius={10} tintColor="#2ec4b6" tintOpacity={0.3} borderOpacity={0.4} style={styles.sheetKidsBadge}>
                          <Text style={styles.sheetKidsText}>Kids</Text>
                        </LiquidGlass>
                      )}
                    </View>
                  </View>

                  {selectedProfile.pin && (
                    <View style={styles.pinPromptSection}>
                      <Text style={styles.pinPromptText}>Profile Locked</Text>
                      <LiquidGlass cornerRadius={16} tintColor="#ff914d" tintOpacity={0.15} borderOpacity={0.45} style={styles.pinPromptInputWrap}>
                        <TextInput value={pinEntry} onChangeText={(t: string) => { setPinEntry(t.replace(/[^0-9]/g, '').slice(0, 4)); setPinError(null) }} placeholder="••••" placeholderTextColor="rgba(255,255,255,0.2)" keyboardType="number-pad" secureTextEntry maxLength={4} style={[styles.pinPromptInput, pinEntryFocused && styles.pinPromptInputFocused]} onFocus={() => setPinEntryFocused(true)} onBlur={() => setPinEntryFocused(false)} />
                      </LiquidGlass>
                      {pinError && <Text style={styles.pinErrorText}>{pinError}</Text>}
                    </View>
                  )}

                  <View style={styles.sheetBtnRow}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { Animated.timing(sheetTranslateY, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => { setSheetVisible(false); startEditingProfile(selectedProfile) }) }}>
                      <LiquidGlass cornerRadius={16} tintColor="#2ec4b6" tintOpacity={0.2} borderOpacity={0.45} style={styles.sheetBtnOutline}>
                        <Text style={styles.sheetBtnOutlineText}>Edit</Text>
                      </LiquidGlass>
                    </TouchableOpacity>
                    <View style={{ flex: 2, marginLeft: 12 }}>
                      <TouchableOpacity
                        onPress={() => handleSignInSliderComplete(1)}
                        activeOpacity={0.8}
                      >
                        <LiquidGlass cornerRadius={16} tintColor="#ff914d" tintOpacity={0.35} borderOpacity={0.55} style={styles.sheetBtnSolidTouch}>
                          <Text style={styles.sheetBtnSolidText}>
                            {selectedProfile.pin ? 'Unlock Profile' : 'Sign In'}
                          </Text>
                        </LiquidGlass>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LiquidGlass>
              </Animated.View>
            </>
          )}

        </KeyboardAvoidingView>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  glassyBackground: { ...StyleSheet.absoluteFillObject },
  gradientLayer: { ...StyleSheet.absoluteFillObject },
  bgOrbPrimary: { position: 'absolute', width: 500, height: 500, borderRadius: 250, top: -120, left: -120, opacity: 0.8, transform: [{ rotate: '15deg' }] },
  bgOrbSecondary: { position: 'absolute', width: 400, height: 400, borderRadius: 200, bottom: -80, right: -100, opacity: 0.7 },
  container: { flex: 1, paddingHorizontal: 20 },

  headerBlock: { marginBottom: 28, alignItems: 'center', marginTop: 10 },
  title: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 1, textShadowColor: 'rgba(229,9,20,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 20 },
  subtitle: { color: 'rgba(200,180,255,0.85)', fontSize: 16, fontWeight: '600', marginTop: 6, letterSpacing: 0.3 },

  planContainer: { padding: 18, marginBottom: 24 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  planHeaderLabel: { color: '#d4b8ff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  planUsage: { color: 'rgba(255,200,100,0.9)', fontSize: 12, fontWeight: '700' },
  planOptionsRow: { flexDirection: 'row', gap: 10 },
  planOptionBtn: { flex: 1 },
  planOptionGlass: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  planOptionLabel: { color: '#e0d0ff', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  planOptionPrice: { color: 'rgba(255,180,80,0.85)', fontSize: 11, fontWeight: '700' },

  loaderRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: 'rgba(200,180,255,0.9)', marginTop: 16, fontSize: 16, fontWeight: '600' },
  errorText: { color: '#ff6b81', textAlign: 'center', marginTop: 20, fontSize: 15, fontWeight: '600' },

  profileGrid: { paddingBottom: 100 },
  profileGridEmpty: { flex: 1, justifyContent: 'center' },
  columnWrapper: { justifyContent: 'space-between', marginBottom: 20 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyCard: { padding: 30, alignItems: 'center', width: '90%', borderWidth: 1, borderColor: 'rgba(108,92,231,0.4)' },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { color: 'rgba(200,180,255,0.75)', textAlign: 'center', fontSize: 14, lineHeight: 22 },

  profileCardOuter: { width: (SCREEN_WIDTH - 40 - 16) / 2 },
  profileCard: { paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center', overflow: 'hidden', borderRadius: 24 },
  profileCardGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 24, borderWidth: 2 },

  profileActions: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8, zIndex: 10 },
  actionBtnHitbox: { padding: 4 },
  actionButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  avatarContainer: { marginBottom: 16, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  avatar: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 28 },
  avatarInitial: { fontSize: 36, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(108,92,231,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },

  profileName: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.4, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  tagsContainer: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 24 },
  kidsPillWrap: { paddingHorizontal: 10, paddingVertical: 4 },
  kidsPill: { color: '#7efff0', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  lockOverlay: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  lockText: { color: '#ffb347', fontSize: 12, fontWeight: '800' },

  footerActions: { position: 'absolute', bottom: 30, left: 20, right: 20 },
  mainAddButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderWidth: 1.5, borderColor: 'rgba(108,92,231,0.5)', borderRadius: 18 },
  disabledOpacity: { opacity: 0.5 },
  mainAddText: { color: '#d4b8ff', fontSize: 16, fontWeight: '800', marginLeft: 8, letterSpacing: 0.5 },

  createCard: { position: 'absolute', bottom: 20, left: 16, right: 16, padding: 24, zIndex: 50, borderWidth: 1.5, borderColor: 'rgba(108,92,231,0.4)', borderRadius: 24 },
  createHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  createTitle: { color: '#e0d0ff', fontSize: 22, fontWeight: '800' },

  uploadRow: { alignItems: 'center', marginBottom: 20 },
  avatarUpload: { width: 94, height: 94, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(108,92,231,0.5)' },
  avatarUploadImage: { width: '100%', height: '100%' },
  uploadPlaceholder: { alignItems: 'center' },
  uploadHint: { color: 'rgba(200,180,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 6 },

  inputWrap: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  textInputRaw: { color: '#fff', fontSize: 16, paddingVertical: 12, fontWeight: '500' },
  pinHint: { color: 'rgba(200,180,255,0.5)', fontSize: 12, marginTop: 8, marginLeft: 4, marginBottom: 20 },

  colorRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 24 },
  colorSwatchWrap: { padding: 4 },
  colorSwatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: 'transparent', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 5 },
  colorSwatchActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },

  kidsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingHorizontal: 4 },
  kidsLabel: { color: '#e0d0ff', fontSize: 15, fontWeight: '600' },

  saveActionBtn: { paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(229,9,20,0.5)', borderRadius: 16 },
  saveActionText: { color: '#ffb347', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  sheetBackdrop: { position: 'absolute', top: -1000, bottom: 0, left: -1000, right: -1000, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 90 },
  sheetContainer: { position: 'absolute', bottom: 20, left: 16, right: 16, zIndex: 100 },
  sheetContent: { padding: 24, borderWidth: 1.5, borderColor: 'rgba(108,92,231,0.4)', borderRadius: 32 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(108,92,231,0.5)', alignSelf: 'center', marginBottom: 24 },

  sheetProfileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  sheetAvatarLG: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(108,92,231,0.5)' },
  sheetInitialLg: { color: '#fff', fontSize: 34, fontWeight: '900', textShadowColor: 'rgba(108,92,231,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  sheetHeaderInfo: { marginLeft: 16, flex: 1 },
  sheetNameLg: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  sheetKidsBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(46,196,182,0.25)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(46,196,182,0.4)' },
  sheetKidsText: { color: '#7efff0', fontSize: 11, fontWeight: '800' },

  pinPromptSection: { marginBottom: 24 },
  pinPromptText: { color: 'rgba(200,180,255,0.85)', fontSize: 14, fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  pinPromptInputWrap: { alignSelf: 'center', width: 200, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  pinPromptInput: { color: '#ffb347', fontSize: 24, letterSpacing: 12, textAlign: 'center', paddingVertical: 16 },
  pinPromptInputFocused: { letterSpacing: 16 },
  pinErrorText: { color: '#ff6b81', textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: '700' },

  sheetBtnRow: { flexDirection: 'row' },
  sheetBtnOutline: { paddingVertical: 16, alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  sheetBtnOutlineText: { color: '#d4b8ff', fontSize: 16, fontWeight: '800' },
  sheetBtnSolidTouch: { paddingVertical: 16, alignItems: 'center', backgroundColor: 'rgba(255,179,71,0.2)', borderWidth: 1.5, borderColor: 'rgba(255,179,71,0.5)', borderRadius: 16, justifyContent: 'center' },
  sheetBtnSolidText: { color: '#ffb347', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
})

export default SelectProfileScreen
