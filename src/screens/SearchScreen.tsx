import React, { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { EmptyState } from "../components/EmptyState";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { RootStackParams } from "../navigation/types";

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<TextInput | null>(null);
  const files = useVaultStore((s) => s.files);
  const s = styles(colors);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () =>
      files.filter((f) =>
        `${f.name} ${f.extension} ${f.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [files, query],
  );

  const handleSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) return;

    setRecentSearches((current) => {
      const trimmed = text.trim().toLowerCase();
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 5);
      return next;
    });
  };

  const clearRecentSearches = () => setRecentSearches([]);

  return (
    <Screen>
      <View style={s.box}>
        <Feather name="search" size={19} color={colors.secondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          autoFocus
          placeholder="Search files and tags"
          placeholderTextColor={colors.secondary}
          style={s.input}
        />
      </View>
      {query ? (
        <>
          <Text style={s.label}>{results.length} RESULTS</Text>
          {results.map((f) => (
            <FileRow key={f.id} file={f} onPress={() => navigation.navigate("Preview", { fileId: f.id })} />
          ))}
        </>
      ) : (
        <View style={s.recentWrap}>
          <View style={s.recentHeader}>
            <Text style={s.label}>RECENT SEARCHES</Text>
            {recentSearches.length > 0 ? (
              <Pressable onPress={clearRecentSearches}>
                <Text style={s.clearText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {recentSearches.length ? (
            recentSearches.map((item) => (
              <Pressable key={item} style={s.recentItem} onPress={() => handleSearch(item)}>
                <Feather name="clock" size={16} color={colors.secondary} />
                <Text style={s.recentText}>{item}</Text>
              </Pressable>
            ))
          ) : (
            <EmptyState
              icon="search"
              title="Find anything"
              body="Search by file name, type, tag, or folder."
            />
          )}
        </View>
      )}
      {query && !results.length && (
        <EmptyState
          icon="file-text"
          title="Nothing found"
          body="Try a different name or a shorter search."
        />
      )}
    </Screen>
  );
}
const styles = (c: { background: string; surface: string; elevated: string; text: string; secondary: string; border: string; muted: string; inverse: string }) =>
  StyleSheet.create({
    box: {
      height: 52,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    input: { fontSize: 15, color: c.text, flex: 1 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.secondary,
      marginTop: 26,
      marginBottom: 8,
    },
    recentWrap: {
      marginTop: 12,
    },
    recentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    recentItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    recentText: {
      fontSize: 15,
      color: c.text,
    },
    clearText: {
      fontSize: 13,
      color: c.text,
      fontWeight: "600",
    },
  });
