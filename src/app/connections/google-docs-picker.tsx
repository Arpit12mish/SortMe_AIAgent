import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { getGoogleDocsPickerUrl } from '../../connections/api';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import { colors } from '../../components/theme';

type PickerMessage = { type: 'selected'; fileIds: string[] } | { type: 'cancelled' } | { type: 'error'; message: string };

export default function GoogleDocsPickerScreen() {
  const router = useRouter();
  const { importGoogleDocs } = useConnectionsState();
  const [pickerUrl, setPickerUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getGoogleDocsPickerUrl()
      .then((res) => setPickerUrl(res.pickerUrl))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not start the picker'));
  }, []);

  const handleMessage = async (event: WebViewMessageEvent) => {
    let message: PickerMessage;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'selected') {
      if (message.fileIds.length === 0) {
        router.back();
        return;
      }
      try {
        await importGoogleDocs(message.fileIds);
      } catch {
        Alert.alert('Import failed', 'Could not import the selected document(s). You can retry from the Google Docs screen.');
      }
      router.back();
    } else if (message.type === 'cancelled') {
      router.back();
    } else if (message.type === 'error') {
      Alert.alert('Picker error', message.message);
      router.back();
    }
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.danger} />
      </View>
    );
  }

  if (!pickerUrl) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <WebView
      source={{ uri: pickerUrl }}
      onMessage={handleMessage}
      originWhitelist={['https://*']}
      style={styles.webview}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
