import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";

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

      {/* Prepare WebView source depending on URI scheme. Remote URLs use Google viewer. Local PDFs are rendered with PDF.js inside an HTML blob so WebView can show them on Android/iOS. */}
      {(() => {
        const [webHtml, setWebHtml] = React.useState<string | null>(null);
        const [remoteUri, setRemoteUri] = React.useState<string | null>(null);

        React.useEffect(() => {
          let mounted = true;

          async function prepare() {
            setLoading(true);
            try {
              if (/^https?:\/\//i.test(uri)) {
                // Remote URL: use Google Docs viewer for web-hosted PDFs
                if (mounted) setRemoteUri(`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(uri)}`);
                return;
              }

              // Local file: ensure file:// prefix when appropriate and read as base64
              let path = uri as string;
              if (!/^file:\/\//i.test(path) && !/^content:\/\//i.test(path)) {
                path = path.startsWith('/') ? `file://${path}` : path;
              }

              const encodingOpt: any = (FileSystem as any).EncodingType ? (FileSystem as any).EncodingType.Base64 : 'base64';
              const base64 = await (FileSystem as any).readAsStringAsync(path, { encoding: encodingOpt });

              if (!mounted) return;

              // Build an HTML viewer that uses PDF.js to render the base64 PDF into a canvas.
              // Use CDN-hosted pdfjs; if offline support is required, bundle pdfjs locally.
              const safeBase64 = base64.replace(/<\/script>/g, '<\\/script>');
              const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{height:100%;margin:0;background:#fff}#canvas{display:block;margin:0 auto;max-width:100%;}</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script src="https://unpkg.com/pdfjs-dist/build/pdf.min.js"></script>
<script>
  pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';
  function base64ToUint8Array(base64) {
    var raw = atob(base64);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));
    for (var i = 0; i < rawLength; ++i) {
      array[i] = raw.charCodeAt(i);
    }
    return array;
  }
  var pdfData = base64ToUint8Array('${safeBase64}');
  pdfjsLib.getDocument({data: pdfData}).promise.then(function(pdf) {
    return pdf.getPage(1).then(function(page) {
      var scale = Math.max(1, window.devicePixelRatio || 1);
      var viewport = page.getViewport({scale: scale});
      var canvas = document.getElementById('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var context = canvas.getContext('2d');
      var renderContext = { canvasContext: context, viewport: viewport };
      page.render(renderContext);
    });
  }).catch(function(err){
    document.body.innerHTML = '<div style="padding:20px">PDF rendering error: ' + (err && err.toString ? err.toString() : 'unknown') + '</div>';
  });
</script>
</body>
</html>`;

              setWebHtml(html);
            } catch (e) {
              if (mounted) {
                setWebHtml(null);
                handleError(e);
              }
            } finally {
              if (mounted) setLoading(false);
            }
          }

          prepare();
          return () => { mounted = false; };
        }, [uri]);

        if (remoteUri) {
          return (
            <WebView
              originWhitelist={["*"]}
              source={{ uri: remoteUri }}
              onLoadEnd={() => setLoading(false)}
              onError={(syntheticEvent) => { const { nativeEvent } = syntheticEvent as any; handleError(nativeEvent); }}
              style={styles.pdf}
              allowFileAccess={true}
              javaScriptEnabled={true}
              mixedContentMode="always"
              allowUniversalAccessFromFileURLs={true}
            />
          );
        }

        if (!webHtml) {
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
            source={{ html: webHtml }}
            onLoadEnd={() => setLoading(false)}
            onError={(syntheticEvent) => { const { nativeEvent } = syntheticEvent as any; handleError(nativeEvent); }}
            style={styles.pdf}
            allowFileAccess={true}
            javaScriptEnabled={true}
            mixedContentMode="always"
            allowUniversalAccessFromFileURLs={true}
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
