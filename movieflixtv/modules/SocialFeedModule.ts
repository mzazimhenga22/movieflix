import { NativeModules, Platform } from 'react-native';

const { SocialFeedModule } = NativeModules;

interface SocialFeedModuleInterface {
  fetchFeed(userId: string, limit: number, offset: number): Promise<string>;
  likePost(postId: string): Promise<boolean>;
  unlikePost(postId: string): Promise<boolean>;
  commentOnPost(postId: string, comment: string): Promise<string>;
  sharePost(postId: string): Promise<boolean>;
}

const isAvailable = Platform.OS === 'android' && SocialFeedModule != null;

export const SocialFeed = {
  fetchFeed: async (userId: string, limit: number = 20, offset: number = 0): Promise<any[]> => {
    if (isAvailable) {
      const json = await SocialFeedModule.fetchFeed(userId, limit, offset);
      return JSON.parse(json);
    }
    return [];
  },
  
  likePost: async (postId: string): Promise<boolean> => {
    if (isAvailable) {
      return await SocialFeedModule.likePost(postId);
    }
    return false;
  },
  
  unlikePost: async (postId: string): Promise<boolean> => {
    if (isAvailable) {
      return await SocialFeedModule.unlikePost(postId);
    }
    return false;
  },
  
  commentOnPost: async (postId: string, comment: string): Promise<any> => {
    if (isAvailable) {
      const json = await SocialFeedModule.commentOnPost(postId, comment);
      return JSON.parse(json);
    }
    return null;
  },
  
  sharePost: async (postId: string): Promise<boolean> => {
    if (isAvailable) {
      return await SocialFeedModule.sharePost(postId);
    }
    return false;
  },
};

export default SocialFeedModule as SocialFeedModuleInterface;
