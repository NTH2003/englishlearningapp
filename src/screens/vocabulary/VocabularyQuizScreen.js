import React, {useState, useEffect, useRef} from 'react';
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
  recordReviewQuizAnswer,
} from '../../services/vocabularyService';
import {getLearningProgress} from '../../services/storageService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const MIXED_TYPES = ['quiz', 'typing', 'listening'];
let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (e) {
  console.warn('react-native-tts không khả dụng:', e?.message);
}

const VocabularyQuizScreen = ({route}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {words, topicId, topicName} = route.params || {};
  const isReviewQuiz = topicId === 'review';
  const headerTitleText = isReviewQuiz
    ? 'Ôn tập từ vựng'
    : topicName || 'Kiểm tra từ vựng cơ bản';
  
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

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

  // Tạo câu hỏi theo dạng hỗn hợp khi ôn tập
  const generateQuestion = (word, index) => {
    if (!word || !words) return null;
    const mode = isReviewQuiz ? MIXED_TYPES[index % MIXED_TYPES.length] : 'quiz';

    // Lấy 3 từ ngẫu nhiên khác làm đáp án sai
    const wrongAnswers = words
      .filter((w) => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((w) => w.meaning);

    // Tạo mảng đáp án và xáo trộn
    const answers = [word.meaning, ...wrongAnswers].sort(() => Math.random() - 0.5);

    if (mode === 'typing') {
      return {
        mode,
        question: `Viết từ tiếng Anh có nghĩa "${word.meaning}"`,
        correctAnswer: word.word,
        answers: [],
        word: word.word,
        pronunciation: word.pronunciation,
      };
    }
    if (mode === 'listening') {
      return {
        mode,
        question: 'Nghe và chọn nghĩa đúng',
        correctAnswer: word.meaning,
        answers,
        word: word.word,
        pronunciation: word.pronunciation,
      };
    }

    return {
      mode,
      question: `Nghĩa của từ "${word.word}" là gì?`,
      correctAnswer: word.meaning,
      answers,
      word: word.word,
      pronunciation: word.pronunciation,
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
    if (!isFinished) return;
    let cancelled = false;
    (async () => {
      try {
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
  }, [isFinished, xpStart]);

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
    if (isFinished) return undefined;
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isFinished]);

  // Generate question khi currentIndex hoặc currentWord thay đổi
  useEffect(() => {
    if (currentWord) {
      const question = generateQuestion(currentWord, currentIndex);
      setCurrentQuestion(question);
      // Reset khi chuyển câu hỏi
      setSelectedAnswer(null);
      setTypedAnswer('');
      setShowResult(false);
      fadeAnimation.setValue(1);
    } else {
      setCurrentQuestion(null);
    }
  }, [currentIndex, currentWord]);

  const applyAnswerResult = async (answer, correct) => {
    setIsCorrect(correct);
    setShowResult(true);
    setAnswerHistory((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        index: currentIndex,
        question: currentQuestion.question,
        selectedAnswer: answer,
        correctAnswer: currentQuestion.correctAnswer,
        isCorrect: correct,
        word: currentWord?.word || '',
        meaning: currentWord?.meaning || currentQuestion.correctAnswer,
      };
      return next;
    });

    if (isReviewQuiz && currentWord) {
      await recordReviewQuizAnswer(currentWord.id, correct);
      if (correct) {
        setScore((prev) => prev + 1);
      }
    } else if (correct) {
      setScore((prev) => prev + 1);
      if (currentWord && !learnedWords.has(currentWord.id)) {
        await markWordAsLearned(currentWord.id, true);
        setLearnedWords(new Set([...learnedWords, currentWord.id]));
      }
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
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Hoàn thành bài học
      setIsFinished(true);
    }
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setIsCorrect(false);
    setIsFinished(false);
    setLearnedWords(new Set());
    setTimeLeft(5 * 60);
    setAnswerHistory([]);
  };

  const minute = String(Math.floor(timeLeft / 60)).padStart(1, '0');
  const second = String(timeLeft % 60).padStart(2, '0');

  if (isFinished) {
    const rows = answerHistory.filter(Boolean);
    const derivedScore = rows.reduce(
      (sum, row) => sum + (row?.isCorrect ? 1 : 0),
      0,
    );
    const safeTotal = Array.isArray(words) ? words.length : 0;
    const finalScore = Math.max(score, derivedScore);
    const percentage = safeTotal > 0 ? Math.round((finalScore / safeTotal) * 100) : 0;
    const reviewTitle =
      percentage >= 80 ? 'Xuất sắc!' : percentage >= 60 ? 'Khá tốt!' : 'Cố gắng lên!';
    const reviewMessage =
      percentage >= 80
        ? 'Bạn đã nắm chắc từ vựng trong phần ôn tập.'
        : percentage >= 60
          ? 'Bạn làm ổn rồi. Ôn thêm các từ sai để chắc hơn nhé.'
          : 'Hãy ôn tập thêm và thử lại nhé!';
    const summaryTitle = isReviewQuiz ? reviewTitle : 'Hoàn thành!';
    const summaryMessage = isReviewQuiz
      ? reviewMessage
      : percentage >= 80
        ? 'Tuyệt vời! Bạn đã nắm vững từ vựng này.'
        : percentage >= 60
          ? 'Tốt lắm! Hãy tiếp tục luyện tập.'
          : 'Hãy ôn tập lại để cải thiện kết quả.';
    const finishText = isReviewQuiz ? 'Về danh sách' : 'Hoàn thành';
    const restartText = isReviewQuiz ? 'Làm lại' : 'Làm lại';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.reviewResultHeader}>
          <TouchableOpacity
            style={styles.reviewResultBack}
            onPress={handleFinish}
            activeOpacity={0.8}>
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.reviewResultHeaderTitle}>Kết quả</Text>
        </View>

        <ScrollView
          style={styles.reviewResultScroll}
          contentContainerStyle={styles.reviewResultContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.reviewSummaryCard}>
            <View style={styles.reviewSummaryIcon}>
              <Feather name="star" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.reviewSummaryTitle}>{summaryTitle}</Text>
            <Text style={styles.reviewSummaryMessage}>{summaryMessage}</Text>

            <View style={styles.reviewSummaryStats}>
              <View style={styles.reviewStatBoxLeft}>
                <Text style={styles.reviewStatPrimaryOrange}>{percentage}%</Text>
                <Text style={styles.reviewStatLabel}>Điểm số</Text>
              </View>
              <View style={styles.reviewStatBoxRight}>
                <Text style={styles.reviewStatPrimaryBlue}>
                  {finalScore}/{words.length}
                </Text>
                <Text style={styles.reviewStatLabel}>Đúng/Tổng số</Text>
              </View>
            </View>
            <Text style={styles.reviewXpText}>XP nhận: +{xpEarned}</Text>

            <View style={styles.reviewSummaryActions}>
              <TouchableOpacity
                style={styles.reviewSecondaryButton}
                onPress={handleFinish}
                activeOpacity={0.85}>
                <Text style={styles.reviewSecondaryButtonText}>{finishText}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reviewPrimaryButton}
                onPress={handleRestart}
                activeOpacity={0.85}>
                <Text style={styles.reviewPrimaryButtonText}>{restartText}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.reviewDetailTitle}>Chi tiết câu trả lời</Text>
          {rows.map((row) => (
            <View key={row.index} style={styles.reviewAnswerCard}>
              <View style={styles.reviewAnswerHead}>
                <View
                  style={[
                    styles.reviewAnswerStatusIcon,
                    row.isCorrect
                      ? styles.reviewAnswerStatusIconCorrect
                      : styles.reviewAnswerStatusIconWrong,
                  ]}>
                  <Feather
                    name={row.isCorrect ? 'check' : 'x'}
                    size={14}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.reviewAnswerQuestion}>
                  Câu {row.index + 1}: {row.question}
                </Text>
              </View>

              <Text
                style={[
                  styles.reviewAnswerLine,
                  row.isCorrect
                    ? styles.reviewAnswerUserCorrect
                    : styles.reviewAnswerUserWrong,
                ]}>
                Bạn trả lời: {row.selectedAnswer}
              </Text>
              {!row.isCorrect ? (
                <Text style={styles.reviewAnswerCorrect}>
                  Đáp án đúng: {row.correctAnswer}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
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
            <Text style={styles.headerSubtitle}>
              Câu {currentIndex + 1}/{words.length}
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
          <Animated.View
            style={[
              styles.progressInner,
              {
                width: progressWidth,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.pageBody}>
        <Animated.View style={[styles.questionCard, {opacity: fadeAnimation}]}>
          <View style={styles.questionHeadRow}>
            <View style={styles.questionIndexBubble}>
              <Text style={styles.questionIndexText}>{currentIndex + 1}</Text>
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
              {currentQuestion.answers.map((answer, index) => {
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

          <TouchableOpacity
            style={[
              styles.nextButton,
              !showResult && styles.nextButtonDisabled,
            ]}
            onPress={showResult ? handleNext : handleCheckTyping}
            disabled={!showResult && currentQuestion?.mode !== 'typing'}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.nextButtonText,
                !showResult && styles.nextButtonTextDisabled,
              ]}>
              {!showResult && currentQuestion?.mode === 'typing'
                ? 'Kiểm tra'
                : currentIndex < words.length - 1
                  ? 'Tiếp tục'
                  : 'Hoàn thành'}
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
  headerSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
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
    backgroundColor: COLORS.PRIMARY_DARK,
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
  reviewResultHeader: {
    backgroundColor: COLORS.PRIMARY_DARK,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewResultBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewResultHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reviewResultScroll: {
    flex: 1,
  },
  reviewResultContent: {
    padding: 14,
    paddingBottom: 26,
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
  reviewXpText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#7C3AED',
  },
  reviewSummaryActions: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  reviewSecondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  reviewPrimaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.PRIMARY_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPrimaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
  },
  resultScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  resultIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 16,
  },
  resultScore: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 8,
  },
  resultPercentage: {
    fontSize: 20,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 24,
  },
  resultMessage: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  restartButton: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.BORDER,
  },
  restartButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  finishButton: {
    flex: 1,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
});

export default VocabularyQuizScreen;
