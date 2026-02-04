import type { StatusBarStyle } from 'expo-status-bar';
import type { ColorSchemeName } from 'react-native';

export type Theme = {
  statusBarStyle: StatusBarStyle;
  colors: {
    background: string;
    card: string;
    surface: string;
    border: string;
    shadow: string;
    text: string;
    muted: string;
    placeholder: string;
    primary: string;
    onPrimary: string;
    success: string;
    pillBg: string;
  };
};

export function getTheme(colorScheme: ColorSchemeName): Theme {
  const isDark = colorScheme === 'dark';

  return {
    statusBarStyle: isDark ? 'light' : 'dark',
    colors: isDark
      ? {
          background: '#07070A',
          card: '#0E0F14',
          surface: '#0B0C11',
          border: 'rgba(248, 250, 252, 0.12)',
          shadow: '#000000',
          text: '#F8FAFC',
          muted: '#A1A1AA',
          placeholder: 'rgba(161, 161, 170, 0.70)',
          primary: '#F8FAFC',
          onPrimary: '#07070A',
          success: '#34D399',
          pillBg: 'rgba(248, 250, 252, 0.06)',
        }
      : {
          background: '#F6F7FB',
          card: '#FFFFFF',
          surface: '#F1F2F6',
          border: 'rgba(11, 11, 15, 0.10)',
          shadow: '#0B1220',
          text: '#0B0B0F',
          muted: '#6B7280',
          placeholder: 'rgba(107, 114, 128, 0.65)',
          primary: '#0B0B0F',
          onPrimary: '#FFFFFF',
          success: '#10B981',
          pillBg: 'rgba(11, 11, 15, 0.04)',
        },
  };
}
