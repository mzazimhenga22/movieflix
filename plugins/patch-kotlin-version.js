// Patch Kotlin version in gradle.properties to fix expo-updates KSP errors
const fs = require('fs');
const path = require('path');

const withPatchKotlinVersion = (config) => {
  const gradlePropertiesPath = path.join(
    config.modRequest.projectRoot,
    'android',
    'gradle.properties'
  );

  if (fs.existsSync(gradlePropertiesPath)) {
    let content = fs.readFileSync(gradlePropertiesPath, 'utf-8');
    
    // Remove hardcoded kotlinVersion and kspVersion
    content = content.replace(/^kotlinVersion=.*$/gm, '# kotlinVersion auto-detected by expo-modules');
    content = content.replace(/^kspVersion=.*$/gm, '# kspVersion auto-detected by expo-modules');
    
    fs.writeFileSync(gradlePropertiesPath, content);
    console.log('Patched gradle.properties: Kotlin version now auto-detected');
  }

  return config;
};

module.exports = withPatchKotlinVersion;
