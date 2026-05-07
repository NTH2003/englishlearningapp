import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, DeviceEventEmitter, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getLearningProgress} from '../../services/storageService';
import {saveContinueLearning, CONTINUE_KIND} from '../../services/continueLearning';
import {LEARNING_PROGRESS_UPDATED} from '../../services/learningProgressEvents';
import {dedupeVocabularyWordsById} from '../../services/vocabularyService';

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (_) {}

export default function VocabularyTopicDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const topic = route?.params?.topic || null;
  const words = Array.isArray(route?.params?.words) ? route.params.words : [];
  const wordCount = words.length;
  const initialProgress = route?.params?.progress || null;

  const safeTopic = topic || {
    id: 'unknown',
    name: 'Bộ từ vựng',
    color: COLORS.PRIMARY,
    description: '',
  };
  const isVideoTopic = String(safeTopic?.id || '').startsWith('video_vocab_');
  const [speakingWordId, setSpeakingWordId] = useState(null);
  /** Đã học qua flashcard / tiến độ */
  const [learnedIdSet, setLearnedIdSet] = useState(() => new Set());
  const [unknownIdSet, setUnknownIdSet] = useState(() => new Set());
  const [liveProgress, setLiveProgress] = useState(() => ({
    total: initialProgress?.total ?? wordCount,
    learned: initialProgress?.learned ?? 0,
    percentage: initialProgress?.percentage ?? 0,
  }));
  const [examCompleted, setExamCompleted] = useState(false);

  const previewWords = useMemo(() => words, [words]);

  const recomputeProgress = useCallback(async () => {
    if (!wordCount) {
      setLiveProgress({total: 0, learned: 0, percentage: 0});
      setLearnedIdSet(new Set());
      return;
    }
    try {
      let lp =
        (await getLearningProgress({source: 'server'}).catch(() => null)) ||
        (await getLearningProgress().catch(() => null));
      const learnedIds = new Set(
        Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.map(id => String(id)) : [],
      );
      const completedModes = new Set(
        (
          lp?.topicPracticeStats?.[String(safeTopic?.id || '')]?.modesCompleted || []
        )
          .map(m => String(m || '').trim().toLowerCase())
          .filter(Boolean),
      );
      setExamCompleted(
        completedModes.has('quiz') &&
          completedModes.has('typing') &&
          completedModes.has('listening'),
      );
      setLearnedIdSet(learnedIds);
      const report = lp?.flashcardSelfReport && typeof lp.flashcardSelfReport === 'object'
        ? lp.flashcardSelfReport
        : {};
      const unknownFromReport = new Set(
        words
          .map(w => String(w?.id))
          .filter(id => report[id] === false),
      );
      setUnknownIdSet(unknownFromReport);
      const learned = words.filter(w => learnedIds.has(String(w.id))).length;
      setLiveProgress({
        total: wordCount,
        learned,
        percentage: Math.min(100, Math.round((learned / wordCount) * 100)),
      });
    } catch (_) {
      setExamCompleted(false);
      setLearnedIdSet(new Set());
      setUnknownIdSet(new Set());
      setLiveProgress({
        total: wordCount,
        learned: Math.min(initialProgress?.learned ?? 0, wordCount),
        percentage:
          wordCount > 0
            ? Math.min(
                100,
                Math.round(
                  ((initialProgress?.learned ?? 0) / wordCount) * 100,
                ),
              )
            : 0,
      });
    }
  }, [wordCount, words, initialProgress?.learned, safeTopic?.id]);

  useFocusEffect(
    useCallback(() => {
      void recomputeProgress();
      if (safeTopic?.id) {
        void saveContinueLearning({
          kind: CONTINUE_KIND.VOCAB_TOPIC,
          topicId: String(safeTopic.id),
          topicName: String(safeTopic.name || '').slice(0, 120),
        });
      }
    }, [recomputeProgress, safeTopic?.id, safeTopic?.name]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      void recomputeProgress();
    });
    return () => sub.remove();
  }, [recomputeProgress]);

  const learned = Math.min(liveProgress.learned, wordCount);
  const pct = wordCount > 0 ? Math.round((learned / wordCount) * 100) : 0;
  const isExamUnlocked = wordCount > 0 && learned >= wordCount;
  const isExamReady = isExamUnlocked && wordCount >= 4;
  const examStatus = useMemo(() => {
    if (!isExamUnlocked) {
      return {
        label: 'Chưa mở khóa',
        icon: 'lock',
        iconColor: '#64748B',
        pillStyle: styles.practiceStatusLocked,
        textStyle: styles.practiceStatusLockedText,
      };
    }
    if (examCompleted) {
      return {
        label: 'Đã kiểm tra',
        icon: 'check-circle',
        iconColor: '#047857',
        pillStyle: styles.practiceStatusDone,
        textStyle: styles.practiceStatusDoneText,
      };
    }
    return {
      label: 'Chờ kiểm tra',
      icon: 'clock',
      iconColor: '#C2410C',
      pillStyle: styles.practiceStatusPending,
      textStyle: styles.practiceStatusPendingText,
    };
  }, [examCompleted, isExamUnlocked]);

  const primaryCtaLabel = useMemo(() => {
    if (!wordCount) return 'Chưa có từ';
    if (unknownIdSet.size > 0) return 'Học lại từ chưa biết';
    if (learned === 0) return 'Bắt đầu học';
    if (learned < wordCount) return 'Tiếp tục học';
    return 'Xem lại thẻ';
  }, [wordCount, learned, unknownIdSet.size]);

  const openFlashcards = () => {
    if (!words.length) {
      Alert.alert('Chưa có từ', 'Bộ từ này chưa có dữ liệu từ vựng.');
      return;
    }
    const unknownOnly = words.filter((w) => unknownIdSet.has(String(w?.id)));
    const pending = words.filter((w) => !learnedIdSet.has(String(w?.id)));
    // Ưu tiên tuyệt đối theo lựa chọn "Chưa biết" của người dùng.
    // Nếu chưa có flashcardSelfReport thì fallback sang pending theo wordsLearned.
    const ordered = (unknownOnly.length > 0 ? unknownOnly : (pending.length > 0 ? pending : words)).slice();
    navigation.navigate('VocabularyFlashcard', {
      topicId: safeTopic.id,
      topicName: safeTopic.name,
      words: ordered,
    });
  };

  const shuffleWords = list => [...list].sort(() => Math.random() - 0.5);

  const openQuizPractice = () => {
    if (!Array.isArray(words) || words.length < 1) {
      Alert.alert('Chưa có từ', 'Bộ này chưa có từ để luyện.');
      return;
    }
    const unique = dedupeVocabularyWordsById(words);
    if (unique.length < 1) {
      Alert.alert('Chưa có từ', 'Bộ này chưa có từ hợp lệ để luyện.');
      return;
    }
    const picked = shuffleWords(unique).slice(0, Math.min(12, unique.length));
    navigation.navigate('VocabularyQuiz', {
      words: picked,
      topicId: safeTopic.id,
      topicName: safeTopic.name,
      topic: safeTopic,
    });
  };

  const openTypingPractice = () => {
    if (!Array.isArray(words) || words.length < 1) {
      Alert.alert('Chưa có từ', 'Bộ này chưa có từ để luyện.');
      return;
    }
    const picked = shuffleWords(words).slice(0, Math.min(20, words.length));
    navigation.navigate('VocabularyTyping', {
      words: picked,
      topicId: safeTopic.id,
      topicName: safeTopic.name,
    });
  };

  const openListeningPractice = () => {
    if (!Array.isArray(words) || words.length < 4) {
      Alert.alert('Chưa đủ từ', 'Luyện nghe cần ít nhất 4 từ trong bộ.');
      return;
    }
    const picked = shuffleWords(words).slice(0, Math.min(12, words.length));
    navigation.navigate('VocabularyListening', {
      words: picked,
      topicId: safeTopic.id,
      topicName: safeTopic.name,
    });
  };

  const openMixedExam = () => {
    if (!Array.isArray(words) || words.length < 1) {
      Alert.alert('Chưa có từ', 'Bài kiểm tra cần ít nhất 1 từ trong bộ.');
      return;
    }
    const unique = dedupeVocabularyWordsById(words);
    if (unique.length < 1) {
      Alert.alert('Chưa có từ', 'Bài kiểm tra cần ít nhất 1 từ hợp lệ.');
      return;
    }
    const picked = shuffleWords(unique).slice(0, Math.min(12, unique.length));
    navigation.navigate('VocabularyQuiz', {
      words: picked,
      topicId: safeTopic.id,
      topicName: safeTopic.name,
      topic: safeTopic,
      mixedPractice: true,
    });
  };

  const startVideoPracticeLikePostFlashcard = () => {
    if (!Array.isArray(words) || words.length < 1) {
      Alert.alert('Chưa có từ', 'Bộ này chưa có từ để luyện.');
      return;
    }
    // Giống luồng "sau flashcard" của bộ từ vựng: vào Trắc nghiệm trước.
    if (words.length >= 4) {
      openQuizPractice();
      return;
    }
    // Bộ quá ít từ thì fallback kiểu cũ có thể chạy với < 4 từ.
    openTypingPractice();
  };

  /** Loại từ hiển thị tiếng Anh (ưu tiên `partOfSpeech`, hỗ trợ `partOfSpeechVi` Việt) */
  const getPartOfSpeechEnglish = w => {
    const raw = String(w?.partOfSpeech || '').trim();
    const vi = String(w?.partOfSpeechVi || '').trim();
    const lower = raw.toLowerCase();

    const fromEnglishKey = key => {
      switch (key) {
        case 'noun':
          return 'Noun';
        case 'verb':
          return 'Verb';
        case 'adjective':
          return 'Adjective';
        case 'adverb':
          return 'Adverb';
        case 'phrase':
          return 'Phrase';
        case 'pronoun':
          return 'Pronoun';
        case 'preposition':
          return 'Preposition';
        case 'conjunction':
          return 'Conjunction';
        default:
          return null;
      }
    };
    if (lower) {
      const en = fromEnglishKey(lower);
      if (en) return en;
    }

    const viNorm = vi.toLowerCase();
    const viMap = {
      'danh từ': 'Noun',
      'động từ': 'Verb',
      'tính từ': 'Adjective',
      'trạng từ': 'Adverb',
      'cụm từ': 'Phrase',
      'đại từ': 'Pronoun',
      'giới từ': 'Preposition',
      'liên từ': 'Conjunction',
    };
    if (viNorm && viMap[viNorm]) return viMap[viNorm];

    if (raw.length > 0) {
      if (/^[a-z\s]+$/i.test(raw) && raw.length < 24) {
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      }
      return raw;
    }
    if (vi.length > 0) return vi;
    return '—';
  };

  const speakWord = word => {
    if (!word || !Tts) return;
    try {
      setSpeakingWordId(String(word.id));
      Tts.stop();
      Tts.setDefaultLanguage('en-US');
      Tts.setDefaultRate(0.5);
      Tts.speak(String(word.word || ''));
      setTimeout(() => setSpeakingWordId(null), 1200);
    } catch (_) {
      setSpeakingWordId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, {paddingTop: Math.max(insets.top, 10)}]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {safeTopic.name}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isVideoTopic ? (
          <View style={styles.memriseHero}>
            <View style={styles.memriseHeroTop}>
              <View style={styles.memriseHeroTitles}>
                <Text style={styles.memriseKicker}>Học từ video</Text>
                <Text style={styles.memriseStatMain}>
                  Sẵn sàng học <Text style={styles.memriseStatEm}>{wordCount}</Text> từ
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.memriseCta, wordCount === 0 && styles.memriseCtaDisabled]}
              onPress={startVideoPracticeLikePostFlashcard}
              disabled={wordCount === 0}
              activeOpacity={0.9}>
              <Feather name="play" size={20} color="#FFFFFF" />
              <Text style={styles.memriseCtaText}>Bắt đầu học</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Phong cách Memrise: tiến độ + CTA rõ ràng */}
            <View style={styles.memriseHero}>
              <View style={styles.memriseHeroTop}>
                <View style={styles.memriseHeroTitles}>
                  <Text style={styles.memriseKicker}>Học từ mới</Text>
                  <Text style={styles.memriseStatMain}>
                    Đã nắm <Text style={styles.memriseStatEm}>{learned}</Text> / {wordCount} từ ·{' '}
                    <Text style={styles.memriseStatEm}>{pct}%</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {width: `${pct}%`}]} />
              </View>
              <TouchableOpacity
                style={[styles.memriseCta, wordCount === 0 && styles.memriseCtaDisabled]}
                onPress={openFlashcards}
                disabled={wordCount === 0}
                activeOpacity={0.9}>
                <Feather name="play" size={20} color="#FFFFFF" />
                <Text style={styles.memriseCtaText}>{primaryCtaLabel}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.practiceCard}>
              <View style={styles.practiceTitleRow}>
                <View style={styles.practiceTitleIconWrap}>
                  <Feather name="clipboard" size={15} color={COLORS.PRIMARY_DARK} />
                </View>
                <Text style={styles.practiceTitle}>Kiểm tra từ vựng</Text>
              </View>
              <View style={[styles.practiceStatusPill, examStatus.pillStyle]}>
                <Feather name={examStatus.icon} size={14} color={examStatus.iconColor} />
                <Text style={[styles.practiceStatusText, examStatus.textStyle]}>
                  {examStatus.label}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.practiceStartBtn,
                  !isExamReady && styles.practiceBtnDisabled,
                ]}
                activeOpacity={0.88}
                disabled={!isExamReady}
                onPress={openMixedExam}>
                <Feather name="play-circle" size={18} color="#FFFFFF" />
                <Text style={styles.practiceStartBtnText}>
                  {isExamUnlocked
                    ? examCompleted
                      ? 'Làm lại kiểm tra'
                      : 'Bắt đầu kiểm tra'
                    : 'Hoàn thành từ vựng để mở khóa'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, styles.sectionTitleTight]}>Tất cả từ trong bộ</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{wordCount} từ</Text>
          </View>
        </View>
        <View style={styles.previewCard}>
          {previewWords.map((w, idx) => {
            const posLabel = getPartOfSpeechEnglish(w);
            const pronunciation = String(w?.pronunciation || '').trim();
            const speaking = speakingWordId === String(w?.id);
            const isLast = idx === previewWords.length - 1;
            const meaning = String(w?.meaning || '').trim();
            const metaLine =
              pronunciation.length > 0 ? `${posLabel} · ${pronunciation}` : posLabel;
            const sid = String(w?.id);
            const fromProgress = learnedIdSet.has(sid);
            return (
              <View
                key={String(w?.id || idx)}
                style={[styles.wordItem, !isLast && styles.wordItemDivider]}>
                <View style={styles.wordItemMain}>
                  <View style={styles.wordPrimaryRow}>
                    <Text
                      style={[styles.wordLinePrimary, styles.wordLinePrimaryFlex]}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      <Text style={styles.wordLineEn}>{w?.word || '…'}</Text>
                      {!!meaning ? (
                        <>
                          <Text style={styles.wordLineDot}> · </Text>
                          <Text style={styles.wordLineVi}>{meaning}</Text>
                        </>
                      ) : null}
                    </Text>
                    <View style={styles.wordRowActions}>
                      {fromProgress ? (
                        <View style={styles.badgeLearned} accessibilityLabel="Đã học">
                          <Feather name="award" size={13} color="#047857" />
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.wordItemSpeak, speaking && styles.speakBtnActive]}
                        onPress={() => speakWord(w)}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
                        activeOpacity={0.85}>
                        <Feather
                          name="volume-2"
                          size={14}
                          color={speaking ? '#FFFFFF' : COLORS.PRIMARY_DARK}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.wordLineMeta} numberOfLines={1} ellipsizeMode="tail">
                    {metaLine}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.BACKGROUND},
  header: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {fontSize: 18, fontWeight: '800', color: '#FFFFFF'},
  scroll: {flex: 1},
  content: {padding: 16, paddingBottom: 32},

  memriseHero: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 18,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  memriseHeroTop: {marginBottom: 14},
  memriseHeroTitles: {gap: 6},
  memriseKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  memriseStatMain: {fontSize: 16, fontWeight: '700', color: COLORS.TEXT, lineHeight: 22},
  memriseStatEm: {color: COLORS.PRIMARY_DARK, fontWeight: '900'},
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY,
  },
  memriseCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 15,
    borderRadius: 16,
    minHeight: 52,
  },
  memriseCtaDisabled: {backgroundColor: '#D1D5DB'},
  memriseCtaText: {fontSize: 17, fontWeight: '800', color: '#FFFFFF'},
  practiceCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 1,
  },
  practiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  practiceTitleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  practiceStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  practiceStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  practiceStatusLocked: {
    backgroundColor: '#F3F4F6',
  },
  practiceStatusLockedText: {
    color: '#64748B',
  },
  practiceStatusPending: {
    backgroundColor: '#FFF7ED',
  },
  practiceStatusPendingText: {
    color: '#C2410C',
  },
  practiceStatusDone: {
    backgroundColor: '#ECFDF5',
  },
  practiceStatusDoneText: {
    color: '#047857',
  },
  practiceStartBtn: {
    marginBottom: 2,
    borderRadius: 12,
    minHeight: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(232, 110, 0, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  practiceStartBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  practiceBtnDisabled: {
    opacity: 0.72,
  },

  sectionTitle: {
    marginTop: 22,
    marginBottom: 6,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  sectionTitleTight: {marginTop: 0, marginBottom: 0, flex: 1, minWidth: 0},
  sectionHeadRow: {
    marginTop: 26,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY_SOFT,
    borderWidth: 1,
    borderColor: 'rgba(232, 110, 0, 0.25)',
  },
  countPillText: {fontSize: 13, fontWeight: '800', color: COLORS.PRIMARY_DARK},

  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  wordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  wordItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  wordItemMain: {flex: 1, minWidth: 0, justifyContent: 'center'},
  wordPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  wordLinePrimary: {lineHeight: 20},
  wordLinePrimaryFlex: {flex: 1, minWidth: 0},
  wordRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '52%',
  },
  badgeLearned: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 0,
  },
  wordLineEn: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  wordLineDot: {fontSize: 14, fontWeight: '500', color: '#CBD5E1'},
  wordLineVi: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  wordLineMeta: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.15,
  },
  wordItemSpeak: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(232, 110, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBF5',
    flexShrink: 0,
  },
  speakBtnActive: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
});
