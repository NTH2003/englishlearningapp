import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../constants';
import {markWordAsLearned} from '../services/vocabularyService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const VocabularyQuizScreen = ({route}) => {
  const navigation = useNavigation();
  const {words, topicId} = route.params || {};
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  // Tạo câu hỏi trắc nghiệm
  const generateQuestion = (word) => {
    if (!word || !words) return null;
    
    // Lấy 3 từ ngẫu nhiên khác làm đáp án sai
    const wrongAnswers = words
      .filter(w => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.meaning);
    
    // Tạo mảng đáp án và xáo trộn
    const answers = [word.meaning, ...wrongAnswers].sort(() => Math.random() - 0.5);
    
    return {
      question: `Nghĩa của từ "${word.word}" là gì?`,
      correctAnswer: word.meaning,
      answers,
      word: word.word,
      pronunciation: word.pronunciation,
    };
  };

  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Generate question khi currentIndex hoặc currentWord thay đổi
  useEffect(() => {
    if (currentWord) {
      const question = generateQuestion(currentWord);
      setCurrentQuestion(question);
      // Reset khi chuyển câu hỏi
      setSelectedAnswer(null);
      setShowResult(false);
      fadeAnimation.setValue(1);
    } else {
      setCurrentQuestion(null);
    }
  }, [currentIndex, currentWord]);

  const handleAnswerSelect = async (answer) => {
    if (showResult) return;
    
    setSelectedAnswer(answer);
    const correct = answer === currentQuestion.correctAnswer;
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      setScore(score + 1);
      // Đánh dấu từ đã học
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
  };

  if (isFinished) {
    const percentage = Math.round((score / words.length) * 100);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultScreen}>
          <View style={styles.resultCard}>
            <Text style={styles.resultIcon}>
              {percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : '📚'}
            </Text>
            <Text style={styles.resultTitle}>Hoàn thành!</Text>
            <Text style={styles.resultScore}>
              {score} / {words.length}
            </Text>
            <Text style={styles.resultPercentage}>{percentage}%</Text>
            <Text style={styles.resultMessage}>
              {percentage >= 80
                ? 'Tuyệt vời! Bạn đã nắm vững từ vựng này.'
                : percentage >= 60
                ? 'Tốt lắm! Hãy tiếp tục luyện tập.'
                : 'Hãy ôn tập lại để cải thiện kết quả.'}
            </Text>
            <View style={styles.resultButtons}>
              <TouchableOpacity
                style={styles.restartButton}
                onPress={handleRestart}
                activeOpacity={0.7}>
                <Text style={styles.restartButtonText}>Làm lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.finishButton}
                onPress={handleFinish}
                activeOpacity={0.7}>
                <Text style={styles.finishButtonText}>Hoàn thành</Text>
              </TouchableOpacity>
            </View>
          </View>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <Text style={styles.backButtonText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.scoreText}>Điểm: {score}/{words.length}</Text>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {words.length}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
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

      {/* Question Card */}
      <Animated.View style={[styles.questionCard, {opacity: fadeAnimation}]}>
        <View style={styles.questionHeader}>
          <Text style={styles.questionLabel}>Câu hỏi {currentIndex + 1}</Text>
        </View>
        
        <View style={styles.wordInfo}>
          <Text style={styles.wordText}>{currentQuestion.word}</Text>
          <Text style={styles.pronunciationText}>
            {currentQuestion.pronunciation}
          </Text>
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

        {/* Result Message */}
        {showResult && (
          <View
            style={[
              styles.resultContainer,
              isCorrect ? styles.correctResult : styles.wrongResult,
            ]}>
            <Text style={styles.resultText}>
              {isCorrect ? '✓ Đúng rồi!' : '✕ Sai rồi!'}
            </Text>
            {!isCorrect && (
              <Text style={styles.correctAnswerText}>
                Đáp án đúng: {currentQuestion.correctAnswer}
              </Text>
            )}
          </View>
        )}

        {/* Next Button */}
        {showResult && (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            activeOpacity={0.7}>
            <Text style={styles.nextButtonText}>
              {currentIndex < words.length - 1 ? 'Tiếp theo →' : 'Hoàn thành'}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.PRIMARY_DARK,
    fontWeight: '600',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  scoreText: {
    fontSize: 14,
    color: COLORS.SUCCESS,
    fontWeight: '600',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: COLORS.BORDER,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'right',
    fontWeight: '600',
  },
  questionCard: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    padding: 24,
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
  wordInfo: {
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  wordText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 8,
  },
  pronunciationText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
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
