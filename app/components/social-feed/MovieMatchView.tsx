import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React from 'react';

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
      ? `${viewerName}, comparing ${localTotals.qualified} of your recent plays with ${
          matches.length || 'new'
        } film fans`
      : 'Watch at least 70% of a title to unlock Movie Match insights.';

  const renderAvatar = (match: ComputedMatch, size = 48) => {
    const initial = match.profileName.charAt(0).toUpperCase();
    if (match.photoURL) {
      return <Image source={{ uri: match.photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
      <View
        style={[
          styles.avatarFallback,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: match.avatarColor || '#222',
          },
        ]}
      >
        <Text style={styles.avatarFallbackText}>{initial}</Text>
      </View>
    );
  };

  const handleStartParty = () => {
    router.push('/watchparty');
  };

  const renderMatchCard = (match: ComputedMatch) => (
    <TouchableOpacity key={match.id} style={styles.matchCard}>
      <BlurView intensity={30} tint="dark" style={styles.cardContent}>
        <View style={styles.cardAvatarCol}>
          {renderAvatar(match, 48)}
          <View style={[styles.rankChip, match.rankLabel === 'Top 5' ? styles.rankChipTop : match.rankLabel === 'Top 10' ? styles.rankChipTen : styles.rankChipRising]}>
            <Text style={styles.rankChipText}>{match.rankLabel}</Text>
          </View>
        </View>
        <View style={styles.matchInfo}>
          <Text style={styles.matchTitle}>{match.profileName}</Text>
          <Text style={styles.matchSubtitle}>{formatSharedTitles(match.sharedTitles)}</Text>
          <View style={styles.genreChipRow}>
            {match.sharedGenres.slice(0, 3).map((genre) => (
              <View key={`${match.id}-${genre}`} style={styles.genreChip}>
                <Text style={styles.genreChipText}>{getGenreName(genre)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.vibeCopy}>{vibeLabel[match.vibe]}</Text>
        </View>
        <View style={styles.scoreColumn}>
          <Text style={styles.scoreNumber}>{match.matchScore}%</Text>
          <Text style={styles.scoreLabel}>match</Text>
          {match.bestPick?.title ? (
            <Text numberOfLines={1} style={styles.scoreHint}>
              {match.bestPick.title}
            </Text>
          ) : null}
        </View>
      </BlurView>
    </TouchableOpacity>
  );

  const renderSection = (title: string, data: ComputedMatch[]) => {
    if (!data.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {data.map(renderMatchCard)}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(255, 75, 75, 0.15)', 'rgba(255, 75, 75, 0.05)']} style={StyleSheet.absoluteFill} />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Movie Match</Text>
          <Text style={styles.subtitle}>{subtitleCopy}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Qualified titles</Text>
            <Text style={styles.summaryValue}>{localTotals.qualified}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Top 5 unlocked</Text>
            <Text style={styles.summaryValue}>{topFive.length}</Text>
          </View>
          <TouchableOpacity style={[styles.summaryCard, styles.refreshCard]} onPress={refreshLocalHistory}>
            <Ionicons name="refresh" size={18} color="#ff4b4b" />
            <Text style={[styles.summaryLabel, styles.refreshText]}>Refresh tastes</Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.loaderText}>Analyzing community watch data…</Text>
          </View>
        )}

        {!isLoading && errorCopy && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorCopy}</Text>
          </View>
        )}

        {!isLoading && !errorCopy && matches.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyText}>
              Finish at least 70% of a movie or episode and we’ll start surfacing viewers with the same taste.
            </Text>
          </View>
        )}

        {!isLoading && !errorCopy && matches.length > 0 && (
          <>
            {heroMatch && (
              <View style={styles.heroCard}>
                <LinearGradient
                  colors={['rgba(10,10,20,0.9)', 'rgba(255,75,75,0.25)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroContent}>
                  <View style={styles.heroAvatar}>{renderAvatar(heroMatch, 64)}</View>
                  <View style={styles.heroMeta}>
                    <Text style={styles.heroLabel}>Best match</Text>
                    <Text style={styles.heroName}>{heroMatch.profileName}</Text>
                    <Text style={styles.heroScore}>{heroMatch.matchScore}% shared taste</Text>
                    <Text style={styles.heroShared}>{formatSharedTitles(heroMatch.sharedTitles)}</Text>
                    <View style={styles.heroChips}>
                      {heroMatch.sharedGenres.slice(0, 3).map((genre) => (
                        <View key={`hero-${genre}`} style={styles.heroChip}>
                          <Text style={styles.heroChipText}>{getGenreName(genre)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {heroMatch.bestPick?.posterPath ? (
                    <Image
                      source={{ uri: resolvePosterUri(heroMatch.bestPick.posterPath) }}
                      style={styles.heroPoster}
                    />
                  ) : null}
                </View>
                <View style={styles.heroActions}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleStartParty}>
                    <Text style={styles.primaryBtnText}>Start watch party</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/messaging')}>
                    <Text style={styles.secondaryBtnText}>Ping matches</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.avatarStackRow}>
              {matches.slice(0, 6).map((match, index) => (
                <View key={`stack-${match.id}`} style={[styles.avatarStackItem, { marginLeft: index === 0 ? 0 : -16 }]}>
                  {renderAvatar(match, 40)}
                </View>
              ))}
            </View>

            {renderSection('Top 5 Taste Twins', topFive)}
            {renderSection('Top 10 Vibe Board', topTen)}
            {renderSection('Rising Curators', rising)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  refreshCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,75,75,0.4)',
    backgroundColor: 'rgba(255,75,75,0.08)',
  },
  refreshText: {
    color: '#ff4b4b',
    fontWeight: '700',
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loaderText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  errorCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,75,75,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.3)',
  },
  errorText: {
    color: '#ff9b9b',
  },
  emptyState: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
  },
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroContent: {
    flexDirection: 'row',
    padding: 18,
    alignItems: 'center',
  },
  heroAvatar: {
    marginRight: 16,
  },
  heroMeta: {
    flex: 1,
  },
  heroPoster: {
    width: 70,
    height: 105,
    borderRadius: 12,
    marginLeft: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  heroName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  heroScore: {
    color: '#ffb3b3',
    marginTop: 2,
    fontWeight: '600',
  },
  heroShared: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },
  heroChips: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  heroChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroChipText: {
    color: '#fff',
    fontSize: 12,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#ff4b4b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  avatarStackRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  avatarStackItem: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#05060f',
  },
  matchCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
  },
  cardAvatarCol: {
    alignItems: 'center',
    marginRight: 12,
  },
  rankChip: {
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rankChipTop: {
    backgroundColor: 'rgba(255,75,75,0.2)',
  },
  rankChipTen: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rankChipRising: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rankChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  matchInfo: {
    flex: 1,
  },
  matchTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  matchSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  genreChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  genreChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  genreChipText: {
    color: '#fff',
    fontSize: 11,
  },
  vibeCopy: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  scoreColumn: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  scoreNumber: {
    color: '#ff4b4b',
    fontSize: 22,
    fontWeight: '800',
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  scoreHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontWeight: '700',
  },
});
