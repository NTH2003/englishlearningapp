import React, {useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {
  clearAllData,
  getLearningProgress,
  getUserData,
} from '../../services/storageService';
import {getLevelInfo} from '../../services/levelService';
import {getResolvableLearnedWordsCount} from '../../services/vocabularyService';

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

const ICON_STAT = 30;
const ICON_FEATURE = 26;
const ICON_PROFILE = 20;
const ICON_MENU = 18;

/** Thống kê: từ đã học */
function StatWordsIcon() {
  return (
    <View style={homeIconStyles.statIconWrap}>
      <Feather name="book-open" size={ICON_STAT} color="#2563EB" />
    </View>
  );
}

/** Thống kê: video đã xem */
function StatVideoIcon() {
  return (
    <View style={homeIconStyles.statIconWrap}>
      <Feather name="video" size={ICON_STAT} color="#16A34A" />
    </View>
  );
}

/** Thống kê: đã đối thoại */
function StatStreakIcon() {
  return (
    <View style={homeIconStyles.statIconWrap}>
      <Feather name="message-circle" size={ICON_STAT} color={COLORS.PRIMARY} />
    </View>
  );
}

/** Hoạt động / lộ trình */
function ActivityRowIcon() {
  return (
    <Feather name="activity" size={28} color={COLORS.PRIMARY} />
  );
}

const homeIconStyles = StyleSheet.create({
  statIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});

const TEXT_GRAY_800 = '#1F2937';
const TEXT_GRAY_500 = '#6B7280';
const ORANGE_50 = '#FFF7ED';
const ORANGE_200 = '#FED7AA';

const HomeScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState('Xin chào');
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [animatedValues] = useState({
    card1: new Animated.Value(0),
    card2: new Animated.Value(0),
    card3: new Animated.Value(0),
  });

  const [progress, setProgress] = useState({
    wordsLearned: 0,
    videosWatched: 0,
    dialoguesCompleted: 0,
    totalXP: 0,
    level: 'Sơ cấp',
  });
  const handleLogout = useCallback(async () => {
    setShowProfileMenu(false);
    // Xóa data cần UID còn hoạt động; signOut trước có thể làm `_uid` về null.
    await clearAllData();
    const auth = getAuthService();
    if (auth) {
      await auth.signOut();
    }
  }, []);

  const refreshUserName = useCallback(async () => {
    const authSvc = getAuthService();
    let name = '';
    try {
      const ud = await getUserData();
      if (ud && typeof ud === 'object') {
        name =
          String(ud.displayName || ud.name || '').trim() ||
          (typeof ud.fullName === 'string' ? ud.fullName.trim() : '') ||
          String(ud.nickname || ud.username || ud.profileName || '').trim();
      }
    } catch (_) {}
    // Đọc lại sau getUserData — lúc vào màn Auth có thể chưa restore, sau vài trăm ms mới có user.
    const user = authSvc?.getCurrentUser?.() ?? null;
    if (!name && user?.displayName) {
      name = String(user.displayName).trim();
    }
    if (!name && user && !user.isAnonymous && user.email) {
      name = user.email.split('@')[0] || '';
    }
    if (!name && user?.uid) {
      name = String(user.uid).slice(0, 6);
    }
    setUserName(name || 'Xin chào');
  }, []);

  const navigateToFeature = id => {
    if (id === 1) {
      navigation.getParent()?.navigate('VocabularyTab');
    } else if (id === 2) {
      navigation.getParent()?.navigate('VideoTab');
    }
  };

  useEffect(() => {
    let unsub = () => {};
    try {
      const rnAuth = require('@react-native-firebase/auth').default;
      unsub = rnAuth().onAuthStateChanged(() => {
        refreshUserName();
      });
    } catch (_) {
      refreshUserName();
    }
    return () => unsub();
  }, [refreshUserName]);

  useFocusEffect(
    React.useCallback(() => {
      loadProgress();
      const auth = getAuthService();
      const canOpenAdmin = auth?.canAccessAdminPanel
        ? auth.canAccessAdminPanel()
        : auth?.isCurrentUserAdmin
          ? auth.isCurrentUserAdmin()
          : false;
      setCanAccessAdmin(Boolean(canOpenAdmin));

      refreshUserName();

      Animated.stagger(150, [
        Animated.spring(animatedValues.card1, {
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(animatedValues.card2, {
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(animatedValues.card3, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    }, [animatedValues, refreshUserName]),
  );

  const loadProgress = async () => {
    try {
      let savedProgress = await getLearningProgress({source: 'server'});
      if (savedProgress == null) {
        savedProgress = await getLearningProgress();
      }
      let learnedCount = 0;
      try {
        learnedCount = await getResolvableLearnedWordsCount();
      } catch (_) {
        learnedCount = Array.isArray(savedProgress?.wordsLearned)
          ? savedProgress.wordsLearned.length
          : 0;
      }
      const dialoguesCompletedCount = Array.isArray(savedProgress?.dialoguesCompleted)
        ? savedProgress.dialoguesCompleted.length
        : 0;
      const videosWatchedCount = Array.isArray(savedProgress?.videosWatched)
        ? savedProgress.videosWatched.length
        : 0;

      setProgress({
        wordsLearned: learnedCount,
        videosWatched: videosWatchedCount,
        dialoguesCompleted: dialoguesCompletedCount,
        totalXP: savedProgress?.totalXP || 0,
        level: savedProgress?.level || 'Sơ cấp',
      });

    } catch (error) {
      console.error('Error loading progress:', error);
    }
  };

  const levelInfo = getLevelInfo(progress.totalXP || 0);

  const getCardStyle = animatedValue => ({
    transform: [
      {
        scale: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1],
        }),
      },
      {
        translateY: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
    opacity: animatedValue,
  });

  const xpDenom = levelInfo.maxXP - levelInfo.minXP;
  const xpLabel = levelInfo.isMaxLevel
    ? `${levelInfo.inLevelXP}+ XP`
    : `${levelInfo.inLevelXP}/${xpDenom}`;

  const headerTopPad = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  ) + 8;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces>
        {/* Header cam đặc — giống mock (không gradient) */}
        <View style={[styles.headerSolid, {paddingTop: headerTopPad}]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerNotebookBtn}
              onPress={() => navigation.navigate('LearnedVocabulary')}
              activeOpacity={0.75}
              accessibilityLabel="Danh sách từ vựng đã học">
              <Feather name="book" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerRight}>
              <Text style={styles.headerUserName} numberOfLines={1}>
                {userName}
              </Text>
              <View style={styles.profileButtonContainer}>
                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => setShowProfileMenu(!showProfileMenu)}
                  activeOpacity={0.7}>
                  <Feather name="user" size={ICON_PROFILE} color="#FFFFFF" />
                </TouchableOpacity>

                {showProfileMenu && (
                  <View style={styles.profileMenu}>
                    <TouchableOpacity
                      style={styles.profileMenuItem}
                      onPress={() => {
                        setShowProfileMenu(false);
                        navigation.navigate('Profile');
                      }}
                      activeOpacity={0.7}>
                      <Feather name="user" size={ICON_MENU} color={COLORS.TEXT} style={styles.profileMenuIconFeather} />
                      <Text style={styles.profileMenuText}>Hồ sơ</Text>
                    </TouchableOpacity>

                    <View style={styles.profileMenuDivider} />

                    {canAccessAdmin && (
                      <>
                        <TouchableOpacity
                          style={styles.profileMenuItem}
                          onPress={() => {
                            setShowProfileMenu(false);
                            const tabNav = navigation.getParent();
                            const rootNav = tabNav?.getParent();
                            if (rootNav) {
                              rootNav.navigate('Admin');
                            }
                          }}
                          activeOpacity={0.7}>
                          <Feather name="settings" size={ICON_MENU} color={COLORS.TEXT} style={styles.profileMenuIconFeather} />
                          <Text style={styles.profileMenuText}>
                            Quản trị dữ liệu
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.profileMenuDivider} />
                      </>
                    )}

                    <TouchableOpacity
                      style={styles.profileMenuItem}
                      onPress={handleLogout}
                      activeOpacity={0.7}>
                      <Feather name="log-out" size={ICON_MENU} color={COLORS.TEXT} style={styles.profileMenuIconFeather} />
                      <Text style={styles.profileMenuText}>Đăng xuất</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.quickStatsSection}>
          <Animated.View
            style={[styles.quickStatCard, getCardStyle(animatedValues.card1)]}>
            <StatWordsIcon />
            <Text style={styles.quickStatNumber}>{progress.wordsLearned}</Text>
            <Text style={styles.quickStatLabel}>Từ đã học</Text>
          </Animated.View>

          <Animated.View
            style={[styles.quickStatCard, getCardStyle(animatedValues.card2)]}>
            <StatVideoIcon />
            <Text style={styles.quickStatNumber}>
              {progress.videosWatched}
            </Text>
            <Text style={styles.quickStatLabel}>Video đã xem</Text>
          </Animated.View>

          <Animated.View
            style={[styles.quickStatCard, getCardStyle(animatedValues.card3)]}>
            <StatStreakIcon />
            <Text style={styles.quickStatNumber}>
              {progress.dialoguesCompleted}
            </Text>
            <Text style={styles.quickStatLabel}>Đã đối thoại</Text>
          </Animated.View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Cấp độ hiện tại</Text>
            <View style={styles.currentLevelBadge}>
              <Text style={styles.currentLevelBadgeText}>
                Cấp {levelInfo.levelIndex + 1}
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFillSolid,
                {width: `${levelInfo.progressPercent}%`},
              ]}
            />
          </View>

          <View style={styles.levelFooterRow}>
            <Text style={styles.cardSubtitle}>
              {levelInfo.isMaxLevel
                ? 'Bạn đã đạt cấp độ tối đa 🎉'
                : `Tới cấp độ ${levelInfo.levelIndex + 2}`}
            </Text>
            <Text style={styles.levelXpHighlight}>{xpLabel}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.rowCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('LearningPath')}>
            <ActivityRowIcon />
            <Text style={styles.rowCardTitle}>Hoạt động của tôi</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>Tính năng học tập</Text>
          <TouchableOpacity
            style={styles.featureChip}
            activeOpacity={0.85}
            onPress={() => navigateToFeature(1)}>
            <View style={styles.featureChipIconWrap}>
              <Feather name="book-open" size={ICON_FEATURE} color={COLORS.PRIMARY} />
            </View>
            <Text style={styles.featureChipText}>Học từ vựng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.featureChip}
            activeOpacity={0.85}
            onPress={() => navigateToFeature(2)}>
            <View style={styles.featureChipIconWrap}>
              <Feather name="video" size={ICON_FEATURE} color={COLORS.PRIMARY} />
            </View>
            <Text style={styles.featureChipText}>Học qua video</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollView: {
    flex: 1,
  },
  headerSolid: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerNotebookBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  headerUserName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    maxWidth: '70%',
  },
  profileButtonContainer: {
    position: 'relative',
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: THEME.radius.lg,
    paddingVertical: 8,
    minWidth: 160,
    ...THEME.shadow.floating,
    zIndex: 1000,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileMenuIconFeather: {
    marginRight: 12,
  },
  profileMenuText: {
    fontSize: 15,
    color: COLORS.TEXT,
    fontWeight: '500',
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginVertical: 4,
  },

  quickStatsSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -20,
    marginBottom: 20,
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  quickStatNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.PRIMARY,
    marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 12,
    color: TEXT_GRAY_500,
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_800,
  },
  currentLevelBadge: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  currentLevelBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY_SOFT,
    overflow: 'hidden',
  },
  progressFillSolid: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 999,
  },
  levelFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardSubtitle: {
    flex: 1,
    fontSize: 12,
    color: TEXT_GRAY_500,
    marginRight: 8,
  },
  levelXpHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.PRIMARY,
  },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_800,
  },

  sectionBlock: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_800,
    marginBottom: 12,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: ORANGE_50,
    borderWidth: 2,
    borderColor: ORANGE_200,
    width: '100%',
    marginBottom: 12,
  },
  featureChipIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },

  bottomSpacing: {
    height: 28,
  },
});

export default HomeScreen;
