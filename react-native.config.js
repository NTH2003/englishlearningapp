/**
 * Project-level React Native CLI config.
 * Đăng ký lệnh run-android / run-ios từ @react-native-community/cli-platform-*.
 */
let androidCommands = [];
let iosCommands = [];
let androidPlatform = null;
let iosPlatform = null;

try {
  const android = require('@react-native-community/cli-platform-android');
  androidCommands = android.commands || [];
  androidPlatform = { projectConfig: android.projectConfig, dependencyConfig: android.dependencyConfig };
} catch (e) {
  console.warn('@react-native-community/cli-platform-android not found:', e.message);
}

try {
  const ios = require('@react-native-community/cli-platform-ios');
  iosCommands = ios.commands || [];
  iosPlatform = { projectConfig: ios.projectConfig, dependencyConfig: ios.dependencyConfig };
} catch (e) {
  console.warn('@react-native-community/cli-platform-ios not found:', e.message);
}

module.exports = {
  project: {
    android: {},
    ios: {},
  },
  dependencies: {},
  commands: [...androidCommands, ...iosCommands],
  platforms: {
    ...(androidPlatform && { android: androidPlatform }),
    ...(iosPlatform && { ios: iosPlatform }),
  },
};
