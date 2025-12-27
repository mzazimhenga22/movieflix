import React from 'react';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface HeaderProps {
  accountName: string;
  activeProfileName: string | null;
  trendingCount: number;
  reelsCount: number;
  currentPlan: string;
  router: any;
}

const Header: React.FC<HeaderProps> = ({
  accountName,
  activeProfileName,
  trendingCount,
  reelsCount,
  currentPlan,
  router,
}) => {
  return (
    <>
      {/* Header (glassy hero) */}
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
              <Text style={styles.headerEyebrow}>{`Tonight's picks`}</Text>
              <Text style={styles.headerText}>
                Welcome, {activeProfileName ?? accountName}
              </Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <Link href="/messaging" asChild>
              <TouchableOpacity style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                </LinearGradient>
              </TouchableOpacity>
            </Link>
            <Link href="/marketplace" asChild>
              <TouchableOpacity style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="bag-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                </LinearGradient>
              </TouchableOpacity>
            </Link>
            <Link href="/social-feed" asChild>
              <TouchableOpacity style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="people-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                </LinearGradient>
              </TouchableOpacity>
            </Link>

            <Link href="/profile" asChild>
              <TouchableOpacity style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <FontAwesome name="user-circle" size={24} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View style={styles.headerMetaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="flame" size={14} color="#fff" />
            <Text style={styles.metaText}>{trendingCount} trending</Text>
          </View>
          <View style={[styles.metaPill, styles.metaPillSoft]}>
            <Ionicons name="film-outline" size={14} color="#fff" />
            <Text style={styles.metaText}>{reelsCount} reels</Text>
          </View>
          <View style={[styles.metaPill, styles.metaPillOutline]}>
            <Ionicons name="star" size={14} color="#fff" />
            <Text style={styles.metaText}>Fresh drops</Text>
          </View>
        </View>
      </View>

      {currentPlan === 'free' && (
        <View style={styles.upgradeBanner}>
          <LinearGradient
            colors={['rgba(229,9,20,0.9)', 'rgba(185,7,16,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.upgradeBannerGradient}
          >
            <View style={styles.upgradeBannerContent}>
              <Ionicons name="star" size={20} color="#fff" />
              <View style={styles.upgradeBannerText}>
                <Text style={styles.upgradeBannerTitle}>Upgrade to Plus</Text>
                <Text style={styles.upgradeBannerSubtitle}>
                  Unlock unlimited profiles, premium features & more
                </Text>
              </View>
              <TouchableOpacity
                style={styles.upgradeBannerButton}
                onPress={() => router.push('/premium?source=movies')}
              >
                <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}
    </>
  );
};

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
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#e50914',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  iconMargin: {
    marginRight: 4,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 10,
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
  metaPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaPillOutline: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  upgradeBanner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeBannerGradient: {
    padding: 16,
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  upgradeBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeBannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeBannerButtonText: {
    color: '#e50914',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default Header;
