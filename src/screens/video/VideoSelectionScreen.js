import React, {useState, useCallback} from 'react';
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
  const [videos, setVideos] = useState(() =>
    getAllVideos().map((v) => ({
      ...v,
      watched: false,
      needsPractice: false,
      vocabLearned: 0,
      vocabTotal: 0,
    })),
  );

  const loadVideos = useCallback(async () => {
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ]);

    const buildList = (progress, sourceVideos = []) => {
      const watchedArr = Array.isArray(progress?.videosWatched)
        ? progress.videosWatched
        : [];
      const needPracticeArr = Array.isArray(progress?.videosNeedPractice)
        ? progress.videosNeedPractice
        : [];
      const watchedSet = new Set(watchedArr.map((x) => String(x)));
      const needPracticeSet = new Set(needPracticeArr.map((x) => String(x)));
      return sourceVideos.map((v) => {
        return {
          ...v,
          watched: watchedSet.has(String(v.id)),
          needsPractice: needPracticeSet.has(String(v.id)),
          vocabLearned: 0,
          vocabTotal: 0,
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
      await withTimeout(loadVideosFromFirebase(), 5000);
    } catch (_) {}

    // 2) Dựng danh sách cơ bản ngay, không phụ thuộc các bước khác.
    let sourceVideos = getAllVideos();
    if (!Array.isArray(sourceVideos) || sourceVideos.length === 0) {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        await withTimeout(loadVideosFromFirebase({force: true}), 4000);
        sourceVideos = getAllVideos();
      } catch (_) {}
    }
    let baseList = buildList(null, sourceVideos);
    if (baseList.length > 0) {
      setVideos(baseList);
      setInitialLoading(false);
    }

    // 3) Tiến độ xem video lỗi thì bỏ qua, vẫn hiển thị danh sách.
    try {
      const serverProgress = await withTimeout(
        getLearningProgress({source: 'server'}),
        8000,
      );
      baseList = buildList(serverProgress || null, sourceVideos);
    } catch (_) {}

    // 4) Từ vựng/stat — luôn tắt initialLoading trong finally (tránh kẹt khi baseList rỗng + return sớm).
    try {
      await withTimeout(loadVocabularyFromFirebase(), 5000);
      const stats = await withTimeout(
        getVideoVocabLearnedStatsBatch(baseList),
        10000,
      );
      setVideos(applyVocabStatsToVideos(baseList, stats));
    } catch (_) {
      setVideos(baseList);
    } finally {
      setInitialLoading(false);
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
      style={styles.listRow}
      onPress={() => handleSelectVideo(video)}
      activeOpacity={0.85}>
      <View style={styles.listThumbWrap}>
        <View style={styles.listThumb}>
          {video.thumbnailUrl &&
          String(video.thumbnailUrl).trim().startsWith('http') ? (
            <Image
              source={{uri: String(video.thumbnailUrl).trim()}}
              style={styles.listThumbImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#EEF2F7', '#E5E7EB']}
              style={StyleSheet.absoluteFill}>
              <View style={styles.listThumbPlaceholder} />
            </LinearGradient>
          )}
          {video.watched && (
            <View style={styles.watchedBadge}>
              <Feather name="check" size={12} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.listDurationPill}>
            <Text style={styles.listDurationText}>{video.duration}</Text>
          </View>
        </View>
      </View>
      <View style={styles.listMain}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {video.title}
        </Text>
        {video.vocabTotal > 0 ? (
          <View style={styles.listVocabRow}>
            <Feather name="book-open" size={12} color={COLORS.PRIMARY_DARK} />
            <Text style={styles.listVocabText}>
              Đã học{' '}
              <Text style={styles.listVocabFraction}>
                {video.vocabLearned}/{video.vocabTotal}
              </Text>{' '}
              từ
            </Text>
          </View>
        ) : (
          <Text style={styles.listVocabEmpty}>Chưa có từ trong video</Text>
        )}
        <Text style={styles.watchStatus}>
          {video.needsPractice
            ? 'Cần luyện tập'
            : video.watched
              ? 'Đã xem'
              : 'Chưa xem'}
        </Text>
      </View>
      <Feather name="chevron-right" size={22} color={COLORS.TEXT_LIGHT} />
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
          <Text style={styles.heroSubtitle}>Học tiếng Anh qua video sinh động</Text>
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
    marginBottom: 6,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
    lineHeight: 20,
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  listThumbWrap: {
    width: 100,
  },
  listThumb: {
    height: 70,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFF5EB',
  },
  listThumbImage: {
    width: '100%',
    height: '100%',
  },
  listThumbPlaceholder: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  watchedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  listDurationPill: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  listDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  listMain: {
    flex: 1,
    minWidth: 0,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 4,
    letterSpacing: -0.15,
  },
  listVocabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: COLORS.PRIMARY_SOFT,
  },
  listVocabText: {
    fontSize: 11,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  listVocabFraction: {
    color: COLORS.PRIMARY_DARK,
    fontWeight: '800',
  },
  listVocabEmpty: {
    fontSize: 10,
    color: COLORS.TEXT_LIGHT,
    marginBottom: 3,
  },
  watchStatus: {
    fontSize: 11,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  emptyHint: {
    textAlign: 'center',
    color: COLORS.TEXT_SECONDARY,
    padding: 24,
    fontSize: 14,
  },
});

export default VideoSelectionScreen;
