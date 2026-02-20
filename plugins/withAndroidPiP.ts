import { AndroidConfig, ConfigPlugin, withAndroidManifest } from '@expo/config-plugins';

const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

const withAndroidPiP: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add tools namespace to manifest if not present
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = TOOLS_NAMESPACE;
    }

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    // autoEnterEnabled requires API 31+, so we add tools:targetApi to avoid build errors on lower minSdk
    // mainActivity.$['android:autoEnterEnabled'] = 'true';
    mainActivity.$['tools:targetApi'] = '31';
    mainActivity.$['android:launchMode'] = 'singleTask';
    // Ensure the activity doesn't restart when entering PiP mode
    const currentConfigChanges = mainActivity.$['android:configChanges'] || '';
    const requiredChanges = ['orientation', 'screenSize', 'smallestScreenSize', 'screenLayout'];
    const newChanges = requiredChanges.filter(c => !currentConfigChanges.includes(c));
    if (newChanges.length > 0) {
      mainActivity.$['android:configChanges'] = [currentConfigChanges, ...newChanges].filter(Boolean).join('|');
    }
    return config;
  });

export default withAndroidPiP;
