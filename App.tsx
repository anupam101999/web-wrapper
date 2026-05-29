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

const INJECTED_JS = `
(function () {
  true;
})();
`.trim();

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const waitingRef = useRef(false);
  const webReadyRef = useRef(false);

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
