import { NativeModules, Platform } from "react-native";

export type IncomingPdf = {
  uri: string;
  name: string;
  mimeType: string;
};

export async function consumeIncomingPdf(): Promise<IncomingPdf | null> {
  if (Platform.OS !== "android") return null;

  const module = NativeModules.IncomingPdf as
    | { getPendingPdf?: () => Promise<IncomingPdf | null> }
    | undefined;
  if (!module?.getPendingPdf) return null;

  try {
    return await module.getPendingPdf();
  } catch {
    return null;
  }
}
