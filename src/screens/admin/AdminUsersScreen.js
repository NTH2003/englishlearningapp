import React, {useCallback, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, Share, Alert} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {canManageUsers, getCurrentUser} from '../../services/firebaseService';
import {adminStyles} from './adminStyles';

export default function AdminUsersScreen() {
  const navigation = useNavigation();
  const [, bump] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!canManageUsers()) {
        Alert.alert('Không có quyền', 'Giáo viên không có quyền quản lý người dùng.', [
          {text: 'OK', onPress: () => navigation.goBack()},
        ]);
        return undefined;
      }
      bump(n => n + 1);
      return undefined;
    }, [navigation]),
  );

  const user = getCurrentUser();
  const uid = user?.uid || '—';
  const email = user?.email || null;
  const isAnon = Boolean(user?.isAnonymous);
  const providerLabel = isAnon
    ? 'Ẩn danh'
    : email
      ? 'Email / liên kết tài khoản'
      : 'Đã đăng nhập (không có email hiển thị)';

  const onShareUid = async () => {
    if (!user?.uid) return;
    try {
      await Share.share({
        message: user.uid,
        title: 'UID Firebase',
      });
    } catch (e) {
      Alert.alert('Lỗi', e?.message || 'Không thể chia sẻ.');
    }
  };

  return (
    <ScrollView
      style={adminStyles.scroll}
      contentContainerStyle={[adminStyles.scrollContent, {padding: 16}]}>
      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>Phiên hiện tại</Text>
        <Text style={adminStyles.hintText}>
          Ứng dụng không thể liệt kê toàn bộ người dùng từ client. Để xem danh sách user,
          dùng Firebase Console hoặc Admin SDK phía server.
        </Text>
        <View style={{marginTop: 4}}>
          <Text style={adminStyles.userLabel}>Email</Text>
          <Text style={adminStyles.userValue}>{email || '—'}</Text>
        </View>
        <View style={[adminStyles.userRow, {borderBottomWidth: 0, paddingTop: 12}]}>
          <View style={{flex: 1}}>
            <Text style={adminStyles.userLabel}>UID</Text>
            <Text style={adminStyles.userValue} selectable>
              {uid}
            </Text>
          </View>
        </View>
        <View style={adminStyles.badge}>
          <Text style={adminStyles.badgeText}>{providerLabel}</Text>
        </View>
        {user?.uid ? (
          <TouchableOpacity
            style={[adminStyles.secondaryButton, {marginTop: 14}]}
            onPress={onShareUid}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Feather name="share-2" size={18} color={COLORS.PRIMARY_DARK} />
              <Text style={adminStyles.secondaryButtonText}>Chia sẻ UID</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}
