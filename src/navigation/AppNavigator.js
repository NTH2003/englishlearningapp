import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Alert, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TabBarVectorIcon} from '../components/TabBarVectorIcons';
import {NavigationContainer, getFocusedRouteNameFromRoute} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {getApp} from '@react-native-firebase/app';
import {getAuth, onIdTokenChanged} from '@react-native-firebase/auth';
import {
  HomeScreen,
  ProfileScreen,
  LearningPathScreen,
  LearnedVocabularyScreen,
  LoginScreen,
  RegisterScreen,
  VocabularyRootScreen,
  VocabularyFlashcardScreen,
  FlashcardResultScreen,
  VocabularyQuizScreen,
  VocabularyTypingScreen,
  VocabularyListeningScreen,
  VocabularyQuickChallengeScreen,
  VocabularyTopicDetailScreen,
  VideoSelectionScreen,
  VideoLearningScreen,
  DialogueIntroScreen,
  DialoguePracticeScreen,
} from '../screens';
import {COLORS} from '../constants';
import {buildMainTabBarStyle} from './tabBarOptions';
import {preloadEssentialData} from '../services/appDataBootstrap';
import {
  enforceNotSuspendedOrSignOut,
  SUSPENDED_SIGN_OUT_MESSAGE,
} from '../services/firebaseService';

const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const authInstance = getAuth(getApp());

const screenOptions = {
  headerStyle: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
  },
  headerTintColor: COLORS.PRIMARY_DARK,
  headerTitleStyle: {
    fontWeight: '700',
    fontSize: 17,
    color: COLORS.TEXT,
  },
  headerShadowVisible: false,
};

// Tab 1: Trang chủ + Profile, LearningPath — Admin nằm ở RootStack (không có bottom tab)
const HomeStack = () => (
  <Stack.Navigator initialRouteName="Home" screenOptions={screenOptions}>
    <Stack.Screen
      name="Home"
      component={HomeScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="Profile"
      component={ProfileScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="LearningPath"
      component={LearningPathScreen}
      options={{title: 'Bảng xếp hạng'}}
    />
    <Stack.Screen
      name="LearnedVocabulary"
      component={LearnedVocabularyScreen}
      options={{title: 'Từ vựng đã học'}}
    />
  </Stack.Navigator>
);

// Tab 2: Từ vựng (Bộ từ vựng | Ôn tập — trong VocabularyRootScreen; danh sách từ đã học: màn LearnedVocabulary trong HomeStack)
const VocabularyStack = () => (
  <Stack.Navigator initialRouteName="Vocabulary" screenOptions={screenOptions}>
    <Stack.Screen
      name="Vocabulary"
      component={VocabularyRootScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen name="VocabularyFlashcard" component={VocabularyFlashcardScreen} options={{title: 'Học từ vựng', headerShown: false}} />
    <Stack.Screen name="FlashcardResult" component={FlashcardResultScreen} options={{title: 'Kết quả', headerShown: false}} />
    <Stack.Screen name="VocabularyQuiz" component={VocabularyQuizScreen} options={{title: 'Trắc nghiệm', headerShown: false}} />
    <Stack.Screen name="VocabularyTyping" component={VocabularyTypingScreen} options={{title: 'Gõ từ', headerShown: false}} />
    <Stack.Screen name="VocabularyListening" component={VocabularyListeningScreen} options={{title: 'Nghe và chọn', headerShown: false}} />
    <Stack.Screen name="VocabularyQuickChallenge" component={VocabularyQuickChallengeScreen} options={{title: 'Thử thách 60 giây', headerShown: false}} />
    <Stack.Screen name="VocabularyTopicDetail" component={VocabularyTopicDetailScreen} options={{title: 'Chi tiết bộ từ', headerShown: false}} />
  </Stack.Navigator>
);

// Tab 3: Video
const VideoStack = () => (
  <Stack.Navigator initialRouteName="VideoSelection" screenOptions={screenOptions}>
    <Stack.Screen
      name="VideoSelection"
      component={VideoSelectionScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen name="VideoLearning" component={VideoLearningScreen} options={{title: 'Xem Video', headerShown: false}} />
  </Stack.Navigator>
);

// Tab 4: Hội thoại
const DialogueStack = () => (
  <Stack.Navigator initialRouteName="DialogueIntro" screenOptions={screenOptions}>
    <Stack.Screen
      name="DialogueIntro"
      component={DialogueIntroScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen name="DialoguePractice" component={DialoguePracticeScreen} options={{title: 'Thực hành hội thoại', headerShown: false}} />
  </Stack.Navigator>
);

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: COLORS.PRIMARY_DARK,
  tabBarInactiveTintColor: '#94A3B8',
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
};

/** Icon Feather + vòng nền và pill nhấn cho tab đang chọn */
function TabBarIconWithIndicator({iconName, focused, color}) {
  return (
    <View style={{alignItems: 'center', justifyContent: 'flex-start', minHeight: 46, width: 56}}>
      <View
        style={{
          width: 46,
          height: 46,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {focused ? (
          <View
            style={{
              position: 'absolute',
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255, 123, 0, 0.14)',
            }}
          />
        ) : null}
        <TabBarVectorIcon name={iconName} color={color} size={focused ? 24 : 23} />
      </View>
      <View style={{height: 5, marginTop: 2, alignItems: 'center', justifyContent: 'center'}}>
        {focused ? (
          <View
            style={{
              width: 26,
              height: 3,
              borderRadius: 3,
              backgroundColor: COLORS.PRIMARY,
            }}
          />
        ) : (
          <View style={{height: 3}} />
        )}
      </View>
    </View>
  );
}

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        ...tabScreenOptions,
        detachInactiveScreens: false,
        /** Mount sẵn các tab → tránh giật khi lần đầu vào Từ vựng */
        lazy: false,
        tabBarStyle: buildMainTabBarStyle(insets.bottom),
      }}>
    <Tab.Screen
      name="HomeTab"
      component={HomeStack}
      listeners={({navigation, route}) => ({
        tabPress: e => {
          const state = route?.state;
          if (state && typeof state.index === 'number' && state.index > 0) {
            // Chặn chuyển tab mặc định (vào màn stack hiện tại) để tránh lóe LearningPath rồi mới về Home.
            e.preventDefault();
            navigation.navigate('HomeTab', {screen: 'Home'});
          }
        },
      })}
      options={({route}) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'Home';
        const hideTabBar = routeName === 'LearnedVocabulary';
        return {
          title: 'Trang chủ',
          tabBarStyle: hideTabBar
            ? {display: 'none'}
            : buildMainTabBarStyle(insets.bottom),
          tabBarIcon: ({focused, color}) => (
            <TabBarIconWithIndicator iconName="home" focused={focused} color={color} />
          ),
        };
      }}
    />
    <Tab.Screen
      name="VocabularyTab"
      component={VocabularyStack}
      listeners={({navigation, route}) => ({
        tabPress: () => {
          const state = route?.state;
          if (state && typeof state.index === 'number' && state.index > 0) {
            navigation.navigate('VocabularyTab', {screen: 'Vocabulary'});
          }
        },
      })}
      options={({route}) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'Vocabulary';
        const hideTabBar =
          routeName === 'VocabularyFlashcard' ||
          routeName === 'VocabularyQuiz' ||
          routeName === 'VocabularyTyping' ||
          routeName === 'VocabularyListening' ||
          routeName === 'VocabularyQuickChallenge' ||
          routeName === 'VocabularyTopicDetail' ||
          routeName === 'FlashcardResult';
        return {
          title: 'Từ vựng',
          tabBarStyle: hideTabBar
            ? {display: 'none'}
            : buildMainTabBarStyle(insets.bottom),
          tabBarIcon: ({focused, color}) => (
            <TabBarIconWithIndicator iconName="book-open" focused={focused} color={color} />
          ),
        };
      }}
    />
    <Tab.Screen
      name="VideoTab"
      component={VideoStack}
      listeners={({navigation, route}) => ({
        tabPress: () => {
          const state = route?.state;
          if (state && typeof state.index === 'number' && state.index > 0) {
            navigation.navigate('VideoTab', {screen: 'VideoSelection'});
          }
        },
      })}
      options={({route}) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'VideoSelection';
        const hideTabBar = routeName === 'VideoLearning';
        return {
          title: 'Video',
          tabBarStyle: hideTabBar
            ? {display: 'none'}
            : buildMainTabBarStyle(insets.bottom),
          tabBarIcon: ({focused, color}) => (
            <TabBarIconWithIndicator iconName="video" focused={focused} color={color} />
          ),
        };
      }}
    />
    <Tab.Screen
      name="DialogueTab"
      component={DialogueStack}
      listeners={({navigation, route}) => ({
        tabPress: () => {
          const state = route?.state;
          if (state && typeof state.index === 'number' && state.index > 0) {
            navigation.navigate('DialogueTab', {screen: 'DialogueIntro'});
          }
        },
      })}
      options={({route}) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'DialogueIntro';
        const hideTabBar = routeName === 'DialoguePractice';
        return {
          title: 'Hội thoại',
          tabBarStyle: hideTabBar ? {display: 'none'} : buildMainTabBarStyle(insets.bottom),
          tabBarIcon: ({focused, color}) => (
            <TabBarIconWithIndicator iconName="message-circle" focused={focused} color={color} />
          ),
        };
      }}
    />
    <Tab.Screen
      name="ProfileTab"
      component={ProfileScreen}
      options={{
        title: 'Cá nhân',
        tabBarIcon: ({focused, color}) => (
          <TabBarIconWithIndicator iconName="user" focused={focused} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
  );
};

/** Root: chỉ chứa MainTabs dành cho học viên (không còn stack Admin). */
const RootNavigator = () => (
  <RootStack.Navigator initialRouteName="Main" screenOptions={{headerShown: false}}>
    <RootStack.Screen name="Main" component={MainTabs} />
  </RootStack.Navigator>
);

const AuthStack = () => (
  <Stack.Navigator
    initialRouteName="Login"
    screenOptions={screenOptions}>
    <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
    <Stack.Screen name="Register" component={RegisterScreen} options={{headerShown: false}} />
  </Stack.Navigator>
);

const AUTH_INIT_FALLBACK_MS = 12000;
const SUSPENDED_CHECK_TIMEOUT_MS = 10000;

const AppNavigator = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [showMainTabs, setShowMainTabs] = useState(false);

  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setInitializing(prev => {
        if (!prev) return prev;
        try {
          setUser(authInstance.currentUser);
        } catch (_) {}
        return false;
      });
    }, AUTH_INIT_FALLBACK_MS);
    // onIdTokenChanged sẽ chạy cả khi user được "link" từ anonymous -> email/google,
    // giúp chuyển vào Home ngay mà không cần thoát app.
    const unsubscribe = onIdTokenChanged(authInstance, current => {
      setUser(current);
      setInitializing(false);
    });
    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  // Tránh nhấp nháy: sau đăng ký, Firebase có thể auto-login rất nhanh rồi signOut về anonymous.
  // Chỉ chuyển sang MainTabs khi user non-anonymous ổn định trong một khoảng ngắn.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    if (user && !user.isAnonymous) {
      timer = setTimeout(() => {
        void (async () => {
          const suspendRace = Promise.race([
            enforceNotSuspendedOrSignOut(),
            new Promise(resolve =>
              setTimeout(() => resolve({blocked: false}), SUSPENDED_CHECK_TIMEOUT_MS),
            ),
          ]);
          const result = await suspendRace;
          const blocked = Boolean(result?.blocked);
          if (cancelled) return;
          if (blocked) {
            setShowMainTabs(false);
            Alert.alert('Không thể đăng nhập', SUSPENDED_SIGN_OUT_MESSAGE);
          } else {
            setShowMainTabs(true);
          }
        })();
      }, 500);
    } else {
      setShowMainTabs(false);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  /** Sau khi vào Main: preload config Firestore để tab không trống vì race token / mạng. */
  useEffect(() => {
    if (!showMainTabs) {
      return undefined;
    }
    void (async () => {
      try {
        await preloadEssentialData();
      } catch (_) {}
    })();
    return undefined;
  }, [showMainTabs]);

  if (initializing) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.BACKGROUND}}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  const isLoggedIn = showMainTabs;
  const shouldShowAuthStack = !user || user.isAnonymous;
  const isPendingLoggedIn = Boolean(user && !user.isAnonymous && !showMainTabs);

  return (
    <NavigationContainer>
      {isLoggedIn ? (
        <RootNavigator />
      ) : shouldShowAuthStack ? (
        <AuthStack />
      ) : isPendingLoggedIn ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.BACKGROUND}}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : null}
    </NavigationContainer>
  );
};

export default AppNavigator;
