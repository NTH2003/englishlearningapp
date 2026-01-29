import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../constants';
import {
  getAllVocabulary,
  isWordLearned,
} from '../services/vocabularyService';
import {getLearningProgress} from '../services/storageService';

const TOPICS = [
  {
    id: 'Food',
    name: 'Thực phẩm',
    icon: '🍔',
    color: '#FF6B6B',
    description: 'Từ vựng về đồ ăn, thức uống và nhà hàng',
  },
  {
    id: 'Travel',
    name: 'Du lịch',
    icon: '✈️',
    color: '#4ECDC4',
    description: 'Từ vựng về du lịch, sân bay, khách sạn',
  },
  {
    id: 'Daily Life',
    name: 'Cuộc sống hàng ngày',
    icon: '🏠',
    color: '#45B7D1',
    description: 'Từ vựng về thói quen và sinh hoạt thường ngày',
  },
  {
    id: 'Technology',
    name: 'Công nghệ',
    icon: '💻',
    color: '#96CEB4',
    description: 'Từ vựng về máy tính, internet và thiết bị số',
  },
];

const LearningPathScreen = () => {
  const [overview, setOverview] = useState({
    totalWords: 0,
    learnedWords: 0,
    percentage: 0,
    videosWatched: 0,
  });
  const [topicProgress, setTopicProgress] = useState({});

  useFocusEffect(
    React.useCallback(() => {
      loadProgress();
    }, []),
  );

  const loadProgress = async () => {
    const allWords = getAllVocabulary();

    // Tổng quan từ vựng
    let learned = 0;
    for (const w of allWords) {
      const learnedFlag = await isWordLearned(w.id);
      if (learnedFlag) learned += 1;
    }
    const total = allWords.length;

    // Tiến độ khác: video đã xem
    const storedProgress = await getLearningProgress();
    const videosWatched =
      storedProgress?.videosWatched && Array.isArray(storedProgress.videosWatched)
        ? storedProgress.videosWatched.length
        : 0;

    setOverview({
      totalWords: total,
      learnedWords: learned,
      percentage: total > 0 ? Math.round((learned / total) * 100) : 0,
      videosWatched,
    });

    // Theo từng chủ đề
    const perTopic = {};
    for (const topic of TOPICS) {
      const wordsInTopic = allWords.filter(w => w.category === topic.id);
      let learnedCount = 0;
      for (const w of wordsInTopic) {
        const flag = await isWordLearned(w.id);
        if (flag) learnedCount += 1;
      }
      perTopic[topic.id] = {
        total: wordsInTopic.length,
        learned: learnedCount,
        percentage:
          wordsInTopic.length > 0
            ? Math.round((learnedCount / wordsInTopic.length) * 100)
            : 0,
      };
    }
    setTopicProgress(perTopic);
  };

  const getTopicProgress = topicId =>
    topicProgress[topicId] || {total: 0, learned: 0, percentage: 0};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Tổng quan hoạt động */}
        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>Hoạt động của tôi</Text>
          <Text style={styles.overviewSubtitle}>
            Thống kê nhanh các từ đã học, video đã xem và tiến độ theo chủ đề.
          </Text>

          <View style={styles.overviewStatsRow}>
            <View style={styles.overviewStatBox}>
              <Text style={styles.overviewStatLabel}>Từ đã học</Text>
              <Text style={styles.overviewStatValue}>
                {overview.learnedWords}
              </Text>
            </View>
            <View style={styles.overviewStatBox}>
              <Text style={styles.overviewStatLabel}>Video đã xem</Text>
              <Text style={styles.overviewStatValue}>
                {overview.videosWatched}
              </Text>
            </View>
            <View style={styles.overviewStatBox}>
              <Text style={styles.overviewStatLabel}>Tiến độ từ vựng</Text>
              <Text style={styles.overviewStatValue}>
                {overview.percentage}%
              </Text>
            </View>
          </View>

          <View style={styles.overviewProgressBar}>
            <View
              style={[
                styles.overviewProgressFill,
                {width: `${overview.percentage}%`},
              ]}
            />
          </View>
        </View>

        {/* Có thể bổ sung thêm thống kê khác ở đây trong tương lai */}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  overviewCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: COLORS.CARD_SHADOW,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  overviewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  overviewSubtitle: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12,
  },
  overviewStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  overviewStatBox: {
    flex: 1,
    marginRight: 8,
  },
  overviewStatLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  overviewStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
  },
  overviewProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.BORDER,
    overflow: 'hidden',
  },
  overviewProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.PRIMARY_DARK,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 8,
    marginTop: 4,
  },
  topicCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: COLORS.CARD_SHADOW,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topicIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  topicIcon: {
    fontSize: 22,
  },
  topicTextWrapper: {
    flex: 1,
  },
  topicName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 2,
  },
  topicDescription: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  topicPercent: {
    fontSize: 16,
    fontWeight: '700',
  },
  topicProgressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.BORDER,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 6,
  },
  topicProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  topicStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  topicStatText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
});

export default LearningPathScreen;

