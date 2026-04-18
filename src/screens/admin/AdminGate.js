import React, {useCallback, useState} from 'react';
import {Alert} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {
  canAccessAdminPanel,
  getCurrentUserRole,
} from '../../services/firebaseService';
import AdminNavigator from './AdminNavigator';

/**
 * Chặn truy cập nếu không phải admin/teacher; stack quản trị nằm bên trong.
 */
export default function AdminGate() {
  const navigation = useNavigation();
  const [allowed, setAllowed] = useState(() => canAccessAdminPanel());
  const [role, setRole] = useState(() => getCurrentUserRole());

  useFocusEffect(
    useCallback(() => {
      const ok = canAccessAdminPanel();
      const nextRole = getCurrentUserRole();
      setAllowed(ok);
      setRole(nextRole);
      if (!ok) {
        Alert.alert(
          'Không có quyền',
          'Chỉ tài khoản admin hoặc giáo viên mới truy cập được màn Quản trị.',
          [{text: 'OK', onPress: () => navigation.goBack()}],
        );
      }
      return undefined;
    }, [navigation]),
  );

  if (!allowed) {
    return null;
  }

  return <AdminNavigator userRole={role} />;
}
