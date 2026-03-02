import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useFocusEffect,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../constants';

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [authUser, setAuthUser] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const auth = getAuthService();
      setAuthUser(auth ? auth.getCurrentUser() : null);
    }, []),
  );

  const isLoggedIn = authUser && !authUser.isAnonymous;
  const displayName = isLoggedIn ? (authUser.email || 'Người dùng') : 'Người dùng';
  const displayEmail = isLoggedIn ? authUser.email : 'Đăng nhập để đồng bộ tiến độ';

  const handleLoginPress = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất? Tiến độ trên thiết bị này sẽ dùng tài khoản ẩn danh mới.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            const auth = getAuthService();
            if (auth) {
              const result = await auth.signOut();
              setAuthUser(auth.getCurrentUser());
              if (result.ok) {
                Alert.alert('Thành công', 'Đã đăng xuất.');
              } else {
                Alert.alert('Lỗi', result.error);
              }
            }
          },
        },
      ],
    );
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {displayEmail}
          </Text>
          {isLoggedIn ? (
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={styles.logoutButtonText}>Đăng xuất</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.loginButton} onPress={handleLoginPress} activeOpacity={0.7}>
              <Text style={styles.loginButtonText}>Đăng nhập</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin</Text>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuText}>Chỉnh sửa hồ sơ</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuText}>Cài đặt</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Học tập</Text>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuText}>Lịch sử học tập</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuText}>Thống kê</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  content: {
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 30,
    paddingTop: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 50,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12,
  },
  loginButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 10,
  },
  loginButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.BORDER,
    borderRadius: 10,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuText: {
    fontSize: 16,
    color: COLORS.TEXT,
  },
  menuArrow: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
  },
});

export default ProfileScreen;
