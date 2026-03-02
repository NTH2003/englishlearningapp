import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import auth from '@react-native-firebase/auth';
import {
  HomeScreen,
  ProfileScreen,
  AdminScreen,
  LearningPathScreen,
  LoginScreen,
  RegisterScreen,
  TopicSelectionScreen,
  StudyModeSelectionScreen,
  VocabularyFlashcardScreen,
  VocabularyQuizScreen,
  VocabularyTypingScreen,
  VocabularyListeningScreen,
  MyVocabularyScreen,
  ReviewSessionScreen,
  VideoSelectionScreen,
  VideoLearningScreen,
  DialogueIntroScreen,
  DialoguePracticeScreen,
  LessonDetailScreen,
} from '../screens';
import {COLORS} from '../constants';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: {
    backgroundColor: COLORS.PRIMARY_DARK,
  },
  headerTintColor: COLORS.BACKGROUND_WHITE,
  headerTitleStyle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  headerShadowVisible: false,
};

const MainStack = () => (
  <Stack.Navigator
    initialRouteName="Home"
    screenOptions={screenOptions}>
    <Stack.Screen
      name="Home"
      component={HomeScreen}
      options={{
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="Vocabulary"
      component={TopicSelectionScreen}
      options={{
        title: 'Học từ vựng',
      }}
    />
    <Stack.Screen
      name="StudyModeSelection"
      component={StudyModeSelectionScreen}
      options={{
        title: 'Chọn phương thức học',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="VocabularyFlashcard"
      component={VocabularyFlashcardScreen}
      options={{
        title: 'Học từ vựng',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="VocabularyQuiz"
      component={VocabularyQuizScreen}
      options={{
        title: 'Trắc nghiệm',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="VocabularyTyping"
      component={VocabularyTypingScreen}
      options={{
        title: 'Gõ từ',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="VocabularyListening"
      component={VocabularyListeningScreen}
      options={{
        title: 'Nghe và chọn',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="LessonDetail"
      component={LessonDetailScreen}
      options={{
        title: 'Chi tiết bài học',
      }}
    />
    <Stack.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        title: 'Hồ sơ',
      }}
    />
    <Stack.Screen
      name="Admin"
      component={AdminScreen}
      options={{
        title: 'Quản trị dữ liệu',
      }}
    />
    <Stack.Screen
      name="VideoSelection"
      component={VideoSelectionScreen}
      options={{
        title: 'Học qua Video',
      }}
    />
    <Stack.Screen
      name="VideoLearning"
      component={VideoLearningScreen}
      options={{
        title: 'Xem Video',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="DialogueIntro"
      component={DialogueIntroScreen}
      options={{
        title: 'Thực hành hội thoại',
      }}
    />
    <Stack.Screen
      name="DialoguePractice"
      component={DialoguePracticeScreen}
      options={{
        title: 'Thực hành hội thoại',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="LearningPath"
      component={LearningPathScreen}
      options={{
        title: 'Hoạt động của tôi',
      }}
    />
    <Stack.Screen
      name="MyVocabulary"
      component={MyVocabularyScreen}
      options={{
        title: 'Từ vựng của tôi',
      }}
    />
    <Stack.Screen
      name="ReviewSession"
      component={ReviewSessionScreen}
      options={{
        title: 'Ôn tập',
        headerShown: false,
      }}
    />
  </Stack.Navigator>
);

const AuthStack = () => (
  <Stack.Navigator
    initialRouteName="Login"
    screenOptions={screenOptions}>
    <Stack.Screen
      name="Login"
      component={LoginScreen}
      options={{
        title: 'Đăng nhập',
      }}
    />
    <Stack.Screen
      name="Register"
      component={RegisterScreen}
      options={{
        title: 'Đăng ký',
      }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(current => {
      setUser(current);
      if (initializing) {
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, [initializing]);

  if (initializing) {
    return null;
  }

  const isLoggedIn = user && !user.isAnonymous;

  return (
    <NavigationContainer>
      {isLoggedIn ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;
