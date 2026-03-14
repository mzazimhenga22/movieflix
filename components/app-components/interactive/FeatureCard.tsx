import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface FeatureCardProps {
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description: string;
  onPress?: () => void;
  isLarge?: boolean;
  iconColor?: string; // New prop for icon color
}

const FeatureCard: React.FC<FeatureCardProps> = ({ iconName, title, description, onPress, isLarge = false, iconColor = '#ffffff' }) => {
  return (
    <TouchableOpacity
      style={[styles.card, isLarge && styles.largeCard]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['rgba(229,9,20,0.16)', 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardBg}
      />
      {isLarge ? (
        <>
          <View style={[styles.iconContainer, styles.largeIconContainer]}>
            <MaterialCommunityIcons name={iconName} size={40} color={iconColor} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.title, styles.largeTitle]}>{title}</Text>
            <Text style={[styles.description, styles.largeDescription]}>{description}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name={iconName} size={30} color={iconColor} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    flex: 1,
    marginHorizontal: 7.5,
    minHeight: 160,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  largeCard: {
    flex: undefined,
    marginHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 120,
  },
  iconContainer: {
    marginBottom: 10,
    alignSelf: 'flex-start',
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  largeIconContainer: {
    marginBottom: 0,
    marginRight: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  largeTitle: {
    fontSize: 20,
    marginBottom: 8,
  },
  description: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 18,
  },
  largeDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default FeatureCard;
