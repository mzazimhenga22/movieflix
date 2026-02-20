import { NativeModules } from 'react-native';

const { AlgorithmModule } = NativeModules;

interface AlgorithmModuleInterface {
    recommend(
        itemsJson: string,
        profileJson: string,
        socialSignalsJson: string
    ): Promise<string>;

    computeTasteProfile(eventsJson: string): Promise<string>;
}

export default AlgorithmModule as AlgorithmModuleInterface;
