/**
 * English Learning App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect} from 'react';
import {LogBox, StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import {initStorageSync} from './src/services/storageService';
import {preloadEssentialData} from './src/services/appDataBootstrap';

if (__DEV__) {
  // Ẩn cảnh báo deprecations của RNFirebase namespaced API để không spam LogBox.
  LogBox.ignoreLogs([
    'This method is deprecated (as well as all React Native Firebase namespaced API)',
    'Please see migration guide for more details: https://rnfirebase.io/migrating-to-v22',
  ]);
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    void (async () => {
      try {
        await initStorageSync();
      } catch (_) {}
      // Preload sớm 1 lần để các màn mở ra có dữ liệu ngay.
      void preloadEssentialData().catch(() => {});
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default App;
