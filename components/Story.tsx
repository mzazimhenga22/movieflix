import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Image, Animated, Easing, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';

interface StoryMedia {
  type: 'image' | 'video';
  uri: string;
}

export interface Story {
  id: number;
  title: string;
  image: string; // Thumbnail for the story
  media: StoryMedia[]; // Array of media items for the story
}

interface StoryProps {
  stories: Story[];
}

const StoryComponent: React.FC<StoryProps> = ({ stories }) => {
  const displayedStories = stories.slice(0, 4);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });

  useEffect(() => {
    // When stories change, trigger the animation
    // Start a bit lower for a more noticeable entrance, but stay within the rail area
    slideAnim.setValue(40);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [stories]); // Dependency on the whole stories array

  const handleStoryPress = (story: Story) => {
    deferNav(() => {
      router.push({
        pathname: '/story-viewer',
        params: {
          stories: JSON.stringify(stories), // Pass all stories
          initialStoryId: story.id, // Pass the ID of the tapped story
        },
      });
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rail}
      >
        <View style={styles.railSheen} pointerEvents="none" />
        <View style={styles.railGlow} pointerEvents="none" />
        <Animated.View style={[styles.storiesContainer, { transform: [{ translateY: slideAnim }] }]}>
          {displayedStories.map((story, index) => (
            <TouchableOpacity
              key={`story-${index}-${String(story.id)}-${story.title}`}
              style={styles.storyContainer}
              onPress={() => handleStoryPress(story)}
            >
              <View style={styles.storyImageWrapper}>
                <Image source={{ uri: story.image }} style={styles.storyImage} />
              </View>
              <Text style={styles.storyText} numberOfLines={1} ellipsizeMode="tail">
                {story.title}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 140,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  rail: {
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'visible', // allow bottom glow to show fully
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    backgroundColor: 'rgba(10,12,24,0.25)', // more transparent to blend with hero
  },
  railSheen: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    opacity: 0.28,
  },
  railGlow: {
    position: 'absolute',
    bottom: -6,
    left: 24,
    right: 24,
    height: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(229,9,20,0.35)',
  },
  storiesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  storyContainer: {
    alignItems: 'center',
    width: 78, // Give each story a fixed width
    gap: 8,
  },
  storyImageWrapper: {
    padding: 7,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: 'rgba(125,216,255,0.18)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  storyImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  storyText: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});

export default StoryComponent;
