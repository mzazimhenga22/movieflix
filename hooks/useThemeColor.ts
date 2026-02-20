import { useThemeContext } from '../hooks/use-theme';
import { ColorSchemeName } from 'react-native';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ThemeColors
) {
  const { theme } = useThemeContext();
  const colorFromProps = props[theme.dark ? 'dark' : 'light'];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return theme.colors[colorName];
  }
}

type ThemeColors = {
  primary: string;
  background: string;
  card: string;
  text: string;
  border: string;
  notification: string;
};
