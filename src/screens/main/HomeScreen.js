import React, {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import {getApp} from '@react-native-firebase/app';
import {getAuth, onAuthStateChanged} from '@react-native-firebase/auth';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {
  getLearningProgress,
  getUserData,
} from '../../services/storageService';
import {preloadEssentialData} from '../../services/appDataBootstrap';
import {getLevelInfo} from '../../services/levelService';
import {getResolvableLearnedWordsCount} from '../../services/vocabularyService';
import {
  CONTINUE_KIND,
  pickFreshContinueLearning,
  buildVocabularyTopicDetailResume,
} from '../../services/continueLearning';
import {loadVideosFromFirebase, getAllVideos} from '../../services/videoService';
const authInstance = getAuth(getApp());

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

function getNativeAuthCurrentUser() {
  try {
    return authInstance.currentUser || null;
  } catch (_) {
    return null;
  }
}

function deriveUserNameFallback() {
  const u = getNativeAuthCurrentUser();
  if (!u) return 'Xin chào';
  const displayName = String(u.displayName || '').trim();
  if (displayName) return displayName;
  if (!u.isAnonymous && u.email) {
    return String(u.email).split('@')[0] || 'Xin chào';
  }
  if (u.uid) return String(u.uid).slice(0, 6);
  return 'Xin chào';
}

function parseLevelIndexFromLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Math.max(1, Number(m[1]) || 1);
  return n - 1;
}

const ICON_STAT = 30;
const ICON_FEATURE = 26;
const ICON_PROFILE = 20;
const ICON_MENU = 18;
/** Đệm cuối ScrollView khi có dock «Tiếp tục học» cố định đáy màn */
const CONTINUE_DOCK_SCROLL_PADDING = 132;

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

/** Bảng xếp hạng & lộ trình tính năng */
function LeaderboardRowIcon() {
  return <Feather name="award" size={28} color={COLORS.PRIMARY} />;
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
const TEXT_GRAY_600 = '#4B5563';

const HomeScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState(() => deriveUserNameFallback());
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const hasAnimatedRef = useRef(false);
  const [animatedValues] = useState({
    card1: new Animated.Value(0),
    card2: new Animated.Value(0),
    card3: new Animated.Value(0),
    learningBlock: new Animated.Value(0),
  });

  const [progress, setProgress] = useState({
    wordsLearned: 0,
    videosWatched: 0,
    dialoguesCompleted: 0,
    totalXP: 0,
    level: 'Sơ cấp',
  });
  const [continueSnap, setContinueSnap] = useState(null);
  const [continueNavigating, setContinueNavigating] = useState(false);
  const loadProgress = useCallback(async () => {
    try {
      // Đảm bảo cache/user data được nạp trước khi đọc progress cho Home.
      try {
        await preloadEssentialData();
      } catch (_) {}

      const isMeaningfulProgress = (lp) => {
        if (!lp || typeof lp !== 'object') return false;
        const words = Array.isArray(lp.wordsLearned) ? lp.wordsLearned.length : 0;
        const videos = Array.isArray(lp.videosWatched) ? lp.videosWatched.length : 0;
        const dialogues = Array.isArray(lp.dialoguesCompleted)
          ? lp.dialoguesCompleted.length
          : 0;
        const xp = Math.max(
          0,
          Number(lp.totalXP) || Number(lp.totalXp) || Number(lp.xp) || 0,
        );
        const hasWordStats =
          lp.wordStats && typeof lp.wordStats === 'object'
            ? Object.keys(lp.wordStats).length > 0
            : false;
        const hasVideoViews =
          lp.videoViewCounts && typeof lp.videoViewCounts === 'object'
            ? Object.keys(lp.videoViewCounts).length > 0
            : false;
        return words > 0 || videos > 0 || dialogues > 0 || xp > 0 || hasWordStats || hasVideoViews;
      };

      const initialProgress = await getLearningProgress().catch(() => null);
      let savedProgress =
        initialProgress && typeof initialProgress === 'object' ? initialProgress : {};
      if (!isMeaningfulProgress(savedProgress)) {
        const fromCache = await getLearningProgress({source: 'cache'}).catch(() => null);
        if (fromCache && typeof fromCache === 'object' && isMeaningfulProgress(fromCache)) {
          savedProgress = fromCache;
        } else {
          const fromServer = await getLearningProgress({source: 'server'}).catch(() => null);
          if (
            fromServer &&
            typeof fromServer === 'object' &&
            isMeaningfulProgress(fromServer)
          ) {
            savedProgress = fromServer;
          }
        }
      }
      let learnedCount = 0;
      const rawWordsLearnedCount = Array.isArray(savedProgress?.wordsLearned)
        ? savedProgress.wordsLearned.length
        : 0;
      try {
        learnedCount = await getResolvableLearnedWordsCount();
      } catch (_) {
        learnedCount = rawWordsLearnedCount;
      }
      // Nếu cache từ vựng/video chưa kịp nạp, resolve có thể trả 0 giả.
      if (learnedCount <= 0 && rawWordsLearnedCount > 0) {
        learnedCount = rawWordsLearnedCount;
      }
      const dialoguesCompletedCount = Array.isArray(savedProgress?.dialoguesCompleted)
        ? savedProgress.dialoguesCompleted.length
        : 0;
      const videosWatchedCount = Array.isArray(savedProgress?.videosWatched)
        ? savedProgress.videosWatched.length
        : savedProgress?.videoViewCounts && typeof savedProgress.videoViewCounts === 'object'
          ? Object.keys(savedProgress.videoViewCounts).length
          : 0;
      const xpFromLegacy = Math.max(
        0,
        Number(savedProgress?.totalXP) ||
          Number(savedProgress?.totalXp) ||
          Number(savedProgress?.xp) ||
          0,
      );

      setProgress({
        wordsLearned: learnedCount,
        videosWatched: videosWatchedCount,
        dialoguesCompleted: dialoguesCompletedCount,
        totalXP: xpFromLegacy,
        level: savedProgress?.level || 'Sơ cấp',
      });
      setContinueSnap(pickFreshContinueLearning(savedProgress));
    } catch (error) {
      console.error('Error loading progress:', error);
      setContinueSnap(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setShowProfileMenu(false);
    const auth = getAuthService();
    if (auth) {
      await auth.signOut();
    }
  }, []);

  const refreshUserName = useCallback(async () => {
    const authSvc = getAuthService();
    const tryPickName = async () => {
      let picked = '';
      try {
        const ud = await getUserData();
        if (ud && typeof ud === 'object') {
          picked =
            String(ud.displayName || ud.name || '').trim() ||
            (typeof ud.fullName === 'string' ? ud.fullName.trim() : '') ||
            String(ud.nickname || ud.username || ud.profileName || '').trim();
        }
      } catch (_) {}
      const user = authSvc?.getCurrentUser?.() ?? null;
      const nativeUser = getNativeAuthCurrentUser();
      const finalUser = user || nativeUser;
      if (!picked && user?.displayName) {
        picked = String(user.displayName).trim();
      }
      if (!picked && finalUser?.displayName) {
        picked = String(finalUser.displayName).trim();
      }
      if (!picked && finalUser && !finalUser.isAnonymous && finalUser.email) {
        picked = finalUser.email.split('@')[0] || '';
      }
      if (!picked && finalUser?.uid) {
        picked = String(finalUser.uid).slice(0, 6);
      }
      return picked;
    };

    let name = '';
    try {
      name = await tryPickName();
      if (!name) {
        // App vừa mở có thể auth/profile chưa kịp restore.
        await new Promise((r) => setTimeout(r, 700));
        name = await tryPickName();
      }
    } catch (_) {
      // keep fallback below
    }
    setUserName(name || 'Xin chào');
  }, []);

  const handleContinueLearning = useCallback(async () => {
    const tab = navigation.getParent?.();
    if (!tab) return;
    const snap = continueSnap;
    if (!snap?.kind || continueNavigating) return;
    setContinueNavigating(true);
    try {
      const k = String(snap.kind);
      if (
        k === CONTINUE_KIND.VOCAB_TOPIC ||
        k === CONTINUE_KIND.VOCAB_FLASHCARD
      ) {
        const detailParams = await buildVocabularyTopicDetailResume(snap.topicId);
        if (!detailParams) {
          Alert.alert(
            'Không mở được',
            'Chủ đề không còn trong danh sách hoặc chưa có từ.',
          );
          return;
        }
        tab?.navigate('VocabularyTab', {
          screen: 'Vocabulary',
          params: {
            screen: 'VocabularyTopicDetail',
            params: detailParams,
          },
        });
        return;
      }
      if (k === CONTINUE_KIND.VIDEO) {
        await loadVideosFromFirebase().catch(() => {});
        const list = getAllVideos();
        const video = list.find(v => String(v?.id) === String(snap.videoId));
        if (!video) {
          Alert.alert(
            'Không mở được',
            'Video không còn trong danh sách.',
          );
          return;
        }
        tab?.navigate('VideoTab', {
          screen: 'VideoLearning',
          params: {video},
        });
        return;
      }
      if (k === CONTINUE_KIND.DIALOGUE) {
        tab?.navigate('DialogueTab', {
          screen: 'DialoguePractice',
          params: {
            scenarioId: snap.scenarioId,
            partnerId: 'us',
          },
        });
      }
    } catch (e) {
      Alert.alert('Lỗi', String(e?.message || 'Không thể tiếp tục.'));
    } finally {
      setContinueNavigating(false);
    }
  }, [continueNavigating, continueSnap, navigation]);

  const continueSubtitleText = useMemo(() => {
    if (!continueSnap) return '';
    const k = String(continueSnap.kind);
    if (
      k === CONTINUE_KIND.VOCAB_TOPIC ||
      k === CONTINUE_KIND.VOCAB_FLASHCARD
    ) {
      return String(continueSnap.topicName || 'Bộ từ vựng').trim();
    }
    if (k === CONTINUE_KIND.VIDEO) {
      return String(continueSnap.videoTitle || 'Video').trim();
    }
    if (k === CONTINUE_KIND.DIALOGUE) {
      return String(continueSnap.scenarioTitle || 'Hội thoại').trim();
    }
    return '';
  }, [continueSnap]);

  const continueKindLabel = useMemo(() => {
    if (!continueSnap) return '';
    const k = String(continueSnap.kind);
    if (k === CONTINUE_KIND.VOCAB_FLASHCARD) return 'Flashcard';
    if (k === CONTINUE_KIND.VOCAB_TOPIC) return 'Từ vựng';
    if (k === CONTINUE_KIND.VIDEO) return 'Video';
    if (k === CONTINUE_KIND.DIALOGUE) return 'Hội thoại';
    return '';
  }, [continueSnap]);

  const continueDashboardPalette = useMemo(() => {
    const k = String(continueSnap?.kind || '');
    if (k === CONTINUE_KIND.VIDEO) {
      return {
        cardBorder: 'rgba(34, 197, 94, 0.35)',
        iconBg: '#FFFFFF',
        iconColor: '#15803D',
        accentBar: '#22C55E',
        featherIcon: 'video',
        cardGradient: ['#FFFFFF', '#ECFDF5'],
        iconRing: 'rgba(21, 128, 61, 0.18)',
        ctaBg: '#15803D',
        ctaText: '#FFFFFF',
      };
    }
    if (k === CONTINUE_KIND.DIALOGUE) {
      return {
        cardBorder: 'rgba(139, 92, 246, 0.35)',
        iconBg: '#FFFFFF',
        iconColor: '#6D28D9',
        accentBar: '#8B5CF6',
        featherIcon: 'message-circle',
        cardGradient: ['#FFFFFF', '#F5F3FF'],
        iconRing: 'rgba(109, 40, 217, 0.2)',
        ctaBg: '#6D28D9',
        ctaText: '#FFFFFF',
      };
    }
    if (k === CONTINUE_KIND.VOCAB_FLASHCARD) {
      return {
        cardBorder: 'rgba(251, 146, 60, 0.45)',
        iconBg: '#FFFFFF',
        iconColor: '#C2410C',
        accentBar: COLORS.PRIMARY,
        featherIcon: 'layers',
        cardGradient: ['#FFFFFF', '#FFF4E6'],
        iconRing: 'rgba(194, 65, 12, 0.22)',
        ctaBg: COLORS.PRIMARY_DARK,
        ctaText: '#FFFFFF',
      };
    }
    return {
      cardBorder: 'rgba(59, 130, 246, 0.35)',
      iconBg: '#FFFFFF',
      iconColor: '#1D4ED8',
      accentBar: '#3B82F6',
      featherIcon: 'book-open',
      cardGradient: ['#FFFFFF', '#EFF6FF'],
      iconRing: 'rgba(29, 78, 216, 0.18)',
      ctaBg: '#1D4ED8',
      ctaText: '#FFFFFF',
    };
  }, [continueSnap?.kind]);

  const navigateToFeature = id => {
    const tab = navigation.getParent?.();
    if (!tab) return;
    if (id === 1) {
      tab?.navigate('VocabularyTab');
    } else if (id === 2) {
      tab?.navigate('VideoTab', {
        screen: 'VideoSelection',
      });
    } else if (id === 3) {
      tab?.navigate('DialogueTab');
    } else if (id === 4) {
      tab?.navigate('VocabularyTab', {
        screen: 'Vocabulary',
        params: {initialVocabTab: 'review'},
      });
    }
  };

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthStateChanged(authInstance, () => {
        refreshUserName();
        loadProgress();
      });
    } catch (_) {
      refreshUserName();
      loadProgress();
    }
    return () => unsub();
  }, [refreshUserName, loadProgress]);

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

      if (!hasAnimatedRef.current) {
        hasAnimatedRef.current = true;
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
          Animated.spring(animatedValues.learningBlock, {
            toValue: 1,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, [animatedValues, refreshUserName]),
  );

  const levelInfo = getLevelInfo(progress.totalXP || 0);
  const forcedLevelIndex =
    Number(progress.totalXP || 0) <= 0 ? parseLevelIndexFromLabel(progress.level) : null;
  const shownLevelIndex =
    forcedLevelIndex != null ? forcedLevelIndex : levelInfo.levelIndex;

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

  const scrollBottomPad = continueSnap
    ? CONTINUE_DOCK_SCROLL_PADDING
    : styles.bottomSpacing.height;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Không pad bottom: Tab Navigator + tabBar đã chừa safe area; pad bottom ở đây tạo khoảng trắng trên nav */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <View style={styles.homeInner}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{paddingBottom: scrollBottomPad}}
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
              <View style={styles.headerUserInfo}>
                <Text style={styles.headerUserName} numberOfLines={1}>
                  {userName || deriveUserNameFallback()}
                </Text>
              </View>
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

                    {/* Nút vào khu vực quản trị đã được gỡ khỏi bản app học viên */}

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

        <View style={[styles.card, styles.levelCard]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Cấp độ hiện tại</Text>
            <View style={styles.currentLevelBadge}>
              <Text style={styles.currentLevelBadgeText}>Cấp {shownLevelIndex + 1}</Text>
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
                : `Tới cấp độ ${shownLevelIndex + 2}`}
            </Text>
            <Text style={styles.levelXpHighlight}>{xpLabel}</Text>
          </View>
        </View>

        <View style={[styles.card, styles.leaderboardCard]}>
          <TouchableOpacity
            style={styles.rowCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('LearningPath')}>
            <View style={styles.rowCardIconWrap}>
              <LeaderboardRowIcon />
            </View>
            <View style={styles.rowCardTextWrap}>
              <Text style={styles.rowCardTitle}>Bảng xếp hạng</Text>
              <Text style={styles.rowCardSubTitle}>
                Top XP tuần và thứ hạng của bạn
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={22}
              color={TEXT_GRAY_500}
              style={styles.rowCardChevron}
            />
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.sectionBlock,
            getCardStyle(animatedValues.learningBlock),
          ]}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionHeading}>Tính năng học tập</Text>
            </View>
          </View>

          <View style={styles.learningFeaturesGrid}>
            <View style={styles.learningGridRow}>
              <TouchableOpacity
                style={[styles.featureTile, styles.featureTileVocab]}
                activeOpacity={0.88}
                onPress={() => navigateToFeature(1)}
                accessibilityRole="button"
                accessibilityLabel="Học từ vựng">
                <View style={[styles.featureTileIconCircle, styles.featureTileIconCircleVocab]}>
                  <Feather name="book-open" size={ICON_FEATURE} color="#2563EB" />
                </View>
                <Text style={styles.featureTileTitle}>Từ vựng</Text>
                <Text style={styles.featureTileHint} numberOfLines={2}>
                  Flashcard, bộ từ
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.featureTile, styles.featureTileVideo]}
                activeOpacity={0.88}
                onPress={() => navigateToFeature(2)}
                accessibilityRole="button"
                accessibilityLabel="Học qua video">
                <View style={[styles.featureTileIconCircle, styles.featureTileIconCircleVideo]}>
                  <Feather name="video" size={ICON_FEATURE} color="#16A34A" />
                </View>
                <Text style={styles.featureTileTitle}>Video</Text>
                <Text style={styles.featureTileHint} numberOfLines={2}>
                  Phụ đề & từ khoá
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.learningGridRow}>
              <TouchableOpacity
                style={[styles.featureTile, styles.featureTileDialogue]}
                activeOpacity={0.88}
                onPress={() => navigateToFeature(3)}
                accessibilityRole="button"
                accessibilityLabel="Luyện hội thoại">
                <View style={[styles.featureTileIconCircle, styles.featureTileIconCircleDialogue]}>
                  <Feather name="message-circle" size={ICON_FEATURE} color="#7C3AED" />
                </View>
                <Text style={styles.featureTileTitle}>Hội thoại</Text>
                <Text style={styles.featureTileHint} numberOfLines={2}>
                  Nghe mẫu, thực hành
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.featureTile, styles.featureTileExam]}
                activeOpacity={0.88}
                onPress={() => navigateToFeature(4)}
                accessibilityRole="button"
                accessibilityLabel="Làm bài kiểm tra">
                <View style={[styles.featureTileIconCircle, styles.featureTileIconCircleExam]}>
                  <Feather name="clipboard" size={ICON_FEATURE} color="#C2410C" />
                </View>
                <Text style={styles.featureTileTitle}>Kiểm tra</Text>
                <Text style={styles.featureTileHint} numberOfLines={2}>
                  Trắc nghiệm, ôn tập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

      </ScrollView>

      {continueSnap ? (
        <View style={styles.continueDockOuter} pointerEvents="box-none">
          <View style={styles.continueDockInner}>
            <View style={styles.continueSectionHeading}>
              <LinearGradient
                colors={['#FFF7ED', '#FFEDD5']}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
                style={styles.continueSectionHeadingIcon}>
                <Feather name="zap" size={14} color={COLORS.PRIMARY_DARK} />
              </LinearGradient>
              <View style={styles.continueSectionHeadingTextCol}>
                <Text style={styles.continueCompactSectionLabel}>Tiếp tục học</Text>
                <Text style={styles.continueSectionHeadingSub}>
                  Bấm thẻ để vào đúng chỗ bạn dở
                </Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={handleContinueLearning}
              disabled={continueNavigating}
              accessibilityRole="button"
              accessibilityLabel="Tiếp tục học">
              <LinearGradient
                colors={continueDashboardPalette.cardGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
                style={[
                  styles.continueCompactCard,
                  {
                    borderColor: continueDashboardPalette.cardBorder,
                  },
                ]}>
                <View
                  style={[
                    styles.continueCompactAccent,
                    {backgroundColor: continueDashboardPalette.accentBar},
                  ]}
                />
                <View style={styles.continueCompactRow}>
                  <View
                    style={[
                      styles.continueCompactIconCircle,
                      {
                        backgroundColor: continueDashboardPalette.iconBg,
                        borderColor: continueDashboardPalette.iconRing,
                      },
                    ]}>
                    <Feather
                      name={continueDashboardPalette.featherIcon}
                      size={22}
                      color={continueDashboardPalette.iconColor}
                    />
                  </View>
                  <View style={styles.continueCompactTextCol}>
                    <View
                      style={[
                        styles.continueCompactKindPill,
                        {borderColor: continueDashboardPalette.iconRing},
                      ]}>
                      <Text
                        style={[
                          styles.continueCompactKindText,
                          {color: continueDashboardPalette.iconColor},
                        ]}>
                        {continueKindLabel || 'Hoạt động'}
                      </Text>
                    </View>
                    <Text
                      style={styles.continueCompactTopic}
                      numberOfLines={2}>
                      {continueSubtitleText || '—'}
                    </Text>
                  </View>
                  <View style={styles.continueCompactAction}>
                    {continueNavigating ? (
                      <ActivityIndicator
                        size="small"
                        color={continueDashboardPalette.ctaBg}
                      />
                    ) : (
                      <View
                        style={[
                          styles.continueCtaPill,
                          {backgroundColor: continueDashboardPalette.ctaBg},
                        ]}>
                        <Text
                          style={[
                            styles.continueCtaPillText,
                            {color: continueDashboardPalette.ctaText},
                          ]}>
                          Tiếp tục
                        </Text>
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={continueDashboardPalette.ctaText}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  homeInner: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  headerSolid: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
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
    gap: 12,
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  headerUserInfo: {
    alignItems: 'flex-end',
    minWidth: 0,
    flexShrink: 1,
  },
  headerGreeting: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  headerUserName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: 180,
  },
  headerSubline: {
    marginTop: 1,
    fontSize: 11,
    color: 'rgba(255,255,255,0.86)',
    fontWeight: '600',
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
    marginTop: -18,
    marginBottom: 20,
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EEF8',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  quickStatNumber: {
    fontSize: 27,
    fontWeight: '800',
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
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EAF0F8',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  levelCard: {
    backgroundColor: '#FFFDFC',
  },
  leaderboardCard: {
    backgroundColor: '#FFFEFD',
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
    height: 13,
    borderRadius: 999,
    backgroundColor: '#FFE9D7',
    overflow: 'hidden',
  },
  progressFillSolid: {
    height: '100%',
    backgroundColor: '#FF7A1A',
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
  rowCardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1E3',
  },
  rowCardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_800,
  },
  rowCardSubTitle: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_GRAY_500,
    fontWeight: '600',
  },
  continueDockOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: -8},
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: {
        elevation: 18,
      },
    }),
  },
  continueDockInner: {
    marginHorizontal: 16,
    gap: 10,
  },
  continueSectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  continueSectionHeadingIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 123, 0, 0.25)',
  },
  continueSectionHeadingTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  continueCompactSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_GRAY_600,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  continueSectionHeadingSub: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_GRAY_500,
    letterSpacing: 0.1,
  },
  continueCompactCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.07,
        shadowRadius: 18,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  continueCompactAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  continueCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 14,
    gap: 12,
  },
  continueCompactIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  continueCompactTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  continueCompactKindPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  continueCompactKindText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  continueCompactTopic: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_GRAY_800,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  continueCompactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  continueCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  continueCtaPillText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  rowCardChevron: {
    flexShrink: 0,
  },

  sectionBlock: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeadingRow: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT_GRAY_800,
  },
  sectionHeadingSub: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_GRAY_500,
  },
  learningFeaturesGrid: {
    gap: 10,
  },
  learningGridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  featureTile: {
    flex: 1,
    minHeight: 132,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  featureTileVocab: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  featureTileVideo: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  featureTileDialogue: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
  },
  featureTileExam: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  featureTileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  featureTileIconCircleVocab: {
    backgroundColor: '#DBEAFE',
  },
  featureTileIconCircleVideo: {
    backgroundColor: '#D1FAE5',
  },
  featureTileIconCircleDialogue: {
    backgroundColor: '#EDE9FE',
  },
  featureTileIconCircleExam: {
    backgroundColor: '#FFEDD5',
  },
  featureTileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_800,
    marginBottom: 4,
  },
  featureTileHint: {
    fontSize: 12,
    color: TEXT_GRAY_600,
    fontWeight: '500',
    lineHeight: 16,
  },
  bottomSpacing: {
    height: 28,
  },
});

export default HomeScreen;
