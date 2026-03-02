import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {markWordAsLearned, isWordLearned} from '../../services/vocabularyService';
import {getWordMedia} from '../../services/firebaseService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

const VocabularyFlashcardScreen = ({route}) => {
  const navigation = useNavigation();
  const {words, topicId} = route.params || {};
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLearned, setIsLearned] = useState(false);
  const [learnedWordsInSession, setLearnedWordsInSession] = useState(
    new Set(),
  );
  const [wordMedia, setWordMedia] = useState(null);
  
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  
  // Tính toán tiến độ
  const progress = words && words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  // Cập nhật animation tiến độ
  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    // Reset khi chuyển từ
    setIsFlipped(false);
    flipAnimation.setValue(0);
    position.setValue({x: 0, y: 0});
    opacity.setValue(1);
    
    // Kiểm tra trạng thái đã học của từ mới
    const syncStatuses = async () => {
      if (currentWord) {
        const learned = await isWordLearned(currentWord.id);
        setIsLearned(learned);
        const media = await getWordMedia(currentWord.id);
        setWordMedia(media);
      } else {
        setWordMedia(null);
      }
    };
    syncStatuses();
  }, [currentIndex, currentWord]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        position.setValue({x: gestureState.dx, y: gestureState.dy});
        opacity.setValue(1 - Math.abs(gestureState.dx) / SCREEN_WIDTH);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
          if (gestureState.dx > 0) {
            // Swipe right - Previous
            handlePrevious();
          } else {
            // Swipe left - Next
            handleNext();
          }
        } else {
          // Reset position
          Animated.spring(position, {
            toValue: {x: 0, y: 0},
            useNativeDriver: false,
          }).start();
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
  };

  const handleToggleLearned = async () => {
    if (!currentWord) return;
    
    const newLearnedStatus = !isLearned;
    setIsLearned(newLearnedStatus);
    
    // Cập nhật danh sách từ đã học trong session
    const newSet = new Set(learnedWordsInSession);
    if (newLearnedStatus) {
      newSet.add(currentWord.id);
    } else {
      newSet.delete(currentWord.id);
    }
    setLearnedWordsInSession(newSet);
    
    // Lưu vào storage
    await markWordAsLearned(currentWord.id, newLearnedStatus);
  };

  const getWordImageSource = () => {
    if (!currentWord) return null;
    const image = wordMedia?.imageUrl || currentWord.image || currentWord.imageUri;
    if (!image) return null;
    if (typeof image === 'string') return {uri: image};
    return image; // hỗ trợ require('...') nếu cần
  };

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontAnimatedStyle = {
    transform: [{rotateY: frontInterpolate}],
  };

  const backAnimatedStyle = {
    transform: [{rotateY: backInterpolate}],
  };

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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <Text style={styles.backButtonText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
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

      {/* Flashcard Container */}
      <View style={styles.flashcardContainer}>
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              transform: [
                {translateX: position.x},
                {translateY: position.y},
              ],
              opacity: opacity,
            },
          ]}
          {...panResponder.panHandlers}>
          {/* Front of Card */}
          <Animated.View
            style={[
              styles.card,
              styles.cardFront,
              frontAnimatedStyle,
              {
                opacity: flipAnimation.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 0, 0],
                }),
              },
            ]}>
            <View style={styles.cardContent}>
              <View style={styles.cardContentInner}>

                {/* Word Section tappable to flip */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={handleFlip}
                  style={styles.wordSectionTouchable}>
                  {getWordImageSource() ? (
                    <View style={styles.wordImageWrapper}>
                      <Image
                        source={getWordImageSource()}
                        style={styles.wordImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                  <View style={styles.wordSection}>
                    <Text style={styles.wordText}>{currentWord.word}</Text>
                    <Text style={styles.pronunciationText}>
                      {currentWord.pronunciation}
                    </Text>
                  </View>
                  <Text style={styles.flipHintText}>
                    Tap để lật thẻ xem nghĩa
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {/* Back of Card */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleFlip}
            style={[
              styles.card,
              styles.cardBack,
              backAnimatedStyle,
              {opacity: flipAnimation.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0, 1],
              })},
            ]}>
            <View style={styles.cardContent}>
              {/* Meaning Section */}
              <View style={styles.meaningSection}>
                <Text style={styles.meaningLabel}>Nghĩa tiếng Việt:</Text>
                <Text style={styles.meaningText}>{currentWord.meaning}</Text>
              </View>

              {/* Example Section - Always visible */}
              {currentWord.example && (
                <View style={styles.exampleSection}>
                  <Text style={styles.exampleLabel}>Ví dụ minh họa:</Text>
                  <Text style={styles.exampleText}>
                    {currentWord.example}
                  </Text>
                  <Text style={styles.exampleMeaningText}>
                    {currentWord.exampleMeaning}
                  </Text>
                </View>
              )}
              
              {/* Learned Button */}
              <TouchableOpacity
                style={[
                  styles.learnedButton,
                  isLearned && styles.learnedButtonActive,
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleLearned();
                }}
                activeOpacity={0.7}>
                <Text style={[
                  styles.learnedButtonText,
                  isLearned && styles.learnedButtonTextActive,
                ]}>
                  {isLearned ? '✓ Đã học' : '○ Đánh dấu đã học'}
                </Text>
              </TouchableOpacity>
              
              <Text style={styles.flipHintText}>Tap để lật lại</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

      </View>

      {/* Navigation Buttons */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.navButtonText,
              currentIndex === 0 && styles.navButtonTextDisabled,
            ]}>
            ← Trước
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.navButton,
            styles.navButtonPrimary,
            currentIndex === words.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={currentIndex === words.length - 1}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.navButtonText,
              styles.navButtonTextPrimary,
              currentIndex === words.length - 1 && styles.navButtonTextDisabled,
            ]}>
            Tiếp theo →
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    color: COLORS.PRIMARY_DARK,
    fontWeight: '600',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  statsContainer: {
    marginBottom: 4,
  },
  statsText: {
    fontSize: 12,
    color: COLORS.SUCCESS,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: COLORS.BORDER,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 6,
  },
  progressPercentage: {
    fontSize: 11,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'right',
    fontWeight: '600',
  },
  flashcardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  cardWrapper: {
    width: SCREEN_WIDTH - 40,
    height: 380,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 24,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  cardBack: {
    backgroundColor: COLORS.PRIMARY_SOFT,
    borderRadius: 24,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    flex: 1,
    width: '100%',
  },
  cardContentInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 26,
  },
  wordImageWrapper: {
    width: 170,
    height: 110,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: COLORS.BORDER,
  },
  wordImage: {
    width: '100%',
    height: '100%',
  },
  wordSection: {
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  wordSectionTouchable: {
    width: '100%',
    alignItems: 'center',
  },
  wordText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 12,
    textAlign: 'center',
  },
  pronunciationText: {
    fontSize: 20,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  flipHintText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
    marginTop: 20,
  },
  meaningSection: {
    marginBottom: 24,
    width: '100%',
  },
  meaningLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  meaningText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
    textAlign: 'center',
    lineHeight: 40,
  },
  exampleSection: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
  },
  exampleToggle: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    marginBottom: 16,
  },
  exampleToggleText: {
    fontSize: 16,
    color: COLORS.PRIMARY_DARK,
    fontWeight: '600',
  },
  learnedButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
  },
  learnedButtonActive: {
    backgroundColor: COLORS.SUCCESS,
    borderColor: COLORS.SUCCESS,
  },
  learnedButtonText: {
    fontSize: 16,
    color: COLORS.TEXT,
    fontWeight: '600',
  },
  learnedButtonTextActive: {
    color: COLORS.BACKGROUND_WHITE,
  },
  exampleLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
    marginBottom: 12,
  },
  exampleText: {
    fontSize: 18,
    color: COLORS.TEXT,
    fontStyle: 'italic',
    marginBottom: 8,
    textAlign: 'center',
  },
  exampleMeaningText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  navButton: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.BORDER,
  },
  navButtonPrimary: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderColor: COLORS.PRIMARY_DARK,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  navButtonTextPrimary: {
    color: COLORS.BACKGROUND_WHITE,
  },
  navButtonTextDisabled: {
    color: COLORS.TEXT_SECONDARY,
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

export default VocabularyFlashcardScreen;
