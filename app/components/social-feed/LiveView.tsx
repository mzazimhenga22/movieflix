import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useLiveStreams from '@/hooks/useLiveStreams';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';

export default function LiveView() {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const [liveStreams, loaded] = useLiveStreams();
  const isLoading = !loaded;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255, 75, 75, 0.15)', 'rgba(255, 75, 75, 0.05)']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Live Now</Text>
          <TouchableOpacity
            style={styles.goLiveButton}
            onPress={() => deferNav(() => router.push('/social-feed/go-live'))}
          >
            <BlurView intensity={30} tint="dark" style={styles.goLiveBlur}>
              <Ionicons name="radio" size={20} color="#ff4b4b" />
              <Text style={styles.goLiveText}>Go Live</Text>
            </BlurView>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#ff4b4b" />
            <Text style={styles.loadingText}>Checking who is live…</Text>
          </View>
        )}

        {!isLoading && liveStreams.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="radio-outline" size={48} color="#ff4b4b" />
            <Text style={styles.emptyTitle}>No live rooms yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to start the party.</Text>
          </View>
        )}

        {liveStreams.map((stream) => {
          const thumbnailSource = stream.coverUrl
            ? { uri: stream.coverUrl }
            : require('../../../assets/images/default-thumbnail.webp');
          return (
          <TouchableOpacity
            key={stream.id}
            style={styles.streamCard}
            onPress={() => deferNav(() => router.push(`/social-feed/live/${stream.id}`))}
          >
            <View style={styles.thumbnailContainer}>
              <Image
                source={thumbnailSource}
                style={styles.thumbnail}
              />
              <BlurView intensity={60} tint="dark" style={styles.liveIndicator}>
                <View style={styles.liveIndicatorDot} />
                <Text style={styles.liveText}>LIVE</Text>
                <Text style={styles.viewerCount}>
                  <Ionicons name="eye" size={12} color="#fff" /> {Math.max(stream.viewersCount, 0)}
                </Text>
              </BlurView>
            </View>
            <BlurView intensity={30} tint="dark" style={styles.streamInfo}>
              <Text style={styles.streamTitle}>{stream.title}</Text>
              <Text style={styles.hostName}>{stream.hostName ?? 'Unknown host'}</Text>
            </BlurView>
          </TouchableOpacity>
          );
        })}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  goLiveButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  goLiveBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  goLiveText: {
    color: '#ff4b4b',
    fontWeight: '600',
  },
  streamCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.6)',
  },
  thumbnailContainer: {
    position: 'relative',
    height: 200,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
  },
  liveIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4b4b',
  },
  liveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  viewerCount: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 8,
  },
  streamInfo: {
    padding: 16,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  hostName: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
