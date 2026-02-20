import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import SuggestedPerson from './SuggestedPerson';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Profile } from '../controller';

interface Props {
  suggestedPeople: Profile[];
  onStartChat: (person: Profile) => void;
  startingUserId?: string | null;
  headerHeight: number;
}

const NoMessages = ({ suggestedPeople, onStartChat, startingUserId, headerHeight }: Props) => {
  const router = useRouter();

  const handleProfilePress = (userId: string) => {
    router.push(`/profile?userId=${userId}&from=social-feed`);
  };

  return (
    <View style={[styles.noMessagesContainer, { paddingTop: headerHeight + 20 }]}>
      <BlurView intensity={60} tint="dark" style={styles.card}>
        <LinearGradient
          colors={['rgba(229,9,20,0.22)', 'rgba(255,255,255,0.04)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGlow}
        />

        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.noMessagesTitle}>No messages yet</Text>
            <Text style={styles.noMessagesSubtitle}>
              Start a chat with someone you follow.
            </Text>
          </View>
        </View>

        <FlatList
          data={suggestedPeople}
          renderItem={({ item }) => (
            <SuggestedPerson
              item={item}
              onPressProfile={() => handleProfilePress(item.id)}
              onStartChat={onStartChat}
              busy={startingUserId === item.id}
              disabled={!!startingUserId}
            />
          )}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10 }}
          showsVerticalScrollIndicator={false}
        />
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  noMessagesContainer: {
    flex: 1,
    alignItems: 'center',
  },
  card: {
    width: '92%',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#050915',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  noMessagesTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  noMessagesSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 6,
  },
});

export default NoMessages;
