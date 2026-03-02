import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Video from 'react-native-video';
import {COLORS} from '../../constants';
import {getVocabularyByCategory} from '../../services/vocabularyService';
import {addVideoWatched} from '../../services/storageService';

// TOPICS giống với TopicSelectionScreen
const TOPICS = [
  {
    id: "Food",
    name: "Thực phẩm",
    icon: "🍔",
    color: "#FF6B6B",
    description: "Học từ vựng về các loại thực phẩm, món ăn và nhà hàng",
  },
  {
    id: "Travel",
    name: "Du lịch",
    icon: "✈️",
    color: "#4ECDC4",
    description: "Từ vựng về du lịch, khách sạn và các địa điểm tham quan",
  },
  {
    id: "Daily Life",
    name: "Cuộc sống hàng ngày",
    icon: "🏠",
    color: "#45B7D1",
    description: "Từ vựng về các hoạt động và thói quen hàng ngày",
  },
  {
    id: "Technology",
    name: "Công nghệ",
    icon: "💻",
    color: "#96CEB4",
    description: "Học từ vựng về công nghệ, máy tính và internet",
  },
];

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const VideoLearningScreen = ({route}) => {
  const navigation = useNavigation();
  const {video} = route.params || {};
  const videoRef = useRef(null);
  
  const [isVideoEnded, setIsVideoEnded] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [userUnderstood, setUserUnderstood] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paused, setPaused] = useState(false);

  // Lấy tất cả từ vựng của chủ đề video (không chỉ relatedWordIds)
  const topicWords = video ? getVocabularyByCategory(video.category) : [];

  useEffect(() => {
    // Tự động hiện modal khi video kết thúc
    if (isVideoEnded) {
      setTimeout(() => {
        setShowQuestionModal(true);
      }, 500);
    }
  }, [isVideoEnded]);

  const handleVideoLoad = () => {
    setIsLoading(false);
  };

  const handleVideoEnd = () => {
    setIsVideoEnded(true);
    if (video?.id != null) {
      addVideoWatched(video.id);
    }
  };

  const handleAnswerQuestion = (understood) => {
    setUserUnderstood(understood);
    setShowQuestionModal(false);
  };

  const handlePracticeVocabulary = () => {
    if (topicWords.length > 0) {
      // Tìm topic object từ TOPICS dựa trên category của video
      const topic = TOPICS.find((t) => t.id === video.category);
      
      if (topic) {
        navigation.navigate('StudyModeSelection', {
          words: topicWords,
          topicId: topic.id,
          topic: topic,
        });
      }
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  if (!video) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Không tìm thấy video</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{video.title}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.videoContainer}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text style={styles.loadingText}>Đang tải video...</Text>
          </View>
        )}
        <Video
          ref={videoRef}
          source={{uri: video.videoUrl}}
          style={styles.video}
          controls={true}
          paused={paused}
          resizeMode="contain"
          onLoad={handleVideoLoad}
          onEnd={handleVideoEnd}
          onError={(error) => {
            console.error('Video error:', error);
            setIsLoading(false);
          }}
        />
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.videoTitle}>{video.title}</Text>
        <Text style={styles.videoDescription}>{video.description}</Text>
        <View style={styles.metaInfo}>
          <Text style={styles.metaText}>⏱️ {video.duration}</Text>
          <Text style={styles.metaText}>📚 {topicWords.length} từ vựng</Text>
        </View>
      </View>

      {/* Modal câu hỏi */}
      <Modal
        visible={showQuestionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQuestionModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bạn có hiểu video này không?</Text>
            <Text style={styles.modalSubtitle}>
              Hãy trả lời để chúng tôi có thể đề xuất bài học phù hợp
            </Text>
            
            <View style={styles.answerButtons}>
              <TouchableOpacity
                style={[styles.answerButton, styles.yesButton]}
                onPress={() => handleAnswerQuestion(true)}
                activeOpacity={0.7}>
                <Text style={styles.answerButtonText}>Có, tôi hiểu</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.answerButton, styles.noButton]}
                onPress={() => handleAnswerQuestion(false)}
                activeOpacity={0.7}>
                <Text style={styles.answerButtonText}>Chưa, tôi cần học thêm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nút luyện tập từ vựng (hiện sau khi trả lời) */}
      {userUnderstood !== null && topicWords.length > 0 && (
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.practiceButton}
            onPress={handlePracticeVocabulary}
            activeOpacity={0.8}>
            <Text style={styles.practiceButtonText}>
              📚 Luyện tập từ vựng {video.category === 'Food' ? 'Thực phẩm' : 
                                    video.category === 'Travel' ? 'Du lịch' :
                                    video.category === 'Daily Life' ? 'Cuộc sống hàng ngày' :
                                    'Công nghệ'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.PRIMARY,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 80,
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.5625, // 16:9 aspect ratio
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.5625,
  },
  loadingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 20,
  },
  infoContainer: {
    padding: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
  },
  videoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  videoDescription: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12,
    lineHeight: 24,
  },
  metaInfo: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    padding: 24,
    width: SCREEN_WIDTH - 40,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  answerButtons: {
    width: '100%',
    gap: 12,
  },
  answerButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: COLORS.PRIMARY,
  },
  noButton: {
    backgroundColor: COLORS.BORDER,
  },
  answerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  actionContainer: {
    padding: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  practiceButton: {
    backgroundColor: COLORS.PRIMARY,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  practiceButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.BACKGROUND_WHITE,
  },
});

export default VideoLearningScreen;
