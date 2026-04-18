import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {getAllVocabulary, isWordLearned} from '../../services/vocabularyService';
import {getLearningProgress} from '../../services/storageService';

const LearningPathScreen = () => {
  const [overview, setOverview] = useState({
    totalWords: 0,
    learnedWords: 0,
    percentage: 0,
    videosWatched: 0,
  });

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
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Tổng quan hoạt động */}
        <View style={[styles.overviewCard, THEME.shadow.soft]}>
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
    borderRadius: THEME.radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY_SOFT,
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
});

export default LearningPathScreen;

