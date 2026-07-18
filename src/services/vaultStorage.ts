import AsyncStorage from "@react-native-async-storage/async-storage";
import { Folder, VaultFile } from "../types";
const KEY = "@paper-box/v1";
export async function loadVault(): Promise<{
  files: VaultFile[];
  folders: Folder[];
}> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : { files: [], folders: [] };
}
export async function saveVault(data: {
  files: VaultFile[];
  folders: Folder[];
}) {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}
