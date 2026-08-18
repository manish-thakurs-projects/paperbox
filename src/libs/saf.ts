import { NativeModules } from "react-native";

const { SAFModule } = NativeModules as { SAFModule?: any };

const pickFolder = async (): Promise<string> => {
  if (!SAFModule || !SAFModule.pickFolder)
    throw new Error("SAFModule not available");
  return await SAFModule.pickFolder();
};

const writeFileToTree = async (
  treeUri: string,
  relativePath: string,
  base64Data: string,
): Promise<boolean> => {
  if (!SAFModule || !SAFModule.writeFileToTree)
    throw new Error("SAFModule not available");
  return await SAFModule.writeFileToTree(treeUri, relativePath, base64Data);
};

const readFileFromTree = async (
  treeUri: string,
  relativePath: string,
): Promise<string> => {
  if (!SAFModule || !SAFModule.readFileFromTree)
    throw new Error("SAFModule not available");
  return await SAFModule.readFileFromTree(treeUri, relativePath);
};

export default {
  pickFolder,
  writeFileToTree,
  readFileFromTree,
};
