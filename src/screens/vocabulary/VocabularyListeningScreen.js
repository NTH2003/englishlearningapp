import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
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

// Import TTS với error handling
let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (error) {
  console.warn('react-native-tts không khả dụng:', error);
}

const VocabularyListeningScreen = ({route}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {words, topicId} = route.params || {};
  const isReviewQuiz = topicId === 'review';
  const headerTitleText = isReviewQuiz ? 'Ôn tập nghe chọn' : 'Nghe và chọn';
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [xpStart, setXpStart] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;
  const [ttsAvailable, setTtsAvailable] = useState(false);

  // Tạo câu hỏi nghe tiếng Anh và chọn từ tiếng Anh
  const generateQuestion = (word) => {
    if (!word || !words) return null;
    
    // Lấy 3 từ tiếng Anh ngẫu nhiên khác làm đáp án sai
    const wrongAnswers = words
      .filter(w => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.word);
    
    // Tạo mảng đáp án và xáo trộn
    const answers = [word.word, ...wrongAnswers].sort(() => Math.random() - 0.5);
    
    return {
      question: 'Nghe và chọn từ đúng',
      correctAnswer: word.word,
      answers,
      word: word.word,
      pronunciation: word.pronunciation,
    };
  };

  const [currentQuestion, setCurrentQuestion] = useState(null);

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
    // Kiểm tra và cấu hình TTS
    try {
      if (Tts && typeof Tts.setDefaultLanguage === 'function') {
        Tts.setDefaultLanguage('en-US');
        Tts.setDefaultRate(0.5);
        Tts.setDefaultPitch(1.0);
        setTtsAvailable(true);
      }
    } catch (error) {
      console.warn('TTS không khả dụng:', error);
      setTtsAvailable(false);
    }
  }, []);

  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    // Generate question khi currentIndex hoặc currentWord thay đổi
    if (currentWord) {
      const question = generateQuestion(currentWord);
      setCurrentQuestion(question);
      // Reset khi chuyển câu hỏi
      setSelectedAnswer(null);
      setShowResult(false);
      setIsCorrect(false);
      setIsPlaying(false);
      fadeAnimation.setValue(1);
    } else {
      setCurrentQuestion(null);
    }
  }, [currentIndex, currentWord]);

  useEffect(() => {
    if (!currentWord || !ttsAvailable) return;
    const id = setTimeout(() => {
      handlePlayPronunciation();
    }, 240);
    return () => clearTimeout(id);
  }, [currentIndex, currentWord?.id, ttsAvailable]);

  const handlePlayPronunciation = () => {
    if (currentWord && ttsAvailable) {
      setIsPlaying(true);
      try {
        Tts.speak(currentWord.word);
        // Reset playing state sau khi phát xong
        setTimeout(() => {
          setIsPlaying(false);
        }, 2000);
      } catch (error) {
        console.warn('Lỗi phát âm:', error);
        setIsPlaying(false);
      }
    }
  };

  const handleAnswerSelect = async (answer) => {
    if (showResult) return;
    
    setSelectedAnswer(answer);
    const correct = answer === currentQuestion.correctAnswer;
    setIsCorrect(correct);
    setShowResult(true);
    setAnswerHistory((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        index: currentIndex,
        question: currentQuestion?.question || '',
        selectedAnswer: answer,
        correctAnswer: currentQuestion?.correctAnswer || '',
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
    setSelectedAnswer(null);
    setShowResult(false);
    setIsCorrect(false);
    setIsFinished(false);
    setIsPlaying(false);
    setLearnedWords(new Set());
    setAnswerHistory([]);
  };

  if (isFinished) {
    const percentage = Math.round((score / words.length) * 100);
    const rows = answerHistory.filter(Boolean);
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
              <Feather name="headphones" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.reviewSummaryTitle}>
              {percentage >= 80 ? 'Xuất sắc!' : percentage >= 60 ? 'Khá tốt!' : 'Cố gắng lên!'}
            </Text>
            <Text style={styles.reviewSummaryMessage}>
              {percentage >= 80
                ? 'Bạn nghe và nhận diện nghĩa rất tốt.'
                : percentage >= 60
                  ? 'Kết quả ổn rồi. Nghe thêm vài lần để chắc hơn nhé.'
                  : 'Bạn còn nhiều từ cần ôn lại. Thử làm lại ngay nhé!'}
            </Text>

            <View style={styles.reviewSummaryStats}>
              <View style={styles.reviewStatBoxLeft}>
                <Text style={styles.reviewStatPrimaryOrange}>{percentage}%</Text>
                <Text style={styles.reviewStatLabel}>Điểm số</Text>
              </View>
              <View style={styles.reviewStatBoxRight}>
                <Text style={styles.reviewStatPrimaryBlue}>
                  {score}/{words.length}
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
          <Text style={styles.progressPercentage}>
            {Math.round(progress)}%
          </Text>
        </View>
      </View>

      <View style={styles.pageBody}>
      <Animated.View style={[styles.questionCard, {opacity: fadeAnimation}]}>
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionLabel}>Câu hỏi {currentIndex + 1}</Text>
          </View>

          {/* Play Button */}
          <View style={styles.playContainer}>
            <TouchableOpacity
              style={[styles.playButton, isPlaying && styles.playButtonPlaying]}
              onPress={handlePlayPronunciation}
              disabled={!ttsAvailable || isPlaying}
              activeOpacity={0.7}>
              <View style={styles.playIconWrap}>
                <Feather
                  name={isPlaying ? 'pause' : 'volume-2'}
                  size={16}
                  color={COLORS.PRIMARY_DARK}
                />
              </View>
              <Text style={styles.playButtonText}>
                {isPlaying ? 'Đang phát...' : 'Nghe lại'}
              </Text>
            </TouchableOpacity>
            {!ttsAvailable && (
              <Text style={styles.ttsWarning}>
                Tính năng phát âm không khả dụng
              </Text>
            )}
          </View>

          <Text style={styles.questionText}>{currentQuestion.question}</Text>

          {/* Answers */}
          <View style={styles.answersContainer}>
            {currentQuestion.answers.map((answer, index) => {
              const isSelected = selectedAnswer === answer;
              const isCorrectAnswer = answer === currentQuestion.correctAnswer;
              let answerStyle = styles.answerButton;
              let textStyle = styles.answerText;

              if (showResult) {
                if (isCorrectAnswer) {
                  answerStyle = [styles.answerButton, styles.correctAnswer];
                  textStyle = [styles.answerText, styles.correctAnswerText];
                } else if (isSelected && !isCorrectAnswer) {
                  answerStyle = [styles.answerButton, styles.wrongAnswer];
                  textStyle = [styles.answerText, styles.wrongAnswerText];
                }
              } else if (isSelected) {
                answerStyle = [styles.answerButton, styles.selectedAnswer];
                textStyle = [styles.answerText, styles.selectedAnswerText];
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={answerStyle}
                  onPress={() => handleAnswerSelect(answer)}
                  disabled={showResult}
                  activeOpacity={0.7}>
                  <Text style={textStyle}>{answer}</Text>
                  {showResult && isCorrectAnswer && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                  {showResult && isSelected && !isCorrectAnswer && (
                    <Text style={styles.crossmark}>✕</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Example (only show when correct) */}
          {showResult && isCorrect && currentWord.example && (
            <View style={styles.exampleContainer}>
              <Text style={styles.exampleLabel}>Ví dụ:</Text>
              <Text style={styles.exampleText}>{currentWord.example}</Text>
              <Text style={styles.exampleMeaningText}>
                {currentWord.exampleMeaning}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Next Button - Fixed at bottom */}
        {showResult && (
          <View style={styles.nextButtonContainer}>
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.7}>
              <Text style={styles.nextButtonText}>
                {currentIndex < words.length - 1 ? 'Tiếp theo →' : 'Hoàn thành'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
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
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 24,
    paddingBottom: 16,
  },
  questionHeader: {
    marginBottom: 20,
  },
  questionLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  playContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  playButton: {
    backgroundColor: COLORS.PRIMARY_SOFT,
    borderWidth: 1,
    borderColor: '#FDBA74',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 126,
    justifyContent: 'center',
  },
  playButtonPlaying: {
    backgroundColor: '#FED7AA',
  },
  playIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  ttsWarning: {
    fontSize: 12,
    color: COLORS.ERROR,
    marginTop: 8,
    textAlign: 'center',
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 24,
    textAlign: 'center',
  },
  answersContainer: {
    gap: 12,
    marginBottom: 20,
  },
  answerButton: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedAnswer: {
    borderColor: COLORS.PRIMARY,
    backgroundColor: COLORS.PRIMARY_SOFT,
  },
  correctAnswer: {
    borderColor: COLORS.SUCCESS,
    backgroundColor: COLORS.SUCCESS + '20',
  },
  wrongAnswer: {
    borderColor: COLORS.ERROR,
    backgroundColor: COLORS.ERROR + '20',
  },
  answerText: {
    fontSize: 16,
    color: COLORS.TEXT,
    flex: 1,
  },
  selectedAnswerText: {
    color: COLORS.PRIMARY_DARK,
    fontWeight: '600',
  },
  correctAnswerText: {
    color: COLORS.SUCCESS,
    fontWeight: '600',
  },
  wrongAnswerText: {
    color: COLORS.ERROR,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 24,
    color: COLORS.SUCCESS,
    fontWeight: 'bold',
  },
  crossmark: {
    fontSize: 24,
    color: COLORS.ERROR,
    fontWeight: 'bold',
  },
  resultContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  correctResult: {
    backgroundColor: COLORS.SUCCESS + '20',
  },
  wrongResult: {
    backgroundColor: COLORS.ERROR + '20',
  },
  resultText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  exampleContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  exampleLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 6,
    fontWeight: '600',
  },
  exampleText: {
    fontSize: 16,
    color: COLORS.TEXT,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  exampleMeaningText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  nextButtonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND_WHITE,
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
  reviewResultBody: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
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
});

export default VocabularyListeningScreen;
