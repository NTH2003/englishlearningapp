import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {
  markWordAsLearned,
  mergeWeakWordIds,
  dedupeVocabularyWordsById,
  recordReviewQuizAnswer,
  recordTopicPracticeMode,
  addPracticeSessionXp,
  flushLearningProgressWrites,
  getAllVocabulary,
} from '../../services/vocabularyService';
import {getLearningProgress, awardXPRepeatable} from '../../services/storageService';
import {XP} from '../../services/levelService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const MIXED_TYPES = ['quiz', 'typing', 'listening'];

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildMixedPracticeSequence(baseWords) {
  const pool = [];
  for (const w of baseWords) {
    for (const mode of MIXED_TYPES) {
      pool.push({...w, __mixedMode: mode});
    }
  }
  let remaining = shuffleArray(pool);
  const result = [];
  while (remaining.length > 0) {
    const prevId = result.length
      ? String(result[result.length - 1]?.id ?? '')
      : null;
    let pickIndex = remaining.findIndex(
      (item) => String(item?.id ?? '') !== prevId,
    );
    if (pickIndex < 0) pickIndex = 0;
    result.push(remaining[pickIndex]);
    remaining.splice(pickIndex, 1);
  }
  return result;
}

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (e) {
  console.warn('react-native-tts không khả dụng:', e?.message);
}

const VocabularyQuizScreen = ({route}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    words: wordsParam,
    topicId,
    topicName,
    hideQuizTimer,
    topic,
    mixedPractice,
    /** Tuỳ chọn: chủ đề gợi ý sau khi xong ({ id, name, ... }) + danh sách từ */
    nextTopic,
    nextTopicWords,
  } = route.params || {};
  const dedupedWords = useMemo(
    () =>
      dedupeVocabularyWordsById(
        Array.isArray(wordsParam) ? wordsParam : [],
      ),
    [wordsParam],
  );
  const globalDistractorPool = useMemo(
    () =>
      dedupeVocabularyWordsById(getAllVocabulary()).filter(
        (w) => w && w.id != null && (String(w.word || '').trim() || String(w.meaning || '').trim()),
      ),
    [wordsParam],
  );
  const isReviewQuiz = topicId === 'review';
  const isMixedPractice = mixedPractice === true && !isReviewQuiz;
  // Bài "Củng cố sau khi học" chạy theo chế độ kiểm tra: không làm lại câu sai.
  const retryWrongAnswers = route?.params?.retryWrong === true;
  /**
   * Mixed Practice: mỗi từ → 3 ô (theo thứ tự quiz / typing / listening — xem generateQuestion).
   * Ôn tập review / quiz chủ đề thường: một ô / từ.
   */
  const words = useMemo(() => {
    if (!isMixedPractice || !dedupedWords.length) return dedupedWords;
    return buildMixedPracticeSequence(dedupedWords);
  }, [dedupedWords, isMixedPractice]);
  const useMixedQuestionModes = isReviewQuiz || isMixedPractice;
  const showQuizTimer = hideQuizTimer !== true;
  const headerTitleText = isReviewQuiz
    ? 'Ôn tập từ vựng'
    : topicName || topic?.name || 'Kiểm tra từ vựng cơ bản';
  
  const [currentIndex, setCurrentIndex] = useState(0);
  /** Chủ đề (không review): lượt chính `questionQueue`; câu sai gom vào `wrongQueue`, chỉ làm hết ở cuối bài. */
  const [questionQueue, setQuestionQueue] = useState([]);
  const [wrongQueue, setWrongQueue] = useState([]);
  /** `main` = đang làm lượt đầu; `wrong_end` = phần cuối — ôn toàn bộ câu đã sai. */
  const [lessonPhase, setLessonPhase] = useState('main');
  const [energy, setEnergy] = useState(100);
  const [questionTurn, setQuestionTurn] = useState(1);
  /** Chủ đề: số lần trả lời đúng rồi bấm Tiếp tục (queue co lại); sai/xoay không tăng — để thanh % không tụt khi sai. */
  const [topicCorrectSteps, setTopicCorrectSteps] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [xpStart, setXpStart] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const practiceRecordedRef = useRef(false);
  const practiceSessionXpAwardedRef = useRef(false);
  /** Chủ đề: từng từ đã trả lời sai ít nhất một lần trong phiên (để ôn flashcard sau). */
  const sessionEverWrongIdsRef = useRef(new Set());
  const initialQueueLenRef = useRef(0);
  const energyPenaltyRef = useRef(10);

  const useTopicRetryQueue = !isReviewQuiz && retryWrongAnswers;
  const activeSlotIndex = useTopicRetryQueue
    ? questionQueue.length > 0
      ? questionQueue[0]
      : -1
    : currentIndex;
  const currentWord =
    activeSlotIndex >= 0 && words && words[activeSlotIndex]
      ? words[activeSlotIndex]
      : null;
  const progress = useMemo(() => {
    if (!words?.length) return 0;
    if (isReviewQuiz || !useTopicRetryQueue) {
      return ((currentIndex + 1) / words.length) * 100;
    }
    const init = initialQueueLenRef.current || words.length;
    if (!init) return 0;
    return Math.min(
      100,
      Math.max(0, (topicCorrectSteps / init) * 100),
    );
  }, [isReviewQuiz, useTopicRetryQueue, currentIndex, words.length, topicCorrectSteps]);

  useEffect(() => {
    if (!words?.length) {
      if (!isReviewQuiz) {
        setQuestionQueue([]);
        setWrongQueue([]);
        setLessonPhase('main');
      }
      return;
    }
    if (isReviewQuiz) {
      setCurrentIndex(0);
      return;
    }
    const q = words.map((_, i) => i);
    initialQueueLenRef.current = q.length;
    energyPenaltyRef.current = Math.min(
      20,
      Math.max(5, Math.round(100 / Math.max(1, q.length))),
    );
    setQuestionQueue(q);
    setWrongQueue([]);
    setLessonPhase('main');
    setTopicCorrectSteps(0);
    setEnergy(100);
    setQuestionTurn(1);
  }, [words, isReviewQuiz]);

  function normalizeText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function areEquivalentAnswers(input, correct) {
    const a = normalizeText(input);
    const b = normalizeText(correct);
    if (!a || !b) return false;
    if (a === b) return true;

    const eqGroups = [
      ['ok', 'okay', 'okey'],
      ['tv', 'television'],
      ['phone', 'telephone'],
      ['mom', 'mother', 'mum'],
      ['dad', 'father'],
      ['hi', 'hello', 'hey'],
    ];
    const findGroup = (x) => eqGroups.find((g) => g.includes(x));
    const ga = findGroup(a);
    const gb = findGroup(b);
    return Boolean(ga && gb && ga === gb);
  }

  const getSmartMode = (word) => {
    if (!word?.id) {
      return MIXED_TYPES[Math.floor(Math.random() * MIXED_TYPES.length)];
    }
    const weak = sessionEverWrongIdsRef.current.has(String(word.id));
    if (weak) {
      return Math.random() > 0.5 ? 'typing' : 'listening';
    }
    return MIXED_TYPES[Math.floor(Math.random() * MIXED_TYPES.length)];
  };

  const generateQuestion = (word) => {
    if (!word) return null;
    if (!words?.length) return null;

    const mode = !useMixedQuestionModes
      ? 'quiz'
      : isMixedPractice
        ? String(word?.__mixedMode || 'quiz')
        : getSmartMode(word);

    const basePool =
      isMixedPractice && dedupedWords.length > 0 ? dedupedWords : words;
    const distractorPool = dedupeVocabularyWordsById([
      ...basePool,
      ...globalDistractorPool,
    ]);

    const answerKey = mode === 'listening' ? 'word' : 'meaning';
    const wrongAnswers = distractorPool
      .filter((w) => String(w.id) !== String(word.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((w) => String(w?.[answerKey] || '').trim())
      .filter((ans) => Boolean(ans) && ans !== correctAnswer);

    const correctAnswer = String(word?.[answerKey] || '').trim();
    const answers = [correctAnswer, ...wrongAnswers].sort(
      () => Math.random() - 0.5,
    );

    if (mode === 'typing') {
      return {
        mode: 'typing',
        question: `Nghĩa tiếng Việt: "${word.meaning}"\nViết từ tiếng Anh tương ứng.`,
        correctAnswer: word.word,
        answers: [],
        word: word.word,
      };
    }

    if (mode === 'listening') {
      return {
        mode,
        question: 'Nghe và chọn từ tiếng Anh đúng',
        correctAnswer: word.word,
        answers,
        word: word.word,
        hideWord: true,
      };
    }

    return {
      mode,
      question: `Nghĩa của từ "${word.word}" là gì?`,
      correctAnswer: word.meaning,
      answers,
      word: word.word,
    };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getLearningProgress();
        if (!cancelled) {
          setXpStart(Math.max(0, Number(p?.totalXP) || 0));
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFinished) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Ghi hoàn thành mode trước XP — tránh race với saveLearningProgress snapshot cũ làm mất topicPracticeStats.
        if (!isReviewQuiz) {
          if (!practiceRecordedRef.current) {
            practiceRecordedRef.current = true;
            await recordTopicPracticeMode(
              topicId,
              isMixedPractice ? 'mixed' : 'quiz',
            );
          }
        }
        if (!isReviewQuiz && !practiceSessionXpAwardedRef.current) {
          practiceSessionXpAwardedRef.current = true;
          await awardXPRepeatable(
            `practice_quiz_${String(topicId || 'unknown')}`,
            XP.PRACTICE_COMPLETE_FIRST,
            XP.PRACTICE_COMPLETE_REPEAT,
          );
        }
        await flushLearningProgressWrites();
        const correct = Math.max(0, Math.floor(Number(score) || 0));
        const bonus = Math.min(correct * XP.REVIEW_GOOD, 120);
        if (bonus > 0) {
          await addPracticeSessionXp(bonus);
        }
        const p = await getLearningProgress();
        const latest = Math.max(0, Number(p?.totalXP) || 0);
        if (!cancelled) {
          setXpEarned(Math.max(0, latest - xpStart));
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isFinished, isReviewQuiz, topicId, xpStart, score, isMixedPractice]);

  useEffect(() => {
    try {
      if (Tts && typeof Tts.setDefaultLanguage === 'function') {
        Tts.setDefaultLanguage('en-US');
        Tts.setDefaultRate(0.5);
        Tts.setDefaultPitch(1.0);
        setTtsAvailable(true);
      }
    } catch (error) {
      console.warn('TTS không khả dụng:', error?.message);
      setTtsAvailable(false);
    }
    return () => {
      try {
        Tts?.stop?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (!Tts?.addEventListener) return undefined;
    const onEnd = () => setIsSpeaking(false);
    const s1 = Tts.addEventListener('tts-finish', onEnd);
    const s2 = Tts.addEventListener('tts-cancel', onEnd);
    return () => {
      try {
        s1?.remove?.();
        s2?.remove?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (isFinished || !showQuizTimer) return undefined;
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isFinished, showQuizTimer]);

  // Hết giờ thì tự động kết thúc bài và chuyển sang màn tổng kết.
  useEffect(() => {
    if (!showQuizTimer || isFinished) return;
    if (timeLeft <= 0) {
      setIsFinished(true);
    }
  }, [timeLeft, showQuizTimer, isFinished]);

  // Generate question khi ô đang làm (queue/review) hoặc lượt làm lại thay đổi
  useEffect(() => {
    if (isFinished) {
      setCurrentQuestion(null);
      return;
    }
    if (currentWord) {
      const question = generateQuestion(currentWord);
      setCurrentQuestion(question);
      setSelectedAnswer(null);
      setTypedAnswer('');
      setIsCorrect(false);
      setShowResult(false);
      fadeAnimation.setValue(1);
    } else {
      setCurrentQuestion(null);
    }
  }, [activeSlotIndex, currentWord, questionTurn, isFinished]);

  const applyAnswerResult = async (answer, correct) => {
    setIsCorrect(correct);
    setShowResult(true);
    if (useTopicRetryQueue && !correct) {
      setEnergy((e) => Math.max(0, e - energyPenaltyRef.current));
    }
    setAnswerHistory((prev) => {
      const entry = {
        index: activeSlotIndex,
        turn: questionTurn,
        question: currentQuestion.question,
        selectedAnswer: answer,
        correctAnswer: currentQuestion.correctAnswer,
        isCorrect: correct,
        word: currentWord?.word || '',
        wordId: currentWord?.id,
        meaning: currentWord?.meaning || currentQuestion.correctAnswer,
      };
      if (isReviewQuiz) {
        const next = [...prev];
        next[currentIndex] = entry;
        return next;
      }
      return [...prev, entry];
    });

    if (isReviewQuiz && currentWord) {
      await recordReviewQuizAnswer(currentWord.id, correct);
      if (correct) {
        setScore((prev) => prev + 1);
      } else {
        sessionEverWrongIdsRef.current.add(String(currentWord.id));
      }
    } else if (correct) {
      setScore((prev) => prev + 1);
      if (currentWord) {
        await mergeWeakWordIds([], [currentWord.id]);
      }
      if (currentWord && !learnedWords.has(currentWord.id)) {
        await markWordAsLearned(currentWord.id, true);
        setLearnedWords(new Set([...learnedWords, currentWord.id]));
      }
    } else if (!isReviewQuiz && currentWord) {
      sessionEverWrongIdsRef.current.add(String(currentWord.id));
      await mergeWeakWordIds([currentWord.id], []);
    }

    Animated.sequence([
      Animated.timing(fadeAnimation, {
        toValue: 0.7,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleAnswerSelect = async (answer) => {
    if (showResult) return;

    setSelectedAnswer(answer);
    const correct = answer === currentQuestion.correctAnswer;
    await applyAnswerResult(answer, correct);
  };

  const handleCheckTyping = async () => {
    if (showResult) return;
    const answer = typedAnswer.trim();
    if (!answer) return;
    const correct = areEquivalentAnswers(answer, currentQuestion?.correctAnswer);
    await applyAnswerResult(answer, correct);
  };

  const handlePlayPronunciation = () => {
    const text = String(currentQuestion?.word || currentWord?.word || '').trim();
    if (!ttsAvailable || !text) return;
    try {
      Tts.stop();
      setIsSpeaking(true);
      Tts.speak(text);
    } catch (error) {
      setIsSpeaking(false);
      console.warn('Lỗi phát âm:', error?.message);
    }
  };

  const handleNext = () => {
    if (!showResult) return;
    if (useTopicRetryQueue) {
      const q = questionQueue;
      const wq = wrongQueue;

      if (isCorrect) {
        setTopicCorrectSteps((n) => n + 1);
        const rest = q.slice(1);
        if (rest.length === 0) {
          if (wq.length > 0) {
            setQuestionQueue(wq);
            setWrongQueue([]);
            setLessonPhase('wrong_end');
          } else {
            setIsFinished(true);
            setQuestionQueue([]);
          }
        } else {
          setQuestionQueue(rest);
        }
      } else {
        const failed = q[0];
        const rest = q.slice(1);
        const nextWrong = [...wq, failed];
        if (rest.length === 0) {
          if (nextWrong.length > 0) {
            setQuestionQueue(nextWrong);
            setWrongQueue([]);
            setLessonPhase('wrong_end');
          } else {
            setIsFinished(true);
            setQuestionQueue([]);
          }
        } else {
          setWrongQueue(nextWrong);
          setQuestionQueue(rest);
        }
      }
      setQuestionTurn((t) => t + 1);
    } else if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const goToHome = useCallback(() => {
    const tabNav = navigation.getParent?.();
    tabNav?.navigate('HomeTab', {screen: 'Home'});
  }, [navigation]);

  const goToNextTopicSuggestion = useCallback(() => {
    if (nextTopic && nextTopic.id != null) {
      const w =
        Array.isArray(nextTopicWords) && nextTopicWords.length > 0
          ? nextTopicWords
          : Array.isArray(nextTopic.words)
            ? nextTopic.words
            : [];
      if (w.length > 0) {
        navigation.replace('VocabularyTopicDetail', {
          topic: nextTopic,
          words: w,
        });
        return;
      }
    }
    navigation.navigate('VocabularyTab', {screen: 'Vocabulary'});
  }, [navigation, nextTopic, nextTopicWords]);

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setTopicCorrectSteps(0);
    setWrongQueue([]);
    setLessonPhase('main');
    setSelectedAnswer(null);
    setTypedAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setIsFinished(false);
    setLearnedWords(new Set());
    setTimeLeft(5 * 60);
    setAnswerHistory([]);
    sessionEverWrongIdsRef.current = new Set();
    practiceRecordedRef.current = false;
    if (!isReviewQuiz && words?.length) {
      const q = words.map((_, i) => i);
      initialQueueLenRef.current = q.length;
      energyPenaltyRef.current = Math.min(
        20,
        Math.max(5, Math.round(100 / Math.max(1, q.length))),
      );
      setQuestionQueue(q);
      setEnergy(100);
      setQuestionTurn(1);
    }
  };

  const minute = String(Math.floor(timeLeft / 60)).padStart(1, '0');
  const second = String(timeLeft % 60).padStart(2, '0');
  /** Giữ cân header khi ẩn đồng hồ (luồng sau flashcard). */
  const headerRightSlot = showQuizTimer ? (
    <View style={styles.timerPill}>
      <Feather name="clock" size={14} color="#FFFFFF" />
      <Text style={styles.timerText}>
        {minute}:{second}
      </Text>
    </View>
  ) : (
    <View style={styles.headerRightSpacer} />
  );

  if (isFinished) {
    const xpGain = Math.max(0, Number(xpEarned) || 0);
    const congratsTitle = isReviewQuiz ? 'Ôn tập xong!' : 'Hoàn thành bài học!';
    const hasNextTopicPayload =
      nextTopic?.name &&
      ((Array.isArray(nextTopicWords) && nextTopicWords.length > 0) ||
        (Array.isArray(nextTopic?.words) && nextTopic.words.length > 0));
    const nextLabel = hasNextTopicPayload
      ? `Tiếp theo: ${nextTopic.name}`
      : 'Chọn chủ đề tiếp theo';
    const reviewedAnswers = Array.isArray(answerHistory) ? answerHistory : [];

    return (
      <SafeAreaView style={[styles.container, styles.successScreenSafe]}>
        <ScrollView
          contentContainerStyle={[
            styles.successScrollContent,
            {paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: insets.bottom + 24},
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.successIconCircle}>
            <Feather name="award" size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.successMainTitle}>{congratsTitle}</Text>
          {topicName ? (
            <Text style={styles.successTopicLabel} numberOfLines={2}>
              {topicName}
            </Text>
          ) : null}

          <View style={styles.successXpCard}>
            <Text style={styles.successXpLabel}>XP nhận được</Text>
            <Text style={styles.successXpValue}>+{xpGain}</Text>
          </View>

          {reviewedAnswers.length > 0 ? (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>Đáp án chi tiết</Text>
              <ScrollView
                style={styles.reviewListScroll}
                contentContainerStyle={styles.reviewListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator>
                {reviewedAnswers.map((row, idx) => (
                  <View key={`${idx}-${row?.word || 'q'}`} style={styles.reviewCard}>
                    <View style={styles.reviewHead}>
                      <View
                        style={[
                          styles.reviewStatusDot,
                          row?.isCorrect ? styles.reviewStatusDotOk : styles.reviewStatusDotBad,
                        ]}>
                        <Feather
                          name={row?.isCorrect ? 'check' : 'x'}
                          size={13}
                          color="#FFFFFF"
                        />
                      </View>
                      <Text style={styles.reviewQuestion} numberOfLines={2}>
                        Câu {idx + 1}: {row?.question || '—'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.reviewLine,
                        row?.isCorrect ? styles.reviewUserCorrect : styles.reviewUserWrong,
                      ]}>
                      Bạn trả lời: {String(row?.selectedAnswer || '(bỏ trống)')}
                    </Text>
                    {!row?.isCorrect ? (
                      <Text style={styles.reviewCorrectLine}>
                        Đáp án đúng: {String(row?.correctAnswer || '—')}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.successBtnPrimary}
            onPress={goToHome}
            activeOpacity={0.9}>
            <Feather name="home" size={22} color="#FFFFFF" />
            <Text style={styles.successBtnPrimaryText}>Về trang chủ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.successBtnSecondary}
            onPress={goToNextTopicSuggestion}
            activeOpacity={0.9}>
            <Feather name="book-open" size={22} color={COLORS.PRIMARY_DARK} />
            <Text style={styles.successBtnSecondaryText}>{nextLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.successLinkRedo}
            onPress={handleRestart}
            activeOpacity={0.85}>
            <Text style={styles.successLinkRedoText}>
              {isReviewQuiz ? 'Làm lại ôn tập' : 'Làm lại bài'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const topicQueuePending =
    useTopicRetryQueue && words?.length > 0 && questionQueue.length === 0;

  if (topicQueuePending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Đang chuẩn bị câu hỏi…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentWord || !currentQuestion) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Không có câu hỏi nào</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progressWidth = progressAnimation.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topOrange, {paddingTop: Math.max(insets.top, 8) + 4}]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitleText}
            </Text>
          </View>
          {headerRightSlot}
        </View>
        <View style={styles.progressRow}>
          <View
            style={[
              styles.progressOuter,
              useTopicRetryQueue ? styles.progressOuterWithEnergy : null,
            ]}>
            <Animated.View
              style={[
                styles.progressInner,
                {
                  width: progressWidth,
                },
              ]}
            />
          </View>
          {useTopicRetryQueue ? (
            <View style={styles.energyCompact} accessibilityLabel="Năng lượng">
              <Feather name="zap" size={16} color="#FEF3C7" />
              <Text style={styles.energyCompactText}>{Math.round(energy)}%</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.pageBody}>
        <Animated.View style={[styles.questionCard, {opacity: fadeAnimation}]}>
          <View style={styles.questionHeadRow}>
            <View style={styles.questionIndexBubble}>
              <Text style={styles.questionIndexText}>
                {useTopicRetryQueue ? questionTurn : currentIndex + 1}
              </Text>
            </View>
            <View style={styles.tagPill}>
              <Text style={styles.tagPillText}>
                {currentQuestion?.mode === 'typing'
                  ? 'Viết từ'
                  : currentQuestion?.mode === 'listening'
                    ? 'Nghe'
                    : 'Trắc nghiệm'}
              </Text>
            </View>
          </View>

          {useTopicRetryQueue &&
          currentWord &&
          !showResult &&
          lessonPhase === 'wrong_end' ? (
            <View style={styles.retryBannerPrimary}>
              <Feather name="layers" size={17} color="#9A3412" />
              <Text style={styles.retryBannerPrimaryText}>
                Phần cuối bài — ôn lại các câu đã sai
                {questionQueue.length + wrongQueue.length > 0
                  ? ` (còn ${questionQueue.length + wrongQueue.length})`
                  : ''}
                .
              </Text>
            </View>
          ) : null}

          <Text style={styles.questionText}>{currentQuestion.question}</Text>
          {(currentQuestion?.mode === 'listening' || currentQuestion?.mode === 'quiz') ? (
            <TouchableOpacity
              style={styles.listenRow}
              activeOpacity={0.8}
              onPress={handlePlayPronunciation}
              disabled={!ttsAvailable}>
              <Feather name="volume-2" size={14} color={COLORS.PRIMARY_DARK} />
              <Text style={styles.listenText}>
                {isSpeaking ? 'Đang phát âm...' : 'Nghe phát âm'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {currentQuestion?.mode === 'typing' ? (
            <View style={styles.typingWrap}>
              <TextInput
                style={[
                  styles.typingInput,
                  showResult && isCorrect && styles.typingInputCorrect,
                  showResult && !isCorrect && styles.typingInputWrong,
                ]}
                placeholder="Nhập từ tiếng Anh..."
                value={typedAnswer}
                onChangeText={setTypedAnswer}
                editable={!showResult}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {showResult ? (
                <Text
                  style={[
                    styles.typingHint,
                    isCorrect ? styles.typingHintCorrect : styles.typingHintWrong,
                  ]}>
                  {isCorrect
                    ? 'Chính xác!'
                    : `Đáp án đúng: ${currentQuestion.correctAnswer}`}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.answersContainer}>
              {(currentQuestion.answers || []).map((answer, index) => {
                const isSelected = selectedAnswer === answer;
                const isCorrectAnswer = answer === currentQuestion.correctAnswer;
                let answerStyle = styles.answerButton;
                let textStyle = styles.answerText;
                let letterStyle = styles.optionLetter;

                if (showResult) {
                  if (isCorrectAnswer) {
                    answerStyle = [styles.answerButton, styles.correctAnswer];
                    textStyle = [styles.answerText, styles.correctAnswerText];
                    letterStyle = [styles.optionLetter, styles.correctLetter];
                  } else if (isSelected && !isCorrectAnswer) {
                    answerStyle = [styles.answerButton, styles.wrongAnswer];
                    textStyle = [styles.answerText, styles.wrongAnswerText];
                    letterStyle = [styles.optionLetter, styles.wrongLetter];
                  }
                } else if (isSelected) {
                  answerStyle = [styles.answerButton, styles.selectedAnswer];
                  textStyle = [styles.answerText, styles.selectedAnswerText];
                  letterStyle = [styles.optionLetter, styles.selectedLetter];
                }

                return (
                  <TouchableOpacity
                    key={index}
                    style={answerStyle}
                    onPress={() => handleAnswerSelect(answer)}
                    disabled={showResult}
                    activeOpacity={0.8}>
                    <View style={styles.answerLeft}>
                      <View style={styles.optionBadge}>
                        <Text style={letterStyle}>
                          {OPTION_LETTERS[index] || index + 1}
                        </Text>
                      </View>
                      <Text style={textStyle}>{answer}</Text>
                    </View>
                    {showResult && isCorrectAnswer ? (
                      <Feather name="check" size={18} color={COLORS.SUCCESS} />
                    ) : null}
                    {showResult && isSelected && !isCorrectAnswer ? (
                      <Feather name="x" size={18} color={COLORS.ERROR} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {showResult && !isCorrect && useTopicRetryQueue ? (
            <Text style={styles.retryWrongFootnote}>
              {lessonPhase === 'main'
                ? 'Câu sai sẽ được gom vào phần ôn ở cuối bài (sau khi bạn làm xong lượt các câu còn lại).'
                : 'Câu sai sẽ được thêm vào lượt ôn trong phần cuối này.'}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.nextButton,
              !showResult &&
                currentQuestion?.mode !== 'typing' &&
                styles.nextButtonDisabled,
            ]}
            onPress={showResult ? handleNext : handleCheckTyping}
            disabled={!showResult && currentQuestion?.mode !== 'typing'}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.nextButtonText,
                !showResult &&
                  currentQuestion?.mode !== 'typing' &&
                  styles.nextButtonTextDisabled,
              ]}>
              {!showResult && currentQuestion?.mode === 'typing'
                ? 'Kiểm tra'
                : isReviewQuiz
                  ? currentIndex < words.length - 1
                    ? 'Tiếp tục'
                    : 'Hoàn thành'
                  : isCorrect && questionQueue.length <= 1
                    ? 'Hoàn thành'
                    : 'Tiếp tục'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
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
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerRightSpacer: {
    width: 32,
    height: 32,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timerText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  progressOuter: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  progressOuterWithEnergy: {
    minWidth: 0,
  },
  progressInner: {
    height: '100%',
    backgroundColor: '#111827',
  },
  energyCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
  },
  energyCompactText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFBEB',
    minWidth: 40,
    textAlign: 'right',
  },
  pageBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 22,
    justifyContent: 'flex-start',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
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
    fontWeight: '600',
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
  retryBannerPrimary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  retryBannerPrimaryText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 20,
  },
  retryWrongFootnote: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 12,
    fontWeight: '500',
  },
  questionText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    lineHeight: 30,
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
    marginBottom: 16,
  },
  typingInput: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#111827',
    fontWeight: '600',
  },
  typingInputCorrect: {
    borderColor: COLORS.SUCCESS,
    backgroundColor: '#ECFDF5',
  },
  typingInputWrong: {
    borderColor: COLORS.ERROR,
    backgroundColor: '#FEF2F2',
  },
  typingHint: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  typingHintCorrect: {
    color: COLORS.SUCCESS,
  },
  typingHintWrong: {
    color: COLORS.ERROR,
  },
  answersContainer: {
    gap: 12,
    marginBottom: 16,
  },
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
  selectedAnswer: {
    borderColor: COLORS.PRIMARY_DARK,
    backgroundColor: '#FFF7ED',
  },
  correctAnswer: {
    borderColor: COLORS.SUCCESS,
    backgroundColor: '#ECFDF5',
  },
  wrongAnswer: {
    borderColor: COLORS.ERROR,
    backgroundColor: '#FEF2F2',
  },
  answerText: {
    fontSize: 20,
    color: '#111827',
    flex: 1,
    fontWeight: '600',
  },
  selectedAnswerText: {
    color: '#9A3412',
    fontWeight: '700',
  },
  correctAnswerText: {
    color: COLORS.SUCCESS,
    fontWeight: '700',
  },
  wrongAnswerText: {
    color: COLORS.ERROR,
    fontWeight: '700',
  },
  selectedLetter: {
    color: '#9A3412',
  },
  correctLetter: {
    color: COLORS.SUCCESS,
  },
  wrongLetter: {
    color: COLORS.ERROR,
  },
  resultContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  correctResult: {
    backgroundColor: '#ECFDF5',
  },
  wrongResult: {
    backgroundColor: '#FEF2F2',
  },
  resultText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  correctAnswerHint: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.ERROR,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nextButtonTextDisabled: {
    color: '#F3F4F6',
  },
  successScreenSafe: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  successScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  successIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  successMainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  successSummaryHint: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
  },
  successTopicLabel: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
    textAlign: 'center',
  },
  successXpCard: {
    marginTop: 28,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD4',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  successXpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  successXpValue: {
    marginTop: 8,
    fontSize: 36,
    fontWeight: '800',
    color: '#7C3AED',
  },
  successBtnPrimary: {
    marginTop: 28,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 16,
    borderRadius: 14,
  },
  successBtnPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successBtnSecondary: {
    marginTop: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
  },
  successBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
    textAlign: 'center',
  },
  successLinkRedo: {
    marginTop: 22,
    paddingVertical: 10,
  },
  successLinkRedoText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    textDecorationLine: 'underline',
  },
  reviewSection: {
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  reviewListScroll: {
    maxHeight: 280,
  },
  reviewListContent: {
    paddingBottom: 2,
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewStatusDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  reviewStatusDotOk: {
    backgroundColor: '#22C55E',
  },
  reviewStatusDotBad: {
    backgroundColor: '#EF4444',
  },
  reviewQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewLine: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  reviewUserCorrect: {
    color: '#16A34A',
  },
  reviewUserWrong: {
    color: '#DC2626',
  },
  reviewCorrectLine: {
    marginTop: 4,
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
  },
});

export default VocabularyQuizScreen;
