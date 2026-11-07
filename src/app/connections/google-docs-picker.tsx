import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { getGoogleDocsPickerUrl } from '../../connections/api';
import { useConnectionsState } from '../../connections/ConnectionsStateContext';
import { colors } from '../../components/theme';

// Must exactly match google-picker.html's PICKER_REDIRECT_URI. Runs in the
// system browser via openAuthSessionAsync, same as the OAuth sign-in flow
// (see src/connections/oauth.ts) -- an embedded in-app WebView can't
// reliably get Google's own account/session check to pass inside gapi's
// picker bootstrap, regardless of cookie settings, which is the same
// restriction that already made the sign-in flow use the system browser.
const PICKER_REDIRECT_URI = 'sortme://picker-redirect';

export default function GoogleDocsPickerScreen() {
  const router = useRouter();
  const { importGoogleDocs } = useConnectionsState();
  // This effect opens a browser session as its side effect; it must run
  // exactly once even if the effect fires twice (e.g. React StrictMode).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const { pickerUrl } = await getGoogleDocsPickerUrl();
        const result = await WebBrowser.openAuthSessionAsync(pickerUrl, PICKER_REDIRECT_URI);
        if (result.type !== 'success' || !result.url) {
          router.back();
          return;
        }

        const redirectUrl = new URL(result.url);
        const error = redirectUrl.searchParams.get('error');
        if (error) {
          Alert.alert('Picker error', error);
          router.back();
          return;
        }
        if (redirectUrl.searchParams.get('cancelled')) {
          router.back();
          return;
        }

        const fileIds = (redirectUrl.searchParams.get('fileIds') ?? '').split(',').filter(Boolean);
        if (fileIds.length === 0) {
          router.back();
          return;
        }

        try {
          await importGoogleDocs(fileIds);
        } catch {
          Alert.alert('Import failed', 'Could not import the selected document(s). You can retry from the Google Docs screen.');
        }
        router.back();
      } catch (e) {
        Alert.alert('Could not start the picker', e instanceof Error ? e.message : 'Unknown error');
        router.back();
      }
    })();
  }, [importGoogleDocs, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
