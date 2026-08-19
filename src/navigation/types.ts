import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParams = {
  Vault: NavigatorScreenParams<BottomTabParams> | undefined;
  Search: undefined;
  FileDetail: { fileId: string };
  FolderDetail: { folderId: string };
  Preview: {
    fileId?: string;
    externalUri?: string;
    externalName?: string;
    externalMimeType?: string;
  };
  PdfReview: { imageUris?: string[]; draftId?: string };
  AllFiles: undefined;
  CapturedFiles: undefined;
  Privacy: undefined;
};

export type BottomTabParams = {
  Home: { widgetAction?: "import" } | undefined;
  Folders: undefined;
  Camera: { widgetAction?: "scan" | "createPdf" } | undefined;
  Favorites: undefined;
  Settings: undefined;
};
