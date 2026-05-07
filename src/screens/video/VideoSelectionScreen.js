import React, {useState, useCallback, useEffect, useRef} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  StatusBar,
  Platform,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {loadVideosFromFirebase, getAllVideos} from '../../services/videoService';
import {getLearningProgress} from '../../services/storageService';
import {
  loadVocabularyFromFirebase,
  getVideoVocabLearnedStatsBatch,
} from '../../services/vocabularyService';
import {LEARNING_PROGRESS_UPDATED} from '../../services/learningProgressEvents';

const TEXT_DARK = '#1F2937';

function applyVocabStatsToVideos(baseList, stats) {
  const byId = new Map(stats.map((s) => [s.videoId, s]));
  return baseList.map((v) => {
    const s = byId.get(v.id);
    return {
      ...v,
      vocabLearned: s?.learned ?? 0,
      vocabTotal: s?.total ?? 0,
    };
  });
}

const VideoSelectionScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('unwatched');
  const [searchQuery, setSearchQuery] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [videos, setVideos] = useState(() =>
    getAllVideos().map((v) => ({
      ...v,
      watched: false,
      needsPractice: false,
      vocabLearned: 0,
      vocabTotal: 0,
    })),
  );
  const videosRef = useRef(videos);
  const isLoadingDataRef = useRef(false);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const loadVideos = useCallback(async () => {
    if (isLoadingDataRef.current) {
      return;
    }
    isLoadingDataRef.current = true;
    setIsLoadingData(true);
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ]);

    const buildList = (progress, sourceVideos = []) => {
      const previousStatsById = new Map(
        videosRef.current.map((v) => [
          String(v.id),
          {
            vocabLearned: Number(v.vocabLearned) || 0,
            vocabTotal: Number(v.vocabTotal) || 0,
          },
        ]),
      );
      const watchedArr = Array.isArray(progress?.videosWatched)
        ? progress.videosWatched
        : [];
      const needPracticeArr = Array.isArray(progress?.videosNeedPractice)
        ? progress.videosNeedPractice
        : [];
      const watchedSet = new Set(watchedArr.map((x) => String(x)));
      const needPracticeSet = new Set(needPracticeArr.map((x) => String(x)));
      return sourceVideos.map((v) => {
        const prev = previousStatsById.get(String(v.id));
        return {
          ...v,
          watched: watchedSet.has(String(v.id)),
          needsPractice: needPracticeSet.has(String(v.id)),
          // Giữ stats cũ trong lúc reload để tránh nhấp nháy "chưa có từ" <-> "đã học x/y từ".
          vocabLearned: prev?.vocabLearned ?? 0,
          vocabTotal: prev?.vocabTotal ?? 0,
        };
      });
    };

    setVideos((prev) =>
      Array.isArray(prev) && prev.length > 0
        ? prev
        : applyVocabStatsToVideos(buildList(null), []),
    );

    // 1) Luôn cố lấy danh sách video trước.
    try {
      await withTimeout(loadVideosFromFirebase(), 10000);
    } catch (_) {}

    // 2) Dựng danh sách cơ bản ngay, không phụ thuộc các bước khác.
    let sourceVideos = getAllVideos();
    if (!Array.isArray(sourceVideos) || sourceVideos.length === 0) {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        await withTimeout(loadVideosFromFirebase({force: true}), 10000);
        sourceVideos = getAllVideos();
      } catch (_) {}
    }
    let baseList = buildList(null, sourceVideos);
    if (baseList.length > 0) {
      setVideos(baseList);
      setInitialLoading(false);
    }

    // 3) Lấy tiến độ local/default trước để cập nhật tức thì trạng thái Đã xem/Cần luyện.
    try {
      const localProgress = await withTimeout(getLearningProgress(), 2500);
      baseList = buildList(localProgress || null, sourceVideos);
      setVideos(baseList);
    } catch (_) {}

    // 3b) Đồng bộ server ở nền, không chặn UI.
    void (async () => {
      try {
        const serverProgress = await withTimeout(
          getLearningProgress({source: 'server'}),
          8000,
        );
        if (!serverProgress) return;
        const nextList = buildList(serverProgress, sourceVideos);
        setVideos((prev) =>
          applyVocabStatsToVideos(nextList, prev.map((v) => ({
            videoId: v.id,
            learned: Number(v.vocabLearned) || 0,
            total: Number(v.vocabTotal) || 0,
          }))),
        );
      } catch (_) {}
    })();

    // 4) Từ vựng/stat — luôn tắt initialLoading trong finally (tránh kẹt khi baseList rỗng + return sớm).
    try {
      await withTimeout(loadVocabularyFromFirebase(), 10000);
      const stats = await withTimeout(
        getVideoVocabLearnedStatsBatch(baseList),
        12000,
      );
      setVideos(applyVocabStatsToVideos(baseList, stats));
    } catch (_) {
      setVideos(baseList);
    } finally {
      setInitialLoading(false);
      isLoadingDataRef.current = false;
      setIsLoadingData(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await loadVideos();
      })();
      return () => {
        cancelled = true;
      };
    }, [loadVideos]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      void loadVideos();
    });
    return () => sub.remove();
  }, [loadVideos]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadVideos();
    setRefreshing(false);
  }, [loadVideos]);

  const handleSelectVideo = (video) => {
    navigation.navigate('VideoLearning', {video});
  };

  const heroPadTop = Math.max(insets.top, 8) + 8;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchedVideos = videos.filter((video) => {
    if (!normalizedQuery) return true;
    const title = String(video.title || '').toLowerCase();
    const description = String(video.description || '').toLowerCase();
    return title.includes(normalizedQuery) || description.includes(normalizedQuery);
  });
  const unwatchedVideos = searchedVideos.filter((video) => !video.watched);
  const watchedVideos = searchedVideos.filter((video) => video.watched);
  const needPracticeVideos = searchedVideos.filter((video) => video.needsPractice);
  const filteredVideos =
    activeFilter === 'watched'
      ? watchedVideos
      : activeFilter === 'need_practice'
        ? needPracticeVideos
        : unwatchedVideos;

  const renderVideoCard = (video) => (
    <TouchableOpacity
      key={video.id}
      style={styles.cardWrap}
      onPress={() => handleSelectVideo(video)}
      activeOpacity={0.85}>
      <View style={styles.cardImageWrap}>
        {video.thumbnailUrl &&
        String(video.thumbnailUrl).trim().startsWith('http') ? (
          <Image
            source={{uri: String(video.thumbnailUrl).trim()}}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#1F2937', '#111827']}
            style={styles.cardImage}>
            <View style={styles.listThumbPlaceholder} />
          </LinearGradient>
        )}
        <View style={styles.cardChip}>
          <Text style={styles.cardChipText} numberOfLines={1}>
            {video.vocabTotal > 0
              ? `${video.vocabLearned}/${video.vocabTotal} từ`
              : 'Chưa có từ'}
          </Text>
        </View>
        <View style={styles.cardDurationPill}>
          <Text style={styles.cardDurationText}>{video.duration}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {video.title}
        </Text>
        <View style={styles.cardBottomRow}>
          <View style={styles.watchStatusPill}>
            <Text style={styles.watchStatusPillText}>
              {video.needsPractice
                ? 'Cần luyện tập'
                : video.watched
                  ? 'Đã xem'
                  : 'Chưa xem'}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.TEXT_LIGHT} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <View style={styles.stickyTop}>
        <View style={[styles.heroOrange, {paddingTop: heroPadTop}]}>
          <Text style={styles.heroTitle}>Video học tập</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.PRIMARY_DARK]}
          />
        }>
        <View style={styles.filterTabsWrap}>
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'unwatched' && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter('unwatched')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                activeFilter === 'unwatched' && styles.filterTabTextActive,
              ]}>
              Chưa xem
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeFilter === 'watched' && styles.filterTabActive]}
            onPress={() => setActiveFilter('watched')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                activeFilter === 'watched' && styles.filterTabTextActive,
              ]}>
              Đã xem
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'need_practice' && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter('need_practice')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                activeFilter === 'need_practice' && styles.filterTabTextActive,
              ]}>
              Cần luyện tập
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Feather
            name="search"
            size={17}
            color={COLORS.TEXT_SECONDARY}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm video..."
            placeholderTextColor={COLORS.TEXT_SECONDARY}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{top: 8, left: 8, right: 8, bottom: 8}}>
              <Feather name="x-circle" size={18} color={COLORS.TEXT_LIGHT} />
            </TouchableOpacity>
          ) : null}
        </View>

        {filteredVideos.map(renderVideoCard)}

        {initialLoading && videos.length === 0 && (
          <Text style={styles.emptyHint}>Đang tải video từ Firestore...</Text>
        )}
        {!initialLoading && videos.length === 0 && (
          <Text style={styles.emptyHint}>Chưa có video.</Text>
        )}
        {videos.length > 0 && filteredVideos.length === 0 && (
          <Text style={styles.emptyHint}>
            {searchQuery.trim()
              ? 'Không tìm thấy video phù hợp.'
              : activeFilter === 'watched'
                ? 'Bạn chưa xem video nào.'
                : activeFilter === 'need_practice'
                  ? 'Bạn chưa có video cần luyện tập.'
                : 'Bạn đã xem hết video rồi.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  stickyTop: {
    flexShrink: 0,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  filterTabsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  filterTabActive: {
    borderColor: COLORS.PRIMARY,
    backgroundColor: '#FFF7ED',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: COLORS.PRIMARY,
  },
  heroOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  searchRow: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    paddingHorizontal: 10,
    height: 44,
    gap: 8,
  },
  searchIcon: {
    marginLeft: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXT_DARK,
    paddingVertical: 0,
  },
  sectionHead: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TEXT_DARK,
    letterSpacing: -0.2,
  },
  sectionHint: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  cardWrap: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  /** Ngắn hơn 16:9 (~−14% chiều cao thumb) — danh sách gọn hơn. */
  cardImageWrap: {
    width: '100%',
    aspectRatio: 2.05,
    backgroundColor: '#111827',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(253, 231, 235, 0.94)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '72%',
  },
  cardChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A61E4D',
  },
  cardDurationPill: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  cardDurationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.25,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  watchStatusPill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  watchStatusPillText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  listThumbPlaceholder: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  emptyHint: {
    textAlign: 'center',
    color: COLORS.TEXT_SECONDARY,
    padding: 24,
    fontSize: 14,
  },
});

export default VideoSelectionScreen;
