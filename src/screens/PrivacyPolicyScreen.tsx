import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";

export function PrivacyPolicyScreen() {
  const { colors } = usePaperTheme();
  const s = styles(colors);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      <Text style={s.sectionTitle}>Summary</Text>
      <Text style={s.paragraph}>
        PaperBox is an offline first personal document vault. This Privacy Policy explains how the app collects,
        stores, and uses your data. The app is designed to keep your files on your device; no personal data is
        shared with third parties by default.
      </Text>

      <Text style={s.sectionTitle}>Data collection and storage</Text>
      <Text style={s.paragraph}>
        Files you add to PaperBox — whether captured with the in app camera or imported from other sources — are
        stored locally on your device. PaperBox stores only the files and metadata necessary for the app to
        function (file names, URIs, timestamps, tags). The app does not upload your files to any server unless you
        explicitly use an export or share feature.
      </Text>

      <Text style={s.sectionTitle}>Local storage and security</Text>
      <Text style={s.paragraph}>
        PaperBox stores your files and metadata locally on your device. The app does not share this information
        with third parties unless you explicitly export or share files. The security of your data depends on the
        device's local protections and the app permissions you grant.
      </Text>

      <Text style={s.sectionTitle}>Biometric authentication</Text>
      <Text style={s.paragraph}>
        When app lock is enabled, PaperBox uses your device's system biometric prompt to authenticate. If biometrics
        are unavailable, the prompt can fall back to the device credential method such as passcode or PIN. The app
        does not receive biometric data directly.
      </Text>

      <Text style={s.sectionTitle}>Exports and sharing</Text>
      <Text style={s.paragraph}>
        Exporting or sharing files will create an export file or invoke the system share sheet. When you share or
        export, you explicitly send files or export packages to other apps or services — PaperBox does not
        transfer data without your explicit action.
      </Text>

      <Text style={s.sectionTitle}>Crash reporting & analytics</Text>
      <Text style={s.paragraph}>
        PaperBox does not include analytics or crash reporting by default. If you enable any diagnostic or
        sharing features that send logs externally, the app will warn you and ask for confirmation.
      </Text>

      <Text style={s.sectionTitle}>Third-party libraries</Text>
      <Text style={s.paragraph}>
        PaperBox uses open source libraries to provide functionality (camera, file system access, navigation).
        These libraries may collect runtime information as part of their normal operation. No library is expected
        to transmit your files to external servers without your explicit action.
      </Text>

      <Text style={s.sectionTitle}>Data retention and deletion</Text>
      <Text style={s.paragraph}>
        All data (files and metadata) are retained on your device until you delete them. Deleting a file through
        the app removes it from the app's vault; depending on the platform, a copy may remain in the system recycle
        bin or backups until purged by the system.
      </Text>

      <Text style={s.sectionTitle}>Security</Text>
      <Text style={s.paragraph}>
        PaperBox keeps your data on the device and avoids sharing files without your consent. Because the app
        stores information locally, use your operating system's device-level security and encryption features for
        stronger protection.
      </Text>

      <Text style={s.sectionTitle}>Changes to this policy</Text>
      <Text style={s.paragraph}>
        This Privacy Policy may be updated as the app evolves. When changes are made, the app will display an
        in app notice describing material changes.
      </Text>

      <Text style={s.sectionTitle}>Contact</Text>
      <Text style={s.paragraph}>
        For questions about privacy, contact the app developer or review the repository for implementation details.
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    title: { fontSize: 28, fontWeight: "800", color: c.text, marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: c.text, marginTop: 14, marginBottom: 6 },
    paragraph: { color: c.secondary, lineHeight: 20 },
  });

