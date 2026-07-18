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
        Paper Box is an offline first personal document vault. This Privacy Policy explains how the app collects,
        stores, and uses your data. The app is designed to keep your files on your device; no personal data is
        shared with third parties by default.
      </Text>

      <Text style={s.sectionTitle}>Data collection and storage</Text>
      <Text style={s.paragraph}>
        Files you add to Paper Box — whether captured with the in app camera or imported from other sources — are
        stored locally on your device. Paper Box stores only the files and metadata necessary for the app to
        function (file names, URIs, timestamps, tags). The app does not upload your files to any server unless you
        explicitly use an export or share feature.
      </Text>

      <Text style={s.sectionTitle}>Passcode</Text>
      <Text style={s.paragraph}>
        If you choose to set an app passcode, Paper Box stores a cryptographic hash of the passcode. The app uses
        a SHA-256 hash to verify the passcode locally; the plaintext passcode is never stored. This helps protect
        your passcode from disclosure, but the stored hash is not kept in secure hardware — for maximum security,
        consider using a device level secure storage solution.
      </Text>

      <Text style={s.sectionTitle}>Biometric authentication</Text>
      <Text style={s.paragraph}>
        When enabled, biometric authentication uses your device's biometric APIs (fingerprint / face) to unlock the
        app. Biometrics are performed by the device's system; the app does not receive your biometric data. The
        biometric setting only controls whether the device prompt is offered as an unlock option.
      </Text>

      <Text style={s.sectionTitle}>Exports and sharing</Text>
      <Text style={s.paragraph}>
        Exporting or sharing files will create an export file or invoke the system share sheet. When you share or
        export, you explicitly send files or export packages to other apps or services — Paper Box does not
        transfer data without your explicit action.
      </Text>

      <Text style={s.sectionTitle}>Crash reporting & analytics</Text>
      <Text style={s.paragraph}>
        Paper Box does not include analytics or crash reporting by default. If you enable any diagnostic or
        sharing features that send logs externally, the app will warn you and ask for confirmation.
      </Text>

      <Text style={s.sectionTitle}>Third-party libraries</Text>
      <Text style={s.paragraph}>
        Paper Box uses open source libraries to provide functionality (camera, file system access, navigation).
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
        The app uses local encryption primitives where applicable and stores passcode hashes rather than plaintext
        secrets. However, passcode hashes and files are stored in app storage and are not protected by device
        hardware by default. For stronger protection, use device level encryption and secure storage provided by the
        OS.
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
