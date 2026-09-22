# PaperBox

PaperBox is an offline-first document vault for Android. It helps you scan
paper documents, import files, turn pages into PDFs, and keep everything
organized in one private place.

The app is designed around a simple idea: your documents should stay on your
device unless you deliberately share, download, or open them somewhere else.

## What it can do

- Scan documents with the camera and save them to the vault.
- Build PDFs from one or more captured pages, with drafts and page reordering.
- Import documents through Android's system file picker.
- Preview PDFs, images, video, audio, and supported Office files.
- Convert Office files to PDF when the user asks to view them.
- Organize files with folders, favorites, pins, tags, and search.
- Share and download files through Android's system services.
- Accept PDFs opened from another app.
- Provide Android home-screen widgets for scanning, importing, creating PDFs,
  and opening folders.
- Follow the device light/dark theme.

## Privacy and security

PaperBox does not require an account and does not sync the vault to a server.
Vault metadata is stored locally, and vault file contents are encrypted with
AES-GCM. The encryption key is kept in Android Secure Storage in production
builds. Temporary plaintext files can exist while a file is being previewed,
shared, downloaded, or converted; the app removes those temporary copies when
the operation finishes.

The app uses the camera when you scan and Android's system picker when you
import a file. It does not need broad photo-library read permission. Files can
leave the vault only when you choose an export, share, download, or external-app
action; the receiving app or destination then controls its own copy.

This repository intentionally does not contain signing keys, passwords, upload
certificates, release bundles, or local environment files. Create those locally
when building your own release.

## Tech stack

- Expo SDK 54 and React Native 0.81
- TypeScript
- React Navigation and Zustand
- Native Android Kotlin modules for widgets and Storage Access Framework support
- `react-native-pdf`, `pdf-lib`, OpenCV, and Expo modules for document features

## Getting started

Install Node.js (the project uses the versions supported by Expo SDK 54), the
Android SDK, and a JDK supported by the Android Gradle plugin.

```powershell
npm ci
npm run typecheck
npx expo start
```

To run the native Android development build:

```powershell
npx expo run:android
```

The first native build may take several minutes while Gradle and the native
modules are compiled.

## Release builds

PaperBox is currently configured as package `paperbox.dustmedia.org`, version
`1.0.2`, Android version code `6`.

For a signed release build, create `android/key.properties` locally and keep it
out of Git:

```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=YOUR_KEY_ALIAS
storeFile=release.keystore
```

Place the matching keystore at `android/app/release.keystore`, or change the
local `storeFile` value. Never reuse a keystore from an unknown source, and
never publish its password. Verify the certificate fingerprint against the
signing key registered in Google Play before uploading.

Build an Android App Bundle with:

```powershell
cd android
.\gradlew.bat bundleRelease
```

The bundle is written to
`android/app/build/outputs/bundle/release/app-release.aab`.

## Useful checks

```powershell
npm run typecheck
git diff --check
```

Before publishing, also inspect the generated release manifest and scan the
repository for accidental credentials. Do not commit files from `android/app`
that match signing-key, certificate, APK/AAB, or environment-file patterns.

## Project shape

- `src/screens` contains the user-facing screens.
- `src/services` contains vault, import, sharing, download, PDF, and widget
  services.
- `src/store` contains local application state.
- `src/components` contains reusable UI components.
- `android/app/src/main` contains the native Android activity, widgets, and SAF
  integration.

## Contributions

Small, focused pull requests are welcome. Please include a short explanation,
run the typecheck, and avoid adding generated build output or personal data.
Security issues should be reported privately to the maintainer rather than
posted publicly with exploit details.

## License

This project is open-source and licensed under the [MIT License](LICENSE). See the LICENSE file for details.
