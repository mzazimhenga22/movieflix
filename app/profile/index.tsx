import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Redirect /profile to the (tabs)/profile screen.
 * The app/profile/ directory holds sub-routes (edit, search) 
 * but the main profile screen lives inside the tabs group.
 */
export default function ProfileIndex() {
    return <Redirect href="/(tabs)/profile" />;
}
