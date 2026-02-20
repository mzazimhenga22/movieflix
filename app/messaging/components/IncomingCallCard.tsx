import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { CallSession } from '@/lib/calls/types';

type IncomingCallCardProps = {
  call: CallSession;
  onAccept: () => void;
  onDecline: () => void;
};

const IncomingCallCard = ({ call, onAccept, onDecline }: IncomingCallCardProps) => {
  const label =
    call.type === 'video' ? 'Incoming video call' : 'Incoming voice call';
  const name = call.conversationName || 'Unknown';

  return (
    <LinearGradient
      colors={['rgba(229,9,20,0.25)', 'rgba(10,12,24,0.85)']}
      style={styles.container}
    >
      <View style={styles.textColumn}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onDecline}
          style={[styles.actionButton, styles.decline]}
          accessibilityLabel="Decline call"
        >
          <Ionicons name="close" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onAccept}
          style={[styles.actionButton, styles.accept]}
          accessibilityLabel="Accept call"
        >
          <Ionicons
            name={call.type === 'video' ? 'videocam' : 'call'}
            size={18}
            color="#0E0E0E"
          />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  decline: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  accept: {
    backgroundColor: '#fff',
  },
});

export default IncomingCallCard;
