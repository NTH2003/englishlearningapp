import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {COLORS} from '../../constants';
import AdminHomeScreen from './AdminHomeScreen';
import AdminUsersScreen from './AdminUsersScreen';
import AdminTopicsScreen from './AdminTopicsScreen';
import AdminVocabularyScreen from './AdminVocabularyScreen';
import AdminVideosScreen from './AdminVideosScreen';
import AdminDialoguesScreen from './AdminDialoguesScreen';

const Stack = createNativeStackNavigator();

const headerOpts = {
  headerStyle: {backgroundColor: COLORS.BACKGROUND_WHITE},
  headerTintColor: COLORS.PRIMARY_DARK,
  headerTitleStyle: {fontWeight: '700', fontSize: 17, color: COLORS.TEXT},
  headerShadowVisible: false,
};

export default function AdminNavigator({userRole}) {
  return (
    <Stack.Navigator
      initialRouteName="AdminHome"
      screenOptions={headerOpts}>
      <Stack.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        options={{headerShown: false}}
        initialParams={{userRole: userRole || 'learner'}}
      />
      <Stack.Screen
        name="AdminUsers"
        component={AdminUsersScreen}
        options={{title: 'Người dùng'}}
      />
      <Stack.Screen
        name="AdminTopics"
        component={AdminTopicsScreen}
        options={{headerShown: false, title: 'Bộ từ vựng'}}
      />
      <Stack.Screen
        name="AdminVocabulary"
        component={AdminVocabularyScreen}
        options={{headerShown: false, title: 'Từ vựng'}}
      />
      <Stack.Screen
        name="AdminVideos"
        component={AdminVideosScreen}
        options={{headerShown: false, title: 'Quản lý video'}}
      />
      <Stack.Screen
        name="AdminDialogues"
        component={AdminDialoguesScreen}
        options={{title: 'Hội thoại'}}
      />
    </Stack.Navigator>
  );
}
