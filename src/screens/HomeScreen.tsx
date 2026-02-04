import * as Clipboard from 'expo-clipboard';
import * as Network from 'expo-network';
import * as React from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import StaticServer from 'react-native-static-server';
import { startApiServer } from '../server/apiServer';
import {
  ensureWebRootFilesAsync,
  getWebRootDir,
  getWebRootNativePath,
  writeSharedTextAsync,
} from '../web/webRoot';
import type { Theme } from '../theme/theme';

const DEFAULT_PORT = 8080;

type Props = {
  theme: Theme;
};

const API_PORT_OFFSET = 1;

export default function HomeScreen({ theme }: Props) {
  const [text, setText] = React.useState('');
  const [serverRunning, setServerRunning] = React.useState(false);
  const serverPort = DEFAULT_PORT;
  const [ipAddress, setIpAddress] = React.useState<string | null>(null);
  const [serverUrl, setServerUrl] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);

  const serverRef = React.useRef<StaticServer | null>(null);
  const apiRef = React.useRef<ReturnType<typeof startApiServer> | null>(null);
  const debouncedWriteRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = React.useRef(false);
  const serverRunningRef = React.useRef(false);
  const snapshotRef = React.useRef<{ text: string; updatedAt: string }>({
    text,
    updatedAt: new Date().toISOString(),
  });

  const styles = React.useMemo(() => makeStyles(theme), [theme]);

  React.useEffect(() => {
    snapshotRef.current = { text, updatedAt: new Date().toISOString() };
  }, [text]);

  React.useEffect(() => {
    startingRef.current = starting;
  }, [starting]);

  React.useEffect(() => {
    serverRunningRef.current = serverRunning;
  }, [serverRunning]);

  const computedUrl = React.useMemo(() => {
    if (!serverRunning && !starting) return null;
    if (ipAddress && isUsefulIpAddress(ipAddress)) {
      const host = ipAddress.includes(':') ? `[${ipAddress}]` : ipAddress;
      return `http://${host}:${serverPort}`;
    }
    return serverUrl;
  }, [ipAddress, serverPort, serverUrl]);

  const startServerAsync = React.useCallback(async () => {
    if (startingRef.current || serverRunningRef.current) return;
    startingRef.current = true;
    setStarting(true);

    try {
      await ensureWebRootFilesAsync();

      let ip: string | null = null;
      try {
        ip = await Network.getIpAddressAsync();
      } catch {
        ip = null;
      }
      setIpAddress(ip);

      const rootDirPath = getWebRootNativePath();
      const server = new StaticServer(serverPort, rootDirPath, { localOnly: false });
      serverRef.current = server;
      const urlFromServer = await server.start();

      apiRef.current = startApiServer({
        port: serverPort + API_PORT_OFFSET,
        getSnapshot: () => snapshotRef.current,
        onRemoteText: (nextText) => {
          setText((prev) => (prev === nextText ? prev : nextText));
        },
      });

      setServerUrl(urlFromServer);
      serverRunningRef.current = true;
      setServerRunning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not start sharing', message);
      setIpAddress(null);
      setServerRunning(false);
      setServerUrl(null);
      serverRef.current = null;
      apiRef.current = null;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [serverPort]);

  const stopServerAsync = React.useCallback(async () => {
    try {
      await apiRef.current?.stopAsync();
    } catch {
      // best-effort stop
    } finally {
      apiRef.current = null;
    }

    if (!serverRef.current) {
      serverRunningRef.current = false;
      setIpAddress(null);
      setServerRunning(false);
      setServerUrl(null);
      return;
    }

    try {
      await serverRef.current.stop();
    } catch {
      // best-effort stop
    } finally {
      serverRef.current = null;
      serverRunningRef.current = false;
      setIpAddress(null);
      setServerRunning(false);
      setServerUrl(null);
    }
  }, []);

  React.useEffect(() => {
    void startServerAsync();
    return () => {
      void stopServerAsync();
    };
  }, [startServerAsync, stopServerAsync]);

  React.useEffect(() => {
    if (!serverRunning) return;
    if (debouncedWriteRef.current) clearTimeout(debouncedWriteRef.current);

    debouncedWriteRef.current = setTimeout(() => {
      void writeSharedTextAsync(text, snapshotRef.current.updatedAt);
    }, 250);

    return () => {
      if (debouncedWriteRef.current) clearTimeout(debouncedWriteRef.current);
    };
  }, [serverRunning, text]);

  const copyUrlAsync = React.useCallback(async () => {
    if (!computedUrl) return;
    await Clipboard.setStringAsync(computedUrl);
    Alert.alert('Copied', 'Share URL copied to clipboard.');
  }, [computedUrl]);

  const pasteFromClipboardAsync = React.useCallback(async () => {
    const value = await Clipboard.getStringAsync();
    setText(value);
  }, []);

  const openOnThisDeviceAsync = React.useCallback(async () => {
    if (!computedUrl) return;
    const canOpen = await Linking.canOpenURL(computedUrl);
    if (!canOpen) {
      Alert.alert('Cannot open URL', computedUrl);
      return;
    }
    await Linking.openURL(computedUrl);
  }, [computedUrl]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={18}
        keyboardOpeningTime={0}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandText}>
              <View style={{ flexDirection: 'row', display: "flex", alignItems: "center", gap: 8}}>
                <View style={styles.logoWrap}>
                  <Image
                    source={require('../../asset/png/icon.png')}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="EZCP logo"
                  />
                </View>
                <Text style={styles.title}>E.Z;C-P</Text>
              </View>
              <Text style={styles.subtitle}>
                Simple, fast text sharing — offline over hotspot / Wi‑Fi.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Sharing</Text>
            <View style={styles.pill}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: serverRunning ? theme.colors.success : theme.colors.muted },
                ]}
              />
              <Text style={styles.pillText}>
                {starting ? 'Starting…' : serverRunning ? 'Live' : 'Stopped'}
              </Text>
            </View>
          </View>

          <Text style={styles.bodyText}>
            1) Turn on {Platform.OS === 'ios' ? 'Personal Hotspot' : 'Wi‑Fi hotspot'} on this device. 2)
            Connect the receiving device to that Wi‑Fi. 3) Open the URL below on the receiving device.
          </Text>

          <View style={styles.urlBox}>
            <Text style={styles.urlLabel}>Share URL</Text>
            <Pressable onPress={() => void copyUrlAsync()} disabled={!computedUrl}>
              <Text style={styles.urlValue} selectable>
                {starting ? 'Starting…' : computedUrl ?? 'Not sharing'}
              </Text>
            </Pressable>
            <Text style={styles.urlHint}>
              {computedUrl ? 'Tap the URL to copy.' : 'Start sharing to generate a URL.'}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [styles.buttonPrimary, pressed && styles.buttonPressed]}
              onPress={() => void (serverRunning ? stopServerAsync() : startServerAsync())}
              disabled={starting}
            >
              <Text style={styles.buttonPrimaryText}>{serverRunning ? 'Stop' : 'Start'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
              onPress={() => void copyUrlAsync()}
              disabled={!computedUrl}
            >
              <Text style={styles.buttonSecondaryText}>Copy URL</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.buttonTertiary, pressed && styles.buttonPressed]}
              onPress={() => void openOnThisDeviceAsync()}
              disabled={!computedUrl}
            >
              <Text style={styles.buttonTertiaryText}>Preview</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Text</Text>
            <Text style={styles.miniMuted}>{text.length.toLocaleString()} chars</Text>
          </View>

          <Text style={styles.bodyText}>
            Tip: edits on the receiver web page will sync back here automatically.
          </Text>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste anything here…"
            placeholderTextColor={theme.colors.placeholder}
            multiline
            textAlignVertical="top"
            style={styles.textArea}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
              onPress={() => void pasteFromClipboardAsync()}
            >
              <Text style={styles.buttonSecondaryText}>Paste</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.buttonTertiary, pressed && styles.buttonPressed]}
              onPress={() => setText('')}
              disabled={!text}
            >
              <Text style={styles.buttonTertiaryText}>Clear</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.buttonTertiary, pressed && styles.buttonPressed]}
              onPress={() => void Clipboard.setStringAsync(text)}
              disabled={!text}
            >
              <Text style={styles.buttonTertiaryText}>Copy</Text>
            </Pressable>
          </View>

          <Text style={styles.footerHint}>
            Receiver page lives at the URL above and refreshes automatically.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>For More Visit: https://muhammedgasal.com</Text>
          <Text style={styles.footerText}>Web root: {getWebRootDir()}</Text>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    bg: {
      ...StyleSheet.absoluteFillObject,
    },
    glowTop: {
      position: 'absolute',
      top: -140,
      left: -90,
      width: 320,
      height: 320,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      opacity: 0.75,
      transform: [{ rotate: '12deg' }],
    },
    glowBottom: {
      position: 'absolute',
      bottom: -160,
      right: -110,
      width: 360,
      height: 360,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      opacity: 0.55,
      transform: [{ rotate: '-10deg' }],
    },
    container: {
      paddingHorizontal: 18,
      paddingBottom: 28,
      gap: 14,
    },
    header: {
      paddingTop: 8,
      paddingBottom: 6,
      gap: 6,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoWrap: {
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      resizeMode: 'contain'
    },
    logo: {
      width: 30,
      height: 30,
    },
    brandText: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: 0.2,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.muted,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      gap: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    bodyText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.muted,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.pillBg,
      borderColor: theme.colors.border,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 99,
    },
    pillText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    urlBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 4,
    },
    urlLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    urlValue: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.text,
    },
    urlHint: {
      fontSize: 12,
      color: theme.colors.muted,
    },
    buttonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    buttonPrimary: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    buttonPrimaryText: {
      color: theme.colors.onPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    buttonSecondary: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderColor: theme.colors.border,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    buttonSecondaryText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    buttonTertiary: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderColor: theme.colors.border,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      opacity: 0.98,
    },
    buttonTertiaryText: {
      color: theme.colors.muted,
      fontSize: 14,
      fontWeight: '700',
    },
    buttonPressed: {
      opacity: 0.85,
    },
    miniMuted: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.muted,
    },
    textArea: {
      minHeight: 190,
      maxHeight: 420,
      borderRadius: 14,
      borderColor: theme.colors.border,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
      padding: 12,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    footerHint: {
      fontSize: 12,
      color: theme.colors.muted,
      lineHeight: 18,
    },
    footer: {
      paddingTop: 6,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      color: theme.colors.muted,
    },
  });
}

function isUsefulIpAddress(ip: string): boolean {
  if (!ip) return false;
  if (ip === '0.0.0.0') return false;
  if (ip === '127.0.0.1') return false;
  if (ip === '::1') return false;
  if (ip.includes('%')) return false;
  return true;
}
