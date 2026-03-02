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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {markWordAsLearned} from '../../services/vocabularyService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const VocabularyTypingScreen = ({route}) => {
  const navigation = useNavigation();
  const {words, topicId} = route.params || {};
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const inputRef = useRef(null);

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

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
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const handleCheckAnswer = async () => {
    if (!userInput.trim() || showResult) return;

    const normalizedInput = normalizeText(userInput);
    const normalizedCorrect = normalizeText(currentWord.word);
    const correct = normalizedInput === normalizedCorrect;

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
                  Đáp án đúng: {currentWord.word}
                </Text>
              )}
              {currentWord.example && isCorrect && (
                <View style={styles.exampleContainer}>
                  <Text style={styles.exampleLabel}>Ví dụ:</Text>
                  <Text style={styles.exampleText}>{currentWord.example}</Text>
                  <Text style={styles.exampleMeaningText}>
                    {currentWord.exampleMeaning}
                  </Text>
                </View>
              )}
            </View>
          )}

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
  correctAnswerText: {
    fontSize: 16,
    color: COLORS.TEXT,
    textAlign: 'center',
    fontWeight: '600',
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
    opacity: 0.5,
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

export default VocabularyTypingScreen;
