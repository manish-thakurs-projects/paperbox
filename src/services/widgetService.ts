import { NativeModules, Platform } from "react-native";
import type { Folder } from "../types";

export type PendingWidgetAction =
  | { action: "paperbox.widget.SCAN" }
  | { action: "paperbox.widget.CREATE_PDF" }
  | { action: "paperbox.widget.IMPORT" }
  | { action: "paperbox.widget.OPEN_FOLDER"; folderId: string };

type PaperBoxWidgetsModule = {
  getPendingAction?: () => Promise<PendingWidgetAction | null>;
  setFolders?: (folders: Array<{ id: string; name: string }>) => Promise<void>;
};

const getModule = () =>
  Platform.OS === "android"
    ? (NativeModules.PaperBoxWidgets as PaperBoxWidgetsModule | undefined)
    : undefined;

export async function consumePendingWidgetAction(): Promise<PendingWidgetAction | null> {
  const module = getModule();
  if (!module?.getPendingAction) return null;

  try {
    return await module.getPendingAction();
  } catch {
    return null;
  }
}

export async function syncWidgetFolders(folders: Folder[]): Promise<void> {
  const module = getModule();
  if (!module?.setFolders) return;

  try {
    await module.setFolders(folders.map(({ id, name }) => ({ id, name })));
  } catch {
    // Widgets are an optional surface; vault operations must not depend on them.
  }
}
