import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../constants';

const STUDY_MODES = [
  {
    id: 'flashcard',
    name: 'FlashCard',
    description: 'Học từ vựng bằng thẻ ghi nhớ, lật thẻ để xem nghĩa',
    icon: '🃏',
    color: COLORS.PRIMARY_DARK,
  },
  {
    id: 'quiz',
    name: 'Trắc nghiệm',
    description: 'Luyện tập với câu hỏi trắc nghiệm để kiểm tra kiến thức',
    icon: '📝',
    color: COLORS.PRIMARY,
  },
  {
    id: 'typing',
    name: 'Gõ từ',
    description: 'Luyện tập bằng cách gõ từ vựng theo nghĩa tiếng Việt',
    icon: '⌨️',
    color: COLORS.PRIMARY,
  },
  {
    id: 'listening',
    name: 'Nghe và chọn',
    description: 'Nghe từ vựng và chọn nghĩa đúng từ các đáp án',
    icon: '👂',
    color: COLORS.PRIMARY,
  },
];

const StudyModeSelectionScreen = ({route}) => {
  const navigation = useNavigation();
  const {words, topicId, topic} = route.params || {};

  const handleSelectMode = (modeId) => {
    switch (modeId) {
      case 'flashcard':
        navigation.navigate('VocabularyFlashcard', {
          words,
          topicId,
        });
        break;
      case 'quiz':
        navigation.navigate('VocabularyQuiz', {
          words,
          topicId,
        });
        break;
      case 'typing':
        navigation.navigate('VocabularyTyping', {
          words,
          topicId,
        });
        break;
      case 'listening':
        navigation.navigate('VocabularyListening', {
          words,
          topicId,
        });
        break;
      default:
        break;
    }
  };

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
        <Text style={styles.headerTitle}>Chọn phương thức học</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Topic Info */}
      {topic && (
        <View style={styles.topicInfo}>
          <Text style={styles.topicIcon}>{topic.icon}</Text>
          <View style={styles.topicDetails}>
            <Text style={styles.topicName}>{topic.name}</Text>
            <Text style={styles.topicStats}>{words?.length || 0} từ vựng</Text>
          </View>
        </View>
      )}

      {/* Study Modes List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Chọn cách học phù hợp với bạn</Text>
        
        {STUDY_MODES.map((mode) => (
          <TouchableOpacity
            key={mode.id}
            style={styles.modeCard}
            onPress={() => handleSelectMode(mode.id)}
            activeOpacity={0.7}>
            <View style={styles.modeIconContainer}>
              <Text style={styles.modeIcon}>{mode.icon}</Text>
            </View>
            <View style={styles.modeContent}>
              <Text style={styles.modeName}>{mode.name}</Text>
              <Text style={styles.modeDescription}>{mode.description}</Text>
            </View>
            <View style={styles.modeArrow}>
              <Text style={styles.modeArrowText}>→</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
  },
  placeholder: {
    width: 80,
  },
  topicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  topicIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  topicDetails: {
    flex: 1,
  },
  topicName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  topicStats: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 16,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.PRIMARY_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modeIcon: {
    fontSize: 32,
  },
  modeContent: {
    flex: 1,
  },
  modeName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  modeDescription: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
  },
  modeArrow: {
    marginLeft: 12,
  },
  modeArrowText: {
    fontSize: 24,
    color: COLORS.PRIMARY_DARK,
  },
});

export default StudyModeSelectionScreen;
