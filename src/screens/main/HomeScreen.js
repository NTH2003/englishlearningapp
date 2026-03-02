import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {clearAllData, getLearningProgress} from '../../services/storageService';
import {getLearnedWordsCount} from '../../services/vocabularyService';

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

const HomeScreen = () => {
  const navigation = useNavigation();
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userName, setUserName] = useState('Người dùng');
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Hàm xử lý đăng xuất
  const handleLogout = useCallback(async () => {
    setShowProfileMenu(false);
    const auth = getAuthService();
    if (auth) {
      await auth.signOut();
    }
    await clearAllData();
  }, []);

  // Hàm điều hướng đến các màn hình tính năng
  const navigateToFeature = (featureId) => {
    if (featureId === 1) {
      navigation.navigate('Vocabulary');
    } else if (featureId === 2) {
      navigation.navigate('VideoSelection');
    } else if (featureId === 3) {
      navigation.navigate('DialogueIntro');
    }
  }

  // Dữ liệu tiến độ học tập
  const [progress, setProgress] = useState({
    wordsLearned: 0,
    lessonsCompleted: 0,
    currentStreak: 0,
    totalXP: 0,
    level: "Sơ cấp",
  })

  // Load tiến độ học tập từ storage + cập nhật tên user
  useFocusEffect(
    React.useCallback(() => {
      loadProgress();
      const auth = getAuthService();
      const user = auth ? auth.getCurrentUser() : null;
      const canAccessAdmin = auth?.isCurrentUserAdmin ? auth.isCurrentUserAdmin() : false;
      setIsAdminUser(Boolean(canAccessAdmin));
      if (user && !user.isAnonymous && user.email) {
        const shortName = user.email.split('@')[0] || 'Người dùng';
        setUserName(shortName);
      } else {
        setUserName('Người dùng');
      }
    }, []),
  );

  const loadProgress = async () => {
    try {
      const learnedCount = await getLearnedWordsCount();
      const savedProgress = await getLearningProgress();
      
      setProgress({
        wordsLearned: learnedCount,
        lessonsCompleted: savedProgress?.lessonsCompleted?.length || 0,
        currentStreak: savedProgress?.currentStreak || 0,
        totalXP: savedProgress?.totalXP || 0,
        level: savedProgress?.level || "Sơ cấp",
      });
    } catch (error) {
      console.error('Error loading progress:', error);
    }
  };

  const features = [
    {
      id: 1,
      title: "Học từ vựng",
      description: "Mở rộng vốn từ",
      icon: "📚",
      color: COLORS.PRIMARY,
    },
    {
      id: 2,
      title: "Học qua Video",
      description: "Xem video và luyện tập",
      icon: "🎬",
      color: COLORS.PRIMARY,
    },
    {
      id: 3,
      title: "Thực hành hội thoại",
      description: "Nhập vai trong tình huống thực tế",
      icon: "💬",
      color: COLORS.PRIMARY,
    },
  ]

  const totalXP = progress.totalXP || 0;
  let levelMin = 0;
  let levelMax = 100;
  if (totalXP < 100) {
    levelMin = 0;
    levelMax = 100;
  } else if (totalXP < 300) {
    levelMin = 100;
    levelMax = 300;
  } else {
    levelMin = 300;
    levelMax = 600;
  }
  const levelRange = levelMax - levelMin || 1;
  const inLevelXP = Math.min(Math.max(totalXP - levelMin, 0), levelRange);
  const levelProgressPercent = Math.round((inLevelXP / levelRange) * 100);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} bounces={true}>
        <View style={styles.headerGradient}>
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <Text style={styles.greeting}>Xin chào, {userName}! 👋</Text>
              <View style={styles.profileButtonContainer}>
                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => setShowProfileMenu(!showProfileMenu)}
                  activeOpacity={0.7}>
                  <Text style={styles.profileIcon}>👤</Text>
                </TouchableOpacity>
                
                {/* Profile Menu */}
                {showProfileMenu && (
                  <View style={styles.profileMenu}>
                <TouchableOpacity
                  style={styles.profileMenuItem}
                  onPress={() => {
                    setShowProfileMenu(false)
                    navigation.navigate('Profile')
                  }}
                  activeOpacity={0.7}>
                      <Text style={styles.profileMenuIcon}>👤</Text>
                      <Text style={styles.profileMenuText}>Hồ sơ</Text>
                    </TouchableOpacity>
                    <View style={styles.profileMenuDivider} />
                    {isAdminUser && (
                      <>
                        <TouchableOpacity
                          style={styles.profileMenuItem}
                          onPress={() => {
                            setShowProfileMenu(false)
                            navigation.navigate('Admin')
                          }}
                          activeOpacity={0.7}>
                          <Text style={styles.profileMenuIcon}>🛠️</Text>
                          <Text style={styles.profileMenuText}>Quản trị dữ liệu</Text>
                        </TouchableOpacity>
                        <View style={styles.profileMenuDivider} />
                      </>
                    )}
                    <TouchableOpacity
                      style={styles.profileMenuItem}
                      onPress={handleLogout}
                      activeOpacity={0.7}>
                      <Text style={styles.profileMenuIcon}>🚪</Text>
                      <Text style={styles.profileMenuText}>Đăng xuất</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.headerDecor} />
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Tiến độ học tập</Text>
          <View style={styles.statsContainer}>
            {/* Stat Card 1 */}
            <View style={[styles.statCard, {backgroundColor: COLORS.PRIMARY_DARK}]}>
              <Text style={styles.statIcon}>📚</Text>
              <Text style={styles.statNumber}>{progress.wordsLearned}</Text>
              <Text style={styles.statLabelWhite}>Từ vựng</Text>
            </View>

            {/* Stat Card 2 */}
            <View style={[styles.statCard, {backgroundColor: COLORS.PRIMARY_DARK}]}>
              <Text style={styles.statIcon}>📖</Text>
              <Text style={styles.statNumber}>{progress.lessonsCompleted}</Text>
              <Text style={styles.statLabelWhite}>Bài học</Text>
            </View>
          </View>

          <View style={[styles.levelBadge, {backgroundColor: COLORS.BACKGROUND}]}>
            <View style={styles.levelBadgeContent}>
              <Text style={styles.levelLabel}>Cấp độ hiện tại</Text>
              <Text style={styles.levelValue}>{progress.level || 'Sơ cấp'}</Text>
              <View style={styles.levelXpRow}>
                <View style={styles.levelXpBarBackground}>
                  <View
                    style={[
                      styles.levelXpBarFill,
                      {width: `${levelProgressPercent}%`},
                    ]}
                  />
                </View>
                <Text style={styles.levelXpText}>
                  {progress.totalXP || 0} XP
                </Text>
              </View>
            </View>
          </View>

          {/* Nút xem lộ trình chi tiết */}
          <TouchableOpacity
            style={styles.learningPathButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('LearningPath')}>
            <Text style={styles.learningPathIcon}>📈</Text>
            <View style={styles.learningPathTextWrapper}>
              <Text style={styles.learningPathTitle}>Hoạt động của tôi</Text>
              <Text style={styles.learningPathSubtitle}>
                Thống kê từ đã học và video đã xem
              </Text>
            </View>
          </TouchableOpacity>

          {/* Nút xem từ yêu thích */}
          <TouchableOpacity
            style={styles.learningPathButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MyVocabulary')}>
            <Text style={styles.learningPathIcon}>★</Text>
            <View style={styles.learningPathTextWrapper}>
              <Text style={styles.learningPathTitle}>Từ vựng của tôi</Text>
              <Text style={styles.learningPathSubtitle}>
                Xem danh sách từ đã yêu thích
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tính năng học tập</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>Xem tất cả →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.featuresGrid}>
            {features.map((feature, index) => {
              const isLastOdd = features.length % 2 === 1 && index === features.length - 1
              return (
              <TouchableOpacity
                key={feature.id}
                onPress={() => {
                  setSelectedFeature(feature.id);
                  navigateToFeature(feature.id);
                }}
                activeOpacity={0.8}
                style={[
                  styles.featureCardWrapper,
                  isLastOdd && styles.featureCardWrapperLastOdd,
                  selectedFeature === feature.id && styles.featureCardActive,
                ]}
              >
                <View
                  style={[
                    styles.featureCard,
                    isLastOdd && styles.featureCardLastOdd,
                    {backgroundColor: feature.color},
                  ]}>
                  <Text style={styles.featureIcon}>{feature.icon}</Text>
                  <Text
                    style={styles.featureTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail">
                    {feature.title}
                  </Text>
                  <Text
                    style={styles.featureDescription}
                    numberOfLines={2}
                    ellipsizeMode="tail">
                    {feature.description}
                  </Text>
                </View>
              </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollView: {
    flex: 1,
  },
  // Header Styles - Đồng nhất
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    position: "relative",
    overflow: "visible",
    backgroundColor: COLORS.PRIMARY,
  },
  headerDecor: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  headerContent: {
    position: "relative",
    zIndex: 1,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.BACKGROUND_WHITE,
    flex: 1,
  },
  // Profile Button & Menu - Đồng nhất
  profileButtonContainer: {
    position: "relative",
    marginLeft: 12,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileIcon: {
    fontSize: 20,
  },
  profileMenu: {
    position: "absolute",
    top: 45,
    right: 0,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  profileMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileMenuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  profileMenuText: {
    fontSize: 15,
    color: COLORS.TEXT,
    fontWeight: "500",
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginVertical: 4,
  },
  // Stats Section - Đồng nhất
  statsSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginTop: -20,
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.TEXT,
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.BACKGROUND_WHITE,
    marginBottom: 4,
  },
  statLabelWhite: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
  },
  levelBadge: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.PRIMARY_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  levelBadgeContent: {
    flex: 1,
  },
  levelLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4,
    fontWeight: "500",
  },
  levelValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  streakText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
  },
  progressCircle: {
    display: 'none',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.TEXT,
  },
  levelXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  levelXpBarBackground: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.BORDER,
    overflow: 'hidden',
  },
  levelXpBarFill: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 999,
  },
  levelXpText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.TEXT_SECONDARY,
  },
  learningPathButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.BACKGROUND,
  },
  learningPathIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  learningPathTextWrapper: {
    flex: 1,
  },
  learningPathTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 2,
  },
  learningPathSubtitle: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  // Section Styles - Đồng nhất
  section: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.PRIMARY,
    fontWeight: "600",
  },
  // Feature Cards - Đồng nhất
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  featureCardWrapper: {
    width: "48%",
    marginBottom: 12,
  },
  featureCardWrapperLastOdd: {
    width: "100%",
    alignItems: "center",
  },
  featureCardActive: {
    transform: [{ scale: 0.95 }],
  },
  featureCard: {
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    height: 150,
    justifyContent: "center",
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  featureCardLastOdd: {
    width: "48%",
  },
  featureIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.BACKGROUND_WHITE,
    marginBottom: 4,
    textAlign: "center",
  },
  featureDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.85)",
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  bottomSpacing: {
    height: 20,
  },
})

export default HomeScreen
