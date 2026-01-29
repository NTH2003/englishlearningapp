import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import TopicSelectionScreen from '../screens/TopicSelectionScreen';
import StudyModeSelectionScreen from '../screens/StudyModeSelectionScreen';
import VocabularyFlashcardScreen from '../screens/VocabularyFlashcardScreen';
import VocabularyQuizScreen from '../screens/VocabularyQuizScreen';
import VocabularyTypingScreen from '../screens/VocabularyTypingScreen';
import VocabularyListeningScreen from '../screens/VocabularyListeningScreen';
import LessonDetailScreen from '../screens/LessonDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import VideoSelectionScreen from '../screens/VideoSelectionScreen';
import VideoLearningScreen from '../screens/VideoLearningScreen';
import DialogueIntroScreen from '../screens/DialogueIntroScreen';
import DialoguePracticeScreen from '../screens/DialoguePracticeScreen';
import LearningPathScreen from '../screens/LearningPathScreen';
import {COLORS} from '../constants';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.PRIMARY_DARK,
          },
          headerTintColor: COLORS.BACKGROUND_WHITE,
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          headerShadowVisible: false,
        }}>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
