import React, {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TabBarVectorIcon} from '../components/TabBarVectorIcons';
import {NavigationContainer, getFocusedRouteNameFromRoute} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import auth from '@react-native-firebase/auth';
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
  VideoVocabularyStudyModeScreen,
  VideoSelectionScreen,
  VideoLearningScreen,
  DialogueIntroScreen,
  DialoguePracticeScreen,
  LessonDetailScreen,
} from '../screens';
import AdminGate from '../screens/admin/AdminGate';
import {COLORS} from '../constants';
import {buildMainTabBarStyle} from './tabBarOptions';
import {ensureFirestoreAuthReady} from '../services/firebaseService';
import {loadVideosFromFirebase} from '../services/videoService';
import {loadVocabularyFromFirebase} from '../services/vocabularyService';
import {loadDialoguesFromFirebase} from '../services/dialogueService';

const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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
    <Stack.Screen name="LearningPath" component={LearningPathScreen} options={{title: 'Hoạt động của tôi'}} />
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
    <Stack.Screen name="VideoVocabularyStudyMode" component={VideoVocabularyStudyModeScreen} options={{title: 'Phương thức học', headerShown: false}} />
    <Stack.Screen name="LessonDetail" component={LessonDetailScreen} options={{title: 'Chi tiết bài học'}} />
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
  tabBarActiveTintColor: COLORS.PRIMARY,
  tabBarInactiveTintColor: COLORS.TEXT_LIGHT,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600',
  },
};

/** Icon Feather + gạch chân tab đang chọn */
function TabBarIconWithIndicator({iconName, focused, color}) {
  return (
    <View style={{alignItems: 'center', justifyContent: 'flex-start', minHeight: 44}}>
      <TabBarVectorIcon name={iconName} color={color} size={26} />
      <View style={{height: 5, marginTop: 2, alignItems: 'center'}}>
        {focused ? (
          <View
            style={{
              width: 40,
              height: 3,
              backgroundColor: COLORS.TEXT,
              borderRadius: 2,
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
      options={({route}) => {
        const routeName = getFocusedRouteNameFromRoute(route) ?? 'Vocabulary';
        const hideTabBar =
          routeName === 'VideoVocabularyStudyMode' ||
          routeName === 'VocabularyFlashcard' ||
          routeName === 'VocabularyQuiz' ||
          routeName === 'VocabularyTyping' ||
          routeName === 'VocabularyListening' ||
          routeName === 'VocabularyQuickChallenge' ||
          routeName === 'FlashcardResult' ||
          routeName === 'LessonDetail';
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

/** Tabs + Admin full màn hình (không bottom nav) */
const RootNavigator = () => (
  <RootStack.Navigator initialRouteName="Main" screenOptions={{headerShown: false}}>
    <RootStack.Screen name="Main" component={MainTabs} />
    <RootStack.Screen name="Admin" component={AdminGate} />
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

const AppNavigator = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [showMainTabs, setShowMainTabs] = useState(false);

  useEffect(() => {
    // onIdTokenChanged sẽ chạy cả khi user được "link" từ anonymous -> email/google,
    // giúp chuyển vào Home ngay mà không cần thoát app.
    const unsubscribe = auth().onIdTokenChanged(current => {
      setUser(current);
      if (initializing) setInitializing(false);
    });
    return unsubscribe;
  }, [initializing]);

  // Tránh nhấp nháy: sau đăng ký, Firebase có thể auto-login rất nhanh rồi signOut về anonymous.
  // Chỉ chuyển sang MainTabs khi user non-anonymous ổn định trong một khoảng ngắn.
  useEffect(() => {
    let timer = null;
    if (user && !user.isAnonymous) {
      timer = setTimeout(() => {
        setShowMainTabs(true);
      }, 500);
    } else {
      setShowMainTabs(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  /** Sau khi vào Main: preload config Firestore để tab không trống vì race token / mạng. */
  useEffect(() => {
    if (!showMainTabs) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        await ensureFirestoreAuthReady();
        if (cancelled) {
          return;
        }
        await Promise.all([
          loadVideosFromFirebase({force: true}).catch(() => {}),
          loadVocabularyFromFirebase({force: true}).catch(() => {}),
          loadDialoguesFromFirebase().catch(() => {}),
        ]);
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
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
