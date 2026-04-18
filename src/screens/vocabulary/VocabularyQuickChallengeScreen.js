import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  Animated,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getLearningProgress, saveLearningProgress} from '../../services/storageService';
import {computeLevelName, XP} from '../../services/levelService';
import {recordReviewQuizAnswer} from '../../services/vocabularyService';

const CHALLENGE_SECONDS = 60;
const MODES = ['quiz', 'typing', 'listening'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (_) {}

export default function VocabularyQuickChallengeScreen({route}) {
  const navigation = useNavigation();
  const sourceWords = Array.isArray(route?.params?.words) ? route.params.words : [];
  const topicName = route?.params?.topicName || 'Thử thách 60 giây';
  const words = useMemo(() => sourceWords.filter((w) => w && w.id != null), [sourceWords]);

  const [timeLeft, setTimeLeft] = useState(CHALLENGE_SECONDS);
  const [running, setRunning] = useState(true);
  const [index, setIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [wrongWords, setWrongWords] = useState([]);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [finished, setFinished] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const usedRef = useRef(new Set());
  const xpAwardedRef = useRef(false);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    try {
      if (Tts && typeof Tts.setDefaultLanguage === 'function') {
        Tts.setDefaultLanguage('en-US');
        Tts.setDefaultRate(0.5);
        setTtsAvailable(true);
      }
    } catch (_) {
      setTtsAvailable(false);
    }
  }, []);

  useEffect(() => {
    const pct = ((CHALLENGE_SECONDS - timeLeft) / CHALLENGE_SECONDS) * 100;
    Animated.timing(progressAnimation, {
      toValue: Math.max(0, Math.min(100, pct)),
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [timeLeft, progressAnimation]);

  useEffect(() => {
    if (!finished || xpAwardedRef.current) return;
    xpAwardedRef.current = true;
    (async () => {
      try {
        const earned = Math.max(
          XP.QUICK_CHALLENGE_FINISH,
          Math.round(score * 0.2),
        );
        const progress = await getLearningProgress();
        const totalXP = Math.max(0, Number(progress?.totalXP) || 0) + earned;
        await saveLearningProgress({
          ...(progress || {}),
          totalXP,
          level: computeLevelName(totalXP),
        });
        setSessionXp(earned);
      } catch (_) {
        setSessionXp(0);
      }
    })();
  }, [finished, score]);

  const currentWord = words.length ? words[index % words.length] : null;
  const mode = MODES[index % MODES.length];

  const options = useMemo(() => {
    if (!currentWord || words.length < 2) return [];
    const wrongs = shuffle(words.filter((w) => String(w.id) !== String(currentWord.id)))
      .slice(0, 3)
      .map((w) => w.meaning);
    return shuffle([currentWord.meaning, ...wrongs]);
  }, [currentWord, words, index]);

  const goNext = () => {
    setIndex((i) => i + 1);
    setTypedAnswer('');
    setSelectedAnswer(null);
  };

  const recordWrong = (word) => {
    if (!word) return;
    if (usedRef.current.has(String(word.id))) return;
    usedRef.current.add(String(word.id));
    setWrongWords((prev) => [...prev, word]);
  };

  const onCorrect = () => {
    if (currentWord?.id != null) {
      void recordReviewQuizAnswer(currentWord.id, true);
    }
    setCorrectCount((n) => n + 1);
    setAttemptCount((n) => n + 1);
    setScore((s) => s + 10);
    setAnswerHistory((prev) => [
      ...prev,
      {
        index: prev.length,
        mode,
        prompt:
          mode === 'typing'
            ? `Viết từ tiếng Anh có nghĩa "${currentWord?.meaning || ''}"`
            : mode === 'listening'
              ? 'Nghe và chọn nghĩa đúng'
              : `Nghĩa của từ "${currentWord?.word || ''}" là gì?`,
        word: currentWord?.word || '',
        userAnswer: mode === 'typing' ? typedAnswer.trim() : selectedAnswer,
        correctAnswer: mode === 'typing' ? currentWord?.word || '' : currentWord?.meaning || '',
        isCorrect: true,
      },
    ]);
    goNext();
  };

  const onWrong = () => {
    if (currentWord?.id != null) {
      void recordReviewQuizAnswer(currentWord.id, false);
    }
    setAttemptCount((n) => n + 1);
    recordWrong(currentWord);
    setAnswerHistory((prev) => [
      ...prev,
      {
        index: prev.length,
        mode,
        prompt:
          mode === 'typing'
            ? `Viết từ tiếng Anh có nghĩa "${currentWord?.meaning || ''}"`
            : mode === 'listening'
              ? 'Nghe và chọn nghĩa đúng'
              : `Nghĩa của từ "${currentWord?.word || ''}" là gì?`,
        word: currentWord?.word || '',
        userAnswer: mode === 'typing' ? typedAnswer.trim() : selectedAnswer,
        correctAnswer: mode === 'typing' ? currentWord?.word || '' : currentWord?.meaning || '',
        isCorrect: false,
      },
    ]);
    goNext();
  };

  const answerQuiz = (ans) => {
    if (finished || !currentWord) return;
    setSelectedAnswer(ans);
    if (ans === currentWord.meaning) {
      onCorrect();
      return;
    }
    onWrong();
  };

  const answerTyping = () => {
    if (finished || !currentWord) return;
    if (!typedAnswer.trim()) return;
    if (normalize(typedAnswer) === normalize(currentWord.word)) onCorrect();
    else onWrong();
  };

  const playWord = () => {
    if (!ttsAvailable || !currentWord) return;
    try {
      setSpeaking(true);
      Tts.speak(String(currentWord.word));
      setTimeout(() => setSpeaking(false), 1200);
    } catch (_) {
      setSpeaking(false);
    }
  };

  const reviewWrongWords = () => {
    if (!wrongWords.length) {
      navigation.goBack();
      return;
    }
    navigation.replace('VocabularyTyping', {
      words: wrongWords,
      topicId: 'review',
      topicName: 'Ôn lại từ sai',
    });
  };

  if (!words.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Chưa đủ dữ liệu</Text>
          <Text style={styles.emptyText}>Hãy học thêm từ trước khi mở Thử thách 60 giây.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progressWidth = progressAnimation.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const minute = String(Math.floor(timeLeft / 60)).padStart(1, '0');
  const second = String(timeLeft % 60).padStart(2, '0');
  const percent = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topOrange, {paddingTop: Math.max(insets.top, 8) + 4}]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerBody}>
            <Text style={styles.title}>Thử thách 60 giây</Text>
            <Text style={styles.subTitle} numberOfLines={1}>
              {topicName} · {attemptCount} câu
            </Text>
          </View>
          <View style={styles.timerPill}>
            <Feather name="clock" size={14} color="#FFFFFF" />
            <Text style={styles.timerText}>
              {minute}:{second}
            </Text>
          </View>
        </View>
        <View style={styles.progressOuter}>
          <Animated.View style={[styles.progressInner, {width: progressWidth}]} />
        </View>
      </View>

      {finished ? (
        <ScrollView
          style={styles.resultScroll}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.reviewSummaryCard}>
            <View style={styles.reviewSummaryIcon}>
              <Feather name="zap" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.reviewSummaryTitle}>Kết thúc thử thách</Text>
            <Text style={styles.reviewSummaryMessage}>
              Điểm và đáp án được hiển thị sau khi hoàn thành toàn bộ phiên.
            </Text>
            <View style={styles.reviewSummaryStats}>
              <View style={styles.reviewStatBoxLeft}>
                <Text style={styles.reviewStatPrimaryOrange}>{percent}%</Text>
                <Text style={styles.reviewStatLabel}>Tỷ lệ đúng</Text>
              </View>
              <View style={styles.reviewStatBoxRight}>
                <Text style={styles.reviewStatPrimaryBlue}>{score}</Text>
                <Text style={styles.reviewStatLabel}>Tổng điểm</Text>
              </View>
            </View>
            <Text style={styles.resultLine}>Đúng: {correctCount}/{attemptCount}</Text>
            <Text style={styles.resultLine}>XP thưởng: +{sessionXp}</Text>
            <View style={styles.resultButtons}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={reviewWrongWords} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>
                  {wrongWords.length ? `Ôn lại ${wrongWords.length} từ sai` : 'Về ôn tập'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setTimeLeft(CHALLENGE_SECONDS);
                  setRunning(true);
                  setIndex(0);
                  setTypedAnswer('');
                  setSelectedAnswer(null);
                  setScore(0);
                  setCorrectCount(0);
                  setAttemptCount(0);
                  setWrongWords([]);
                  setAnswerHistory([]);
                  usedRef.current = new Set();
                  xpAwardedRef.current = false;
                  setSessionXp(0);
                  setFinished(false);
                }}>
                <Text style={styles.primaryBtnText}>Chơi lại</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.reviewDetailTitle}>Đáp án chi tiết</Text>
          {answerHistory.map((row, rowIndex) => (
            <View key={`${rowIndex}-${row.word}`} style={styles.reviewAnswerCard}>
              <View style={styles.reviewAnswerHead}>
                <View
                  style={[
                    styles.reviewAnswerStatusIcon,
                    row.isCorrect
                      ? styles.reviewAnswerStatusIconCorrect
                      : styles.reviewAnswerStatusIconWrong,
                  ]}>
                  <Feather name={row.isCorrect ? 'check' : 'x'} size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.reviewAnswerQuestion}>Câu {rowIndex + 1}: {row.prompt}</Text>
              </View>
              <Text
                style={[
                  styles.reviewAnswerLine,
                  row.isCorrect ? styles.reviewAnswerUserCorrect : styles.reviewAnswerUserWrong,
                ]}>
                Bạn trả lời: {row.userAnswer || '(bỏ trống)'}
              </Text>
              {!row.isCorrect ? (
                <Text style={styles.reviewAnswerCorrect}>Đáp án đúng: {row.correctAnswer}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.pageBody}>
          <View style={styles.questionCard}>
            <View style={styles.questionHeadRow}>
              <View style={styles.questionIndexBubble}>
                <Text style={styles.questionIndexText}>{attemptCount + 1}</Text>
              </View>
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText}>
                  {mode === 'typing' ? 'Viết từ' : mode === 'listening' ? 'Nghe' : 'Trắc nghiệm'}
                </Text>
              </View>
            </View>

            <Text style={styles.questionText}>
              {mode === 'typing'
                ? 'Viết từ tiếng Anh có nghĩa:'
                : mode === 'listening'
                  ? 'Nghe và chọn nghĩa đúng'
                  : 'Nghĩa của từ sau là gì?'}
            </Text>
            <Text style={styles.keyword}>
              {mode === 'typing' ? currentWord?.meaning : currentWord?.word}
            </Text>
            {mode !== 'typing' ? (
              <TouchableOpacity
                style={styles.listenRow}
                activeOpacity={0.85}
                onPress={playWord}
                disabled={!ttsAvailable}>
                <Feather name="volume-2" size={14} color={COLORS.PRIMARY_DARK} />
                <Text style={styles.listenText}>
                  {speaking ? 'Đang phát âm...' : 'Nghe phát âm'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {mode === 'typing' ? (
              <View style={styles.typingWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Nhập từ tiếng Anh..."
                  value={typedAnswer}
                  onChangeText={setTypedAnswer}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={answerTyping}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, !typedAnswer.trim() && styles.primaryBtnDisabled]}
                  onPress={answerTyping}
                  disabled={!typedAnswer.trim()}
                  activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Tiếp tục</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.answersContainer}>
                {options.map((ans, i) => (
                  <TouchableOpacity
                    key={`${ans}-${i}`}
                    style={styles.answerButton}
                    onPress={() => answerQuiz(ans)}
                    activeOpacity={0.88}>
                    <View style={styles.answerLeft}>
                      <View style={styles.optionBadge}>
                        <Text style={styles.optionLetter}>{OPTION_LETTERS[i] || i + 1}</Text>
                      </View>
                      <Text style={styles.answerText}>{ans}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F3F4F6'},
  topOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {flex: 1, minWidth: 0},
  title: {fontSize: 18, fontWeight: '800', color: '#FFFFFF'},
  subTitle: {fontSize: 14, color: 'rgba(255,255,255,0.95)', marginTop: 2, fontWeight: '600'},
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timerText: {color: '#FFFFFF', fontWeight: '700', fontSize: 16},
  progressOuter: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  progressInner: {
    height: '100%',
    backgroundColor: '#111827',
  },
  pageBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 18,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 14,
  },
  questionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  questionIndexBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionIndexText: {
    color: COLORS.PRIMARY_DARK,
    fontWeight: '700',
  },
  tagPill: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagPillText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    lineHeight: 28,
  },
  keyword: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 10,
  },
  listenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  listenText: {
    fontSize: 14,
    color: COLORS.PRIMARY_DARK,
    fontWeight: '500',
  },
  typingWrap: {
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#111827',
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  answersContainer: {gap: 12, marginTop: 4},
  answerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  answerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  optionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetter: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
  },
  answerText: {
    fontSize: 18,
    color: '#111827',
    flex: 1,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  resultButtons: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  resultScroll: {flex: 1},
  resultContent: {
    padding: 16,
    paddingBottom: 28,
  },
  reviewSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  reviewSummaryIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSummaryTitle: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewSummaryMessage: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
  },
  reviewSummaryStats: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  reviewStatBoxLeft: {
    flex: 1,
    backgroundColor: '#FEF3E8',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewStatBoxRight: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewStatPrimaryOrange: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  reviewStatPrimaryBlue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563EB',
  },
  reviewStatLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  resultLine: {
    marginTop: 6,
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  reviewDetailTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewAnswerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  reviewAnswerHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewAnswerStatusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  reviewAnswerStatusIconCorrect: {
    backgroundColor: '#22C55E',
  },
  reviewAnswerStatusIconWrong: {
    backgroundColor: '#EF4444',
  },
  reviewAnswerQuestion: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewAnswerLine: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  reviewAnswerUserCorrect: {
    color: '#16A34A',
  },
  reviewAnswerUserWrong: {
    color: '#EF4444',
  },
  reviewAnswerCorrect: {
    marginTop: 4,
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '700',
  },
  emptyWrap: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: COLORS.TEXT, marginBottom: 8},
  emptyText: {fontSize: 14, color: COLORS.TEXT_SECONDARY, textAlign: 'center', marginBottom: 12},
});

