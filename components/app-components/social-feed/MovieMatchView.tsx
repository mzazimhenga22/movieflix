import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import React from 'react';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import LiquidGlass from '../LiquidGlass';

import { IMAGE_BASE_URL } from '../../../constants/api';
import {
  formatSharedTitles,
  getGenreName,
  useMovieMatchData,
  vibeLabel,
  type ComputedMatch,
} from '../../../lib/movieMatch/hooks';

const resolvePosterUri = (path?: string | null) => {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${IMAGE_BASE_URL}${path}`;
};

export default function MovieMatchView() {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const {
    matches,
    heroMatch,
    localTotals,
    viewerName,
    loading,
    errorCopy,
    refreshLocalHistory,
  } = useMovieMatchData();
  
  const topFive = matches.filter((match) => match.rankLabel === 'Top 5');
  const topTen = matches.filter((match) => match.rankLabel === 'Top 10');
  const rising = matches.filter((match) => match.rankLabel === 'Rising');

  const isLoading = loading;
  const subtitleCopy =
    localTotals.qualified > 0
      ? `${viewerName}, comparing ${localTotals.qualified} of your plays with ${matches.length} fans`
      : 'Watch more to unlock Movie Match insights.';

  const renderAvatar = (match: ComputedMatch, size = 48) => {
    const initial = match.profileName.charAt(0).toUpperCase();
    if (match.photoURL) {
      return <Image source={{ uri: match.photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: match.avatarColor || '#222' }]}>
        <Text style={styles.avatarFallbackText}>{initial}</Text>
      </View>
    );
  };

  const renderMatchCard = (match: ComputedMatch) => (
    <View key={match.id} style={styles.matchWrapper}>
        <LiquidGlass cornerRadius={24} tintOpacity={0.06} glowColor="#ff4b4b" glowIntensity={0.1} style={styles.matchGlass}>
            <TouchableOpacity style={styles.matchContent} activeOpacity={0.8}>
                <View style={styles.cardAvatarCol}>
                    {renderAvatar(match, 52)}
                    <View style={[styles.rankChip, match.rankLabel === 'Top 5' ? styles.rankChipTop : styles.rankChipTen]}>
                        <Text style={styles.rankChipText}>{match.rankLabel}</Text>
                    </View>
                </View>
                <View style={styles.matchInfo}>
                    <Text style={styles.matchTitle}>{match.profileName}</Text>
                    <Text style={styles.matchSubtitle} numberOfLines={1}>{formatSharedTitles(match.sharedTitles)}</Text>
                    <View style={styles.genreChipRow}>
                        {match.sharedGenres.slice(0, 2).map((genre) => (
                        <View key={`${match.id}-${genre}`} style={styles.genreChip}>
                            <Text style={styles.genreChipText}>{getGenreName(genre)}</Text>
                        </View>
                        ))}
                    </View>
                </View>
                <View style={styles.scoreColumn}>
                    <Text style={styles.scoreNumber}>{match.matchScore}%</Text>
                    <Text style={styles.scoreLabel}>match</Text>
                </View>
            </TouchableOpacity>
        </LiquidGlass>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0a0a', '#050508']} style={StyleSheet.absoluteFill} />
      <View style={[styles.bgOrb, { top: -100, right: -100, backgroundColor: '#ff4b4b10' }]} />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Movie Match</Text>
          <Text style={styles.subtitle}>{subtitleCopy}</Text>
        </View>

        {heroMatch && (
            <View style={styles.heroWrapper}>
                <LiquidGlass cornerRadius={32} tintOpacity={0.1} glowColor="#ff4b4b" glowIntensity={0.3} style={styles.heroGlass}>
                    <View style={styles.heroContent}>
                        <View style={styles.heroAvatar}>{renderAvatar(heroMatch, 64)}</View>
                        <View style={styles.heroMeta}>
                            <Text style={styles.heroLabel}>ULTIMATE MATCH</Text>
                            <Text style={styles.heroName}>{heroMatch.profileName}</Text>
                            <Text style={styles.heroScore}>{heroMatch.matchScore}% shared taste</Text>
                        </View>
                        {heroMatch.bestPick?.posterPath && (
                            <Image source={{ uri: resolvePosterUri(heroMatch.bestPick.posterPath) }} style={styles.heroPoster} />
                        )}
                    </View>
                    <View style={styles.heroActions}>
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => deferNav(() => router.push('/watchparty'))}>
                            <LiquidGlass cornerRadius={16} tintOpacity={0.2} tintColor="#ff4b4b" style={styles.btnGlass}>
                                <Text style={styles.primaryBtnText}>Start Watch Party</Text>
                            </LiquidGlass>
                        </TouchableOpacity>
                    </View>
                </LiquidGlass>
            </View>
        )}

        <View style={styles.summaryRow}>
            {[
                { label: 'Qualified', value: localTotals.qualified, color: '#fff' },
                { label: 'Top 5', value: topFive.length, color: '#ff4b4b' },
                { label: 'Sync', icon: 'refresh', action: refreshLocalHistory, color: '#fff' }
            ].map((item, i) => (
                <TouchableOpacity key={i} style={styles.summaryCard} onPress={item.action}>
                    <LiquidGlass cornerRadius={20} tintOpacity={0.05} style={styles.summaryGlass}>
                        {item.icon ? (
                            <Ionicons name={item.icon as any} size={20} color="#ff4b4b" />
                        ) : (
                            <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                        )}
                        <Text style={styles.summaryLabel}>{item.label}</Text>
                    </LiquidGlass>
                </TouchableOpacity>
            ))}
        </View>

        {isLoading ? (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color="#ff4b4b" />
                <Text style={styles.loaderText}>Syncing cinematic souls...</Text>
            </View>
        ) : (
            <>
                {topFive.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Taste Twins</Text>
                        {topFive.map(renderMatchCard)}
                    </View>
                )}
                {topTen.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Vibe Board</Text>
                        {topTen.map(renderMatchCard)}
                    </View>
                )}
            </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050508' },
  bgOrb: { position: 'absolute', width: 400, height: 400, borderRadius: 200, filter: 'blur(100px)' as any },
  content: { flex: 1, padding: 16 },
  header: { marginBottom: 25, paddingHorizontal: 8 },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  subtitle: { marginTop: 8, color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  heroWrapper: { marginBottom: 25 },
  heroGlass: { padding: 20 },
  heroContent: { flexDirection: 'row', alignItems: 'center' },
  heroAvatar: { marginRight: 16 },
  heroMeta: { flex: 1 },
  heroLabel: { color: '#ff4b4b', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroName: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 2 },
  heroScore: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4, fontWeight: '600' },
  heroPoster: { width: 60, height: 90, borderRadius: 12, backgroundColor: '#111' },
  heroActions: { marginTop: 20 },
  primaryBtn: { height: 50 },
  btnGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  summaryCard: { flex: 1, height: 80 },
  summaryGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  matchWrapper: { marginBottom: 12 },
  matchGlass: { padding: 12 },
  matchContent: { flexDirection: 'row', alignItems: 'center' },
  cardAvatarCol: { alignItems: 'center', marginRight: 16 },
  rankChip: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rankChipTop: { backgroundColor: 'rgba(255,75,75,0.2)' },
  rankChipTen: { backgroundColor: 'rgba(255,255,255,0.1)' },
  rankChipText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  matchInfo: { flex: 1 },
  matchTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  matchSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2, fontWeight: '500' },
  genreChipRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  genreChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  genreChipText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  scoreColumn: { alignItems: 'flex-end', minWidth: 60 },
  scoreNumber: { color: '#ff4b4b', fontSize: 24, fontWeight: '900' },
  scoreLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700' },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 15, marginLeft: 8 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  loaderText: { color: 'rgba(255,255,255,0.5)', marginTop: 15, fontWeight: '600' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
