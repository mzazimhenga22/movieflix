import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../../components/ScreenWrapper';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useAccent } from '../components/AccentContext';
import FeatureCard from '../components/interactive/FeatureCard';
import { useActiveProfile } from '../../hooks/use-active-profile';

const ACCENT = '#e50914';

  const InteractiveScreen = () => {
    const router = useRouter();
    const { setAccentColor } = useAccent();
    const accentColor = getAccentFromPosterPath('/interactive/accent');
    const activeProfile = useActiveProfile();
    const isKidsProfile = Boolean(activeProfile?.isKids);

    useEffect(() => {
      if (accentColor) {
        setAccentColor(accentColor);
      }
    }, [accentColor, setAccentColor]);

    if (isKidsProfile) {
      return (
        <ScreenWrapper>
          <LinearGradient
            colors={[accentColor, '#150a13', '#05060f']}
            start={[0, 0]}
            end={[1, 1]}
            style={styles.gradient}
          />
          <LinearGradient
            colors={['rgba(125,216,255,0.2)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.bgOrbPrimary}
          />
          <LinearGradient
            colors={['rgba(229,9,20,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 0.2, y: 1 }}
            style={styles.bgOrbSecondary}
          />

          <View style={styles.kidsBlockWrap}>
            <View style={styles.kidsBlockCard}>
              <Text style={styles.kidsBlockTitle}>Not available on Kids profiles</Text>
              <Text style={styles.kidsBlockBody}>
                Interactive and social features are disabled on Kids profiles.
              </Text>
              <TouchableOpacity style={styles.kidsBlockButton} onPress={() => router.push('/select-profile')}>
                <Text style={styles.kidsBlockButtonText}>Switch profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScreenWrapper>
      );
    }

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      />
      <LinearGradient
        colors={['rgba(125,216,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgOrbPrimary}
      />
      <LinearGradient
        colors={['rgba(229,9,20,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={styles.bgOrbSecondary}
      />

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#e50914', '#b20710']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGlow}
          />
          <View style={styles.headerGlass}>
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerSheen}
            />
            <View>
              <Text style={styles.headerEyebrow}>Playground</Text>
              <Text style={styles.header}>Interactive Features</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn}>
              <MaterialCommunityIcons name="cog" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <MaterialCommunityIcons name="star-four-points" size={14} color="#fff" />
              <Text style={styles.metaText}>Live</Text>
            </View>
            <View style={[styles.metaPill, styles.metaPillGhost]}>
              <MaterialCommunityIcons name="flask" size={14} color="#fff" />
              <Text style={styles.metaText}>Labs</Text>
            </View>
            <View style={[styles.metaPill, styles.metaPillGhost]}>
              <MaterialCommunityIcons name="cloud-sync" size={14} color="#fff" />
              <Text style={styles.metaText}>Synced</Text>
            </View>
          </View>
        </View>

        {/* Local Storage Usage Card */}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <Text style={styles.sectionSubtitle}>Keep space optimized for downloads</Text>
        </View>
        <View style={styles.sectionWrapper}>
          <View style={styles.glassCard}>
            <LinearGradient
              colors={['rgba(229,9,20,0.18)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cardSheen}
            />
            <View style={styles.localStorageRow}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="sd" size={36} color={ACCENT} />
              </View>

              <View style={styles.localStorageTextContent}>
                <Text style={styles.localStorageTitle}>Local Storage Usage</Text>
                <View style={styles.badgesRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>34.2 MB</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeGhost]}>
                    <Text style={styles.badgeText}>12 files</Text>
                  </View>
                </View>

                <View style={styles.skelLineLarge} />
                <View style={{ height: 8 }} />

                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBarFill, { width: '36%' }]} />
                </View>
              </View>

              <TouchableOpacity style={styles.allocateButton}>
                <Text style={styles.allocateButtonText}>Allocate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Features grid */}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Experiments</Text>
          <Text style={styles.sectionSubtitle}>Try the latest interactive toys</Text>
        </View>
        <View style={styles.sectionWrapper}>
          <View style={styles.glassCard}>
            <View style={styles.featuresGrid}>
              <View style={styles.row}>
                <FeatureCard
                  iconName="account-group"
                  title="Watch Party"
                  description="Host live watch parties with synchronized playback and in-app chat."
                  onPress={() => router.push('/watchparty')}
                  iconColor={ACCENT}
                />
                <FeatureCard
                  iconName="comment-question"
                  title="In-Playback Trivia"
                  description="Engage with trivia and challenges during key moments."
                  onPress={() => console.log('In-Playback Trivia')}
                  iconColor={ACCENT}
                />
              </View>

              <View style={styles.row}>
                <FeatureCard
                  iconName="cube-scan"
                  title="Augmented Reality Mode"
                  description="Experience AR with movie posters and interactive objects."
                  onPress={() => console.log('Augmented Reality Mode')}
                  iconColor={ACCENT}
                />
                <FeatureCard
                  iconName="format-list-checks"
                  title="Personalized Watchlists"
                  description="Get personalized movie journeys based on your viewing history."
                  onPress={() => console.log('Personalized Watchlists')}
                  iconColor={ACCENT}
                />
              </View>

              <View style={styles.row}>
                <FeatureCard
                  iconName="movie-open-play"
                  title="Behind-the-Scenes"
                  description="Discover exclusive content and interactive Easter egg hunts."
                  onPress={() => console.log('Behind-the-Scenes')}
                  iconColor={ACCENT}
                />
                <FeatureCard
                  iconName="palette"
                  title="Customizable UI Themes"
                  description="Switch between dark mode, cinema mode, and more."
                  onPress={() => console.log('Customizable UI Themes')}
                  iconColor={ACCENT}
                />
              </View>

              <View style={styles.row}>
                <FeatureCard
                  iconName="microphone"
                  title="Voice Command"
                  description="Control the app hands-free with your voice."
                  onPress={() => console.log('Voice Command')}
                  iconColor={ACCENT}
                />
                <FeatureCard
                  iconName="heart-multiple-outline"
                  title="Mood Mixer"
                  description="Blend genres and moods to discover surprising new picks."
                  onPress={() => console.log('Mood Mixer')}
                  iconColor={ACCENT}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <FeatureCard
                  iconName="emoticon-happy"
                  title="Social Reactions"
                  description="Share live reactions during movies with friends and other viewers."
                  isLarge={true}
                  onPress={() => router.push('/social-feed')}
                  iconColor={ACCENT}
                />
                <View style={styles.row}>
                  <FeatureCard
                    iconName="translate"
                    title="Live Subtitles Lab"
                    description="Test experimental subtitle styles, fonts, and live translations."
                    onPress={() => console.log('Live Subtitles Lab')}
                    iconColor={ACCENT}
                  />
                  <FeatureCard
                    iconName="timeline-text"
                    title="Scene Timeline"
                    description="Jump to key scenes, trailers, and behind-the-scenes moments."
                    onPress={() => console.log('Scene Timeline')}
                    iconColor={ACCENT}
                  />
                </View>
                <View style={styles.row}>
                  <FeatureCard
                    iconName="controller-classic"
                    title="Interactive Stories"
                    description="Prototype choose‑your‑path narratives and alternate endings."
                    onPress={() => console.log('Interactive Stories')}
                    iconColor={ACCENT}
                  />
                  <FeatureCard
                    iconName="robot-excited"
                    title="AI Story Coach"
                    description="Get AI‑powered tips on what to watch next and why."
                    onPress={() => console.log('AI Story Coach')}
                    iconColor={ACCENT}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* bottom spacing */}
        <View style={{ height: 90 }} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    top: -80,
    left: -60,
    opacity: 0.6,
    transform: [{ rotate: '12deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -90,
    right: -20,
    opacity: 0.55,
    transform: [{ rotate: '-10deg' }],
  },
  scrollViewContent: {
    paddingBottom: 80,
    paddingTop: Platform.OS === 'ios' ? 48 : 20,
    paddingHorizontal: 14,
  },
  headerContainer: {
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  headerGlass: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  headerSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  header: {
    color: '#fefefe',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  iconBtn: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metaPillGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  sectionWrapper: {
    marginBottom: 14,
  },

  glassCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    overflow: 'hidden',
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
    opacity: 0.65,
  },

  // Local storage row
  localStorageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  localStorageTextContent: {
    flex: 1,
  },
  localStorageTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  badgeGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  skelLineLarge: {
    height: 10,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },

  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    width: '80%',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 4,
  },

  allocateButton: {
    marginLeft: 12,
    backgroundColor: ACCENT,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: ACCENT,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  allocateButtonText: {
    color: '#FFF',
    fontWeight: '700',
  },

  // Features grid
  featuresGrid: {
    paddingHorizontal: 4,
  },
  sectionHeading: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: '#fefefe',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kidsBlockWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  kidsBlockCard: {
    width: '100%',
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  kidsBlockTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  kidsBlockBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  kidsBlockButton: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  kidsBlockButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});

export default InteractiveScreen;
