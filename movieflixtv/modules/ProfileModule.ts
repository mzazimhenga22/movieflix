import { NativeModules } from 'react-native';

const { ProfileModule } = NativeModules;

interface ProfileModuleInterface {
  processReviewFeed(
    supabaseJson: string,
    firestoreJson: string,
    currentUserId: string
  ): Promise<string>;

  /**
   * Parse raw Firestore snapshot documents into validated HouseholdProfile objects.
   * Offloads JSON parsing and validation from the JS thread.
   */
  parseHouseholdProfiles(
    snapshotDocsJson: string,
    defaultColor: string
  ): Promise<string>;

  /**
   * Validate and sanitize a single profile for saving.
   * Ensures PIN format, trims strings, sets defaults.
   */
  validateProfileForSave(profileJson: string): Promise<string>;
}

export default ProfileModule as ProfileModuleInterface;
