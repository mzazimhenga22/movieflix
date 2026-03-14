import { NativeModules } from 'react-native';

const { MessagingModule } = NativeModules;

interface MessagingModuleInterface {
    processConversations(
        itemsJson: string,
        userId: string,
        activeKind: string,
        activeFilter: string,
        searchQuery: string,
        localReadMapJson: string
    ): Promise<string>;
    groupStories(storiesJson: string): Promise<string>;
}

export default MessagingModule as MessagingModuleInterface;
