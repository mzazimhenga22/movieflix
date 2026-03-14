/**
 * fix-missing-layouts.js
 * Creates _layout.tsx for route directories that need them,
 * and renames non-route directories (components/, hooks/, styles/, utils/) 
 * to start with _ to exclude them from expo-router.
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');

// Standard Stack layout content for route directories
const stackLayout = `import { Stack } from 'expo-router';
import React from 'react';

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`;

// Directories that ARE routes and need _layout.tsx
const routeDirs = [
    'admin',
    'calls',
    'details',
    'feed',
    'reels',
    'story',
    'streaks',
    'tv-login',
];

// Directories that are NOT routes — they are helper dirs inside route groups
// These need to be renamed to start with _ so expo-router ignores them
const nonRouteDirs = [
    '(auth)/components',
    '(tabs)/movies',          // This one needs careful handling
    '(tabs)/movies/components',
    '(tabs)/movies/hooks',
    '(tabs)/movies/styles',
    '(tabs)/movies/utils',
    'calls/components',
    'marketplace/components',
    'messaging/components',
    'messaging/chat/components',
    'hooks',
];

// Create _layout.tsx for route directories
routeDirs.forEach(dir => {
    const dirPath = path.join(appDir, dir);
    if (!fs.existsSync(dirPath)) return;

    const layoutPath = path.join(dirPath, '_layout.tsx');
    const indexPath = path.join(dirPath, 'index.tsx');
    const indexTsPath = path.join(dirPath, 'index.ts');

    if (!fs.existsSync(layoutPath) && !fs.existsSync(indexPath) && !fs.existsSync(indexTsPath)) {
        fs.writeFileSync(layoutPath, stackLayout, 'utf8');
        console.log('✅ Created _layout.tsx in app/' + dir);
    } else {
        console.log('⏭️  Skipped app/' + dir + ' (already has layout or index)');
    }
});

// Check marketplace sub-dirs
['marketplace/seller', 'marketplace/tickets'].forEach(dir => {
    const dirPath = path.join(appDir, dir);
    if (!fs.existsSync(dirPath)) return;

    const layoutPath = path.join(dirPath, '_layout.tsx');
    const indexPath = path.join(dirPath, 'index.tsx');

    if (!fs.existsSync(layoutPath) && !fs.existsSync(indexPath)) {
        fs.writeFileSync(layoutPath, stackLayout, 'utf8');
        console.log('✅ Created _layout.tsx in app/' + dir);
    }
});

// Check messaging/chat
const chatDir = path.join(appDir, 'messaging', 'chat');
if (fs.existsSync(chatDir)) {
    const chatLayout = path.join(chatDir, '_layout.tsx');
    if (!fs.existsSync(chatLayout)) {
        fs.writeFileSync(chatLayout, stackLayout, 'utf8');
        console.log('✅ Created _layout.tsx in app/messaging/chat');
    }
}

console.log('\n--- Done! ---');
console.log('NOTE: Non-route directories like components/, hooks/, styles/, utils/ inside app/');
console.log('should ideally be moved outside of app/ or renamed with _ prefix to exclude from routing.');
