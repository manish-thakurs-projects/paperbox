# Contributing to PaperBox

Thank you for your interest in contributing to PaperBox! We welcome contributions from the community. This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions with other contributors and maintainers.

## How to Contribute

### Reporting Issues

- **Security Issues**: Please report security vulnerabilities privately to the maintainer rather than posting them publicly with exploit details.
- **Bug Reports**: Include a clear description, steps to reproduce, and the expected vs actual behavior.
- **Feature Requests**: Describe the feature, why it's useful, and how it would work.

### Pull Requests

1. **Fork the repository** and create a new branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow the code style** and conventions used in the project:
   - Use TypeScript for all TypeScript code
   - Use Kotlin for native Android modules
   - Run `npm run typecheck` before submitting

3. **Keep commits clean and focused**:
   - Make small, focused commits with clear messages
   - Avoid mixing unrelated changes in a single PR
   - Don't commit generated build output or personal data

4. **Test your changes**:
   - Test on Android development and release builds when possible
   - Run type checks: `npm run typecheck`
   - Run code quality checks: `git diff --check`

5. **Write clear descriptions**:
   - Explain what your PR does and why
   - Reference relevant issues
   - Include any breaking changes or migration steps

6. **Submit your PR**:
   - Target the `main` branch
   - Include a clear title and description
   - Be ready to address feedback and iterate

## Development Setup

### Prerequisites

- Node.js (version supported by Expo SDK 54)
- Android SDK
- JDK supported by the Android Gradle plugin

### Getting Started

```bash
# Install dependencies
npm ci

# Type check
npm run typecheck

# Start development server
npx expo start

# Run on Android
npx expo run:android
```

## Project Structure

- `src/screens` - User-facing screens
- `src/services` - Vault, import, sharing, download, PDF, and widget services
- `src/store` - Local application state
- `src/components` - Reusable UI components
- `android/app/src/main` - Native Android activity, widgets, and SAF integration

## Best Practices

- **Don't commit sensitive data**: Never commit signing keys, passwords, certificates, or environment files
- **Security first**: Consider privacy and security implications of changes
- **Documentation**: Update documentation when adding features
- **Performance**: Consider the impact on app performance and battery usage
- **Accessibility**: Ensure changes are accessible to all users

## Licensing

By contributing to PaperBox, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue for questions or discussions about contributing.

Thank you for helping make PaperBox better! 🙏
