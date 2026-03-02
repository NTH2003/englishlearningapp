'use client';

import React, { useState, useCallback, useMemo, memo } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
  SafeAreaView,
  RefreshControl,
  Alert,
  TextInput,
  Animated,
} from "react-native"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../../constants"
import { getAllVocabulary, isWordLearned } from "../../services/vocabularyService"
import { getTopics, saveTopics, getLearningProgress } from "../../services/storageService"
import { SEED_TOPICS } from "../../data/seedTopicsData"
import FilterChip from "./FilterChip"

const { height: SCREEN_HEIGHT } = Dimensions.get("window")

const TopicSelectionScreen = () => {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const [topics, setTopics] = useState([])
  const [topicsProgress, setTopicsProgress] = useState({})
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [previewWords, setPreviewWords] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingTopics, setSavingTopics] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("default")
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [userWordLevel, setUserWordLevel] = useState("all") // all | Beginner | Intermediate

  const loadTopicsAndProgress = useCallback(async () => {
    let topicsToUse = []
    try {
      const list = await getTopics([])
      topicsToUse = Array.isArray(list) && list.length > 0 ? list : []
      setTopics(topicsToUse)
    } catch (_) {
      setTopics([])
    }
    const progress = {}
    for (const topic of topicsToUse) {
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
        mainLevel,
      }
    }
    setTopicsProgress(progress)
    // Lấy level của người học để lọc chủ đề phù hợp
    try {
      const lp = await getLearningProgress()
      const lvl = lp?.level
      if (lvl === "Sơ cấp") {
        setUserWordLevel("Beginner")
      } else if (lvl === "Trung cấp") {
        setUserWordLevel("Intermediate")
      } else {
        setUserWordLevel("all")
      }
    } catch (_) {
      setUserWordLevel("all")
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadTopicsAndProgress()
    }, [loadTopicsAndProgress]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTopicsAndProgress()
    setRefreshing(false)
  }, [loadTopicsAndProgress])

  const handleTopicSelect = (topicId) => {
    const allWords = getAllVocabulary()
    const topicWords = allWords.filter((word) => word.category === topicId)

    if (topicWords.length === 0) return

    const topic = topics.find((t) => t.id === topicId)
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

  const handleSaveTopicsToFirebase = useCallback(async () => {
    setSavingTopics(true)
    try {
      const result = await saveTopics(topics)
      if (result.ok) {
        Alert.alert("Thành công", "Đã lưu chủ đề lên Firebase.")
        await loadTopicsAndProgress()
      } else {
        Alert.alert("Lỗi", result.error || "Không lưu được.")
      }
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không lưu được.")
    } finally {
      setSavingTopics(false)
    }
  }, [topics, loadTopicsAndProgress])

  const handleSeedSampleData = useCallback(async () => {
    setSeeding(true)
    try {
      const result = await saveTopics(SEED_TOPICS)
      if (result.ok) {
        Alert.alert("Thành công", "Đã thêm 4 chủ đề mẫu vào Firebase. Đang tải lại...")
        await loadTopicsAndProgress()
      } else {
        Alert.alert("Lỗi", result.error || "Không thêm được dữ liệu mẫu.")
      }
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không thêm được dữ liệu mẫu.")
    } finally {
      setSeeding(false)
    }
  }, [loadTopicsAndProgress])

  const getTopicProgress = (topicId) => {
    return (
      topicsProgress[topicId] || {
        total: 0,
        learned: 0,
        percentage: 0,
        level: "Sơ cấp",
        mainLevel: "Beginner",
      }
    )
  }

  const getTopicStatus = (topicId) => {
    const p = getTopicProgress(topicId)
    if (!p.total || p.percentage === 0) return "not_started"
    if (p.percentage === 100) return "completed"
    return "in_progress"
  }

  const overallStats = (() => {
    const totalTopics = topics.length
    let learned = 0
    let total = 0
    topics.forEach((t) => {
      const p = getTopicProgress(t.id)
      learned += p.learned || 0
      total += p.total || 0
    })
    const percentage = total > 0 ? Math.round((learned / total) * 100) : 0
    return { totalTopics, learned, total, percentage }
  })()

  const filteredAndSearchedTopics = useMemo(() => {
    let result = topics.filter((topic) => {
      // Lọc theo level người học
      if (userWordLevel !== "all") {
        const p = getTopicProgress(topic.id)
        if (p.mainLevel && p.mainLevel !== userWordLevel) {
          return false
        }
      }
      // Apply status filter
      if (filter !== "all" && getTopicStatus(topic.id) !== filter) {
        return false
      }
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return topic.name.toLowerCase().includes(query) || topic.description.toLowerCase().includes(query)
      }
      return true
    })

    // Apply sorting
    if (sortBy === "progress") {
      result.sort((a, b) => getTopicProgress(b.id).percentage - getTopicProgress(a.id).percentage)
    } else if (sortBy === "alphabetical") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [topics, filter, searchQuery, sortBy, topicsProgress, userWordLevel])

  return (
    <SafeAreaView style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.PRIMARY_DARK]} />
        }
      >
        {/* Header bỏ text để màn hình tập trung vào danh sách chủ đề */}

        {topics.length === 0 && (
          <TouchableOpacity
            style={[styles.seedButton, styles.seedButtonElevated]}
            onPress={handleSeedSampleData}
            disabled={seeding}
          >
            <Text style={styles.seedButtonIcon}>✨</Text>
            <Text style={styles.seedButtonText}>{seeding ? "Đang thêm..." : "Thêm dữ liệu mẫu"}</Text>
          </TouchableOpacity>
        )}

        {topics.length > 0 && (
          <>
            <View style={styles.searchAndSortContainer}>
              <View style={styles.searchInputWrapper}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm chủ đề..."
                  placeholderTextColor={COLORS.TEXT_SECONDARY}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[styles.sortButton, showSortMenu && styles.sortButtonActive]}
                onPress={() => setShowSortMenu(!showSortMenu)}
              >
                <Text style={styles.sortButtonText}>⚙️</Text>
              </TouchableOpacity>
            </View>

            {showSortMenu && (
              <View style={styles.sortMenu}>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === "default" && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy("default")
                    setShowSortMenu(false)
                  }}
                >
                  <Text style={styles.sortOptionText}>Mặc định</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === "progress" && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy("progress")
                    setShowSortMenu(false)
                  }}
                >
                  <Text style={styles.sortOptionText}>Theo tiến độ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === "alphabetical" && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy("alphabetical")
                    setShowSortMenu(false)
                  }}
                >
                  <Text style={styles.sortOptionText}>Theo tên (A-Z)</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.filterRow}>
              <FilterChip label="Tất cả" active={filter === "all"} onPress={() => setFilter("all")} />
              <FilterChip
                label="Chưa học"
                active={filter === "not_started"}
                onPress={() => setFilter("not_started")}
              />
              <FilterChip
                label="Đang học"
                active={filter === "in_progress"}
                onPress={() => setFilter("in_progress")}
              />
              <FilterChip
                label="Hoàn thành"
                active={filter === "completed"}
                onPress={() => setFilter("completed")}
              />
            </View>
          </>
        )}

        <View style={styles.content}>
          {filteredAndSearchedTopics.length === 0 && topics.length === 0 && !refreshing ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📚</Text>
              <Text style={styles.emptyStateTitle}>Chưa có chủ đề nào</Text>
              <Text style={styles.emptyStateText}>
                Hãy thêm dữ liệu mẫu để bắt đầu học tập.
              </Text>
            </View>
          ) : filteredAndSearchedTopics.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🔍</Text>
              <Text style={styles.emptyStateTitle}>Không tìm thấy chủ đề</Text>
              <Text style={styles.emptyStateText}>Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</Text>
            </View>
          ) : (
            filteredAndSearchedTopics.map((topic) => {
              const progress = getTopicProgress(topic.id)
              return (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  progress={progress}
                  status={getTopicStatus(topic.id)}
                  onPress={() => handleTopicSelect(topic.id)}
                />
              )
            })
          )}
        </View>
      </ScrollView>

      <PreviewModal
        visible={showPreviewModal}
        topic={selectedTopic}
        words={previewWords}
        insets={insets}
        onStartLearning={handleStartLearning}
        onClose={handleClosePreview}
      />
    </SafeAreaView>
  )
}

const TopicCard = memo(({ topic, progress, status, onPress }) => (
  <TouchableOpacity
    style={[styles.topicCard, styles.topicCardShadow, { borderLeftColor: topic.color }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.topicHeader}>
      <View style={[styles.iconContainer, { backgroundColor: topic.color + "22" }]}>
        <Text style={styles.topicIcon}>{topic.icon}</Text>
      </View>
      <View style={styles.topicInfo}>
        <Text style={styles.topicName}>{topic.name}</Text>
        <View style={styles.topicMetaRow}>
          <Text
            style={[
              styles.topicLevelBadge,
              progress.level === "Trung cấp" && styles.topicLevelBadgeIntermediate,
            ]}
          >
            {progress.level}
          </Text>
        </View>
        <Text style={styles.topicDescription} numberOfLines={2}>
          {topic.description}
        </Text>
      </View>
    </View>

    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>
          {progress.percentage}% đã học
        </Text>
        <Text style={styles.progressPercentage}>
          {progress.learned}/{progress.total} từ
        </Text>
      </View>
      <View style={[styles.progressBarBg, { backgroundColor: topic.color + "28" }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.min(progress.percentage, 100)}%`,
              backgroundColor: topic.color,
            },
          ]}
        />
      </View>
    </View>
  </TouchableOpacity>
))

TopicCard.displayName = "TopicCard"

const PreviewModal = ({ visible, topic, words, insets, onStartLearning, onClose }) => {
  const previewList = (words || []).slice(0, 6)
  const remaining = Math.max((words?.length || 0) - previewList.length, 0)

  return (
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
            contentContainerStyle={styles.wordsListContent}
          >
            {previewList.map((word, index) => (
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
          {remaining > 0 && (
            <Text style={styles.moreWordsText}>+ {remaining} từ khác</Text>
          )}
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
            <Text style={styles.startButtonText}>▶ Bắt đầu học</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
)}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerContent: {
    flex: 1,
  },
  headingTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.TEXT,
    textAlign: "left",
    marginBottom: 4,
  },
  headingSubtitle: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
  },
  progressRing: {
    marginLeft: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  progressCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.PRIMARY_DARK + "08",
  },
  progressPercentText: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.PRIMARY_DARK,
  },
  seedButton: {
    marginHorizontal: 20,
    marginVertical: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: COLORS.PRIMARY_DARK + "12",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  seedButtonElevated: {
    shadowColor: COLORS.PRIMARY_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  seedButtonIcon: {
    fontSize: 18,
  },
  seedButtonText: {
    fontSize: 14,
    color: COLORS.PRIMARY_DARK,
    fontWeight: "600",
  },
  searchAndSortContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.TEXT,
  },
  clearButton: {
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  sortButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  sortButtonActive: {
    backgroundColor: COLORS.PRIMARY_DARK + "15",
    borderColor: COLORS.PRIMARY_DARK,
  },
  sortButtonText: {
    fontSize: 18,
  },
  sortMenu: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    overflow: "hidden",
  },
  sortOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  sortOptionActive: {
    backgroundColor: COLORS.PRIMARY_DARK + "08",
    borderBottomColor: COLORS.PRIMARY_DARK,
  },
  sortOptionText: {
    fontSize: 14,
    color: COLORS.TEXT,
    fontWeight: "500",
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  topicCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
  },
  topicCardShadow: {
    shadowColor: COLORS.TEXT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  topicIcon: {
    fontSize: 30,
  },
  topicInfo: {
    flex: 1,
  },
  topicName: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.TEXT,
    marginBottom: 2,
  },
  topicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  topicLevelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "#E0F2FE",
    color: COLORS.PRIMARY_DARK,
  },
  topicLevelBadgeIntermediate: {
    backgroundColor: "#FEF3C7",
    color: COLORS.WARNING,
  },
  topicDescription: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
  },
  statusIndicator: {
    marginLeft: 8,
  },
  statusEmoji: {
    fontSize: 24,
  },
  progressSection: {
    marginBottom: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressText: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "600",
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.PRIMARY_DARK,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    marginTop: 1,
    borderRadius: 6,
  },
  levelSection: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  levelTag: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  levelTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.BACKGROUND_WHITE,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: "600",
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
    flexDirection: "column",
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
  moreWordsText: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    textAlign: "center",
  },
})

export default TopicSelectionScreen
