import { NativeModules, Platform } from "react-native";

type PaperBoxPdfHandlerModule = {
  shouldShowExternalPdfOption?: () => Promise<boolean>;
};

export async function shouldShowExternalPdfOption(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  try {
    const module = NativeModules.PaperBoxWidgets as
      | PaperBoxPdfHandlerModule
      | undefined;
    if (!module?.shouldShowExternalPdfOption) return true;
    return await module.shouldShowExternalPdfOption();
  } catch {
    // Keep the action available if the optional native check is unavailable.
    return true;
  }
}
