import React, { useState } from "react";
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import Pdf from "react-native-pdf";

type Props = {
  uri: string;
  filename?: string;
  onError?: (err: any) => void;
  onOpenExternal?: () => void;
  showOpenExternal?: boolean; // if false, hide the footer "Open in other app" button
};

export default function PdfViewer({ uri, filename, onError, onOpenExternal, showOpenExternal = true }: Props) {
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

      <Pdf
        source={{ uri, cache: false }}
        onLoadComplete={(n: number) => handleLoadComplete(n)}
        onError={(e: any) => handleError(e)}
        onPageChanged={(p: number) => setPage(p)}
        style={styles.pdf}
      />

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
