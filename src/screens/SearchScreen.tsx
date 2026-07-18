import React, { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { EmptyState } from "../components/EmptyState";
import { palette } from "../theme/tokens";
import { useVaultStore } from "../store/useVaultStore";
import { RootStackParams } from "../navigation/types";

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<TextInput | null>(null);
  const files = useVaultStore((s) => s.files);

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
      <Text style={s.title}>Search</Text>
      <View style={s.box}>
        <Feather name="search" size={19} color={palette.secondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          autoFocus
          placeholder="Search files and tags"
          placeholderTextColor={palette.secondary}
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
                <Feather name="clock" size={16} color={palette.secondary} />
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
const s = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
    color: palette.black,
    marginBottom: 24,
  },
  box: {
    height: 52,
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  input: { fontSize: 15, color: palette.black, flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: palette.secondary,
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
    borderColor: palette.border,
  },
  recentText: {
    fontSize: 15,
    color: palette.black,
  },
  clearText: {
    fontSize: 13,
    color: palette.black,
    fontWeight: "600",
  },
});
