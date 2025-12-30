export const getAccentFromPosterPath = (posterPath?: string | null): string => {
  if (!posterPath) return '#e50914';
  let hash = 0;
  for (let i = 0; i < posterPath.length; i++) {
    hash = (hash * 31 + posterPath.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 40%)`;
}

