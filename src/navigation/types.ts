export type RootStackParams = {
  Vault: undefined;
  Search: undefined;
  FileDetail: { fileId: string };
  FolderDetail: { folderId: string };
  Preview: { fileId: string };
  CameraCapture: { mode: "photo" | "pdf" };
  PdfReview: { imageUris: string[] };
  Tags: undefined;
};

export type BottomTabParams = {
  Home: undefined;
  Folders: undefined;
  Camera: undefined;
  Favorites: undefined;
  Settings: undefined;
};
