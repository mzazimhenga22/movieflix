import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import LiquidGlass from '../LiquidGlass';

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
  const renderActionIcon = (iconName: string, iconColor: string, glowColor: string) => (
    <LiquidGlass
      glowColor={glowColor}
      tintColor="#1a1a2e"
      tintOpacity={0.4}
      cornerRadius={12}
      glowIntensity={0.3}
      borderWidth={1}
      style={styles.actionIconWrap}
      animated={false}
    >
      <Ionicons name={iconName as any} size={20} color={iconColor} />
    </LiquidGlass>
  );

  const renderGenreTag = (genre: string, index: number) => (
    <LiquidGlass
      key={genre}
      glowColor={index === 0 ? accent : '#ffffff'}
      tintColor={index === 0 ? `${accent}20` : 'rgba(255,255,255,0.06)'}
      tintOpacity={0.6}
      cornerRadius={12}
      glowIntensity={0.2}
      borderWidth={1}
      style={styles.genreTag}
      animated={false}
    >
      {index === 0 && <Ionicons name="star" size={12} color={accent} />}
      <Text style={[styles.genreText, index === 0 && { color: accent }]}>{genre}</Text>
    </LiquidGlass>
  );

  return (
    <>
      <AnimatedSection delay={500}>
        <LiquidGlass
          glowColor={accent}
          tintColor="#0f1224"
          tintOpacity={0.6}
          cornerRadius={20}
          glowIntensity={0.5}
          borderWidth={1.5}
          style={styles.glassCard}
          animated={true}
        >
          {isOwnProfile && (
            <View style={styles.favoriteGenreCard}>
              <View style={styles.favoriteGenreHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {renderActionIcon('heart', accent, accent)}
                  <Text style={styles.sectionTitle}>Favorite genre</Text>
                </View>
                <TouchableOpacity
                  onPress={() => deferNav(() => router.push('/categories?pickFavorite=1'))}
                  activeOpacity={0.85}
                >
                  <LiquidGlass
                    glowColor={accent}
                    tintColor={`${accent}15`}
                    tintOpacity={0.5}
                    cornerRadius={999}
                    glowIntensity={0.4}
                    borderWidth={1}
                    style={styles.favoriteGenreAction}
                    animated={false}
                  >
                    <Ionicons name="sparkles" size={16} color={accent} />
                    <Text style={[styles.favoriteGenreActionText, { color: accent }]}>
                      {favoriteGenre ? 'Change' : 'Choose'}
                    </Text>
                  </LiquidGlass>
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
            {renderActionIcon('film', 'rgba(255,255,255,0.7)', '#ffffff')}
            <Text style={styles.sectionTitle}>Favorite Genres</Text>
          </View>
          <View style={styles.genresList}>
            {favoriteGenres.map((genre, index) => renderGenreTag(genre, index))}
          </View>
        </LiquidGlass>
      </AnimatedSection>

      <AnimatedSection delay={600}>
        <LiquidGlass
          glowColor="#ffffff"
          tintColor="#0f1224"
          tintOpacity={0.6}
          cornerRadius={20}
          glowIntensity={0.4}
          borderWidth={1.5}
          style={[styles.glassCard, { paddingVertical: 12 }]}
          animated={true}
        >
          <View style={styles.sectionHeader}>
            {renderActionIcon('apps', 'rgba(255,255,255,0.7)', '#ffffff')}
            <Text style={styles.sectionTitle}>Actions</Text>
          </View>

          <TouchableOpacity style={styles.actionItem} onPress={handleSettings}>
            {renderActionIcon('settings-outline', '#fff', '#ffffff')}
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
            {renderActionIcon('storefront-outline', '#6482ff', '#6482ff')}
            <Text style={styles.actionText}>{isOwnProfile ? 'My catalog' : 'View catalog'}</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          {isOwnProfile && (
            <>
              <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/orders'))}>
                {renderActionIcon('receipt-outline', '#4ADE80', '#4ADE80')}
                <Text style={styles.actionText}>My orders</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>

              {isPaymentsAdmin && (
                <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/admin/payments'))}>
                  {renderActionIcon('card-outline', accent, accent)}
                  <Text style={styles.actionText}>Payments (admin)</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/tickets'))}>
                {renderActionIcon('ticket-outline', '#ffc864', '#ffc864')}
                <Text style={styles.actionText}>My tickets</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => deferNav(() => router.push('/marketplace/scan-ticket'))}>
                {renderActionIcon('qr-code-outline', '#b482ff', '#b482ff')}
                <Text style={styles.actionText}>Scan ticket (seller)</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.actionItem}>
            {renderActionIcon('help-circle-outline', '#fff', '#ffffff')}
            <Text style={styles.actionText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          {isOwnProfile && (
            <TouchableOpacity style={[styles.actionItem, styles.actionItemLogout]} onPress={handleLogout}>
              {renderActionIcon('log-out-outline', accent, accent)}
              <Text style={[styles.actionText, { color: accent }]}>Logout</Text>
            </TouchableOpacity>
          )}
        </LiquidGlass>
      </AnimatedSection>
    </>
  );
});

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
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
    overflow: 'hidden',
  },
  favoriteGenreActionText: {
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    overflow: 'hidden',
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
    overflow: 'hidden',
  },
  actionItemLogout: {
    marginTop: 8,
    borderTopWidth: 0,
    borderRadius: 14,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
});

export default ActionsList;
