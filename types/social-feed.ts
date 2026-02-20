import { ImageSourcePropType } from 'react-native';

// Defines the shape of a single comment object
export interface Comment {
  id: number | string;
  user: string;
  text: string;
  spoiler?: boolean;
}

// This is now the single source of truth for a review item's shape,
// matching the data provided by the useSocialReactions hook.
export interface Review {
  id: number | string;
  docId?: string;
  origin?: 'firestore' | 'supabase' | 'mock';
  userId?: string | null;
  user: string;
  avatar?: string | null;
  date: string;
  review: string;
  movie?: string;
  image?: ImageSourcePropType;
  genres?: string[];
  likes: number;
  liked: boolean;
  bookmarked: boolean;
  watched: number;
  commentsCount: number;
  comments?: Comment[];
  retweet?: boolean;
  likerAvatars?: ImageSourcePropType[];
  videoUrl?: string;
  tags?: string[];
}

// This type is no longer needed as Review now has the correct shape.
export interface FeedCardItem extends Omit<Review, 'comments'> {
  commentsCount: number;
  comments?: Comment[];
}
