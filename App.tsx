import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import { getTheme } from './src/theme/theme';

export default function App() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.statusBarStyle} />
      <HomeScreen theme={theme} />
    </SafeAreaProvider>
  );
}
