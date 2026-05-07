import React, {useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  DeviceEventEmitter,
  TextInput,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getAllDialogues, loadDialoguesFromFirebase} from '../../services/dialogueService';
import {getLearningProgress} from '../../services/storageService';
import {LEARNING_PROGRESS_UPDATED} from '../../services/learningProgressEvents';

const DialogueIntroScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [topicFilter, setTopicFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogues, setDialogues] = useState(() => getAllDialogues());
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const reloadDebounceRef = useRef(null);

  const progressScore = (lp) => {
    if (!lp || typeof lp !== 'object') return 0;
    const dialogues = Array.isArray(lp?.dialoguesCompleted) ? lp.dialoguesCompleted.length : 0;
    const words = Array.isArray(lp?.wordsLearned) ? lp.wordsLearned.length : 0;
    const videos = Array.isArray(lp?.videosWatched) ? lp.videosWatched.length : 0;
    const xp = Math.max(0, Number(lp?.totalXP) || Number(lp?.totalXp) || Number(lp?.xp) || 0);
    return dialogues * 100000 + words * 1000 + videos * 100 + xp;
  };

  const loadDialogueListWithProgress = React.useCallback(
    async ({preferServerProgress = false} = {}) => {
    if (isMountedRef.current) {
      // Chỉ hiện spinner khi chưa có dữ liệu để hiển thị.
      setLoading((prev) => {
        const hasRows = Array.isArray(dialogues) && dialogues.length > 0;
        return hasRows ? prev : true;
      });
    }
    try {
      const rows = await loadDialoguesFromFirebase();
      const list = Array.isArray(rows) ? rows : [];
      const fallbackList = getAllDialogues();
      const safeList = list.length > 0 ? list : Array.isArray(fallbackList) ? fallbackList : [];
      let lp = (await getLearningProgress().catch(() => null)) || {};
      // Đọc thêm server nhưng không cho phép bản cũ từ server ghi đè bản local mới hơn.
      try {
        const serverLp = await getLearningProgress({source: 'server'});
        if (progressScore(serverLp) > progressScore(lp)) {
          lp = serverLp || lp;
        }
      } catch (_) {}
      const completedSet = new Set(
        Array.isArray(lp?.dialoguesCompleted)
          ? lp.dialoguesCompleted.map((x) => String(x || '').trim().toLowerCase())
          : [],
      );
      const normalized = safeList.map((row) => {
        const id = String(row?.id || '').trim().toLowerCase();
        return {
          ...row,
          completed: id ? completedSet.has(id) : Boolean(row?.completed),
        };
      });
      if (isMountedRef.current) {
        setDialogues(normalized);
      }
    } catch (_) {
      // Lỗi mạng/auth thoáng qua: giữ dữ liệu hiện có để tránh trắng màn.
      const fallbackList = getAllDialogues();
      if (Array.isArray(fallbackList) && fallbackList.length > 0) {
        if (isMountedRef.current) {
          setDialogues((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : fallbackList));
        }
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
        reloadDebounceRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadDialogueListWithProgress({preferServerProgress: true});
    }, [loadDialogueListWithProgress]),
  );

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, (payload) => {
      const changedDialogueId = String(payload?.dialogueId || '')
        .trim()
        .toLowerCase();
      if (changedDialogueId) {
        // Cập nhật ngay trạng thái "Đã học" trên UI, không chờ round-trip Firestore.
        setDialogues((prev) =>
          Array.isArray(prev)
            ? prev.map((row) => {
                const rid = String(row?.id || '')
                  .trim()
                  .toLowerCase();
                return rid === changedDialogueId ? {...row, completed: true} : row;
              })
            : prev,
        );
      }
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
      }
      reloadDebounceRef.current = setTimeout(() => {
        reloadDebounceRef.current = null;
        void loadDialogueListWithProgress({preferServerProgress: false});
      }, 250);
    });
    return () => sub.remove();
  }, [loadDialogueListWithProgress]);

  const handleSelectScenario = (scenario) => {
    navigation.navigate('DialoguePractice', {
      scenarioId: scenario.id,
      partnerId: 'us',
    });
  };

  const filteredScenarios = useMemo(() => {
    const difficultyRank = (row) => {
      const d = String(row?.difficultyVi || '').trim().toLowerCase();
      if (d === 'dễ') return 0;
      if (d === 'trung bình') return 1;
      if (d === 'khó') return 2;
      return 3;
    };
    const sortUnlearnedFirst = (list) =>
      [...list].sort((a, b) => {
        const aDone = Boolean(a?.completed);
        const bDone = Boolean(b?.completed);
        if (aDone !== bDone) return aDone ? 1 : -1; // Chưa học lên trước
        const dr = difficultyRank(a) - difficultyRank(b);
        if (dr !== 0) return dr; // Ưu tiên Dễ -> Trung bình -> Khó
        return String(a?.title || '').localeCompare(String(b?.title || ''), 'vi');
      });

    let filtered = dialogues;
    if (topicFilter === 'done') {
      filtered = dialogues.filter((s) => Boolean(s.completed));
    } else if (topicFilter === 'todo') {
      filtered = dialogues.filter((s) => !Boolean(s.completed));
    }
    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((s) => {
        const title = String(s?.title || '').toLowerCase();
        const desc = String(s?.description || '').toLowerCase();
        const diff = String(s?.difficultyVi || '').toLowerCase();
        return title.includes(q) || desc.includes(q) || diff.includes(q);
      });
    }
    return sortUnlearnedFirst(filtered);
  }, [dialogues, topicFilter, searchQuery]);

  const heroPadTop = insets.top + 10;

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <View style={[styles.heroOrange, {paddingTop: heroPadTop}]}>
        <Text style={styles.heroTitle}>Hội thoại</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: Math.max(insets.bottom, 20)},
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.filterTabsWrap}>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'all' && styles.filterTabActive]}
            onPress={() => setTopicFilter('all')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'all' && styles.filterTabTextActive,
              ]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'done' && styles.filterTabActive]}
            onPress={() => setTopicFilter('done')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'done' && styles.filterTabTextActive,
              ]}>
              Đã học
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'todo' && styles.filterTabActive]}
            onPress={() => setTopicFilter('todo')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'todo' && styles.filterTabTextActive,
              ]}>
              Chưa học
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
            placeholder="Tìm hội thoại..."
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

        {filteredScenarios.map((scenario, index) => {
          const accent = String(scenario.accentColor || COLORS.PRIMARY).trim() || COLORS.PRIMARY;
          const done = Boolean(scenario.completed);
          const difficulty = String(scenario.difficultyVi || 'Dễ').trim() || 'Dễ';
          const scenarioId = String(scenario?.id || '').trim().toLowerCase();
          return (
            <TouchableOpacity
              key={scenarioId || `${String(scenario?.title || 'dialogue')}-${index}`}
              style={styles.card}
              activeOpacity={0.88}
              onPress={() => handleSelectScenario(scenario)}>
              <View style={styles.cardInner}>
                <View style={[styles.cardAccentStripe, {backgroundColor: accent}]} />
                <View
                  style={[
                    styles.emojiWrap,
                    {
                      borderColor: `${accent}33`,
                      backgroundColor: `${accent}14`,
                    },
                  ]}>
                  <Text style={styles.emojiText} allowFontScaling={false}>
                    {scenario.icon || '💬'}
                  </Text>
                </View>
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {scenario.title}
                  </Text>
                  <View style={styles.chipRow}>
                    <View style={[styles.chip, {borderColor: `${accent}28`}]}>
                      <Feather name="layers" size={12} color={accent} />
                      <Text style={styles.chipText} numberOfLines={1}>
                        {difficulty}
                      </Text>
                    </View>
                    {done ? (
                      <View style={styles.chipDone}>
                        <Feather name="check-circle" size={12} color="#059669" />
                        <Text style={styles.chipDoneText}>Đã học</Text>
                      </View>
                    ) : (
                      <View style={styles.chipTodo}>
                        <Feather name="circle" size={11} color="#94A3B8" />
                        <Text style={styles.chipTodoText}>Chưa học</Text>
                      </View>
                    )}
                  </View>
                  {scenario.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {scenario.description}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.cardChevron}>
                  <Feather name="chevron-right" size={18} color={COLORS.PRIMARY_DARK} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {loading && dialogues.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY_DARK} />
          </View>
        ) : filteredScenarios.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>
              {dialogues.length === 0
                ? 'Chưa có kịch bản hội thoại'
                : 'Không có kịch bản phù hợp'}
            </Text>
            {dialogues.length > 0 ? (
              <Text style={styles.emptyText}>
                Thử đổi bộ lọc phía trên hoặc quay lại sau khi có thêm nội dung.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  heroOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  filterTabsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  filterTab: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 6,
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
  searchRow: {
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
    color: '#1F2937',
    paddingVertical: 0,
  },
  card: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8ECF2',
    marginBottom: 11,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 88,
  },
  cardAccentStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    marginRight: 14,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  emojiText: {
    fontSize: 26,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingLeft: 6,
    paddingRight: 8,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginBottom: 8,
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  chipDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  chipDoneText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  chipTodo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipTodoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 17,
    marginTop: 4,
    fontWeight: '500',
  },
  cardChevron: {
    alignSelf: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.PRIMARY_SOFT,
    borderWidth: 1,
    borderColor: 'rgba(255,123,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  emptyState: {
    marginTop: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 21,
  },
});

export default DialogueIntroScreen;
