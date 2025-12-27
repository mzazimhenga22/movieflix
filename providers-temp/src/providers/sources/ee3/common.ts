const getEnvValue = (keys: string[]): string | undefined => {
  try {
    if (typeof process === 'undefined') return undefined;
    const env = process.env as Record<string, string | undefined>;
    for (const key of keys) {
      const value = env?.[key];
      if (value && value.trim()) {
        return value.trim();
      }
    }
  } catch (e) {
    // ignore
  }
  return undefined;
};

export const apiBaseUrl = 'https://borg.rips.cc';

const envUsername = getEnvValue(['EE3_USERNAME', 'PSTREAM_EE3_USERNAME', 'EXPO_PUBLIC_EE3_USERNAME', 'NEXT_PUBLIC_EE3_USERNAME']);
const envPassword = getEnvValue(['EE3_PASSWORD', 'PSTREAM_EE3_PASSWORD', 'EXPO_PUBLIC_EE3_PASSWORD', 'NEXT_PUBLIC_EE3_PASSWORD']);

export const username = envUsername ?? '_sf_'; // I'd appreciate if you made your own account "_sf_" seems to be removed. Invite codes are: fmhy or mpgh

export const password = envPassword ?? 'defonotscraping';
