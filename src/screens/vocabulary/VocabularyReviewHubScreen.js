import React, {useCallback, useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {
  getAllVocabulary,
  loadVocabularyFromFirebase,
  wordBelongsToTopic,
} from '../../services/vocabularyService';
import {getLearningProgress, getTopics} from '../../services/storageService';
import {LEARNING_PROGRESS_UPDATED} from '../../services/learningProgressEvents';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUIZ_THEME = {
  border: '#7C3AED',
  icon: '#7C3AED',
  iconSoft: '#EDE9FE',
};

export default function VocabularyReviewHubScreen() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [learnedCount, setLearnedCount] = useState(0);
  const [totalWordsInApp, setTotalWordsInApp] = useState(0);
  const [learnedWords, setLearnedWords] = useState([]);
  const [wrongIdSet, setWrongIdSet] = useState(() => new Set());
  const [topics, setTopics] = useState([]);
  const [topicsProgress, setTopicsProgress] = useState({});

  const load = useCallback(async () => {
    try {
      if (getAllVocabulary().length === 0) {
        try {
          await loadVocabularyFromFirebase({force: true});
        } catch (_) {}
      }
      const lp = await getLearningProgress();
      const learnedIds = new Set(
        Array.isArray(lp?.wordsLearned)
          ? lp.wordsLearned.map((id) => String(id))
          : [],
      );
      const allWords = getAllVocabulary();
      const vocabIds = new Set(allWords.map((w) => String(w.id)));
      const rwRaw = Array.isArray(lp?.reviewWrongWordIds)
        ? lp.reviewWrongWordIds.map((id) => String(id))
        : [];
      const rw = new Set(
        rwRaw.filter((id) => learnedIds.has(id) && vocabIds.has(id)),
      );
      const learned = allWords.filter((w) => learnedIds.has(String(w.id)));
      setWrongIdSet(rw);
      setLearnedWords(learned);
      setLearnedCount(learned.length);
      setTotalWordsInApp(allWords.length);

      let topicsList = [];
      try {
        topicsList = await getTopics([]);
      } catch (_) {
        topicsList = [];
      }
      if (!Array.isArray(topicsList)) topicsList = [];
      const progress = {};
      for (const topic of topicsList) {
        const topicWords = allWords.filter((word) =>
          wordBelongsToTopic(word, topic.id),
        );
        const learnedInTopic = topicWords.filter((word) =>
          learnedIds.has(String(word.id)),
        ).length;
        progress[topic.id] = {
          total: topicWords.length,
          learned: learnedInTopic,
          percentage:
            topicWords.length > 0
              ? Math.round((learnedInTopic / topicWords.length) * 100)
              : 0,
        };
      }
      setTopics(topicsList);
      setTopicsProgress(progress);
    } catch {
      setWrongIdSet(new Set());
      setLearnedWords([]);
      setLearnedCount(0);
      setTotalWordsInApp(0);
      setTopics([]);
      setTopicsProgress({});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      load();
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openQuizFromPool = (pool, labelHint) => {
    if (!pool || pool.length < 4) {
      Alert.alert(
        'Chưa đủ từ',
        'Trắc nghiệm cần ít nhất 4 từ đã thuộc. Hãy học thêm ở tab Từ vựng trước.',
      );
      return;
    }
    const picked = shuffle(pool).slice(0, Math.min(10, pool.length));
    navigation.navigate('VocabularyQuiz', {
      words: picked,
      topicId: 'review',
      topicName: labelHint || 'Ôn tập',
    });
  };

  const openTypingFromPool = (pool, labelHint) => {
    if (!pool || !pool.length) {
      Alert.alert('Chưa có từ', 'Hiện chưa có từ để luyện tập.');
      return;
    }
    const picked = shuffle(pool).slice(0, Math.min(20, pool.length));
    navigation.navigate('VocabularyTyping', {
      words: picked,
      topicId: 'review',
      topicName: labelHint || 'Ôn tập',
    });
  };

  const openQuickChallenge = () => {
    if (!learnedWords.length) {
      Alert.alert(
        'Chưa có từ đã thuộc',
        'Hãy học một vài từ trước khi bắt đầu Thử thách 60 giây.',
      );
      return;
    }
    const picked = shuffle(learnedWords).slice(0, Math.min(24, learnedWords.length));
    navigation.navigate('VocabularyQuickChallenge', {
      words: picked,
      topicName: 'Ôn tập tốc độ',
    });
  };

  const openReviewPractice = () => {
    if (totalWordsInApp === 0) {
      Alert.alert(
        'Chưa có từ vựng',
        'Hãy đợi nội dung được tải hoặc thêm bộ từ trong phần quản trị.',
      );
      return;
    }
    if (!learnedWords.length) {
      Alert.alert(
        'Chưa có từ đã thuộc',
        'Hãy học từ mới ở tab Từ vựng trước — ôn tập chỉ dùng các từ bạn đã đánh dấu đã thuộc.',
      );
      return;
    }
    if (learnedWords.length >= 4) {
      openQuizFromPool(learnedWords, 'Ôn tập — kiểm tra');
      return;
    }
    openTypingFromPool(learnedWords, 'Ôn tập — viết từ');
  };

  const openQuizLearned = () => {
    openQuizFromPool(learnedWords, 'Ôn tập — kiểm tra');
  };

  const openCompletedTopicPractice = (topic) => {
    const allWords = getAllVocabulary();
    const topicWords = allWords.filter((w) => wordBelongsToTopic(w, topic.id));
    if (!topicWords.length) {
      Alert.alert('Không có từ', 'Bộ này chưa có từ trong kho.');
      return;
    }
    if (topicWords.length >= 4) {
      openQuizFromPool(topicWords, `${topic.name} — kiểm tra`);
      return;
    }
    openTypingFromPool(topicWords, `${topic.name} — viết từ`);
  };

  const wrongAgainCount = learnedWords.filter((w) =>
    wrongIdSet.has(String(w.id)),
  ).length;
  const wrongWords = learnedWords.filter((w) => wrongIdSet.has(String(w.id)));
  const completedTopics = topics.filter((t) => {
    const p = topicsProgress[t.id];
    return p && p.total > 0 && p.percentage === 100;
  });

  const canQuizLearned = learnedWords.length >= 4;

  const openWrongWordsPractice = () => {
    if (!wrongWords.length) {
      Alert.alert(
        'Không có từ sai',
        'Bạn chưa có từ nào cần ôn lại trong danh sách lỗi gần đây.',
      );
      return;
    }
    if (wrongWords.length >= 4) {
      openQuizFromPool(wrongWords, 'Ôn lại từ làm sai');
      return;
    }
    openTypingFromPool(wrongWords, 'Ôn lại từ làm sai');
  };

  return (
    <View style={styles.screenRoot}>
      <View style={styles.stickyTop}>
        <View style={styles.statsRow}>
          <StatMini
            label="Đã thuộc"
            value={learnedCount}
            icon="check-circle"
            bg="#DCFCE7"
            iconColor="#16A34A"
          />
          <StatMini
            label="Cần ôn lại"
            value={wrongAgainCount}
            icon="refresh-cw"
            bg="#FFEDD5"
            iconColor="#EA580C"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.PRIMARY_DARK]}
          />
        }>
        {totalWordsInApp === 0 ? (
          <View style={styles.hintCard}>
            <Feather name="inbox" size={22} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.hintTitle}>Chưa có từ vựng</Text>
            <Text style={styles.hintText}>
              Kiểm tra kết nối hoặc thử kéo để tải lại.
            </Text>
          </View>
        ) : null}

        {totalWordsInApp > 0 && learnedCount > 0 ? (
          <>
            {wrongAgainCount > 0 ? (
              <TouchableOpacity
                style={[styles.primaryCta, styles.primaryCtaPurple]}
                onPress={openWrongWordsPractice}
                activeOpacity={0.92}>
                <Feather name="refresh-cw" size={22} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>Ôn từ làm sai</Text>
                <Text style={styles.primaryCtaSub}>
                  {wrongAgainCount} từ · ưu tiên luyện lại ngay
                </Text>
              </TouchableOpacity>
            ) : null}

            {wrongAgainCount === 0 ? (
              <View style={styles.allDoneCard}>
                <Feather name="smile" size={28} color="#16A34A" />
                <Text style={styles.allDoneTitle}>Chưa có từ làm sai khi ôn</Text>
                <Text style={styles.allDoneText}>
                  Khi bạn trả lời sai trong bài ôn tập, từ đó sẽ được đếm ở mục
                  Cần ôn lại phía trên.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.primaryCta}
              onPress={openReviewPractice}
              activeOpacity={0.92}>
              <Feather name="check-square" size={22} color="#FFFFFF" />
              <Text style={styles.primaryCtaText}>Làm bài ôn</Text>
              <Text style={styles.primaryCtaSub}>
                Quiz/Viết từ · {learnedCount} từ đã thuộc
                {wrongAgainCount > 0
                  ? ` · ưu tiên ${wrongAgainCount} từ làm sai`
                  : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryCta, styles.primaryCtaOrange]}
              onPress={openQuickChallenge}
              activeOpacity={0.92}>
              <Feather name="zap" size={22} color="#FFFFFF" />
              <Text style={styles.primaryCtaText}>Thử thách 60 giây</Text>
              <Text style={styles.primaryCtaSub}>
                Trộn quiz/nghe/gõ từ · chấm điểm theo combo
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {totalWordsInApp > 0 && learnedCount === 0 ? (
          <View style={styles.hintCard}>
            <Feather name="book-open" size={22} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.hintTitle}>Bắt đầu từ tab Từ vựng</Text>
            <Text style={styles.hintText}>
              Học một vài từ trước, sau đó quay lại đây để ôn.
            </Text>
          </View>
        ) : null}

        {completedTopics.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Bộ đã hoàn thành</Text>
            <Text style={styles.sectionHint}>
              Chạm để làm bài ôn của bộ (không dùng flashcard).
            </Text>
            {completedTopics.map((topic) => (
              <TouchableOpacity
                key={topic.id}
                style={styles.completedRow}
                onPress={() => openCompletedTopicPractice(topic)}
                activeOpacity={0.92}>
                <View style={styles.completedIconWrap}>
                  <Feather name="check" size={18} color="#16A34A" />
                </View>
                <View style={styles.completedBody}>
                  <Text style={styles.completedTitle} numberOfLines={2}>
                    {topic.name || topic.id}
                  </Text>
                  <Text style={styles.completedSub}>100% · Ôn lại bộ</Text>
                </View>
                <Feather name="chevron-right" size={20} color={COLORS.TEXT_LIGHT} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {Platform.OS === 'ios' ? <View style={{height: 8}} /> : null}
      </ScrollView>
    </View>
  );
}

function StatMini({label, value, icon, bg, iconColor}) {
  return (
    <View style={[styles.statCard, {backgroundColor: bg}]}>
      <Feather name={icon} size={18} color={iconColor} />
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function ExerciseRow({
  theme,
  icon,
  title,
  subtitle,
  metaWords,
  metaTime,
  onPress,
}) {
  const borderColor = theme.border;
  const iconColor = theme.icon;
  const iconSoft = theme.iconSoft;
  return (
    <TouchableOpacity
      style={[styles.exCard, {borderTopColor: borderColor}]}
      onPress={onPress}
      activeOpacity={0.92}>
      <View style={[styles.exIconWrap, {backgroundColor: iconSoft}]}>
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.exBody}>
        <Text style={styles.exTitle}>{title}</Text>
        <Text style={styles.exSub}>{subtitle}</Text>
        <View style={styles.exMeta}>
          <View style={styles.exMetaItem}>
            <Feather name="book-open" size={13} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.exMetaText}>{metaWords}</Text>
          </View>
          <View style={styles.exMetaItem}>
            <Feather name="clock" size={13} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.exMetaText}>{metaTime}</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={22} color={COLORS.TEXT_LIGHT} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  stickyTop: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: COLORS.BACKGROUND,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.BORDER,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    ...THEME.shadow.soft,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 2,
  },
  primaryCta: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    ...THEME.shadow.soft,
  },
  primaryCtaPurple: {
    backgroundColor: '#7C3AED',
  },
  primaryCtaOrange: {
    backgroundColor: '#EA580C',
  },
  primaryCtaText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  primaryCtaSub: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  allDoneCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
  },
  allDoneTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginTop: 10,
  },
  allDoneText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '500',
  },
  hintCard: {
    marginTop: 14,
    borderRadius: 14,
    padding: 18,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: 'center',
  },
  hintTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginTop: 10,
  },
  hintText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginTop: 20,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 10,
    fontWeight: '500',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    ...THEME.shadow.soft,
  },
  completedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  completedBody: {
    flex: 1,
    minWidth: 0,
  },
  completedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  completedSub: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
    fontWeight: '600',
  },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    ...THEME.shadow.soft,
  },
  exIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  exBody: {
    flex: 1,
    minWidth: 0,
  },
  exTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  exSub: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
    fontWeight: '500',
  },
  exMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  exMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exMetaText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
});
