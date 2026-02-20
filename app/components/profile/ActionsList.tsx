import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';

interface ActionsListProps {
  userIdToDisplay: string | undefined;
  isOwnProfile: boolean;
  isPaymentsAdmin: boolean;
  accent: string;
  favoriteGenre: any;
  favoriteGenres: any[];
  deferNav: (fn: () => void) => void;
  router: any;
  handleLogout: () => void;
  handleSettings: () => void;
}

const ActionsList = memo(function ActionsList({
  userIdToDisplay,
  isOwnProfile,
  isPaymentsAdmin,
  accent,
  favoriteGenre,
  favoriteGenres,
  deferNav,
  router,
  handleLogout,
  handleSettings,
}: ActionsListProps) {
  return (
    <>
      <AnimatedSection delay={500} style={[styles.glassCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
        {isOwnProfile && (
          <View style={styles.favoriteGenreCard}>
            <View style={styles.favoriteGenreHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="heart" size={18} color={accent} />
                <Text style={styles.sectionTitle}>Favorite genre</Text>
              </View>
              <TouchableOpacity
                style={[styles.favoriteGenreAction, { borderColor: `${accent}40` }]}
                onPress={() => deferNav(() => router.push('/categories?pickFavorite=1'))}
              >
                <Ionicons name="sparkles" size={16} color={accent} />
                <Text style={[styles.favoriteGenreActionText, { color: accent }]}>
                  {favoriteGenre ? 'Change' : 'Choose'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.favoriteGenreValue, { color: accent }]} numberOfLines={1}>
              {favoriteGenre?.name ?? 'Not set'}
            </Text>
            <Text style={styles.favoriteGenreHint}>
              Pick one in Categories to personalize your Movies feed.
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Ionicons name="film" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.sectionTitle}>Favorite Genres</Text>
        </View>
        <View style={styles.genresList}>
          {favoriteGenres.map((genre, index) => (
            <View
              key={genre}
              style={[
                styles.genreTag,
                { borderColor: `${accent}30`, backgroundColor: index === 0 ? `${accent}15` : 'rgba(255,255,255,0.06)' },
              ]}
            >
              {index === 0 && <Ionicons name="star" size={12} color={accent} />}
              <Text style={[styles.genreText, index === 0 && { color: accent }]}>{genre}</Text>
            </View>
          ))}
        </View>
      </AnimatedSection>

      <AnimatedSection delay={600} style={[styles.glassCard, { paddingVertical: 12, borderColor: 'rgba(255,255,255,0.08)' }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="apps" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.sectionTitle}>Actions</Text>
        </View>

        <TouchableOpacity style={styles.actionItem} onPress={handleSettings}>
          <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="settings-outline" size={20} color="white" />
          </View>
          <Text style={styles.actionText}>Settings</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionItem, !userIdToDisplay && { opacity: 0.6 }]}
          onPress={() => {
            if (!userIdToDisplay) return;
            deferNav(() =>
              router.push({ pathname: '/marketplace/seller/[id]', params: { id: String(userIdToDisplay) } } as any)
            );
          }}
          disabled={!userIdToDisplay}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(100,130,255,0.15)' }]}>
            <Ionicons name="storefront-outline" size={20} color="#6482ff" />
          </View>
          <Text style={styles.actionText}>{isOwnProfile ? 'My catalog' : 'View catalog'}</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        {isOwnProfile && (
          <>
            <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/orders'))}>
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(74,222,128,0.15)' }]}>
                <Ionicons name="receipt-outline" size={20} color="#4ADE80" />
              </View>
              <Text style={styles.actionText}>My orders</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            {isPaymentsAdmin && (
              <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/admin/payments'))}>
                <View style={[styles.actionIconWrap, { backgroundColor: `${accent}20` }]}>
                  <Ionicons name="card-outline" size={20} color={accent} />
                </View>
                <Text style={styles.actionText}>Payments (admin)</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/tickets'))}>
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(255,200,100,0.15)' }]}>
                <Ionicons name="ticket-outline" size={20} color="#ffc864" />
              </View>
              <Text style={styles.actionText}>My tickets</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/scan-ticket'))}>
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(180,130,255,0.15)' }]}>
                <Ionicons name="qr-code-outline" size={20} color="#b482ff" />
              </View>
              <Text style={styles.actionText}>Scan ticket (seller)</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.actionItem}>
          <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="help-circle-outline" size={20} color="white" />
          </View>
          <Text style={styles.actionText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        {isOwnProfile && (
          <TouchableOpacity style={[styles.actionItem, styles.actionItemLogout]} onPress={handleLogout}>
            <View style={[styles.actionIconWrap, { backgroundColor: `${accent}20` }]}>
              <Ionicons name="log-out-outline" size={20} color={accent} />
            </View>
            <Text style={[styles.actionText, { color: accent }]}>Logout</Text>
          </TouchableOpacity>
        )}
      </AnimatedSection>
    </>
  );
});

const styles = StyleSheet.create({
  glassCard: {
    backgroundColor: 'rgba(15,18,35,0.6)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
    marginBottom: 0,
  },
  favoriteGenreCard: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  favoriteGenreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  favoriteGenreAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  favoriteGenreActionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  favoriteGenreValue: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  favoriteGenreHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 16,
  },
  genresList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  genreText: { color: 'white', fontSize: 13, fontWeight: '600' },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  actionText: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionItemLogout: {
    marginTop: 8,
    borderTopWidth: 0,
    backgroundColor: 'rgba(229,9,20,0.08)',
    borderRadius: 14,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
});

export default ActionsList;
