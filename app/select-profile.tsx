import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    type Unsubscribe
} from 'firebase/firestore'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Animated,
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

import ScreenWrapper from '../components/ScreenWrapper'
import { authPromise, firestore } from '../constants/firebase'
import { supabase, supabaseConfigured } from '../constants/supabase'
import { getLastAuthUid as getLastAuthUidStored, setLastAuthUid as setLastAuthUidStored } from '../lib/profileStorage'
import { useSubscription } from '../providers/SubscriptionProvider'
import { useAccent } from './components/AccentContext'

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
  free: 'Free Plan',
  plus: 'Plus Plan',
  premium: 'Premium Plan',
}

const PLAN_PRICES: Record<PlanTier, number> = {
  free: 0,
  plus: 100,
  premium: 200,
}

const palette = ['#e50914', '#ff914d', '#2ec4b6', '#6c5ce7', '#ff6bcb', '#00b8d9']
const PROFILES_BUCKET = 'profiles'

const SelectProfileScreen = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { accentColor } = useAccent()
  const { refresh: refreshSubscription } = useSubscription()

  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [lastAuthUid, setLastAuthUid] = useState<string | null>(null)
  const [lastAuthUidLoaded, setLastAuthUidLoaded] = useState(false)

  const effectiveUid = currentUser?.uid ?? lastAuthUid

  // Plan + offline cache
  const [planTier, setPlanTier] = useState<PlanTier>('free')
  const [planHydrated, setPlanHydrated] = useState(false)

  // Profiles + offline cache
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([])
  const [profilesHydrated, setProfilesHydrated] = useState(false)

  // UI state
  const [savingProfile, setSavingProfile] = useState(false)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<HouseholdProfile | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const sheetTranslateY = React.useRef(new Animated.Value(1)).current
  const [newProfileName, setNewProfileName] = useState('')
  const [isKidsProfile, setIsKidsProfile] = useState(false)
  const [selectedColor, setSelectedColor] = useState(palette[0])
  const [errorCopy, setErrorCopy] = useState<string | null>(null)
  const [profilePin, setProfilePin] = useState('')
  const [pinEntry, setPinEntry] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [pinEntryFocused, setPinEntryFocused] = useState(false)
  const [profilePinFocused, setProfilePinFocused] = useState(false)
  const gradientFade = React.useRef(new Animated.Value(0)).current
  const [gradientIndex, setGradientIndex] = useState(0)

  const gradientPalettes = useMemo(() => {
    const accent = accentColor || '#e50914'
    return [
      [accent, '#150a1f', '#050509'],
      ['#0f0c29', '#302b63', '#24243e'],
      ['#ff512f', '#dd2476', '#0b0411'],
    ]
  }, [accentColor])

  // Avatar upload/edit
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [editingProfile, setEditingProfile] = useState<HouseholdProfile | null>(null)

  // Subscription flow: handled in the Premium screen

  const profileLimit = PROFILE_LIMITS[planTier]
  const planLabel = PLAN_LABELS[planTier]

  const canCreateMore = editingProfile ? true : profiles.length < profileLimit

  const previewAvatarSource = avatarUri || editingProfile?.photoURL || null
  const isEditing = Boolean(editingProfile)

  const profileCacheKey = effectiveUid ? `profileCache:${effectiveUid}` : null
  const planCacheKey = effectiveUid ? `planCache:${effectiveUid}` : null

  useEffect(() => {
    let mounted = true
    getLastAuthUidStored()
      .then((uid) => {
        if (!mounted) return
        setLastAuthUid(uid)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLastAuthUidLoaded(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  useEffect(() => {
    if (gradientPalettes.length <= 1) return
    const interval = setInterval(() => {
      gradientFade.setValue(0)
      Animated.timing(gradientFade, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setGradientIndex((prev) => (prev + 1) % gradientPalettes.length)
        gradientFade.setValue(0)
      })
    }, 9000)
    return () => clearInterval(interval)
  }, [gradientFade, gradientPalettes.length])

  const handleUpgrade = useCallback(() => {
    router.push('/premium?source=profiles')
  }, [router])

  const isLockedIndex = useCallback(
    (index: number) => planTier === 'free' && index >= 1,
    [planTier],
  )

  // Load plan: cache first → network fallback
  const loadPlanTier = useCallback(async () => {
    if (!effectiveUid) {
      setPlanTier('free')
      setPlanHydrated(true)
      return
    }

    let resolved: PlanTier = 'free'

    if (planCacheKey) {
      try {
        const cached = await AsyncStorage.getItem(planCacheKey)
        if (cached === 'free' || cached === 'plus' || cached === 'premium') {
          resolved = cached
        }
      } catch {}
    }

    setPlanTier(resolved)

    if (!currentUser) {
      setPlanHydrated(true)
      return
    }

    try {
      const userDocRef = doc(firestore, 'users', currentUser.uid)
      const snap = await getDoc(userDocRef)
      const raw = (snap.data()?.planTier as string | undefined ?? 'free').toLowerCase().trim()
      const fresh: PlanTier = raw === 'premium' || raw === 'plus' || raw === 'free' ? raw : 'free'

      setPlanTier(fresh)
      if (planCacheKey) {
        await AsyncStorage.setItem(planCacheKey, fresh)
      }
    } catch {
      // offline → keep cached
    } finally {
      setPlanHydrated(true)
    }
  }, [currentUser, effectiveUid, planCacheKey])

  // Auth
  useEffect(() => {
    let unsub: Unsubscribe | undefined
    let resolved = false

    authPromise
      .then((auth) => {
        unsub = onAuthStateChanged(auth, (user) => {
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

    return () => {
      unsub?.()
    }
  }, [])

  useEffect(() => {
    if (authChecked && lastAuthUidLoaded && !currentUser && !effectiveUid) {
      router.replace('/(auth)/login')
    }
  }, [authChecked, currentUser, effectiveUid, lastAuthUidLoaded, router])

  // Hydrate profiles from cache immediately
  useEffect(() => {
    if (!profileCacheKey) {
      setProfiles([])
      setProfilesHydrated(true)
      return
    }

    let mounted = true
    AsyncStorage.getItem(profileCacheKey)
      .then((cached) => {
        if (!mounted) return
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as HouseholdProfile[]
            if (Array.isArray(parsed)) {
              setProfiles(parsed)
              if (parsed.length === 0) setShowCreateCard(true)
            }
          } catch {}
        }
      })
      .finally(() => {
        if (mounted) setProfilesHydrated(true)
      })

    return () => {
      mounted = false
    }
  }, [profileCacheKey])

  // Load plan on mount + focus
  useEffect(() => {
    void loadPlanTier()
  }, [loadPlanTier])

  useFocusEffect(useCallback(() => void loadPlanTier(), [loadPlanTier]))

  // Firestore subscription – updates when online, never overrides cache on error
  useEffect(() => {
    if (!currentUser || !profileCacheKey) return

    const profilesRef = collection(firestore, 'users', currentUser.uid, 'profiles')
    const q = query(profilesRef, orderBy('createdAt', 'asc'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HouseholdProfile[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: (data.name as string)?.trim() || 'Profile',
            avatarColor: (data.avatarColor as string)?.trim() || palette[0],
            photoURL: data.photoURL as string | null | undefined,
            photoPath: data.photoPath as string | null | undefined,
            isKids: Boolean(data.isKids),
            hiddenDueToPlan: Boolean(data.hiddenDueToPlan),
            pin: typeof data.pin === 'string' && data.pin.length > 0 ? data.pin : null,
          }
        })

        setProfiles(next)
        setErrorCopy(null)
        setShowCreateCard(next.length === 0)

        AsyncStorage.setItem(profileCacheKey, JSON.stringify(next)).catch(() => {})
      },
      (err) => {
        console.warn('[select-profile] snapshot error (offline?)', err)
        // Keep cached profiles
        if (profiles.length === 0 && profilesHydrated) {
          setErrorCopy('Profiles unavailable (offline?).')
        }
      },
    )

    return () => unsub()
  }, [currentUser, profileCacheKey, profiles.length, profilesHydrated])

  const handleSelectProfile = useCallback(
    async (profile: HouseholdProfile) => {
      const index = profiles.findIndex((p) => p.id === profile.id)
      if (planTier === 'free' && index >= 1) {
        Alert.alert(
          'Upgrade required',
          'Free plan supports 1 profile. Upgrade to use multiple profiles.',
          [{ text: 'Not now', style: 'cancel' }, { text: 'Upgrade', onPress: handleUpgrade }],
        )
        return
      }

      try {
        await AsyncStorage.setItem(
          'activeProfile',
          JSON.stringify({
            id: profile.id,
            name: profile.name,
            avatarColor: profile.avatarColor,
            photoURL: profile.photoURL ?? null,
            photoPath: profile.photoPath ?? null,
            isKids: profile.isKids ?? false,
            planTier,
          }),
        )
        router.replace(currentUser ? '/movies' : '/downloads')
      } catch (err) {
        Alert.alert('Error', 'Unable to select this profile.')
      }
    },
    [planTier, profiles, handleUpgrade, currentUser],
  )

  const resetForm = () => {
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
    if (!currentUser) {
      Alert.alert('Offline', 'Connect to the internet to manage profiles.')
      return
    }

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
              const stored = await AsyncStorage.getItem('activeProfile')
              if (stored) {
                const parsed = JSON.parse(stored)
                if (parsed?.id === profile.id) {
                  await AsyncStorage.removeItem('activeProfile')
                }
              }
            } catch (err) {
              console.error('[select-profile] failed to delete profile', err)
              Alert.alert('Error', 'Unable to delete this profile. Please try again.')
            }
          },
        },
      ],
      { cancelable: true },
    )
  }

  const uploadAvatarToSupabase = async (): Promise<{ url: string; path: string } | null> => {
    if (!avatarUri || !currentUser) return null
    if (!supabaseConfigured) return null

    try {
      const base64 = await FileSystem.readAsStringAsync(avatarUri, { encoding: 'base64' })
      const arrayBuffer = decode(base64)

      const uriExt = avatarUri.split('.').pop()?.split('?')[0]
      const extension = uriExt || 'jpg'

      const safeName = `${currentUser.uid}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`

      const { error } = await supabase.storage.from(PROFILES_BUCKET).upload(safeName, arrayBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(PROFILES_BUCKET).getPublicUrl(safeName)
      return { url: urlData.publicUrl, path: safeName }
    } catch (err) {
      console.error('[select-profile] avatar upload failed', err)
      Alert.alert('Upload failed', 'Unable to upload the selected photo. Please try again.')
      return null
    }
  }

  const handleCreateProfile = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'Please sign in to create a profile.')
      return
    }

    if (!editingProfile && profiles.length >= profileLimit) {
      Alert.alert(
        'Upgrade needed',
        'To use more than 1 profile, please upgrade.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: handleUpgrade },
        ],
      )
      return
    }

    const trimmedName = newProfileName.trim()
    if (!trimmedName) {
      Alert.alert('Name required', 'Please provide a name for this profile.')
      return
    }

    const normalizedPin = profilePin.trim()
    if (normalizedPin && !/^\d{4}$/.test(normalizedPin)) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits or left blank.')
      return
    }

    setSavingProfile(true)
    let uploadResult: { url: string; path: string } | null = null

    if (avatarUri) {
      setAvatarUploading(true)
      uploadResult = await uploadAvatarToSupabase()
    }

    try {
      const chosenColor = selectedColor || palette[0]
      const payload: Record<string, any> = {
        name: trimmedName,
        avatarColor: chosenColor,
        isKids: isKidsProfile,
        pin: normalizedPin.length === 4 ? normalizedPin : null,
      }

      if (!editingProfile) {
        payload.createdAt = serverTimestamp()
        payload.planTierAtCreation = planTier
      }

      if (uploadResult) {
        payload.photoURL = uploadResult.url
        payload.photoPath = uploadResult.path
      }

      if (editingProfile) {
        const profileRef = doc(firestore, 'users', currentUser.uid, 'profiles', editingProfile.id)
        await updateDoc(profileRef, payload)
      } else {
        await addDoc(collection(firestore, 'users', currentUser.uid, 'profiles'), payload)
      }

      resetForm()
    } catch (err) {
      console.error('[select-profile] failed to save profile', err)
      Alert.alert('Error', 'We could not save this profile. Please try again.')
    } finally {
      setSavingProfile(false)
      setAvatarUploading(false)
    }
  }

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need access to your photos to set a profile picture.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      })

      if (result.canceled || !result.assets?.length) return
      setAvatarUri(result.assets[0].uri)
    } catch (err) {
      console.error('[select-profile] avatar pick failed', err)
      Alert.alert('Error', 'Could not open the photo library. Please try again.')
    }
  }

  const handleChoosePlan = (tier: PlanTier) => {
    if (tier === planTier) return
    // Redirect to the Premium screen which handles upgrades/cancellations
    router.push(`/premium?source=profiles&requested=${tier}`)
  }

  // Subscription handling moved to `premium.tsx`.

  const profileData = useMemo(() => profiles, [profiles])

  const renderProfile = ({ item, index }: { item: HouseholdProfile; index: number }) => {
    const locked = isLockedIndex(index)

    return (
      <TouchableOpacity
        style={[styles.profileCard, locked && { opacity: 0.55 }]}
        activeOpacity={0.9}
        onPress={() => {
          if (locked) {
            Alert.alert(
              'Upgrade required',
              'Free plan supports 1 profile. Upgrade to use multiple profiles.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Upgrade', onPress: handleUpgrade },
              ],
            )
            return
          }
          // Open bottom sheet with details instead of immediate selection
          setSelectedProfile(item)
          setPinEntry('')
          setPinError(null)
          setSheetVisible(true)
          Animated.timing(sheetTranslateY, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start()
        }}
      >
        {!locked && (
          <View style={styles.profileActions} pointerEvents="box-none">
            <TouchableOpacity style={styles.actionButton} onPress={() => startEditingProfile(item)}>
              <Ionicons name="pencil" size={16} color={accentColor} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleDeleteProfile(item)}>
              <Ionicons name="trash" size={16} color={accentColor} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.avatar, !item.photoURL && { backgroundColor: item.avatarColor || '#222' }]}>
          {item.photoURL ? (
            <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>

        <Text style={styles.profileName} numberOfLines={1}>
          {item.name}
        </Text>

        {item.isKids && <Text style={styles.kidsPill}>Kids</Text>}

        {locked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={16} color="#fff" />
            <Text style={styles.lockText}>Upgrade</Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  const paletteCount = gradientPalettes.length || 1
  const nextGradientIndex = (gradientIndex + 1) % paletteCount

  return (
    <ScreenWrapper disableTopInset>
      <View style={styles.flex}>
        <View style={styles.glassyBackground} pointerEvents="none">
          <LinearGradient
            colors={gradientPalettes[gradientIndex]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientLayer}
          />
          <Animated.View style={[styles.gradientLayer, { opacity: gradientFade }]}>
            <LinearGradient
              colors={gradientPalettes[nextGradientIndex]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientLayer}
            />
          </Animated.View>
          <LinearGradient
            colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.bgOrbPrimary}
          />
          <LinearGradient
            colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)']}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 0.2, y: 1 }}
            style={styles.bgOrbSecondary}
          />
        </View>
        <KeyboardAvoidingView
          style={[styles.container, { paddingTop: insets.top + 12 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.header}>
          <Text style={styles.title}>{`Who's watching?`}</Text>
          <Text style={styles.subtitle}>
            Pick a profile to load personalized recommendations.
          </Text>

          <Text style={styles.offlineHint}>
            Profiles are available offline if they were loaded before.
          </Text>
        </View>

        <View style={styles.planRow}>
          <Text style={styles.planText}>
            {planLabel} • {profiles.length}/{profileLimit} used
          </Text>
          {planTier !== 'premium' && (
            <TouchableOpacity onPress={handleUpgrade}>
              <Text style={[styles.upgradeLink, { color: accentColor }]}>Need more?</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.planOptionsRow}>
          {(['free', 'plus', 'premium'] as PlanTier[]).map((tier) => (
            <TouchableOpacity
              key={tier}
              style={[styles.planOption, planTier === tier && styles.planOptionActive]}
              onPress={() => handleChoosePlan(tier)}
            >
              <Text style={styles.planOptionLabel}>{PLAN_LABELS[tier]}</Text>
              <Text style={styles.planOptionPrice}>{PLAN_PRICES[tier]} KSH</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Subscription sheet removed; purchases handled in /premium */}

        {!profilesHydrated ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={accentColor} size="small" />
            <Text style={styles.loaderText}>Loading profiles...</Text>
          </View>
        ) : errorCopy ? (
          <Text style={styles.errorText}>{errorCopy}</Text>
        ) : (
          <FlatList
            data={profileData}
            keyExtractor={(item) => item.id}
            renderItem={renderProfile}
            numColumns={2}
            contentContainerStyle={[
              styles.profileGrid,
              profileData.length === 0 && styles.profileGridEmpty,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Ionicons name="add-circle-outline" size={36} color="rgba(255,255,255,0.8)" />
                <Text style={styles.emptyTitle}>Create your first profile</Text>
                <Text style={styles.emptySubtitle}>
                  Add a profile for every person so everyone gets their own list.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.addButton,
              !canCreateMore && styles.addButtonDisabled,
              { backgroundColor: accentColor },
            ]}
            onPress={openNewProfileForm}
            disabled={!canCreateMore}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{canCreateMore ? 'Add profile' : 'Limit reached'}</Text>
          </TouchableOpacity>
        </View>

        {showCreateCard && (
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>{isEditing ? 'Edit profile' : 'New profile'}</Text>

            <TextInput
              placeholder="Profile name"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.input}
              value={newProfileName}
              onChangeText={setNewProfileName}
              maxLength={20}
            />

            <TextInput
              placeholder="4-digit PIN (optional)"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={[styles.pinInput, profilePinFocused && keyboardVisible && styles.pinInputKeyboard]}
              value={profilePin}
              onChangeText={(text) => {
                const sanitized = text.replace(/[^0-9]/g, '').slice(0, 4)
                setProfilePin(sanitized)
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              onFocus={() => setProfilePinFocused(true)}
              onBlur={() => setProfilePinFocused(false)}
            />
            <Text style={styles.pinHelper}>Leave blank to skip the PIN.</Text>

            <View style={styles.uploadRow}>
              <TouchableOpacity
                style={styles.avatarUpload}
                onPress={handlePickAvatar}
                onLongPress={() => setAvatarUri(null)}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarUploadImage} />
                ) : previewAvatarSource ? (
                  <Image source={{ uri: previewAvatarSource }} style={styles.avatarUploadImage} />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="camera" size={24} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.uploadHint}>
                      {avatarUploading ? 'Selecting photo…' : 'Add a profile photo'}
                    </Text>
                    <Text style={styles.uploadSubtext}>Optional (tap to change)</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.colorRow}>
              {palette.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    selectedColor === color && { borderColor: '#fff', borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>

            <View style={styles.kidsRow}>
              <Text style={styles.kidsLabel}>Kids profile</Text>
              <Switch
                value={isKidsProfile}
                onValueChange={setIsKidsProfile}
                thumbColor={isKidsProfile ? '#fff' : '#999'}
                trackColor={{ true: accentColor, false: 'rgba(255,255,255,0.2)' }}
              />
            </View>

            <View style={styles.createActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: accentColor }]}
                onPress={handleCreateProfile}
                disabled={savingProfile}
              >
                <Text style={styles.saveText}>{savingProfile ? 'Saving…' : isEditing ? 'Save' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom sheet for profile details */}
        {selectedProfile && (
          <>
            {sheetVisible && (
              <TouchableOpacity
                style={styles.sheetBackdrop}
                activeOpacity={1}
                onPress={() => {
                  Animated.timing(sheetTranslateY, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setSheetVisible(false)
                    setSelectedProfile(null)
                    setPinEntry('')
                    setPinError(null)
                  })
                }}
              />
            )}

            <Animated.View
              pointerEvents={sheetVisible ? 'auto' : 'none'}
              style={[
                styles.sheet,
                {
                  transform: [
                    {
                      translateY: sheetTranslateY.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={[styles.sheetAvatar, !selectedProfile.photoURL && { backgroundColor: selectedProfile.avatarColor }]}>
                  {selectedProfile.photoURL ? (
                    <Image source={{ uri: selectedProfile.photoURL }} style={styles.sheetAvatarImage} />
                  ) : (
                    <Text style={styles.sheetInitial}>{selectedProfile.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sheetName}>{selectedProfile.name}</Text>
                  {selectedProfile.isKids && <Text style={styles.sheetPill}>Kids</Text>}
                </View>
              </View>

            {selectedProfile.pin ? (
              <View style={styles.pinEntryBlock}>
                <Text style={styles.pinEntryLabel}>Enter PIN to unlock</Text>
                <TextInput
                  value={pinEntry}
                  onChangeText={(text) => {
                    setPinEntry(text.replace(/[^0-9]/g, '').slice(0, 4))
                    setPinError(null)
                  }}
                  placeholder="••••"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  style={[styles.pinEntryInput, pinEntryFocused && keyboardVisible && styles.pinEntryInputKeyboard]}
                  onFocus={() => setPinEntryFocused(true)}
                  onBlur={() => setPinEntryFocused(false)}
                />
                {pinError ? <Text style={styles.pinEntryError}>{pinError}</Text> : null}
              </View>
            ) : null}

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={[styles.sheetButton, { backgroundColor: accentColor }]}
                  onPress={async () => {
                    if (selectedProfile.pin) {
                      if (pinEntry.trim().length === 0) {
                        setPinError('Enter PIN to continue')
                        return
                      }
                      if (pinEntry !== selectedProfile.pin) {
                        setPinError('Incorrect PIN')
                        return
                      }
                    }

                    try {
                      await handleSelectProfile(selectedProfile)
                    } finally {
                      Animated.timing(sheetTranslateY, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
                        setSheetVisible(false)
                        setSelectedProfile(null)
                        setPinEntry('')
                        setPinError(null)
                      })
                    }
                  }}
                >
                  <Text style={styles.sheetButtonText}>Use profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetButton, styles.sheetButtonOutline]}
                  onPress={() => {
                    // Edit: open create/edit form and close sheet
                    setEditingProfile(selectedProfile)
                    setNewProfileName(selectedProfile.name)
                    setSelectedColor(selectedProfile.avatarColor || palette[0])
                    setIsKidsProfile(selectedProfile.isKids ?? false)
                    setProfilePin(selectedProfile.pin ?? '')
                    setShowCreateCard(true)
                    Animated.timing(sheetTranslateY, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
                      setSheetVisible(false)
                      setSelectedProfile(null)
                      setPinEntry('')
                      setPinError(null)
                    })
                  }}
                >
                  <Text style={[styles.sheetButtonText, { color: accentColor }]}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetButton, styles.sheetButtonDanger]}
                  onPress={() => {
                    Alert.alert('Delete profile', `Delete ${selectedProfile.name}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => {
                        handleDeleteProfile(selectedProfile)
                        Animated.timing(sheetTranslateY, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
                          setSheetVisible(false)
                          setSelectedProfile(null)
                          setPinEntry('')
                          setPinError(null)
                        })
                      } }
                    ])
                  }}
                >
                  <Text style={[styles.sheetButtonText, { color: '#fff' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
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
  glassyBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -60,
    left: -40,
    opacity: 0.5,
    transform: [{ rotate: '12deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    bottom: -80,
    right: -30,
    opacity: 0.45,
    transform: [{ rotate: '-14deg' }],
  },
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },

  offlineHint: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },

  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planOptionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },

  planOption: {
    flex: 1,
    padding: 10,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    alignItems: 'center',
  },
  planOptionActive: {
    borderColor: '#fff',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  planOptionLabel: { color: '#fff', fontWeight: '700' },
  planOptionPrice: { color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  planText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, letterSpacing: 0.3 },
  upgradeLink: { fontWeight: '700', fontSize: 13 },

  loaderRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  loaderText: { color: 'rgba(255,255,255,0.8)', marginLeft: 12 },
  errorText: { color: '#ff7675', textAlign: 'center', marginTop: 20 },

  profileGrid: { flexGrow: 1, paddingVertical: 12 },
  profileGridEmpty: { justifyContent: 'center' },

  profileCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    marginHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  profileActions: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    zIndex: 2,
  },

  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 20 },
  avatarInitial: { fontSize: 26, fontWeight: '800', color: '#fff' },

  profileName: { color: '#fff', fontSize: 16, fontWeight: '600' },

  kidsPill: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 11,
    letterSpacing: 0.5,
  },

  lockOverlay: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.5)',
  },
  lockText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: { color: 'rgba(255,255,255,0.68)', textAlign: 'center', fontSize: 13, lineHeight: 18 },

  actions: { marginTop: 12 },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { fontWeight: '700', fontSize: 15, color: '#fff', marginLeft: 8 },

  createCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  uploadRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  avatarUpload: {
    width: 90,
    height: 90,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarUploadImage: { width: '100%', height: '100%' },

  uploadPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  uploadHint: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 6, textAlign: 'center' },
  uploadSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2, textAlign: 'center' },

  createTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  pinInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  pinHelper: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginBottom: 12,
  },

  colorRow: { flexDirection: 'row', marginBottom: 12 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },

  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kidsLabel: { color: '#fff', fontWeight: '600' },

  createActions: { flexDirection: 'row', justifyContent: 'flex-end' },

  subscriptionCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subscriptionTitle: { color: '#fff', fontWeight: '700', marginBottom: 8 },

  freqBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqBtnActive: {
    backgroundColor: '#e50914',
  },
  freqText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  freqTextActive: { color: '#fff' },

  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cancelText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  saveButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, marginLeft: 12 },
  saveText: { color: '#05060f', fontWeight: '700' },
  sheetBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(6,6,10,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    elevation: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetAvatar: { width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarImage: { width: '100%', height: '100%', borderRadius: 16 },
  sheetInitial: { color: '#fff', fontSize: 28, fontWeight: '800' },
  sheetName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sheetPill: { marginTop: 6, color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  pinEntryBlock: { marginBottom: 12 },
  pinEntryLabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 6 },
  pinEntryInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 4,
  },
  pinEntryInputKeyboard: {
    fontSize: 24,
    letterSpacing: 8,
    paddingVertical: 14,
  },
  pinInputKeyboard: {
    fontSize: 18,
    letterSpacing: 4,
    paddingVertical: 14,
  },
  pinEntryError: { color: '#ff6b6b', fontSize: 12, marginTop: 4 },
  sheetActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  sheetButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  sheetButtonText: { color: '#fff', fontWeight: '700' },
  sheetButtonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sheetButtonDanger: { backgroundColor: '#e53935' },
})

export default SelectProfileScreen