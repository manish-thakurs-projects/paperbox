import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system";

type Props = {
  uri: string;
  filename?: string;
  onError?: (err: any) => void;
  onOpenExternal?: () => void;
};

export default function PdfViewer({ uri, filename, onError, onOpenExternal }: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [numberOfPages, setNumberOfPages] = useState<number>(0);

  const source = { uri, cache: true } as any;

  const handleLoadComplete = (pageCount: number) => {
    setNumberOfPages(pageCount);
    setLoading(false);
  };

  const handleError = (e: any) => {
    setLoading(false);
    if (onError) onError(e);
  };

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading PDF…</Text>
        </View>
      )}

      {/* WebView source prepared depending on URI scheme: remote URLs use Google viewer, local files are loaded as base64 data URL */}
      {(() => {
        const [webUri, setWebUri] = React.useState<string | null>(null);
        React.useEffect(() => {
          let mounted = true;
          async function prepare() {
            setLoading(true);
            try {
              if (/^https?:\/\//i.test(uri)) {
                // Remote URL: use Google Docs viewer which can render PDFs hosted on the web
                if (mounted) setWebUri(`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(uri)}`);
                return;
              }

              // Local file URIs: read as base64 and load as data URL so the WebView can render the PDF
              try {
                let path = uri;
                if (!/^file:\/\//i.test(path) && !/^content:\/\//i.test(path)) {
                  // Ensure file:// prefix when possible
                  path = path.startsWith('/') ? `file://${path}` : path;
                }

                // Attempt to read local file as base64. This works for file:// URIs on Android/iOS.
                const base64 = await (FileSystem as any).readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
                if (mounted) setWebUri(`data:application/pdf;base64,${base64}`);
              } catch (e) {
                // If reading local file fails, surface the error and don't set a webUri so caller can fallback
                if (mounted) {
                  setWebUri(null);
                  handleError(e);
                }
              }
            } finally {
              if (mounted) setLoading(false);
            }
          }

          prepare();
          return () => { mounted = false; };
        }, [uri]);

        if (!webUri) {
          // No prepared URL -> show fallback UI that allows opening externally (PreviewScreen already provides a fallback too)
          return (
            <View style={[styles.pdf, { justifyContent: "center", alignItems: "center" }]}>
              <Text style={{ marginBottom: 8 }}>Unable to render PDF in-app.</Text>
              {onOpenExternal ? (
                <TouchableOpacity style={styles.openButton} onPress={onOpenExternal}>
                  <Text style={styles.openButtonText}>Open in other app</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }

        return (
          <WebView
            originWhitelist={["*"]}
            source={{ uri: webUri }}
            onLoadEnd={() => setLoading(false)}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent as any;
              handleError(nativeEvent);
            }}
            style={styles.pdf}
            allowFileAccess={true}
          />
        );
      })()}

      <View style={styles.footer}>
        <Text style={styles.pageLabel}>{page}/{numberOfPages || "?"}</Text>
        {onOpenExternal ? (
          <TouchableOpacity style={styles.openButton} onPress={onOpenExternal}>
            <Text style={styles.openButtonText}>Open in other app</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  pdf: {
    flex: 1,
    width: "100%",
  },
  loaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 8,
  },
  footer: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  pageLabel: {
    fontSize: 14,
  },
  openButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#eee",
    borderRadius: 6,
  },
  openButtonText: {
    fontSize: 14,
  },
});
