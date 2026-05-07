import React, { useState, useCallback, useMemo, useContext, useEffect, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import { VocabularyTopicCard } from "./VocabularyTopicCard"

// Giữ danh sách chủ đề tốt gần nhất xuyên qua remount của màn,
// tránh trường hợp getTopics() trả rỗng tạm thời làm UI trắng.
let _stickyTopicsCache = []

function computeTopicProgressPercent({ learnedCount, totalCount }) {
  const total = Math.max(0, Number(totalCount) || 0)
  if (total <= 0) return 0
  const learned = Math.max(0, Number(learnedCount) || 0)
  return Math.round(Math.min(1, learned / total) * 100)
}

function progressScore(lp) {
  if (!lp || typeof lp !== "object") return 0
  const words = Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.length : 0
  const dialogues = Array.isArray(lp?.dialoguesCompleted) ? lp.dialoguesCompleted.length : 0
  const videos = Array.isArray(lp?.videosWatched) ? lp.videosWatched.length : 0
  const xp = Math.max(0, Number(lp?.totalXP) || Number(lp?.totalXp) || Number(lp?.xp) || 0)
  return words * 100000 + dialogues * 1000 + videos * 100 + xp
}

function hasCompletedTopicExam(lp, topicId) {
  const tid = String(topicId || "").trim()
  if (!tid) return false
  const row = lp?.topicPracticeStats?.[tid]
  if (!row || typeof row !== "object") return false
  const set = new Set(
    (Array.isArray(row.modesCompleted) ? row.modesCompleted : [])
      .map((m) => String(m || "").trim().toLowerCase())
      .filter(Boolean),
  )
  return set.has("quiz") && set.has("typing") && set.has("listening")
}

function buildTopicWordDebugSnapshot(allWords, topic, topicWords) {
  if (!__DEV__) return null
  const topicId = String(topic?.id ?? "").trim()
  const topicSlug = String(topic?.slug ?? "").trim()
  const categoryMatches = allWords.filter(
    (w) => String(w?.category ?? "").trim() === topicId,
  ).length
  const topicIdMatches = allWords.filter(
    (w) => String(w?.topicId ?? "").trim() === topicId,
  ).length
  const topicFieldMatches = allWords.filter(
    (w) => String(w?.topic ?? "").trim() === topicId,
  ).length
  const slugAsCategoryMatches = topicSlug
    ? allWords.filter((w) => String(w?.category ?? "").trim() === topicSlug).length
    : 0
  const sampleWords = allWords.slice(0, 5).map((w) => ({
    id: String(w?.id ?? ""),
    category: String(w?.category ?? ""),
    topicId: String(w?.topicId ?? ""),
    topic: String(w?.topic ?? ""),
  }))
  return {
    topicId,
    topicSlug,
    topicWordCount: topicWords.length,
    categoryMatches,
    topicIdMatches,
    topicFieldMatches,
    slugAsCategoryMatches,
    sampleWords,
  }
}

const TopicSelectionScreen = ({ rootFocusTick = 0 }) => {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const vocabTab = useContext(VocabularyTabContext)
  const embedInRoot = vocabTab?.embedInRoot === true
  const [topics, setTopics] = useState(
    Array.isArray(_stickyTopicsCache) ? _stickyTopicsCache : [],
  )
  const [topicsProgress, setTopicsProgress] = useState({})
  const [initialLoading, setInitialLoading] = useState(
    !(
      Array.isArray(_stickyTopicsCache) &&
      _stickyTopicsCache.length > 0 &&
      getAllVocabulary().length > 0
    ),
  )
  const [refreshing, setRefreshing] = useState(false)
  const [savingTopics, setSavingTopics] = useState(false)
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [userWordLevel, setUserWordLevel] = useState("all") // all | Beginner | Intermediate
  const dlog = (...args) => {
    if (__DEV__) console.log("[TopicSelection]", ...args)
  }

  /** Tránh nhiều load song song: bản cũ xong sau ghi đè → topics = [] / tiến độ 0. */
  const loadGenerationRef = useRef(0)
  const loadingGuardRef = useRef(null)
  const loadPromiseRef = useRef(null)
  const lastLoadAtRef = useRef(0)
  const lastForceLoadAtRef = useRef(0)
  const topicsStateRef = useRef([])
  /** Khi lần tải chủ đề trả về rỗng (timeout/mạng) nhưng UI vẫn giữ danh sách cũ — vẫn tính tiến độ theo bản cuối cùng có dữ liệu. */
  const lastNonEmptyTopicsRef = useRef(Array.isArray(_stickyTopicsCache) ? _stickyTopicsCache : [])
  /** Khi cache từ chưa nạp kịp, tránh ghi đè tiến độ đúng bằng toàn 0; thử tải lại có giới hạn. */
  const vocabProgressRetryRef = useRef(0)
  /** Đã từng tải được chủ đề từ getTopics (Firestore/CMS) — không suy từ slug trong từ vựng để tránh ghi đè tên tiếng Việt khi request sau bị timeout. */
  const hadSuccessfulGetTopicsRef = useRef(false)

  const loadTopicsAndProgress = useCallback(async ({ readProgressFromServer = false, force = false } = {}) => {
    dlog("load:start", { readProgressFromServer, force })
    // Dù force hay không, luôn tránh tạo nhiều request chồng nhau.
    if (loadPromiseRef.current) {
      dlog("load:skip-inflight")
      return loadPromiseRef.current
    }
    // Event tiến độ có thể bắn dày; force-load liên tiếp sẽ làm spam request/getTopics trả rỗng tạm thời.
    if (force && Date.now() - lastForceLoadAtRef.current < 1200) {
      dlog("load:skip-force-throttle")
      return
    }
    if (!force && Date.now() - lastLoadAtRef.current < 1200) {
      dlog("load:skip-throttle")
      return
    }
    if (force) {
      lastForceLoadAtRef.current = Date.now()
    }
    const runner = (async () => {
    const gen = ++loadGenerationRef.current
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ])

    /** Warm start: có cache thì render ngay, không hiện spinner khi quay lại từ màn học. */
    const hasWarmTopics =
      Array.isArray(lastNonEmptyTopicsRef.current) && lastNonEmptyTopicsRef.current.length > 0
    const hasWarmWords = getAllVocabulary().length > 0
    if (hasWarmTopics && hasWarmWords) {
      setTopics((prev) =>
        Array.isArray(prev) && prev.length > 0 ? prev : lastNonEmptyTopicsRef.current,
      )
      setInitialLoading(false)
    } else {
      /** Không để frame «Chưa có chủ đề» khi remount ([] ban đầu). */
      setTopics((prev) => (Array.isArray(prev) ? prev : []))
    }
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
      dlog("vocab:initial-count", getAllVocabulary().length)

      const topicsFromCache =
        topicsStateRef.current.length > 0
          ? topicsStateRef.current
          : (lastNonEmptyTopicsRef.current.length > 0
              ? lastNonEmptyTopicsRef.current
              : _stickyTopicsCache)
      const canReuseTopicsWithoutFetch =
        force &&
        !readProgressFromServer &&
        Array.isArray(topicsFromCache) &&
        topicsFromCache.length > 0

      let topicsToUse = []
      if (canReuseTopicsWithoutFetch) {
        topicsToUse = topicsFromCache
        dlog("topics:reuse-cache-count", topicsToUse.length)
      } else {
        try {
          const list = await withTimeout(getTopics(), 5000)
          dlog("topics:first-fetch", Array.isArray(list) ? list.length : null)
          if (Array.isArray(list) && list.length > 0) {
            topicsToUse = list
            hadSuccessfulGetTopicsRef.current = true
          } else {
            topicsToUse = []
          }
          if (!topicsToUse?.length) {
            topicsToUse = []
          }
        } catch (_) {
          topicsToUse = []
        }
      }

      // Lần mở đầu có thể auth/network chưa sẵn sàng; retry nhẹ 1 lần.
      if (!topicsToUse.length && !canReuseTopicsWithoutFetch) {
        try {
          await new Promise((r) => setTimeout(r, 1200))
          const listRetry = await withTimeout(getTopics(), 4000)
          dlog("topics:retry-fetch", Array.isArray(listRetry) ? listRetry.length : null)
          if (Array.isArray(listRetry) && listRetry.length > 0) {
            topicsToUse = listRetry
            hadSuccessfulGetTopicsRef.current = true
          }
        } catch (_) {}
      }

      const safeTopics =
        Array.isArray(topicsToUse) && topicsToUse.length > 0 ? topicsToUse : []
      dlog("topics:safe-count", safeTopics.length)

      if (safeTopics.length > 0) {
        lastNonEmptyTopicsRef.current = safeTopics
        _stickyTopicsCache = safeTopics
      }
      let topicsForProgress =
        safeTopics.length > 0
          ? safeTopics
          : (lastNonEmptyTopicsRef.current.length > 0
              ? lastNonEmptyTopicsRef.current
              : _stickyTopicsCache)

      if (gen !== loadGenerationRef.current) return
      setTopics((prev) => (safeTopics.length > 0 ? safeTopics : prev))
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
      dlog("vocab:after-force-count", allWords.length)

      const progress = {}
      let lpServer = null
      let lpLocal = null
      if (readProgressFromServer) {
        try {
          lpServer = await getLearningProgress({ source: "server" })
        } catch (_) {
          lpServer = null
        }
      }
      try {
        lpLocal = await getLearningProgress()
      } catch (_) {
        lpLocal = null
      }
      let lp = progressScore(lpServer) >= progressScore(lpLocal) ? lpServer : lpLocal
      if (!lp || typeof lp !== "object") {
        lp = lpLocal || lpServer || null
      }
      dlog("progress:summary", {
        wordsLearned: Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.length : 0,
        totalXP: Math.max(0, Number(lp?.totalXP) || Number(lp?.totalXp) || Number(lp?.xp) || 0),
      })

      if (gen !== loadGenerationRef.current) return

      const learnedIds = new Set(
        Array.isArray(lp?.wordsLearned)
          ? lp.wordsLearned.map((id) => String(id))
          : [],
      )
      for (const topic of topicsForProgress) {
        const topicWords = allWords.filter((word) =>
          wordBelongsToTopic(word, topic.id, topicsForProgress),
        )
        if (__DEV__) {
          const snapshot = buildTopicWordDebugSnapshot(allWords, topic, topicWords)
          if (snapshot && (snapshot.topicWordCount === 0 || snapshot.topicWordCount < 3)) {
            dlog("topicWords:debug", snapshot)
          }
        }
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
          percentage: computeTopicProgressPercent({
            learnedCount,
            totalCount: topicWords.length,
          }),
          level: levelName,
          mainLevel,
          examCompleted: hasCompletedTopicExam(lp, topic.id),
        }
      }
      if (gen !== loadGenerationRef.current) return

      // Ẩn các bộ "trống" (0 từ) — thường là seed topics không khớp kho từ vựng hiện tại.
      const nonEmptyTopics = topicsForProgress.filter(
        (t) => (progress[String(t?.id)]?.total ?? 0) > 0,
      )
      dlog("topics:non-empty-count", nonEmptyTopics.length)
      if (nonEmptyTopics.length > 0) {
        // Dù fetch hiện tại trả rỗng tạm thời, vẫn ưu tiên danh sách bộ hợp lệ đã tính được
        // để tránh trạng thái "trang từ vựng rỗng" sau khi học xong.
        setTopics(nonEmptyTopics)
        topicsForProgress = nonEmptyTopics
        lastNonEmptyTopicsRef.current = nonEmptyTopics
        _stickyTopicsCache = nonEmptyTopics
      }

      const vocabEmpty = allWords.length === 0
      const progressAllZeroTotals =
        topicsForProgress.length > 0 &&
        Object.keys(progress).length > 0 &&
        Object.values(progress).every((p) => (p?.total ?? 0) === 0)
      const shouldSkipZeroWipe =
        vocabEmpty && progressAllZeroTotals && topicsForProgress.length > 0

      if (shouldSkipZeroWipe && vocabProgressRetryRef.current < 5) {
        vocabProgressRetryRef.current += 1
        setTimeout(() => {
          if (gen === loadGenerationRef.current) {
            void loadTopicsAndProgress({ readProgressFromServer, force: true })
          }
        }, 700)
      } else {
        vocabProgressRetryRef.current = 0
        // Nếu lần tải này cho progress rỗng hoàn toàn nhưng trước đó đã có dữ liệu,
        // giữ nguyên để tránh "trắng giả" do request tạm thời.
        const hasAnyProgressKey = Object.keys(progress).length > 0
        if (hasAnyProgressKey || topicsForProgress.length > 0) {
          setTopicsProgress(progress)
        }
      }
      dlog("load:done", {
        renderedTopics: Array.isArray(topicsForProgress) ? topicsForProgress.length : 0,
        progressKeys: Object.keys(progress).length,
      })

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
      dlog("load:finally", { gen, currentGen: loadGenerationRef.current })
    }
  })()
    loadPromiseRef.current = runner
    try {
      await runner
      lastLoadAtRef.current = Date.now()
    } finally {
      if (loadPromiseRef.current === runner) {
        loadPromiseRef.current = null
      }
    }
  }, [])

  const refreshProgressOnly = useCallback(async () => {
    try {
      const topicsForProgress =
        Array.isArray(topics) && topics.length > 0 ? topics : lastNonEmptyTopicsRef.current
      if (!Array.isArray(topicsForProgress) || topicsForProgress.length === 0) return

      let allWords = getAllVocabulary()
      if (!Array.isArray(allWords) || allWords.length === 0) return

      const lp = (await getLearningProgress().catch(() => null)) || {}
      const learnedIds = new Set(
        Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.map((id) => String(id)) : [],
      )
      const next = {}
      for (const topic of topicsForProgress) {
        const topicWords = allWords.filter((word) =>
          wordBelongsToTopic(word, topic.id, topicsForProgress),
        )
        const learnedCount = topicWords.filter((word) =>
          learnedIds.has(String(word.id)),
        ).length
        const beginnerCount = topicWords.filter((w) => w.level === "Beginner").length
        const intermediateCount = topicWords.filter((w) => w.level === "Intermediate").length
        const mainLevel = beginnerCount >= intermediateCount ? "Beginner" : "Intermediate"
        const levelName = mainLevel === "Beginner" ? "Sơ cấp" : "Trung cấp"
        next[topic.id] = {
          total: topicWords.length,
          learned: learnedCount,
          percentage: computeTopicProgressPercent({
            learnedCount,
            totalCount: topicWords.length,
          }),
          level: levelName,
          mainLevel,
          examCompleted: hasCompletedTopicExam(lp, topic.id),
        }
      }
      setTopicsProgress(next)
    } catch (_) {}
  }, [topics])

  /** Sau khi quay lại tab / tick > 0: đọc tiến độ từ server để không dùng cache Firestore cũ (0 từ đã học). */
  useEffect(() => {
    loadTopicsAndProgress({ readProgressFromServer: rootFocusTick > 0 })
  }, [rootFocusTick, loadTopicsAndProgress])

  /** Sau khi lưu tiến độ xong: chỉ cập nhật tiến độ cục bộ, không reload cả màn danh sách. */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, (payload) => {
      // Sau khi học xong 1 bộ, filter hiện tại (vd. Đang học) có thể không còn mục nào
      // và tạo cảm giác "rỗng". Luôn quay về Tất cả để hiển thị đầy đủ.
      const shouldResetFilters = payload?.resetTopicFilters !== false
      if (shouldResetFilters) {
        setFilter("all")
        setSearchQuery("")
      }
      // Cập nhật tức thì từ snapshot local, không chờ round-trip server.
      void refreshProgressOnly()
    })
    return () => {
      sub.remove()
    }
  }, [refreshProgressOnly])

  useEffect(() => {
    return () => {
      if (loadingGuardRef.current) {
        clearTimeout(loadingGuardRef.current)
        loadingGuardRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    topicsStateRef.current = Array.isArray(topics) ? topics : []
  }, [topics])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTopicsAndProgress({ readProgressFromServer: true, force: true })
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
    const topicWords = allWords.filter((word) =>
      wordBelongsToTopic(word, topicId, topics),
    )

    if (topicWords.length === 0) return

    const topic = topics.find((t) => t.id === topicId)
    const progress = getTopicProgress(topicId)
    navigation.navigate("VocabularyTopicDetail", {
      topic,
      words: topicWords,
      progress,
    })
  }

  const handleSaveTopicsToFirebase = useCallback(async () => {
    setSavingTopics(true)
    try {
      const result = await saveTopics(topics)
      if (result.ok) {
        Alert.alert("Thành công", "Đã lưu chủ đề lên Firebase.")
        await loadTopicsAndProgress({ readProgressFromServer: true, force: true })
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
    if (p.percentage === 100 && !p.examCompleted) return "ready_for_exam"
    if (p.percentage === 100) return "completed"
    return "in_progress"
  }

  const overallStats = (() => {
    const visibleTopics = topics.filter(
      (t) => getTopicStatus(t.id) !== "completed",
    )
    const totalTopics = visibleTopics.length
    let learned = 0
    let total = 0
    visibleTopics.forEach((t) => {
      const p = getTopicProgress(t.id)
      learned += p.learned || 0
      total += p.total || 0
    })
    const percentage = total > 0 ? Math.round((learned / total) * 100) : 0
    return { totalTopics, learned, total, percentage }
  })()

  const filteredAndSearchedTopics = useMemo(() => {
    // Bộ đã hoàn thành kiểm tra chỉ hiển thị ở tab «Ôn tập», không trùng danh sách bộ từ vựng.
    let result = topics.filter(
      (topic) => getTopicStatus(topic.id) !== "completed",
    )
    result = result.filter((topic) => {
      // Apply status filter (mỗi chip khớp đúng một trạng thái; «Chờ kiểm tra» = ready_for_exam)
      if (filter !== "all" && getTopicStatus(topic.id) !== filter) {
        return false
      }
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return String(topic.name || "").toLowerCase().includes(query)
      }
      return true
    })

    // Guard: nếu filter/search rỗng mà vẫn ra 0 do dữ liệu không chuẩn, trả full list.
    if (filter === "all" && !searchQuery.trim() && result.length === 0 && topics.length > 0) {
      result = topics
    }

    // Ở tab "Tất cả": ưu tiên bộ chờ kiểm tra -> đang học -> chưa học.
    if (filter === "all") {
      const statusPriority = {
        ready_for_exam: 0,
        in_progress: 1,
        not_started: 2,
      }
      result = [...result].sort((a, b) => {
        const pa = statusPriority[getTopicStatus(a.id)] ?? 99
        const pb = statusPriority[getTopicStatus(b.id)] ?? 99
        if (pa !== pb) return pa - pb
        return String(a?.name || "").localeCompare(String(b?.name || ""), "vi")
      })
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
            </View>
          )}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Feather name="search" size={18} color={COLORS.TEXT_SECONDARY} style={styles.searchIconFeather} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm tên bộ..."
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
            label="Chờ kiểm tra"
            active={filter === "ready_for_exam"}
            onPress={() => setFilter("ready_for_exam")}
          />
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
              <ActivityIndicator size="large" color={COLORS.PRIMARY_DARK} />
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
            </View>
          ) : (
            filteredAndSearchedTopics.map((topic) => {
              const progress = getTopicProgress(topic.id)
              const status = getTopicStatus(topic.id)
              const isLocked =
                userWordLevel === "Beginner" && progress.mainLevel === "Intermediate"
              return (
                <VocabularyTopicCard
                  key={topic.id}
                  topic={topic}
                  progress={progress}
                  status={status}
                  locked={isLocked}
                  onPress={() => handleTopicSelect(topic.id, isLocked)}
                />
              )
            })
          )}
        </View>
      </ScrollView>

    </View>
  )
}

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
    marginBottom: 2,
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    flexWrap: "wrap",
    gap: 6,
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
})

export default TopicSelectionScreen
