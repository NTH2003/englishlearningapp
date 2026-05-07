import React, {useCallback, useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
  getLearnedWordsForDisplay,
} from '../../services/vocabularyService';
import {getLearningProgress, getTopics} from '../../services/storageService';
import {LEARNING_PROGRESS_UPDATED} from '../../services/learningProgressEvents';
import {VocabularyTopicCard} from './VocabularyTopicCard';
import {preloadEssentialData} from '../../services/appDataBootstrap';

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
const REVIEW_BATCH_SIZE = 10;
const FAST_REVIEW_BATCH_SIZE = 5;
const REVIEW_RELOAD_TTL_MS = 30000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default function VocabularyReviewHubScreen() {
  const navigation = useNavigation();
  const isMountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [learnedCount, setLearnedCount] = useState(0);
  const [totalWordsInApp, setTotalWordsInApp] = useState(0);
  const [learnedWords, setLearnedWords] = useState([]);
  const [wrongIdSet, setWrongIdSet] = useState(() => new Set());
  const [lastReviewedAtById, setLastReviewedAtById] = useState({});
  const [topics, setTopics] = useState([]);
  const [topicsProgress, setTopicsProgress] = useState({});
  const [reviewableTopics, setReviewableTopics] = useState([]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const load = useCallback(async ({force = false} = {}) => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (
      !force &&
      hasLoadedOnceRef.current &&
      Date.now() - lastLoadedAtRef.current < REVIEW_RELOAD_TTL_MS
    ) {
      return;
    }
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const canApply = () =>
      isMountedRef.current && loadSeqRef.current === seq;
    try {
      // Ưu tiên dữ liệu cache/snapshot để hiện UI nhanh ngay khi vào tab Ôn tập.
      try {
        await preloadEssentialData();
      } catch (_) {}

      if (getAllVocabulary().length === 0) {
        try {
          await withTimeout(loadVocabularyFromFirebase(), 2500);
        } catch (_) {}
      }

      const [lp, topicsListRaw] = await Promise.all([
        getLearningProgress().catch(() => ({})),
        getTopics().catch(() => []),
      ]);
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
      let learned = allWords.filter((w) => learnedIds.has(String(w.id)));
      if (!canApply()) return;
      setWrongIdSet(rw);
      const ws =
        lp?.wordStats && typeof lp.wordStats === 'object' ? lp.wordStats : {};
      const reviewById = {};
      for (const [id, row] of Object.entries(ws)) {
        const ts = Number(row?.lastReviewedAt) || 0;
        if (ts > 0) {
          reviewById[String(id)] = ts;
        }
      }
      if (!canApply()) return;
      setLastReviewedAtById(reviewById);
      setLearnedWords(learned);
      setLearnedCount(learned.length);
      setTotalWordsInApp(allWords.length);

      let topicsList = Array.isArray(topicsListRaw) ? topicsListRaw : [];
      if (!Array.isArray(topicsList)) topicsList = [];
      const progress = {};
      const reviewTopics = [];
      const topicPracticeStats =
        lp?.topicPracticeStats && typeof lp.topicPracticeStats === 'object'
          ? lp.topicPracticeStats
          : {};
      for (const topic of topicsList) {
        const topicWords = allWords.filter((word) =>
          wordBelongsToTopic(word, topic.id, topicsList),
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
          level: 'Sơ cấp',
          mainLevel: 'Beginner',
          examCompleted: false,
        };
        const modes = new Set(
          (
            topicPracticeStats[String(topic?.id)]?.modesCompleted || []
          )
            .map((m) => String(m || '').trim().toLowerCase())
            .filter(Boolean),
        );
        const examDone =
          modes.has('quiz') && modes.has('typing') && modes.has('listening');
        if (examDone && topicWords.length > 0) {
          progress[topic.id] = {
            ...progress[topic.id],
            examCompleted: true,
          };
          reviewTopics.push({
            topic,
            words: topicWords,
            progress: progress[topic.id],
            updatedAt:
              Number(topicPracticeStats[String(topic?.id)]?.updatedAt) || 0,
          });
        }
      }
      if (!canApply()) return;
      setTopics(topicsList);
      setTopicsProgress(progress);
      reviewTopics.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
      setReviewableTopics(reviewTopics);
      hasLoadedOnceRef.current = true;
      lastLoadedAtRef.current = Date.now();
      if (isFirstLoad && canApply()) {
        setInitialLoading(false);
      }

      // Resolve danh sách từ học được chi tiết ở nền; không chặn render lần đầu.
      void (async () => {
        try {
          const resolvedLearned = await getLearnedWordsForDisplay();
          if (
            canApply() &&
            Array.isArray(resolvedLearned) &&
            resolvedLearned.length > 0
          ) {
            setLearnedWords(resolvedLearned);
            setLearnedCount(resolvedLearned.length);
          }
        } catch (_) {}
      })();
    } catch {
      // Giữ dữ liệu hiện có để tránh trắng màn khi lỗi mạng/auth thoáng qua.
      if (isFirstLoad) {
        setInitialLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Luôn tải lại khi vào tab: TTL trong load() sẽ bỏ qua cập nhật sau ôn tập
      // (reviewWrongWordIds mới) nếu người dùng quay lại trong vài chục giây.
      load({force: true});
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      load({force: true});
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({force: true});
    setRefreshing(false);
  }, [load]);

  const openQuizFromPool = (pool, labelHint, batchSize = REVIEW_BATCH_SIZE) => {
    if (!pool || pool.length < 4) {
      Alert.alert(
        'Chưa đủ từ',
        'Trắc nghiệm cần ít nhất 4 từ đã thuộc. Hãy học thêm ở tab Từ vựng trước.',
      );
      return;
    }
    const cap = Math.max(4, Number(batchSize) || REVIEW_BATCH_SIZE);
    const picked = shuffle(pool).slice(0, Math.min(cap, pool.length));
    navigation.navigate('VocabularyQuiz', {
      words: picked,
      topicId: 'review',
      topicName: labelHint || 'Ôn tập',
    });
  };

  const openTypingFromPool = (pool, labelHint, maxCount = 20) => {
    if (!pool || !pool.length) {
      Alert.alert('Chưa có từ', 'Hiện chưa có từ để luyện tập.');
      return;
    }
    const cap = Math.max(1, Number(maxCount) || 20);
    const picked = shuffle(pool).slice(0, Math.min(cap, pool.length));
    navigation.navigate('VocabularyTyping', {
      words: picked,
      topicId: 'review',
      topicName: labelHint || 'Ôn tập',
    });
  };

  const openReviewPracticeNormal = () => {
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
    const prioritized = [...learnedWords].sort((a, b) => {
      const ta = Number(lastReviewedAtById[String(a?.id)] || 0);
      const tb = Number(lastReviewedAtById[String(b?.id)] || 0);
      return ta - tb;
    });
    if (prioritized.length >= 4) {
      openQuizFromPool(
        prioritized,
        `Ôn tập thường — ${REVIEW_BATCH_SIZE} từ`,
        REVIEW_BATCH_SIZE,
      );
      return;
    }
    openTypingFromPool(
      prioritized,
      `Ôn tập thường — ${REVIEW_BATCH_SIZE} từ`,
      REVIEW_BATCH_SIZE,
    );
  };

  const openReviewPracticeFast = () => {
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
    const picked = shuffle(learnedWords).slice(
      0,
      Math.min(Math.max(4, FAST_REVIEW_BATCH_SIZE), learnedWords.length),
    );
    navigation.navigate('VocabularyQuickChallenge', {
      words: picked,
      topicId: 'review',
      topicName: 'Ôn tập siêu tốc',
      challengeMode: 'fast_lives',
      perQuestionSeconds: 8,
      lives: 3,
    });
  };

  const wrongAgainCount = learnedWords.filter((w) =>
    wrongIdSet.has(String(w.id)),
  ).length;
  const wrongWords = learnedWords.filter((w) => wrongIdSet.has(String(w.id)));

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

  const openTopicReview = useCallback(
    (item) => {
      if (!item?.topic || !Array.isArray(item?.words) || item.words.length === 0) {
        Alert.alert('Chưa có dữ liệu', 'Bộ từ này chưa đủ dữ liệu để ôn.');
        return;
      }
      navigation.navigate('VocabularyTopicDetail', {
        topic: item.topic,
        words: item.words,
        progress: item.progress,
      });
    },
    [navigation],
  );

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
        {initialLoading ? (
          <View style={styles.hintCard}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY_DARK} />
            <Text style={styles.hintTitle}>Đang tải dữ liệu...</Text>
          </View>
        ) : null}

        {!initialLoading && totalWordsInApp === 0 ? (
          <View style={styles.hintCard}>
            <Feather name="inbox" size={22} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.hintTitle}>Chưa có từ vựng</Text>
            <Text style={styles.hintText}>
              Kiểm tra kết nối hoặc thử kéo để tải lại.
            </Text>
          </View>
        ) : null}

        {!initialLoading && totalWordsInApp > 0 && learnedCount > 0 ? (
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
              </View>
            ) : null}

            <View style={styles.reviewModesRow}>
              <TouchableOpacity
                style={[styles.primaryCta, styles.reviewModeCard]}
                onPress={openReviewPracticeNormal}
                activeOpacity={0.92}>
                <Feather name="check-square" size={20} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>Ôn tập thường</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryCta, styles.primaryCtaFast, styles.reviewModeCard]}
                onPress={openReviewPracticeFast}
                activeOpacity={0.92}>
                <Feather name="zap" size={20} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>Ôn tập siêu tốc</Text>
              </TouchableOpacity>
            </View>

            {reviewableTopics.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Ôn lại bộ đã kiểm tra</Text>
                {reviewableTopics.map((item) => {
                  const topicId = String(item?.topic?.id || '');
                  const p = topicsProgress[topicId] || item.progress || {};
                  const learnedInTopic = Math.max(0, Number(p?.learned) || 0);
                  const totalInTopic = Math.max(0, Number(p?.total) || 0);
                  const pct =
                    totalInTopic > 0
                      ? Math.round((learnedInTopic / totalInTopic) * 100)
                      : 0;
                  const cardProgress = {
                    total: totalInTopic,
                    learned: learnedInTopic,
                    percentage: pct,
                    level: p?.level ?? 'Sơ cấp',
                    mainLevel: p?.mainLevel ?? 'Beginner',
                    examCompleted: true,
                  };
                  return (
                    <VocabularyTopicCard
                      key={`review-topic-${topicId}`}
                      topic={item.topic}
                      progress={cardProgress}
                      status="completed"
                      locked={false}
                      onPress={() => openTopicReview(item)}
                    />
                  );
                })}
              </>
            ) : null}

          </>
        ) : null}

        {!initialLoading && totalWordsInApp > 0 && learnedCount === 0 ? (
          <View style={styles.hintCard}>
            <Feather name="book-open" size={22} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.hintTitle}>Bắt đầu từ tab Từ vựng</Text>
            <Text style={styles.hintText}>
              Học một vài từ trước, sau đó quay lại đây để ôn.
            </Text>
          </View>
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
  primaryCtaFast: {
    backgroundColor: '#0EA5E9',
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 7,
    textAlign: 'center',
  },
  primaryCtaSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
  reviewModesRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  reviewModeCard: {
    flex: 1,
    marginTop: 0,
    paddingVertical: 14,
    paddingHorizontal: 10,
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
