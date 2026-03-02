import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {COLORS} from '../../constants';
import {
  getLessonById,
  getAllVocabulary,
  isWordLearned,
} from '../../services/vocabularyService';

const LessonDetailScreen = ({route}) => {
  const lessonId = route?.params?.lessonId;
  const [lesson, setLesson] = useState(null);
  const [words, setWords] = useState([]);
  const [learnedStatus, setLearnedStatus] = useState({});

  useEffect(() => {
    if (lessonId) {
      loadLesson();
    }
  }, [lessonId]);

  const loadLesson = async () => {
    const lessonData = getLessonById(parseInt(lessonId));
    if (!lessonData) {
      return;
    }

    setLesson(lessonData);

    // Load words for this lesson
    const allWords = getAllVocabulary();
    const lessonWords = allWords.filter(word =>
      lessonData.words.includes(word.id)
    );
    setWords(lessonWords);

    // Load learned status
    const status = {};
    for (const word of lessonWords) {
      status[word.id] = await isWordLearned(word.id);
    }
    setLearnedStatus(status);
  };

  const getLearnedCount = () => {
    return Object.values(learnedStatus).filter(status => status === true)
      .length;
  };

  const getProgressPercentage = () => {
    if (words.length === 0) return 0;
    return Math.round((getLearnedCount() / words.length) * 100);
  };


  if (!lesson) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Lesson Header */}
        <View style={styles.lessonHeader}>
          <Text style={styles.lessonTitle}>{lesson.title}</Text>
          <View style={styles.lessonMeta}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{lesson.category}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{lesson.level}</Text>
            </View>
          </View>
          <Text style={styles.lessonDescription}>{lesson.description}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{words.length}</Text>
              <Text style={styles.statLabel}>Tổng từ</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{getLearnedCount()}</Text>
              <Text style={styles.statLabel}>Đã học</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{getProgressPercentage()}%</Text>
              <Text style={styles.statLabel}>Tiến độ</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                {width: `${getProgressPercentage()}%`},
              ]}
            />
          </View>
        </View>

        {/* Words List */}
        <View style={styles.wordsSection}>
            <Text style={styles.sectionTitle}>Danh sách từ vựng</Text>
            {words.map(word => (
            <View
              key={word.id}
              style={styles.wordCard}>
              <View style={styles.wordHeader}>
                <View style={styles.wordInfo}>
                  <Text style={styles.wordText}>{word.word}</Text>
                  <Text style={styles.pronunciationText}>{word.pronunciation}</Text>
                </View>
                {learnedStatus[word.id] && (
                  <View style={styles.learnedBadge}>
                    <Text style={styles.learnedBadgeText}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={styles.meaningText}>{word.meaning}</Text>
            </View>
            ))}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
  },
  lessonHeader: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  lessonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  lessonMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    backgroundColor: COLORS.PRIMARY + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.PRIMARY_DARK,
  },
  lessonDescription: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 22,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  wordsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 16,
  },
  wordCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  wordInfo: {
    flex: 1,
  },
  wordText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 4,
  },
  pronunciationText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  learnedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  learnedBadgeText: {
    fontSize: 18,
    color: COLORS.BACKGROUND_WHITE,
    fontWeight: 'bold',
  },
  meaningText: {
    fontSize: 16,
    color: COLORS.TEXT,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 4,
  },
});

export default LessonDetailScreen;
