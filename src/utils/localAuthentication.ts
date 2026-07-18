import * as LocalAuthentication from "expo-local-authentication";

export async function checkLocalAuthenticationAvailable(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return Boolean(hasHardware && isEnrolled);
  } catch {
    return false;
  }
}

export async function authenticateWithLocalAuthentication(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Paper Box",
      fallbackLabel: "Use device credential",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    return { success: false, error: result.error ?? "Authentication was not completed." };
  } catch (error: any) {
    return { success: false, error: error?.message ?? "Unable to authenticate securely." };
  }
}
