import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getLearningProgress} from '../../services/storageService';
import {
  markWordAsLearned,
  recordReviewQuizAnswer,
} from '../../services/vocabularyService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const VocabularyTypingScreen = ({route}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {words, topicId} = route.params || {};
  const isReviewQuiz = topicId === 'review';
  const headerTitleText = isReviewQuiz ? 'Ôn tập gõ từ' : 'Luyện gõ từ';
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [xpStart, setXpStart] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const inputRef = useRef(null);

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

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
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    // Reset khi chuyển từ
    setUserInput('');
    setShowResult(false);
    setIsCorrect(false);
    fadeAnimation.setValue(1);
    // Focus vào input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [currentIndex]);

  const normalizeText = (text) => {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ');
  };

  const areEquivalentAnswers = (input, correct) => {
    const a = normalizeText(input);
    const b = normalizeText(correct);
    if (!a || !b) return false;
    if (a === b) return true;

    // Chấp nhận một số biến thể đồng nghĩa phổ biến trong bài gõ từ.
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
    if (ga && gb && ga === gb) return true;
    return false;
  };

  const handleCheckAnswer = async () => {
    if (!userInput.trim() || showResult) return;

    const correct = areEquivalentAnswers(userInput, currentWord.word);
    const userAnswer = String(userInput || '').trim();

    setIsCorrect(correct);
    setShowResult(true);
    setAnswerHistory((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        index: currentIndex,
        meaning: currentWord?.meaning || '',
        selectedAnswer: userAnswer || '—',
        correctAnswer: currentWord?.word || '',
        isCorrect: correct,
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

    // Animation
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

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setScore(0);
    setUserInput('');
    setShowResult(false);
    setIsCorrect(false);
    setIsFinished(false);
    setLearnedWords(new Set());
    setAnswerHistory([]);
  };

  if (isFinished) {
    const rows = answerHistory.filter(Boolean);
    const safeTotal = Array.isArray(words) ? words.length : 0;
    const derivedScore = rows.reduce(
      (sum, row) => sum + (row?.isCorrect ? 1 : 0),
      0,
    );
    const finalScore = Math.max(score, derivedScore);
    const percentage =
      safeTotal > 0 ? Math.round((finalScore / safeTotal) * 100) : 0;
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.reviewResultHeader, {paddingTop: Math.max(insets.top, 8) + 6}]}>
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
              <Feather name="type" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.reviewSummaryTitle}>
              {percentage >= 80 ? 'Xuất sắc!' : percentage >= 60 ? 'Khá tốt!' : 'Cố gắng lên!'}
            </Text>
            <Text style={styles.reviewSummaryMessage}>
              {percentage >= 80
                ? 'Bạn gõ từ rất tốt. Tiếp tục giữ phong độ!'
                : percentage >= 60
                ? 'Kết quả ổn rồi. Ôn thêm một chút để chắc hơn nhé.'
                : 'Bạn còn nhiều từ cần ôn lại. Thử làm lại ngay nhé!'}
            </Text>

            <View style={styles.reviewSummaryStats}>
              <View style={styles.reviewStatBoxLeft}>
                <Text style={styles.reviewStatPrimaryOrange}>{percentage}%</Text>
                <Text style={styles.reviewStatLabel}>Điểm số</Text>
              </View>
              <View style={styles.reviewStatBoxRight}>
                <Text style={styles.reviewStatPrimaryBlue}>
                  {finalScore}/{safeTotal}
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
                <Text style={styles.reviewSecondaryButtonText}>Về danh sách</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reviewPrimaryButton}
                onPress={handleRestart}
                activeOpacity={0.85}>
                <Text style={styles.reviewPrimaryButtonText}>Làm lại</Text>
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
                  Câu {row.index + 1}: {row.meaning}
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

  if (!currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Không có từ vựng nào</Text>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
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
            <View style={styles.headerRightSpacer} />
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressWidth,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressPercentage}>{Math.round(progress)}%</Text>
          </View>
        </View>

        <View style={styles.pageBody}>
        <Animated.View style={[styles.questionCard, {opacity: fadeAnimation}]}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionLabel}>Câu hỏi {currentIndex + 1}</Text>
          </View>

          <View style={styles.meaningContainer}>
            <Text style={styles.meaningLabel}>Nghĩa tiếng Việt:</Text>
            <Text style={styles.meaningText}>{currentWord.meaning}</Text>
          </View>

          {currentWord.pronunciation && (
            <View style={styles.pronunciationContainer}>
              <Text style={styles.pronunciationLabel}>Phiên âm:</Text>
              <Text style={styles.pronunciationText}>
                {currentWord.pronunciation}
              </Text>
            </View>
          )}

          {/* Input Field */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Gõ từ tiếng Anh:</Text>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                showResult &&
                  (isCorrect ? styles.inputCorrect : styles.inputWrong),
              ]}
              value={userInput}
              onChangeText={setUserInput}
              placeholder="Nhập từ tiếng Anh..."
              placeholderTextColor={COLORS.TEXT_LIGHT}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!showResult}
              onSubmitEditing={handleCheckAnswer}
            />
            {showResult && !isCorrect ? (
              <Text style={styles.wrongAnswerHint}>
                Đáp án đúng: {currentWord.word}
              </Text>
            ) : null}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {!showResult ? (
              <TouchableOpacity
                style={[
                  styles.checkButton,
                  !userInput.trim() && styles.checkButtonDisabled,
                ]}
                onPress={handleCheckAnswer}
                disabled={!userInput.trim()}
                activeOpacity={0.7}>
                <Text style={styles.checkButtonText}>Kiểm tra</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
                activeOpacity={0.7}>
                <Text style={styles.nextButtonText}>
                  {currentIndex < words.length - 1 ? 'Tiếp theo →' : 'Hoàn thành'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  keyboardView: {
    flex: 1,
  },
  topOrange: {
    backgroundColor: COLORS.PRIMARY,
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
  headerRightSpacer: {
    width: 32,
    height: 32,
  },
  progressBarContainer: {
    paddingTop: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#292524',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'right',
    fontWeight: '700',
  },
  pageBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  questionCard: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 4,
    borderRadius: 20,
    padding: 20,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  questionHeader: {
    marginBottom: 20,
  },
  questionLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  meaningContainer: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  meaningLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 8,
    fontWeight: '600',
  },
  meaningText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
  },
  pronunciationContainer: {
    marginBottom: 24,
  },
  pronunciationLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  pronunciationText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: COLORS.TEXT,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputCorrect: {
    borderColor: COLORS.SUCCESS,
    backgroundColor: COLORS.SUCCESS + '20',
  },
  inputWrong: {
    borderColor: COLORS.ERROR,
    backgroundColor: COLORS.ERROR + '20',
  },
  wrongAnswerHint: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ERROR,
  },
  actionButtons: {
    gap: 12,
  },
  checkButton: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  checkButtonDisabled: {
    backgroundColor: '#FDBA74',
  },
  checkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  nextButton: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
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
  reviewResultHeader: {
    backgroundColor: COLORS.PRIMARY_DARK,
    paddingHorizontal: 12,
    paddingBottom: 12,
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
  reviewResultBody: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
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
    color: COLORS.BACKGROUND_WHITE,
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
});

export default VocabularyTypingScreen;
