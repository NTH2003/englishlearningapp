import React, { useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Dimensions } from "react-native"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants"
import { getAllVocabulary, isWordLearned } from "../services/vocabularyService"

const { height: SCREEN_HEIGHT } = Dimensions.get("window")

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
]

const TopicSelectionScreen = () => {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const [topicsProgress, setTopicsProgress] = useState({})
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [previewWords, setPreviewWords] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  useFocusEffect(
    React.useCallback(() => {
      loadTopicsProgress()
    }, []),
  )

  const loadTopicsProgress = async () => {
    const progress = {}
    for (const topic of TOPICS) {
      const allWords = getAllVocabulary()
      const topicWords = allWords.filter((word) => word.category === topic.id)

      let learnedCount = 0
      for (const word of topicWords) {
        const learned = await isWordLearned(word.id)
        if (learned) learnedCount++
      }

      const beginnerCount = topicWords.filter((w) => w.level === "Beginner").length
      const intermediateCount = topicWords.filter((w) => w.level === "Intermediate").length
      const mainLevel = beginnerCount >= intermediateCount ? "Beginner" : "Intermediate"
      const levelName = mainLevel === "Beginner" ? "Sơ cấp" : "Trung cấp"

      progress[topic.id] = {
        total: topicWords.length,
        learned: learnedCount,
        percentage: topicWords.length > 0 ? Math.round((learnedCount / topicWords.length) * 100) : 0,
        level: levelName,
      }
    }
    setTopicsProgress(progress)
  }

  const handleTopicSelect = (topicId) => {
    const allWords = getAllVocabulary()
    const topicWords = allWords.filter((word) => word.category === topicId)

    if (topicWords.length === 0) return

    const topic = TOPICS.find((t) => t.id === topicId)
    setSelectedTopic(topic)
    setPreviewWords(topicWords)
    setShowPreviewModal(true)
  }

  const handleStartLearning = () => {
    setShowPreviewModal(false)
    navigation.navigate("StudyModeSelection", {
      topicId: selectedTopic.id,
      words: previewWords,
      topic: selectedTopic,
    })
  }

  const handleClosePreview = () => {
    setShowPreviewModal(false)
    setSelectedTopic(null)
    setPreviewWords([])
  }

  const getTopicProgress = (topicId) => {
    return (
      topicsProgress[topicId] || {
        total: 0,
        learned: 0,
        percentage: 0,
        level: "Sơ cấp",
      }
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {TOPICS.map((topic) => {
          const progress = getTopicProgress(topic.id)
          return (
            <TopicCard key={topic.id} topic={topic} progress={progress} onPress={() => handleTopicSelect(topic.id)} />
          )
        })}
      </View>

      <PreviewModal
        visible={showPreviewModal}
        topic={selectedTopic}
        words={previewWords}
        insets={insets}
        onStartLearning={handleStartLearning}
        onClose={handleClosePreview}
      />
    </ScrollView>
  )
}

const TopicCard = ({ topic, progress, onPress }) => (
  <TouchableOpacity style={[styles.topicCard, { borderLeftColor: topic.color }]} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.topicHeader}>
      <View style={[styles.iconContainer, { backgroundColor: topic.color + "20" }]}>
        <Text style={styles.topicIcon}>{topic.icon}</Text>
      </View>
      <View style={styles.topicInfo}>
        <Text style={styles.topicName}>{topic.name}</Text>
        <Text style={styles.topicDescription} numberOfLines={2}>
          {topic.description}
        </Text>
      </View>
    </View>

    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>
          {progress.learned} / {progress.total} từ
        </Text>
        <Text style={styles.progressPercentage}>{progress.percentage}%</Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: topic.color + "30" }]}>
        <View style={[styles.progressBarFill, { width: `${progress.percentage}%`, backgroundColor: topic.color }]} />
      </View>
    </View>

    <View style={styles.levelSection}>
      <Text
        style={[
          styles.levelTag,
          { backgroundColor: progress.level === "Sơ cấp" ? COLORS.SUCCESS + "20" : COLORS.WARNING + "20" },
        ]}
      >
        <Text
          style={[
            { color: progress.level === "Sơ cấp" ? COLORS.SUCCESS : COLORS.WARNING, fontSize: 12, fontWeight: "600" },
          ]}
        >
          {progress.level}
        </Text>
      </Text>
    </View>
  </TouchableOpacity>
)

const PreviewModal = ({ visible, topic, words, insets, onStartLearning, onClose }) => (
  <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderContent}>
            {topic && (
              <>
                <View style={[styles.modalIconContainer, { backgroundColor: topic.color + "20" }]}>
                  <Text style={styles.modalIcon}>{topic.icon}</Text>
                </View>
                <View>
                  <Text style={styles.modalTitle}>{topic.name}</Text>
                  <Text style={styles.modalSubtitle}>{words.length} từ vựng</Text>
                </View>
              </>
            )}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Words List */}
        <View style={styles.wordsListContainer}>
          <ScrollView 
            style={styles.wordsList} 
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.wordsListContent}>
            {words.map((word, index) => (
              <View key={word.id} style={styles.wordItem}>
                <View style={styles.wordNumber}>
                  <Text style={styles.wordNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.wordContent}>
                  <Text style={styles.wordText}>{word.word}</Text>
                  <Text style={styles.wordPronunciation}>{word.pronunciation}</Text>
                  <Text style={styles.wordMeaning}>{word.meaning}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelButtonText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.startButton, topic && { backgroundColor: topic.color }]}
            onPress={onStartLearning}
            activeOpacity={0.7}
          >
            <Text style={styles.startButtonText}>Bắt đầu học →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  topicCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  topicIcon: {
    fontSize: 28,
  },
  topicInfo: {
    flex: 1,
  },
  topicName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  topicDescription: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 18,
  },
  progressSection: {
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "500",
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.PRIMARY_DARK,
  },
  progressBar: {
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2.5,
  },
  levelSection: {
    marginTop: 8,
  },
  levelTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: SCREEN_HEIGHT * 0.5,
    flexDirection: 'column',
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  modalHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  modalIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  modalIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.TEXT,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "600",
  },
  wordsListContainer: {
    flex: 1,
    minHeight: 200,
  },
  wordsList: {
    flex: 1,
  },
  wordsListContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  wordItem: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  wordNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.PRIMARY + "20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  wordNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.PRIMARY_DARK,
  },
  wordContent: {
    flex: 1,
  },
  wordText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.TEXT,
    marginBottom: 2,
  },
  wordPronunciation: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: "italic",
    marginBottom: 2,
  },
  wordMeaning: {
    fontSize: 14,
    color: COLORS.PRIMARY_DARK,
  },
  modalFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND_WHITE,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.BACKGROUND,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.TEXT_SECONDARY,
  },
  startButton: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.BACKGROUND_WHITE,
  },
})

export default TopicSelectionScreen
