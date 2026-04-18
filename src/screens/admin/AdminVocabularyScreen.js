import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {getTopics} from '../../services/firebaseService';
import {
  loadVocabularyFromFirebase,
  getAllVocabulary,
  persistFullVocabulary,
  wordBelongsToTopic,
  getNextVocabularyNumericId,
} from '../../services/vocabularyService';
import {EMPTY_WORD_ROW, WORD_TYPES, withTimeout} from './adminVocabShared';

const HEADER_GRADIENT = ['#7C3AED', '#A855F7', '#DB2777'];

function FieldLabel({children, required}) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required ? <Text style={styles.requiredStar}> *</Text> : null}
    </Text>
  );
}

function wordToForm(w) {
  return {
    id: w.id,
    word: w.word != null ? String(w.word) : '',
    pronunciation: w.pronunciation != null ? String(w.pronunciation) : '',
    meaning: w.meaning != null ? String(w.meaning) : '',
    partOfSpeech: w.partOfSpeech != null ? String(w.partOfSpeech) : 'Danh từ',
    example: w.example != null ? String(w.example) : '',
    exampleVi:
      w.exampleMeaning != null && String(w.exampleMeaning).trim() !== ''
        ? String(w.exampleMeaning)
        : w.exampleVi != null
          ? String(w.exampleVi)
          : '',
    category: String(w.category ?? w.topicId ?? '').trim(),
  };
}

function wordInitial(w) {
  const s = String(w?.word || '').trim();
  return s ? s.slice(0, 1).toUpperCase() : '?';
}

export default function AdminVocabularyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [topics, setTopics] = useState([]);
  const [words, setWords] = useState(() => getAllVocabulary());
  const [search, setSearch] = useState('');
  const [filterTopicId, setFilterTopicId] = useState(null);
  const [vocabTab, setVocabTab] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [detailWord, setDetailWord] = useState(null);
  const [form, setForm] = useState(() => ({...EMPTY_WORD_ROW, category: ''}));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await withTimeout(loadVocabularyFromFirebase({force: true}), 15000);
      } catch (_) {}
      setWords([...getAllVocabulary()]);
      const t = await getTopics();
      setTopics(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const onPullRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      try {
        await withTimeout(loadVocabularyFromFirebase({force: true}), 15000);
      } catch (_) {}
      setWords([...getAllVocabulary()]);
      const t = await getTopics();
      setTopics(Array.isArray(t) ? t : []);
    } finally {
      setListRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return undefined;
    }, [refresh]),
  );

  const q = search.trim().toLowerCase();

  const filteredWords = useMemo(() => {
    let list = words;
    if (filterTopicId) {
      list = list.filter((w) => wordBelongsToTopic(w, filterTopicId));
    }
    if (q) {
      list = list.filter((w) => {
        const a = String(w.word || '').toLowerCase();
        const b = String(w.meaning || '').toLowerCase();
        const c = String(w.category || '').toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }
    return list.sort((a, b) => (a.id || 0) - (b.id || 0));
  }, [words, filterTopicId, q]);

  const openAddTab = useCallback(() => {
    const firstCat = topics[0]?.id != null ? String(topics[0].id) : '';
    setForm({...EMPTY_WORD_ROW, category: firstCat});
    setEditingId(null);
    setVocabTab('add');
  }, [topics]);

  const openEdit = (w) => {
    setForm(wordToForm(w));
    setEditingId(w.id);
    setVocabTab('add');
  };

  const onOpenWordDetail = (w) => setDetailWord(w);

  const onOpenWordEdit = (w) => {
    setDetailWord(null);
    openEdit(w);
  };

  const onSaveWord = async () => {
    const en = String(form.word || '').trim();
    const vi = String(form.meaning || '').trim();
    const cat = String(form.category || '').trim();
    if (!en || !vi) {
      Alert.alert('Thiếu dữ liệu', 'Nhập đủ từ tiếng Anh và nghĩa tiếng Việt.');
      return;
    }
    if (!cat) {
      Alert.alert(
        'Thiếu bộ từ',
        'Chọn hoặc nhập bộ (category). Tạo bộ ở màn «Bộ từ vựng» nếu chưa có.',
      );
      return;
    }

    const exampleVi = String(form.exampleVi || '').trim();
    const payloadBase = {
      word: en,
      meaning: vi,
      pronunciation: String(form.pronunciation || '').trim(),
      partOfSpeech: String(form.partOfSpeech || '').trim() || 'Khác',
      example: String(form.example || '').trim(),
      exampleMeaning: exampleVi,
      exampleVi,
      category: cat,
    };

    setSyncing(true);
    try {
      if (editingId != null) {
        const prev = getAllVocabulary().find((x) => x.id === editingId);
        const next = getAllVocabulary().map((w) =>
          w.id === editingId
            ? {
                ...w,
                ...payloadBase,
                id: editingId,
                learned: Boolean(prev?.learned),
              }
            : w,
        );
        const res = await withTimeout(persistFullVocabulary(next), 20000);
        if (!res.ok) {
          Alert.alert('Lỗi', res.error || 'Không lưu được.');
          return;
        }
      } else {
        const id = getNextVocabularyNumericId();
        const row = {
          ...payloadBase,
          id,
          learned: false,
        };
        const res = await withTimeout(
          persistFullVocabulary([...getAllVocabulary(), row]),
          20000,
        );
        if (!res.ok) {
          Alert.alert('Lỗi', res.error || 'Không lưu được.');
          return;
        }
      }
      setWords([...getAllVocabulary()]);
      setEditingId(null);
      const firstCat = topics[0]?.id != null ? String(topics[0].id) : '';
      setForm({...EMPTY_WORD_ROW, category: firstCat});
      setVocabTab('list');
    } catch (e) {
      Alert.alert('Lỗi', e?.message || 'Lưu thất bại.');
    } finally {
      setSyncing(false);
    }
  };

  const onDeleteWord = (w) => {
    const label = String(w.word || '').trim() || 'từ này';
    Alert.alert('Xóa từ vựng', `Xóa «${label}» khỏi Firestore?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setSyncing(true);
          try {
            const next = getAllVocabulary().filter((x) => x.id !== w.id);
            const res = await withTimeout(persistFullVocabulary(next), 20000);
            if (!res.ok) {
              Alert.alert('Lỗi', res.error || 'Không xóa được.');
              return;
            }
            setWords([...getAllVocabulary()]);
            if (detailWord && String(detailWord.id) === String(w.id)) {
              setDetailWord(null);
            }
          } finally {
            setSyncing(false);
          }
        },
      },
    ]);
  };

  const wordTypeHint = useMemo(() => WORD_TYPES.join('  |  '), []);

  const topicNameForWord = (w) => {
    const topic = topics.find((t) => String(t?.id) === String(w?.category ?? ''));
    return topic?.name || w.category || '—';
  };

  const renderWordRow = (w) => {
    const topicLabel = topicNameForWord(w);
    const pos = String(w.partOfSpeech || '').trim();
    const pron = String(w.pronunciation || '').trim();
    const subLine = [
      pron || null,
      String(w.meaning || '').trim() || '—',
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View key={String(w.id)} style={styles.wordListCard}>
        <TouchableOpacity
          style={styles.wordListRowTop}
          activeOpacity={0.88}
          onPress={() => onOpenWordDetail(w)}>
          <View style={styles.wordListThumb}>
            <Text style={styles.wordListThumbLetter}>{wordInitial(w)}</Text>
          </View>
          <View style={styles.wordListMeta}>
            <Text style={styles.wordListTitle} numberOfLines={2}>
              {w.word || '—'}
            </Text>
            <Text style={styles.wordListSub} numberOfLines={2}>
              {subLine}
            </Text>
            <View style={styles.wordListChips}>
              <View style={styles.wordListChip}>
                <Feather name="folder" size={11} color="#7C3AED" />
                <Text style={styles.wordListChipText} numberOfLines={1}>
                  {topicLabel}
                </Text>
              </View>
              {pos ? (
                <View style={styles.wordListChip}>
                  <Feather name="tag" size={11} color="#6366F1" />
                  <Text style={styles.wordListChipText} numberOfLines={1}>
                    {pos}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.wordListActions}>
          <TouchableOpacity
            style={[styles.wordListActionPill, styles.wordListActionPillEdit]}
            onPress={() => onOpenWordEdit(w)}
            activeOpacity={0.88}>
            <Text style={styles.wordListActionPillEditText}>Sửa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.wordListActionPill, styles.wordListActionPillDel]}
            onPress={() => onDeleteWord(w)}
            activeOpacity={0.88}>
            <Text style={styles.wordListActionPillDelText}>Xóa</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listTabContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={listRefreshing}
          onRefresh={onPullRefresh}
          tintColor="#7C3AED"
          colors={['#7C3AED']}
        />
      }>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Danh sách từ ({filteredWords.length})</Text>
        {loading ? (
          <View style={styles.syncRow}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.syncRowText}>Đang đồng bộ từ Firestore…</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.topicsLinkRow}
          onPress={() => navigation.navigate('AdminTopics')}
          activeOpacity={0.88}>
          <Feather name="layers" size={16} color="#7C3AED" />
          <Text style={styles.topicsLinkText}>Quản lý bộ từ vựng</Text>
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo từ, nghĩa, bộ..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterChipsScroll}
          contentContainerStyle={styles.filterChipsContent}>
          <TouchableOpacity
            style={[styles.filterChip, filterTopicId == null && styles.filterChipOn]}
            onPress={() => setFilterTopicId(null)}
            activeOpacity={0.88}>
            <Text
              style={[styles.filterChipLabel, filterTopicId == null && styles.filterChipLabelOn]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          {topics.map((t) => {
            const active =
              filterTopicId != null && String(filterTopicId) === String(t.id);
            return (
              <TouchableOpacity
                key={String(t.id)}
                style={[styles.filterChip, active && styles.filterChipOn]}
                onPress={() => setFilterTopicId(t.id)}
                activeOpacity={0.88}>
                <Text
                  style={[styles.filterChipLabel, active && styles.filterChipLabelOn]}
                  numberOfLines={1}>
                  {t.name || t.id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text style={styles.listHint}>
          {filterTopicId || q
            ? `Hiển thị ${filteredWords.length} / ${words.length} từ`
            : `${words.length} từ trong kho`}
        </Text>
        {filteredWords.length === 0 ? (
          <View style={styles.emptyInline}>
            <Feather name="book-open" size={36} color="#9CA3AF" />
            <Text style={styles.listEmptyText}>
              {words.length === 0
                ? 'Chưa có từ nào. Chuyển sang tab «Thêm mới» để thêm từ.'
                : 'Không khớp lọc — thử bỏ bộ hoặc đổi từ khóa.'}
            </Text>
          </View>
        ) : (
          <View style={styles.wordList}>{filteredWords.map(renderWordRow)}</View>
        )}
      </View>
    </ScrollView>
  );

  const addTabContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {editingId != null ? 'Sửa từ vựng' : 'Thêm từ mới'}
        </Text>
        <FieldLabel required>Bộ từ vựng</FieldLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.formTopicScroll}
          contentContainerStyle={styles.formTopicScrollContent}>
          {topics.length === 0 ? (
            <Text style={styles.warnInline}>
              Chưa có bộ — mở «Quản lý bộ từ vựng» để tạo trước.
            </Text>
          ) : (
            topics.map((t) => {
              const picked = String(form.category) === String(t.id);
              return (
                <TouchableOpacity
                  key={String(t.id)}
                  style={[styles.filterChip, picked && styles.filterChipOn]}
                  onPress={() => setForm((f) => ({...f, category: String(t.id)}))}
                  activeOpacity={0.88}>
                  <Text
                    style={[styles.filterChipLabel, picked && styles.filterChipLabelOn]}
                    numberOfLines={1}>
                    {t.name || t.id}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        <FieldLabel>Id bộ (slug) — nếu cần nhập tay</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.category}
          onChangeText={(v) => setForm((f) => ({...f, category: v}))}
          placeholder="vd: nha-hang-goi-mon"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />
        <FieldLabel required>Từ tiếng Anh</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.word}
          onChangeText={(v) => setForm((f) => ({...f, word: v}))}
          placeholder="happy"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />
        <FieldLabel required>Nghĩa tiếng Việt</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.meaning}
          onChangeText={(v) => setForm((f) => ({...f, meaning: v}))}
          placeholder="hạnh phúc"
          placeholderTextColor="#9CA3AF"
        />
        <FieldLabel>Phát âm</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.pronunciation}
          onChangeText={(v) => setForm((f) => ({...f, pronunciation: v}))}
          placeholder="/ˈhæpi/"
          placeholderTextColor="#9CA3AF"
        />
        <FieldLabel>Loại từ</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.partOfSpeech}
          onChangeText={(v) => setForm((f) => ({...f, partOfSpeech: v}))}
          placeholder="Danh từ"
          placeholderTextColor="#9CA3AF"
        />
        <Text style={styles.hintSmall}>{wordTypeHint}</Text>
        <FieldLabel>Ví dụ (Anh)</FieldLabel>
        <TextInput
          style={styles.input}
          value={form.example}
          onChangeText={(v) => setForm((f) => ({...f, example: v}))}
          placeholderTextColor="#9CA3AF"
        />
        <FieldLabel>Ví dụ (Việt)</FieldLabel>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={form.exampleVi}
          onChangeText={(v) => setForm((f) => ({...f, exampleVi: v}))}
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.submitBtn, syncing && styles.submitBtnDisabled]}
          onPress={onSaveWord}
          disabled={syncing}
          activeOpacity={0.9}>
          {syncing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {editingId != null ? 'Lưu thay đổi' : 'Thêm từ'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <LinearGradient
        colors={HEADER_GRADIENT}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={[styles.headerGradient, {paddingTop: insets.top + 10}]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
            style={styles.headerIconBtn}>
            <Feather name="arrow-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Quản lý từ vựng</Text>
            <Text style={styles.headerSubtitle}>Danh sách từ và thêm từ mới</Text>
          </View>
          <View style={styles.headerRightSpacer} />
        </View>
      </LinearGradient>

      <View style={styles.tabBarOuter}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, vocabTab === 'list' && styles.tabBtnActive]}
            onPress={() => setVocabTab('list')}
            activeOpacity={0.85}>
            <Feather
              name="list"
              size={18}
              color={vocabTab === 'list' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[styles.tabBtnLabel, vocabTab === 'list' && styles.tabBtnLabelActive]}>
              Danh sách
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, vocabTab === 'add' && styles.tabBtnActive]}
            onPress={() => {
              openAddTab();
            }}
            activeOpacity={0.85}>
            <Feather
              name="plus-circle"
              size={18}
              color={vocabTab === 'add' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[styles.tabBtnLabel, vocabTab === 'add' && styles.tabBtnLabelActive]}>
              Thêm mới
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {vocabTab === 'list' ? listTabContent : addTabContent}

      <Modal
        visible={detailWord != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailWord(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chi tiết từ</Text>
              <TouchableOpacity
                onPress={() => setDetailWord(null)}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <Feather name="x" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            {detailWord ? (
              <ScrollView
                style={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <Text style={styles.modalWordTitle} numberOfLines={3}>
                  {detailWord.word || '—'}
                </Text>
                <View style={styles.modalStatRow}>
                  <View style={styles.modalStatChip}>
                    <Feather name="folder" size={14} color="#7C3AED" />
                    <Text style={styles.modalStatChipText} numberOfLines={1}>
                      {topicNameForWord(detailWord)}
                    </Text>
                  </View>
                  {String(detailWord.partOfSpeech || '').trim() ? (
                    <View style={styles.modalStatChip}>
                      <Feather name="tag" size={14} color="#7C3AED" />
                      <Text style={styles.modalStatChipText}>
                        {String(detailWord.partOfSpeech)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {String(detailWord.pronunciation || '').trim() ? (
                  <View style={styles.modalStatRow}>
                    <View style={styles.modalStatChipMuted}>
                      <Feather name="volume-2" size={13} color="#6B7280" />
                      <Text style={styles.modalStatChipMutedText}>
                        {String(detailWord.pronunciation)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.modalSectionLabel}>Nghĩa</Text>
                <View style={styles.modalContentBox}>
                  <Text style={styles.modalBodyText}>
                    {String(detailWord.meaning || '').trim() || '—'}
                  </Text>
                </View>
                {String(detailWord.example || '').trim() ? (
                  <>
                    <Text style={styles.modalSectionLabel}>Ví dụ (Anh)</Text>
                    <View style={styles.modalContentBox}>
                      <Text style={styles.modalBodyText}>
                        {String(detailWord.example)}
                      </Text>
                    </View>
                  </>
                ) : null}
                {(String(detailWord.exampleVi || '').trim() ||
                  String(detailWord.exampleMeaning || '').trim()) ? (
                  <>
                    <Text style={styles.modalSectionLabel}>Ví dụ (Việt)</Text>
                    <View style={styles.modalContentBox}>
                      <Text style={styles.modalBodyText}>
                        {String(
                          detailWord.exampleVi ||
                            detailWord.exampleMeaning ||
                            '',
                        ).trim() || '—'}
                      </Text>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            ) : null}
            {detailWord ? (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalFooterBtnEdit]}
                  onPress={() => {
                    const w = detailWord;
                    setDetailWord(null);
                    onOpenWordEdit(w);
                  }}
                  activeOpacity={0.88}>
                  <Text style={styles.modalFooterBtnEditText}>Sửa</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalFooterBtnDel]}
                  onPress={() => onDeleteWord(detailWord)}
                  activeOpacity={0.88}>
                  <Text style={styles.modalFooterBtnDelText}>Xóa</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    paddingVertical: 4,
  },
  headerRightSpacer: {
    width: 40,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
  },
  tabBarOuter: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: '#7C3AED',
  },
  tabBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  tabBtnLabelActive: {
    color: '#FFFFFF',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  syncRowText: {
    fontSize: 13,
    color: '#5B21B6',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  topicsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  topicsLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#5B21B6',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  filterChipsScroll: {
    marginBottom: 8,
  },
  filterChipsContent: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    maxWidth: 200,
  },
  filterChipOn: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipLabelOn: {
    color: '#5B21B6',
  },
  listHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    fontWeight: '500',
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  listEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  wordList: {},
  wordListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
  },
  wordListRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  wordListThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordListThumbLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5B21B6',
  },
  wordListMeta: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  wordListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  wordListSub: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    lineHeight: 18,
  },
  wordListChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  wordListChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    maxWidth: '100%',
  },
  wordListChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    flexShrink: 1,
  },
  wordListActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  wordListActionPill: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordListActionPillEdit: {
    backgroundColor: '#7C3AED',
    shadowColor: '#5B21B6',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  wordListActionPillEditText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  wordListActionPillDel: {
    backgroundColor: '#DC2626',
    shadowColor: '#991B1B',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  wordListActionPillDelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  formTopicScroll: {
    marginBottom: 8,
    maxHeight: 48,
  },
  formTopicScrollContent: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#6366F1',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 14,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  hintSmall: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: -8,
  },
  warnInline: {
    fontSize: 13,
    color: '#D97706',
    paddingVertical: 8,
  },
  submitBtn: {
    marginTop: 4,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  modalScroll: {
    maxHeight: 400,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalWordTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  modalStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    maxWidth: '100%',
  },
  modalStatChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
    flexShrink: 1,
  },
  modalStatChipMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  modalStatChipMutedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    flex: 1,
  },
  modalSectionLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.4,
  },
  modalContentBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalBodyText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 21,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  modalFooterBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  modalFooterBtnEdit: {
    marginRight: 8,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  modalFooterBtnEditText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modalFooterBtnDel: {
    marginLeft: 8,
    backgroundColor: '#DC2626',
    shadowColor: '#991B1B',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalFooterBtnDelText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
