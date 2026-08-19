import {
  createNavigationContainerRef,
} from "@react-navigation/native";
import { RootStackParams } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParams>();
