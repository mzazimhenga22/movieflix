const fs = require('fs');
const path = require('path');

const layout = `import { Stack } from 'expo-router';
import React from 'react';

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`;

const dirs = [
    'app/(tabs)/movies',
    'app/(tabs)/movies/components',
    'app/(tabs)/movies/hooks',
    'app/(tabs)/movies/styles',
    'app/(tabs)/movies/utils',
    'app/(auth)/components',
    'app/calls/components',
    'app/marketplace/components',
    'app/messaging/components',
    'app/messaging/chat/components',
    'app/hooks',
    'app/details/components',
];

const root = path.join(__dirname, '..');

dirs.forEach(dir => {
    const fullDir = path.join(root, dir);
    if (!fs.existsSync(fullDir)) {
        console.log('SKIP (not found): ' + dir);
        return;
    }
    const layoutPath = path.join(fullDir, '_layout.tsx');
    if (!fs.existsSync(layoutPath)) {
        fs.writeFileSync(layoutPath, layout, 'utf8');
        console.log('✅ Created: ' + dir + '/_layout.tsx');
    } else {
        console.log('⏭️  Exists: ' + dir + '/_layout.tsx');
    }
});
