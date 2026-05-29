import React, { useEffect, useRef } from "react";
import {
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { WebView } from "react-native-webview";

const APP_URL = "https://calcutta-canvas-space.vercel.app/";

const webFrameStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: "100%",
  border: "none",
};

const INJECTED_JS = `
(function () {
  true;
})();
`.trim();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if (Constants.executionEnvironment === "storeClient") {
    console.log("Push notifications are skipped in Expo Go.");
    return null;
  }

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Notification permission not granted.");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  console.log("Expo push token:", token.data);
  return token.data;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const waitingRef = useRef(false);
  const pushTokenRef = useRef<string | null>(null);
  const webReadyRef = useRef(false);
  const lastSentTokenRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendPushTokenToWeb = (token: string | null) => {
    if (lastSentTokenRef.current === token) return;
    // Nothing to send or WebView not mounted
    if (!token || !webViewRef.current) return;
    // Wait for the web app's listener to be attached.
    if (!webReadyRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: "PUSH_TOKEN",
        token,
        platform: Platform.OS,
        deviceName: Device.deviceName || "",
      }),
    );
    lastSentTokenRef.current = token;
    console.log("Push token sent to web:", token);
  };

  // Retry sender: WEB_READY can arrive before Expo finishes resolving the token.
  // Polls every 300ms for up to 10s, then gives up.
  const scheduleTokenRetry = () => {
    if (retryTimerRef.current) return; // already scheduled
    let attempts = 0;
    const MAX_ATTEMPTS = 33; // ~10 seconds

    const tick = () => {
      if (lastSentTokenRef.current === pushTokenRef.current) return;
      if (pushTokenRef.current) {
        sendPushTokenToWeb(pushTokenRef.current);
        if (lastSentTokenRef.current === pushTokenRef.current) return;
      }
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        retryTimerRef.current = setTimeout(tick, 300);
      } else {
        console.log("Push token never resolved — giving up.");
      }
    };

    retryTimerRef.current = setTimeout(tick, 300);
  };

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      pushTokenRef.current = token;
      // Try to send immediately if web is already ready
      sendPushTokenToWeb(token);
      // If web isn't ready yet, WEB_READY will pick it up.
    });

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // ── Android back / side-slide gesture ──────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const triggerWebBack = () => {
      if (waitingRef.current) return true;

      if (webViewRef.current && webReadyRef.current) {
        waitingRef.current = true;

        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              if (typeof window.__rnBackPress === 'function') {
                window.__rnBackPress();
              } else {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({ type: "BACK_AT_ROOT" })
                );
              }
            } catch(e) {
              window.ReactNativeWebView.postMessage(
                JSON.stringify({ type: "BACK_AT_ROOT" })
              );
            }
            true;
          })();
        `);

        setTimeout(() => {
          waitingRef.current = false;
        }, 500);
      } else {
        BackHandler.exitApp();
      }

      return true;
    };

    const sub = BackHandler.addEventListener(
      "hardwareBackPress",
      triggerWebBack,
    );
    return () => sub.remove();
  }, []);

  // ── Messages from the web app ───────────────────────────────────────────
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "BACK_AT_ROOT") {
        waitingRef.current = false;
        BackHandler.exitApp();
        return;
      }

      if (data.type === "BACK_HANDLED") {
        waitingRef.current = false;
        return;
      }

      if (data.type === "CALL") {
        Linking.openURL(data.phone);
        return;
      }

      if (data.type === "WEB_READY") {
        webReadyRef.current = true;
        if (pushTokenRef.current) {
          // Token already resolved — send immediately
          sendPushTokenToWeb(pushTokenRef.current);
        } else {
          // Token still resolving — poll until it's ready
          scheduleTokenRetry();
        }
        return;
      }
    } catch (e) {
      console.log("WebView message error:", e);
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? (
        <iframe src={APP_URL} style={webFrameStyle} />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          onLoadStart={() => {
            webReadyRef.current = false;
            lastSentTokenRef.current = null;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
          }}
          onLoadEnd={() => {
            // Wait for WEB_READY before posting the token. onLoadEnd can fire
            // before the React app has attached its message listener.
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          setSupportMultipleWindows={false}
        />
      )}
      <StatusBar barStyle="dark-content" backgroundColor="#f5ede1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5ede1" },
  webview: { flex: 1 },
});
