import { NativeModules } from 'react-native';

const { DownloadServiceModule } = NativeModules;

interface DownloadServiceModuleInterface {
    startService(title: string, body: string): void;
    stopService(): void;
}

export default DownloadServiceModule as DownloadServiceModuleInterface;
