import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {
  getLearningProgress,
  getUserData,
  saveUserData,
} from '../../services/storageService';
import {getResolvableLearnedWordsCount} from '../../services/vocabularyService';

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

function formatJoinDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (_) {
    return '—';
  }
}

function formatXP(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  return x.toLocaleString('vi-VN');
}

/** Cấp hiển thị kiểu game (1…99) từ XP — thanh tiến độ tới ngưỡng cấp sau. */
function gameLevelFromXP(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  const level = Math.max(1, Math.min(99, Math.floor(xp / 250) + 1));
  const nextCap = level * 250;
  const prevCap = (level - 1) * 250;
  const span = Math.max(1, nextCap - prevCap);
  const inSpan = Math.min(span, Math.max(0, xp - prevCap));
  const pct = Math.round((inSpan / span) * 100);
  return {level, nextCap, prevCap, pct, xp};
}

const ProfileScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [authUser, setAuthUser] = useState(null);
  const [totalXP, setTotalXP] = useState(0);
  const [learnedWordsCount, setLearnedWordsCount] = useState(0);
  const [videosWatchedCount, setVideosWatchedCount] = useState(0);
  const [dialoguesCompletedCount, setDialoguesCompletedCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [editProfileModalVisible, setEditProfileModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [changePasswordModalVisible, setChangePasswordModalVisible] =
    useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const loadProfileData = useCallback(async () => {
    const auth = getAuthService();
    setAuthUser(auth ? auth.getCurrentUser() : null);
    try {
      const ud = await getUserData();
      const authUser = auth ? auth.getCurrentUser() : null;
      let name =
        (ud && typeof ud === 'object'
          ? String(ud.displayName || ud.name || '').trim() ||
            (typeof ud.fullName === 'string' ? ud.fullName.trim() : '') ||
            String(ud.nickname || ud.username || ud.profileName || '').trim()
          : '') ||
        (authUser?.displayName ? String(authUser.displayName).trim() : '') ||
        '';
      setProfileName(name);
    } catch (_) {
      setProfileName('');
    }
    try {
      const lp = await getLearningProgress();
      const xp = Math.max(0, Number(lp?.totalXP) || 0);
      setTotalXP(xp);
      let wl = 0;
      try {
        wl = await getResolvableLearnedWordsCount();
      } catch (_) {
        wl = Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.length : 0;
      }
      const vw = Array.isArray(lp?.videosWatched) ? lp.videosWatched.length : 0;
      const dc = Array.isArray(lp?.dialoguesCompleted)
        ? lp.dialoguesCompleted.length
        : 0;
      setLearnedWordsCount(wl);
      setVideosWatchedCount(vw);
      setDialoguesCompletedCount(dc);
    } catch (_) {
      setTotalXP(0);
      setLearnedWordsCount(0);
      setVideosWatchedCount(0);
      setDialoguesCompletedCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData]),
  );

  const isLoggedIn = authUser && !authUser.isAnonymous;
  const displayName = useMemo(() => {
    if (profileName && String(profileName).trim()) {
      return String(profileName).trim();
    }
    if (isLoggedIn && authUser?.email) {
      return authUser.email.split('@')[0];
    }
    return 'Nguyễn Văn A';
  }, [profileName, isLoggedIn, authUser]);

  const joinDateStr = useMemo(() => {
    const created = authUser?.metadata?.creationTime;
    return formatJoinDate(created);
  }, [authUser]);

  const gameLv = useMemo(() => gameLevelFromXP(totalXP), [totalXP]);

  const handleLoginPress = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất? Tiến độ trên thiết bị này sẽ dùng tài khoản ẩn danh mới.',
      [
        {text: 'Hủy', style: 'cancel'},
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

  const handleChangePassword = useCallback(() => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới không khớp');
      return;
    }
    Alert.alert('Thành công', 'Mật khẩu đã được thay đổi (demo).');
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setChangePasswordModalVisible(false);
  }, [passwordData]);

  const openEditProfileModal = useCallback(() => {
    const baseName =
      (profileName && String(profileName).trim()) ||
      (authUser?.displayName ? String(authUser.displayName).trim() : '') ||
      '';
    setEditDisplayName(baseName);
    setEditProfileModalVisible(true);
  }, [profileName, authUser]);

  const handleSaveProfile = useCallback(async () => {
    const nextName = String(editDisplayName || '').trim();
    if (!nextName) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên hiển thị.');
      return;
    }
    if (nextName.length < 2) {
      Alert.alert('Lỗi', 'Tên hiển thị cần ít nhất 2 ký tự.');
      return;
    }
    setSavingProfile(true);
    try {
      const current = (await getUserData()) || {};
      const ok = await saveUserData({
        ...(current && typeof current === 'object' ? current : {}),
        displayName: nextName,
      });
      if (!ok) {
        Alert.alert('Lỗi', 'Không lưu được hồ sơ. Vui lòng thử lại.');
        return;
      }
      setProfileName(nextName);
      setEditProfileModalVisible(false);
      Alert.alert('Thành công', 'Đã cập nhật hồ sơ.');
    } catch (_) {
      Alert.alert('Lỗi', 'Không lưu được hồ sơ. Vui lòng thử lại.');
    } finally {
      setSavingProfile(false);
    }
  }, [editDisplayName]);

  const gradientColors = ['#FF7A29', '#FF5C5C', '#E91E8C'];

  return (
    <>
    <ScrollView
      style={styles.screenRoot}
      showsVerticalScrollIndicator={false}
      bounces={false}
      contentContainerStyle={styles.scrollContent}>
      <LinearGradient
        colors={gradientColors}
        start={{x: 0, y: 0}}
        end={{x: 0, y: 1}}
        style={[styles.profileGradient, {paddingTop: insets.top + 8}]}>
        <View style={styles.profileHeaderRow}>
          <Text style={styles.profileHeaderTitle}>Trang cá nhân</Text>
        </View>

        <View style={styles.profileHeroCard}>
          <View style={styles.profileHeroTop}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarEmoji}>👤</Text>
              </View>
              <View style={styles.avatarLevelBadge}>
                <Text style={styles.avatarLevelBadgeText}>{gameLv.level}</Text>
              </View>
            </View>
            <View style={styles.profileHeroTextCol}>
              <Text style={styles.profileDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.profileMetaRow}>
                <View style={styles.levelPill}>
                  <Text style={styles.levelPillText}>Level {gameLv.level}</Text>
                </View>
                <Text style={styles.joinDateText}>
                  Tham gia {joinDateStr}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.xpBlock}>
            <View style={styles.xpBlockHeader}>
              <Text style={styles.xpBlockTitle}>
                Tiến độ Level {gameLv.level + 1}
              </Text>
              <Text style={styles.xpBlockNums}>
                {formatXP(gameLv.xp)}/{formatXP(gameLv.nextCap)} XP
              </Text>
            </View>
            <View style={styles.xpBarTrack}>
              <View
                style={[styles.xpBarFill, {width: `${gameLv.pct}%`}]}
              />
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.statsGridWrap}>
        <View style={styles.statsRow}>
          <StatTile
            bg="#E8F2FF"
            iconColor="#2563EB"
            icon="book-open"
            value={String(learnedWordsCount)}
            label="Từ đã học"
          />
          <StatTile
            bg="#FFF4E6"
            iconColor="#EA580C"
            icon="video"
            value={String(videosWatchedCount)}
            label="Video đã xem"
          />
        </View>
        <View style={styles.statsRow}>
          <StatTile
            bg="#F3E8FF"
            iconColor="#7C3AED"
            icon="star"
            value={formatXP(totalXP)}
            label="Tổng XP"
          />
          <StatTile
            bg="#DCFCE7"
            iconColor="#16A34A"
            icon="message-circle"
            value={String(dialoguesCompletedCount)}
            label="Hội thoại hoàn thành"
          />
        </View>
      </View>

      {!isLoggedIn ? (
        <TouchableOpacity
          style={styles.loginBanner}
          onPress={handleLoginPress}
          activeOpacity={0.88}>
          <Text style={styles.loginBannerText}>
            Đăng nhập để đồng bộ tiến độ trên nhiều thiết bị
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.settingsSectionHeading}>Cài đặt</Text>
      <View style={styles.settingsCard}>
        <SettingsRow
          icon="edit-2"
          title="Chỉnh sửa hồ sơ"
          subtitle="Cập nhật thông tin cá nhân"
          onPress={openEditProfileModal}
        />
        <View style={styles.settingsDivider} />
        <SettingsRow
          icon="key"
          title="Đổi mật khẩu"
          subtitle="Cập nhật mật khẩu tài khoản"
          onPress={() => {
            if (!isLoggedIn) {
              Alert.alert(
                'Cần đăng nhập',
                'Hãy đăng nhập bằng email để đổi mật khẩu.',
                [
                  {text: 'Hủy', style: 'cancel'},
                  {text: 'Đăng nhập', onPress: handleLoginPress},
                ],
              );
              return;
            }
            setChangePasswordModalVisible(true);
          }}
        />
        <View style={styles.settingsDivider} />
        <SettingsRow
          icon="bell"
          title="Thông báo"
          subtitle="Cài đặt nhắc nhở học tập"
          onPress={() =>
            Alert.alert('Thông báo', 'Bật/tắt nhắc nhở sẽ có trong bản sau.')
          }
        />
        <View style={styles.settingsDivider} />
        <SettingsRow
          icon="globe"
          title="Ngôn ngữ"
          subtitle="Tiếng Việt"
          onPress={() => Alert.alert('Ngôn ngữ', 'Hiện chỉ hỗ trợ Tiếng Việt.')}
        />
        <View style={styles.settingsDivider} />
        <SettingsRow
          icon="help-circle"
          title="Trợ giúp & Hỗ trợ"
          subtitle="Câu hỏi thường gặp, liên hệ"
          onPress={() =>
            Alert.alert('Trợ giúp', 'Phiên bản 1.0 — English Learning App.')
          }
        />
      </View>

      <TouchableOpacity
        style={styles.logoutOutlineBtn}
        onPress={isLoggedIn ? handleLogout : handleLoginPress}
        activeOpacity={0.85}>
        <Feather
          name="log-out"
          size={20}
          color="#E11D48"
          style={{marginRight: 8}}
        />
        <Text style={styles.logoutOutlineText}>
          {isLoggedIn ? 'Đăng xuất' : 'Đăng nhập'}
        </Text>
      </TouchableOpacity>

      <View style={{height: insets.bottom + 24}} />
    </ScrollView>

    <Modal
      visible={changePasswordModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setChangePasswordModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setChangePasswordModalVisible(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Đổi mật khẩu</Text>
            <View style={{width: 24}} />
          </View>
          <View style={styles.modalForm}>
            <Text style={styles.inputLabel}>Mật khẩu hiện tại</Text>
            <TextInput
              style={styles.input}
              placeholder="Nhập mật khẩu hiện tại"
              placeholderTextColor={COLORS.TEXT_LIGHT}
              secureTextEntry
              value={passwordData.currentPassword}
              onChangeText={text =>
                setPasswordData(prev => ({
                  ...prev,
                  currentPassword: text,
                }))
              }
            />
            <Text style={styles.inputLabel}>Mật khẩu mới</Text>
            <TextInput
              style={styles.input}
              placeholder="Nhập mật khẩu mới"
              placeholderTextColor={COLORS.TEXT_LIGHT}
              secureTextEntry
              value={passwordData.newPassword}
              onChangeText={text =>
                setPasswordData(prev => ({...prev, newPassword: text}))
              }
            />
            <Text style={styles.inputLabel}>Xác nhận mật khẩu mới</Text>
            <TextInput
              style={styles.input}
              placeholder="Xác nhận mật khẩu mới"
              placeholderTextColor={COLORS.TEXT_LIGHT}
              secureTextEntry
              value={passwordData.confirmPassword}
              onChangeText={text =>
                setPasswordData(prev => ({
                  ...prev,
                  confirmPassword: text,
                }))
              }
            />
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleChangePassword}
              activeOpacity={0.8}>
              <Text style={styles.submitButtonText}>Cập nhật mật khẩu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal
      visible={editProfileModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setEditProfileModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditProfileModalVisible(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Chỉnh sửa hồ sơ</Text>
            <View style={{width: 24}} />
          </View>
          <View style={styles.modalForm}>
            <Text style={styles.inputLabel}>Tên hiển thị</Text>
            <TextInput
              style={styles.input}
              placeholder="Nhập tên hiển thị"
              placeholderTextColor={COLORS.TEXT_LIGHT}
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!savingProfile}
            />
            <TouchableOpacity
              style={[styles.submitButton, savingProfile && styles.submitButtonDisabled]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
              activeOpacity={0.8}>
              <Text style={styles.submitButtonText}>
                {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
};

function StatTile({bg, iconColor, icon, value, label}) {
  return (
    <View style={[styles.statTile, {backgroundColor: bg}]}>
      <Feather name={icon} size={26} color={iconColor} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

function SettingsRow({icon, title, subtitle, onPress}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={0.75}>
      <View style={styles.settingsIconCircle}>
        <Feather name={icon} size={20} color={COLORS.PRIMARY} />
      </View>
      <View style={styles.settingsRowBody}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        <Text style={styles.settingsRowSub}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={COLORS.TEXT_LIGHT} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    flexGrow: 1,
  },
  profileGradient: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  profileHeaderRow: {
    marginBottom: 20,
  },
  profileHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {elevation: 6},
    }),
  },
  profileHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  avatarEmoji: {
    fontSize: 36,
  },
  avatarLevelBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF7A29',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarLevelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  profileHeroTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
  },
  profileDisplayName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  profileMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  levelPill: {
    backgroundColor: '#FFF0E6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  joinDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  xpBlock: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  xpBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  xpBlockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  xpBlockNums: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EA580C',
  },
  xpBarTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#0F172A',
  },
  statsGridWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statTile: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
  },
  statTileValue: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  statTileLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  loginBanner: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  loginBannerText: {
    textAlign: 'center',
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '600',
  },

  settingsSectionHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  settingsCard: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  settingsIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF0E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsRowBody: {
    flex: 1,
    minWidth: 0,
  },
  settingsRowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  settingsRowSub: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  settingsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginLeft: 70,
  },
  logoutOutlineBtn: {
    marginTop: 20,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FDA4AF',
    backgroundColor: '#FFFFFF',
  },
  logoutOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E11D48',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  modalClose: {
    fontSize: 22,
    color: COLORS.TEXT,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  modalForm: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
    color: COLORS.TEXT,
  },
  submitButton: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: COLORS.BACKGROUND,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ProfileScreen;
