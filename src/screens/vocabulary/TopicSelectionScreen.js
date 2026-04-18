import React, { useState, useCallback, useMemo, memo, useContext, useEffect, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
  StatusBar,
  DeviceEventEmitter,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Feather from "react-native-vector-icons/Feather"
import { COLORS } from "../../constants"
import { THEME } from "../../theme"
import {
  getAllVocabulary,
  isWordLearned,
  loadVocabularyFromFirebase,
  wordBelongsToTopic,
} from "../../services/vocabularyService"
import { getTopics, saveTopics, getLearningProgress } from "../../services/storageService"
import { LEARNING_PROGRESS_UPDATED } from "../../services/learningProgressEvents"
import FilterChip from "./FilterChip"
import { VocabularyTabContext } from "../../contexts/VocabularyTabContext"

const { height: SCREEN_HEIGHT } = Dimensions.get("window")

const STAT_BLUE = "#2563EB"
const STAT_GREEN = "#16A34A"

function getTopicFeatherIcon(topicId) {
  const map = {
    Food: "book-open",
    Travel: "map-pin",
    "Daily Life": "home",
    Technology: "cpu",
  }
  return map[topicId] || "layers"
}

const TopicSelectionScreen = ({ rootFocusTick = 0 }) => {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const vocabTab = useContext(VocabularyTabContext)
  const embedInRoot = vocabTab?.embedInRoot === true
  const [topics, setTopics] = useState([])
  const [topicsProgress, setTopicsProgress] = useState({})
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [previewWords, setPreviewWords] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingTopics, setSavingTopics] = useState(false)
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [userWordLevel, setUserWordLevel] = useState("all") // all | Beginner | Intermediate

  /** Tránh nhiều load song song: bản cũ xong sau ghi đè → topics = [] / tiến độ 0. */
  const loadGenerationRef = useRef(0)
  const loadingGuardRef = useRef(null)

  const loadTopicsAndProgress = useCallback(async (readProgressFromServer = false) => {
    const gen = ++loadGenerationRef.current
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ])

    /** Không để frame «Chưa có chủ đề» khi remount ([] ban đầu). */
    setTopics((prev) => (Array.isArray(prev) ? prev : []))
    if (loadingGuardRef.current) {
      clearTimeout(loadingGuardRef.current)
    }
    // Guard: tránh bị kẹt loading nếu có nhiều lần reload chồng nhau.
    loadingGuardRef.current = setTimeout(() => {
      setInitialLoading(false)
    }, 9000)

    try {
      // Không chặn UI quá lâu vì tải từ vựng; chỉ chờ ngắn, phần còn lại tiếp tục ở nền.
      if (getAllVocabulary().length === 0) {
        try {
          await withTimeout(loadVocabularyFromFirebase(), 3500)
        } catch (_) {}
      }

      let topicsToUse = []
      try {
        const list = await withTimeout(getTopics([]), 5000)
        if (Array.isArray(list) && list.length > 0) {
          topicsToUse = list
        } else {
          topicsToUse = []
        }
        if (!topicsToUse?.length) {
          topicsToUse = []
        }
      } catch (_) {
        topicsToUse = []
      }

      // Lần mở đầu có thể auth/network chưa sẵn sàng; retry nhẹ 1 lần.
      if (!topicsToUse.length) {
        try {
          await new Promise((r) => setTimeout(r, 1200))
          const listRetry = await withTimeout(getTopics([]), 4000)
          if (Array.isArray(listRetry) && listRetry.length > 0) {
            topicsToUse = listRetry
          }
        } catch (_) {}
      }

      const safeTopics =
        Array.isArray(topicsToUse) && topicsToUse.length > 0 ? topicsToUse : []

      if (gen !== loadGenerationRef.current) return
      setTopics(safeTopics)
      // Có danh sách chủ đề thì bỏ loading ngay; tiến độ có thể cập nhật sau.
      setInitialLoading(false)

      // Tối ưu: tính tiến độ chủ đề và cấp độ người học chỉ với 1 lần đọc learningProgress
      let allWords = getAllVocabulary()
      // Nếu lần đầu cache từ vẫn rỗng (mạng chậm/auth chưa sẵn), tiếp tục nạp nền rồi cập nhật lại tiến độ.
      if (allWords.length === 0) {
        try {
          await withTimeout(loadVocabularyFromFirebase({ force: true }), 12000)
          allWords = getAllVocabulary()
        } catch (_) {}
      }
      const progress = {}
      let lp = null

      try {
        lp = await getLearningProgress(
          readProgressFromServer ? { source: "server" } : {},
        )
      } catch (_) {
        lp = null
      }

      if (gen !== loadGenerationRef.current) return

      const learnedIds = new Set(
        Array.isArray(lp?.wordsLearned)
          ? lp.wordsLearned.map((id) => String(id))
          : [],
      )

      for (const topic of safeTopics) {
        const topicWords = allWords.filter((word) => wordBelongsToTopic(word, topic.id))

        const learnedCount = topicWords.filter((word) =>
          learnedIds.has(String(word.id)),
        ).length

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
      if (gen !== loadGenerationRef.current) return
      setTopicsProgress(progress)

      // Lấy level của người học để lọc chủ đề phù hợp (tận dụng lp ở trên nếu có)
      try {
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
    } finally {
      if (loadingGuardRef.current) {
        clearTimeout(loadingGuardRef.current)
        loadingGuardRef.current = null
      }
      // Đảm bảo không kẹt loading kể cả khi request bị hủy/chồng lệnh.
      if (gen === loadGenerationRef.current) {
        setInitialLoading(false)
      }
    }
  }, [])

  /** Sau khi quay lại tab / tick > 0: đọc tiến độ từ server để không dùng cache Firestore cũ (0 từ đã học). */
  useEffect(() => {
    loadTopicsAndProgress(rootFocusTick > 0)
  }, [rootFocusTick, loadTopicsAndProgress])

    /** Sau khi lưu tiến độ xong (kể cả flashcard lưu nền) — focus có thể chạy trước khi ghi Firestore xong. */
  const reloadDebounceRef = useRef(null)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, (payload) => {
      if (payload?.resetTopicFilters) {
        setFilter("all")
        setSearchQuery("")
      }
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
      reloadDebounceRef.current = setTimeout(() => {
        reloadDebounceRef.current = null
        loadTopicsAndProgress(true)
      }, 120)
    })
    return () => {
      sub.remove()
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current)
    }
  }, [loadTopicsAndProgress])

  useEffect(() => {
    return () => {
      if (loadingGuardRef.current) {
        clearTimeout(loadingGuardRef.current)
        loadingGuardRef.current = null
      }
    }
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTopicsAndProgress(true)
    setRefreshing(false)
  }, [loadTopicsAndProgress])

  const handleTopicSelect = (topicId, isLocked) => {
    if (isLocked) {
      Alert.alert(
        "Chủ đề chưa mở khóa",
        "Chủ đề này dành cho cấp độ cao hơn. Hãy học thêm để tăng cấp độ rồi thử lại nhé!",
      )
      return
    }
    const allWords = getAllVocabulary()
    const topicWords = allWords.filter((word) => wordBelongsToTopic(word, topicId))

    if (topicWords.length === 0) return

    const topic = topics.find((t) => t.id === topicId)
    setSelectedTopic(topic)
    setPreviewWords(topicWords)
    setShowPreviewModal(true)
  }

  const handleStartLearning = () => {
    setShowPreviewModal(false)
    if (!selectedTopic || !previewWords?.length) {
      return
    }
    navigation.navigate("VocabularyFlashcard", {
      topicId: selectedTopic.id,
      topicName: selectedTopic.name,
      words: previewWords,
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
        await loadTopicsAndProgress(true)
      } else {
        Alert.alert("Lỗi", result.error || "Không lưu được.")
      }
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không lưu được.")
    } finally {
      setSavingTopics(false)
    }
  }, [topics, loadTopicsAndProgress])

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
      // Apply status filter
      if (filter !== "all" && getTopicStatus(topic.id) !== filter) {
        return false
      }
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return String(topic.name || "").toLowerCase().includes(query) || String(topic.description || "").toLowerCase().includes(query)
      }
      return true
    })

    // Guard: nếu filter/search rỗng mà vẫn ra 0 do dữ liệu không chuẩn, trả full list.
    if (filter === "all" && !searchQuery.trim() && result.length === 0 && topics.length > 0) {
      result = topics
    }

    return result
  }, [topics, filter, searchQuery, topicsProgress])

  const wordsRemaining = Math.max(overallStats.total - overallStats.learned, 0)

  /** Tránh frame đầu insets=0 rồi cập nhật → giật layout (View + padding ổn định hơn SafeAreaView) */
  const topPad = embedInRoot
    ? 0
    : Math.max(
        insets.top,
        Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
      )

  return (
    <View style={[styles.wrapper, { paddingTop: topPad, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.stickyHeader}>
        <View style={styles.heroBlock}>
          {!embedInRoot && (
            <View style={styles.heroOrange}>
              <Text style={styles.heroTitle}>Từ vựng</Text>
              <Text style={styles.heroSubtitle}>Học và ôn tập từ vựng tiếng Anh</Text>
            </View>
          )}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Feather name="search" size={18} color={COLORS.TEXT_SECONDARY} style={styles.searchIconFeather} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm tên bộ hoặc mô tả..."
              placeholderTextColor={COLORS.TEXT_SECONDARY}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
                <Feather name="x" size={18} color={COLORS.TEXT_SECONDARY} />
              </TouchableOpacity>
            )}
          </View>
        </View>

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

        <View style={styles.sectionHeaderBlock}>
          <Text style={styles.sectionTitleSticky}>Bộ từ vựng</Text>
          <Text style={styles.sectionHintSticky}>Chọn bộ để xem trước từ và học flashcard</Text>
        </View>
      </View>

      <ScrollView
        style={styles.listScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listScrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.PRIMARY_DARK]} />
        }
      >
        <View style={styles.content}>
          {initialLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>⏳</Text>
              <Text style={styles.emptyStateTitle}>Đang tải dữ liệu...</Text>
              <Text style={styles.emptyStateText}>
                Vui lòng đợi trong giây lát.
              </Text>
            </View>
          ) : filteredAndSearchedTopics.length === 0 && topics.length === 0 && !refreshing ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📚</Text>
              <Text style={styles.emptyStateTitle}>Chưa có chủ đề nào</Text>
              <Text style={styles.emptyStateText}>
                Chưa có dữ liệu chủ đề từ Firestore.
              </Text>
            </View>
          ) : filteredAndSearchedTopics.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🔍</Text>
              <Text style={styles.emptyStateTitle}>Không tìm thấy chủ đề</Text>
              <Text style={styles.emptyStateText}>
                Thử thay đổi bộ lọc hoặc tìm kiếm với từ khóa khác.
              </Text>
            </View>
          ) : (
            filteredAndSearchedTopics.map((topic) => {
              const progress = getTopicProgress(topic.id)
              const isLocked =
                userWordLevel === "Beginner" && progress.mainLevel === "Intermediate"
              return (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  progress={progress}
                  locked={isLocked}
                  onPress={() => handleTopicSelect(topic.id, isLocked)}
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
    </View>
  )
}

const TopicCard = memo(({ topic, progress, locked, onPress }) => {
  const iconName = getTopicFeatherIcon(topic.id)
  return (
    <TouchableOpacity
      style={[
        styles.topicCard,
        styles.topicCardShadow,
        locked && styles.topicCardLocked,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.topicTopAccent, { backgroundColor: topic.color }]} />
      <View style={styles.topicCardInner}>
        <View style={styles.topicRowMain}>
          <View style={[styles.iconContainer, { backgroundColor: topic.color + "18" }]}>
            <Feather name={iconName} size={26} color={topic.color} />
          </View>
          <View style={styles.topicInfo}>
            <Text style={styles.topicName}>{topic.name}</Text>
            <View style={styles.topicMetaRow}>
              <Text style={styles.topicWordCount}>
                {progress.learned}/{progress.total} từ
              </Text>
            </View>
            <View style={styles.topicProgressTrack}>
              <View
                style={[
                  styles.topicProgressFill,
                  {
                    width: `${Math.min(100, progress.percentage)}%`,
                    backgroundColor: topic.color,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.topicChevronWrap}>
            {locked ? (
              <Feather name="lock" size={22} color={COLORS.TEXT_LIGHT} />
            ) : (
              <Feather name="chevron-right" size={22} color={COLORS.TEXT_LIGHT} />
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
})

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
                  <Feather name={getTopicFeatherIcon(topic.id)} size={24} color={topic.color} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>{topic.name}</Text>
                  <Text style={styles.modalSubtitle}>{words.length} từ vựng</Text>
                </View>
              </>
            )}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={20} color={COLORS.TEXT_SECONDARY} />
          </TouchableOpacity>
        </View>

        {/* Words List */}
        <View style={styles.wordsListContainer}>
          <Text style={styles.wordsListTitle}>Xem trước từ vựng</Text>
          <ScrollView
            style={styles.wordsList}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.wordsListContent}
          >
            {previewList.map((word, index) => (
              <View key={word.id} style={styles.wordItem}>
                <View style={[styles.wordNumber, topic && { backgroundColor: topic.color + "25" }]}>
                  <Text style={[styles.wordNumberText, topic && { color: topic.color }]}>
                    {index + 1}
                  </Text>
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
            <Text style={styles.cancelButtonText}>Đóng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.startButton, topic && { backgroundColor: topic.color }]}
            onPress={onStartLearning}
            activeOpacity={0.7}
          >
            <Text style={styles.startButtonText}>Bắt đầu học</Text>
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
  /** Thống kê + tìm kiếm + lọc — không cuộn theo danh sách */
  stickyHeader: {
    flexShrink: 0,
    backgroundColor: COLORS.BACKGROUND,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.BORDER,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  heroBlock: {
    marginBottom: 4,
  },
  heroOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    fontWeight: "500",
  },
  statsCardEmbedded: {
    marginTop: 4,
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: -28,
    marginBottom: 8,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 8,
    ...THEME.shadow.soft,
    elevation: 4,
  },
  statsCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statsDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.BORDER,
  },
  statsNum: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  statsLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.TEXT,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  /** Cùng vùng cố định với thống kê / tìm / lọc — không trôi khi cuộn danh sách */
  sectionHeaderBlock: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionTitleSticky: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.TEXT,
  },
  sectionHintSticky: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
    fontWeight: "500",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: '#FFF9F5',
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
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF5E6",
    borderColor: "#FF8C42",
  },
  progressPercentText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF8C42",
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
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  searchIconFeather: {
    marginRight: 8,
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
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.TEXT,
  },
  clearButton: {
    paddingHorizontal: 8,
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
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  topicCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  topicCardLocked: {
    opacity: 0.62,
  },
  topicTopAccent: {
    height: 4,
    width: "100%",
  },
  topicCardInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  topicRowMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  topicCardShadow: {
    ...THEME.shadow.soft,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  topicInfo: {
    flex: 1,
    minWidth: 0,
  },
  topicName: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  topicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  topicWordCount: {
    fontSize: 12,
    color: COLORS.TEXT_LIGHT,
    fontWeight: "600",
  },
  topicProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.BORDER,
    overflow: "hidden",
  },
  topicProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  topicChevronWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  statusIndicator: {
    marginLeft: 8,
  },
  statusEmoji: {
    fontSize: 24,
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
  wordsListContainer: {
    flex: 1,
    minHeight: 200,
  },
  wordsListTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.TEXT_SECONDARY,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
    backgroundColor: "#FF8C42" + "20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  wordNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF8C42",
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
