import React from "react";
import { Linking, Platform, StatusBar, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

const APP_URL = "https://calcutta-canvas-space.vercel.app/";
const webFrameStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: "100%",
  border: "none",
};

export default function App() {
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "CALL") {
        Linking.openURL(data.phone);
      }
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? (
        <iframe src={APP_URL} style={webFrameStyle} />
      ) : (
        <WebView
          source={{ uri: APP_URL }}
          style={styles.webview}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          setSupportMultipleWindows={false}
          onMessage={handleMessage}
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
