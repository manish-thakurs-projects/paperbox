import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";

const WEBSITE_URL = "https://paperbox.dustmedia.org";
const CONTACT_EMAIL = "dustmedianetwork@gmail.com";
const EFFECTIVE_DATE = "August 18, 2026";

export function PrivacyPolicyScreen() {
  const { colors } = usePaperTheme();
  const s = styles(colors);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Privacy Policy</Text>
      <Text style={s.meta}>Effective date: {EFFECTIVE_DATE}</Text>

      <Text style={s.sectionTitle}>Summary</Text>
      <Text style={s.paragraph}>
        PaperBox is an offline-first personal document vault. It is designed so
        your files stay on your device unless you explicitly share, export, or
        open them in another app. PaperBox does not create user accounts, does
        not sync your vault to a server, and does not use analytics or crash
        reporting by default. DustMedia maintains the app and website at{" "}
        <Text
          style={s.link}
          onPress={() => void Linking.openURL(WEBSITE_URL)}
        >
          paperbox.dustmedia.org
        </Text>
        .
      </Text>

      <Text style={s.sectionTitle}>What PaperBox stores</Text>
      <Text style={s.paragraph}>
        When you import or capture a file, PaperBox saves an encrypted copy in
        the vault on your device. It also stores the local metadata needed to
        organize the vault, such as file names, folder membership, favorites,
        pinned state, tags, file types, sizes, and timestamps. App settings are
        stored locally on the device as well.
      </Text>

      <Text style={s.sectionTitle}>Temporary processing</Text>
      <Text style={s.paragraph}>
        To make features like import, preview, share, download, and export work,
        PaperBox may create temporary copies in app cache or other
        app-accessible storage. For example, imported files may be copied to
        cache before they are encrypted, and files may be decrypted temporarily
        for preview, sharing, or downloading. The app attempts to remove those
        temporary copies after the action finishes. If you share or export a
        file, copies may remain in the destination app, download folder, email
        draft, or on the recipient&apos;s device according to that app or
        service&apos;s policies.
      </Text>

      <Text style={s.sectionTitle}>Permissions and system services</Text>
      <Text style={s.paragraph}>
        PaperBox may request camera, file, storage, sharing, and local
        authentication access only when you use the related feature. When you
        use a camera screen, file picker, biometric prompt, share sheet, or
        system folder picker, those features are handled by the operating system
        or a native system component, and their own privacy practices apply.
      </Text>

      <Text style={s.sectionTitle}>Biometric lock</Text>
      <Text style={s.paragraph}>
        If you enable app lock, PaperBox uses the device&apos;s built-in
        biometric or device credential prompt. PaperBox does not receive or
        store your biometric template or passcode.
      </Text>

      <Text style={s.sectionTitle}>Retention and deletion</Text>
      <Text style={s.paragraph}>
        Your vault stays on the device until you delete files or remove the app.
        Deleting a file from PaperBox removes the encrypted copy from the app&apos;s
        vault, but OS caches, backups, system trash, or copies created outside
        the app may remain until they are cleared by the operating system or
        another app.
      </Text>

      <Text style={s.sectionTitle}>Third-party libraries</Text>
      <Text style={s.paragraph}>
        PaperBox uses open-source libraries and platform services to provide
        document scanning, camera access, file system access, navigation, PDF
        rendering, and sharing. These components run locally on your device and
        are used only to provide the feature you requested. PaperBox does not
        intentionally send your vault contents to our servers.
      </Text>

      <Text style={s.sectionTitle}>External links</Text>
      <Text style={s.paragraph}>
        The app includes links to the PaperBox website and email support
        address. If you open them, your browser or mail app handles the request
        under its own privacy policy.
      </Text>

      <Text style={s.sectionTitle}>Changes to this policy</Text>
      <Text style={s.paragraph}>
        If we update this policy, we will replace the text in the app and
        update the effective date.
      </Text>

      <Text style={s.sectionTitle}>Contact</Text>
      <Text style={s.paragraph}>
        Questions about privacy or ownership? Email{" "}
        <Text
          style={s.link}
          onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        >
          {CONTACT_EMAIL}
        </Text>{" "}
        or visit{" "}
        <Text
          style={s.link}
          onPress={() => void Linking.openURL(WEBSITE_URL)}
        >
          paperbox.dustmedia.org
        </Text>
        .
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: c.text,
      marginBottom: 8,
    },
    meta: {
      fontSize: 13,
      color: c.secondary,
      marginBottom: 18,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
      marginTop: 14,
      marginBottom: 6,
    },
    paragraph: {
      color: c.secondary,
      lineHeight: 20,
      marginBottom: 2,
    },
    link: {
      color: c.accent,
      textDecorationLine: "underline",
    },
  });
