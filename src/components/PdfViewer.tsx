import React, { useState } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import Pdf from "react-native-pdf";
import { PaperColors } from "../theme/usePaperTheme";

type Props = {
  uri: string;
  filename?: string;
  colors: PaperColors;
  onError?: (err: any) => void;
  onOpenExternal?: () => void;
  showOpenExternal?: boolean;
};

export default function PdfViewer({
  uri,
  filename,
  colors,
  onError,
  onOpenExternal,
  showOpenExternal = true,
}: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [numberOfPages, setNumberOfPages] = useState<number>(0);

  const handleLoadComplete = (pageCount: number) => {
    setNumberOfPages(pageCount);
    setLoading(false);
  };

  const handleError = (e: any) => {
    setLoading(false);
    if (onError) onError(e);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading PDF...
          </Text>
        </View>
      )}

      <Pdf
        source={{ uri, cache: false }}
        onLoadComplete={(n: number) => handleLoadComplete(n)}
        onError={(e: any) => handleError(e)}
        onPageChanged={(p: number) => setPage(p)}
        style={[styles.pdf, { backgroundColor: colors.background }]}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.pageLabel, { color: colors.text }]} numberOfLines={1}>
          {filename ? `${filename} · ` : ""}
          {numberOfPages > 0 ? `Page ${page} of ${numberOfPages}` : `Page ${page}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pageLabel: {
    fontSize: 12,
    flex: 1,
    marginRight: 12,
  },
  openButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  openButtonText: {
    fontSize: 13,
  },
});
