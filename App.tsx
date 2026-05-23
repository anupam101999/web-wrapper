import React, { useEffect, useRef } from "react";
import {
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const APP_URL = "https://calcutta-canvas-space.vercel.app/";

const webFrameStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: "100%",
  border: "none",
};

// Runs before any page JS.
// Registers window.__rnBackPress which App.jsx (web) also sets up.
// Having it here too means it works even if the web app's hook
// hasn't mounted yet (e.g. during page load).
const INJECTED_JS = `
(function () {
  true;
})();
`.trim();

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const waitingRef = useRef(false);
  // Track whether the web app is ready to receive messages
  const webReadyRef = useRef(false);

  // ── Android back / side-slide gesture ──────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const triggerWebBack = () => {
      if (waitingRef.current) return true; // debounce

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

        // Safety: reset if no reply within 500ms
        setTimeout(() => {
          waitingRef.current = false;
        }, 500);
      } else {
        // WebView not ready yet — just minimize
        BackHandler.exitApp();
      }

      return true; // always intercept
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
          // Mark web as ready once the page finishes loading
          onLoadEnd={() => {
            webReadyRef.current = true;
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
