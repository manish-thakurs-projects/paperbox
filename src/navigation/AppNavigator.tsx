import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AppTabs } from "../navigation/AppTabs";
import { FileDetailScreen } from "../screens/FileDetailScreen";
import { FolderDetailScreen } from "../screens/FolderDetailScreen";
import { PreviewScreen } from "../screens/PreviewScreen";
import { PdfReviewScreen } from "../screens/PdfReviewScreen";
import { CameraCaptureScreen } from "../screens/CameraCaptureScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { RootStackParams } from "../navigation/types";
import { palette } from "../theme/tokens";
const Stack = createNativeStackNavigator<RootStackParams>();
export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: palette.black,
        headerTitleStyle: { fontWeight: "200" },
      }}
    >
      <Stack.Screen
        name="Vault"
        component={AppTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: "Search" }}
      />
      <Stack.Screen
        name="FileDetail"
        component={FileDetailScreen}
        options={{ title: "File details" }}
      />
      <Stack.Screen
        name="FolderDetail"
        component={FolderDetailScreen}
        options={{ title: "Folder" }}
      />
      <Stack.Screen
        name="Preview"
        component={PreviewScreen}
        options={{ title: "Preview" }}
      />
      <Stack.Screen
        name="CameraCapture"
        component={CameraCaptureScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PdfReview"
        component={PdfReviewScreen}
        options={{ title: "Review pages" }}
      />
    </Stack.Navigator>
  );
}
