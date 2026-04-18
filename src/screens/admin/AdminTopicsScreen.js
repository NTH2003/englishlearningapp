import React, {useCallback, useState} from 'react';
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
  FlatList,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {getTopics, saveTopics} from '../../services/firebaseService';
import {
  loadVocabularyFromFirebase,
  getAllVocabulary,
  persistFullVocabulary,
  wordBelongsToTopic,
} from '../../services/vocabularyService';
import {EMPTY_TOPIC_FORM, buildAutoTopicId, withTimeout} from './adminVocabShared';

function countWordsForTopic(topicId, words) {
  return words.filter((w) => wordBelongsToTopic(w, topicId)).length;
}

export default function AdminTopicsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('list');
  const [topics, setTopics] = useState([]);
  const [words, setWords] = useState(() => getAllVocabulary());
  const [topicForm, setTopicForm] = useState(EMPTY_TOPIC_FORM);
  const [savingTopic, setSavingTopic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editTopic, setEditTopic] = useState(null);
  const [editForm, setEditForm] = useState({name: '', description: '', icon: '', color: ''});
  const [savingEdit, setSavingEdit] = useState(false);

  const loadTopics = useCallback(async () => {
    try {
      const list = await getTopics();
      setTopics(Array.isArray(list) ? list : []);
    } catch (_) {
      setTopics([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await withTimeout(loadVocabularyFromFirebase({force: true}), 15000);
      } catch (_) {}
      setWords([...getAllVocabulary()]);
      await loadTopics();
    } finally {
      setLoading(false);
    }
  }, [loadTopics]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      return undefined;
    }, [refreshAll]),
  );

  const onChangeTopic = (key, value) => {
    setTopicForm((prev) => ({...prev, [key]: value}));
  };

  const openEdit = (t) => {
    setEditForm({
      name: String(t.name || '').trim(),
      description: String(t.description || '').trim(),
      icon: String(t.icon || '').trim() || '📘',
      color: String(t.color || '').trim() || '#3B82F6',
    });
    setEditTopic(t);
  };

  const saveEditTopic = async () => {
    if (!editTopic) return;
    const name = String(editForm.name || '').trim();
    if (!name) {
      Alert.alert('Thiếu dữ liệu', 'Nhập tên bộ từ vựng.');
      return;
    }
    setSavingEdit(true);
    try {
      const next = topics.map((x) =>
        x.id === editTopic.id
          ? {
              ...x,
              name,
              description: String(editForm.description || '').trim(),
              icon: String(editForm.icon || '').trim() || '📘',
              color: String(editForm.color || '').trim() || '#3B82F6',
            }
          : x,
      );
      const result = await withTimeout(saveTopics(next), 12000);
      if (!result.ok) {
        Alert.alert('Lỗi', result.error || 'Không thể lưu.');
        return;
      }
      setTopics(next);
      setEditTopic(null);
      Alert.alert('Đã lưu', 'Đã cập nhật bộ từ vựng.');
    } catch (e) {
      Alert.alert('Lỗi', e?.message === 'timeout' ? 'Timeout. Kiểm tra mạng.' : e?.message || 'Lỗi lưu.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteTopic = (topic) => {
    Alert.alert('Xóa bộ từ vựng', `Xóa "${topic.name}" và toàn bộ từ thuộc bộ này trên Firestore?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setSavingTopic(true);
          try {
            const nextTopics = topics.filter((t) => t.id !== topic.id);
            const nextWords = getAllVocabulary().filter((w) => !wordBelongsToTopic(w, topic.id));
            const topicResult = await withTimeout(saveTopics(nextTopics), 12000);
            if (!topicResult.ok) {
              Alert.alert('Lỗi', topicResult.error || 'Không lưu được danh sách bộ.');
              return;
            }
            const vocabResult = await withTimeout(persistFullVocabulary(nextWords), 15000);
            if (!vocabResult.ok) {
              Alert.alert('Lỗi', vocabResult.error || 'Đã xóa bộ nhưng chưa xóa hết từ.');
              return;
            }
            setTopics(nextTopics);
            setWords([...getAllVocabulary()]);
            if (editTopic?.id === topic.id) setEditTopic(null);
          } finally {
            setSavingTopic(false);
          }
        },
      },
    ]);
  };

  const onAddTopic = async () => {
    if (!topicForm.name.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập Tên bộ từ vựng.');
      return;
    }
    setSavingTopic(true);
    try {
      const autoId = buildAutoTopicId(topicForm.name, topics);
      const next = [
        ...topics,
        {
          id: autoId,
          name: topicForm.name.trim(),
          description: topicForm.description.trim(),
          icon: '📘',
          color: '#3B82F6',
        },
      ];
      const result = await withTimeout(saveTopics(next), 12000);
      if (!result.ok) {
        Alert.alert('Lỗi', result.error || 'Không thể lưu chủ đề.');
        return;
      }

      setTopics(next);
      setWords([...getAllVocabulary()]);
      setTopicForm(EMPTY_TOPIC_FORM);
      setMode('list');
      Alert.alert(
        'Đã tạo bộ',
        `Id bộ: «${autoId}». Thêm từ vựng và gán vào bộ này tại màn «Từ vựng» trong quản trị.`,
        [
          {text: 'Đóng', style: 'cancel'},
          {
            text: 'Mở Từ vựng',
            onPress: () => navigation.navigate('AdminVocabulary'),
          },
        ],
      );
    } catch (e) {
      const msg =
        e?.message === 'timeout'
          ? 'Lưu dữ liệu quá lâu (timeout). Kiểm tra mạng hoặc Firestore rồi thử lại.'
          : e?.message || 'Không thể lưu bộ từ vựng.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSavingTopic(false);
    }
  };

  const renderTopicRow = ({item: t}) => {
    const n = countWordsForTopic(t.id, words);
    return (
      <View style={styles.topicRow}>
        <View style={styles.topicRowMain}>
          <Text style={styles.topicRowIcon}>{String(t.icon || '📘')}</Text>
          <View style={styles.topicRowText}>
            <Text style={styles.topicRowTitle} numberOfLines={2}>
              {t.name}
            </Text>
            <Text style={styles.topicRowMeta} numberOfLines={1}>
              ID: {t.id} · {n} từ
            </Text>
            {t.description ? (
              <Text style={styles.topicRowDesc} numberOfLines={2}>
                {t.description}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.topicRowActions}>
          <TouchableOpacity onPress={() => openEdit(t)} style={styles.iconBtn} hitSlop={8}>
            <Feather name="edit-2" size={18} color="#2563EB" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteTopic(t)} style={styles.iconBtn} hitSlop={8}>
            <Feather name="trash-2" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <LinearGradient
        colors={['#2563EB', '#4F46E5']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={[styles.header, {paddingTop: Math.max(insets.top, 10) + 6}]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Bộ từ vựng</Text>
            <Text style={styles.headerSub}>Tạo bộ (metadata) — từ vựng thêm ở màn «Từ vựng»</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, mode === 'list' && styles.tabBtnActive]}
          onPress={() => setMode('list')}>
          <Text style={[styles.tabBtnText, mode === 'list' && styles.tabBtnTextActive]}>
            Danh sách ({topics.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, mode === 'create' && styles.tabBtnActive]}
          onPress={() => setMode('create')}>
          <Text style={[styles.tabBtnText, mode === 'create' && styles.tabBtnTextActive]}>
            Thêm bộ mới
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      ) : mode === 'list' ? (
        <FlatList
          data={topics}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTopicRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Chưa có bộ từ vựng</Text>
              <Text style={styles.emptyHint}>Chuyển sang tab «Thêm bộ mới» để tạo.</Text>
              <TouchableOpacity style={styles.emptyCta} onPress={() => setMode('create')}>
                <Text style={styles.emptyCtaText}>Tạo bộ đầu tiên</Text>
              </TouchableOpacity>
            </View>
          }
        />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Thông tin bộ từ</Text>
            <Text style={styles.fieldLabel}>Tên bộ từ vựng *</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: Từ vựng cơ bản"
              placeholderTextColor="#9CA3AF"
              value={topicForm.name}
              onChangeText={(v) => onChangeTopic('name', v)}
            />

            <Text style={styles.fieldLabel}>Mô tả</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Mô tả ngắn cho bộ từ vựng..."
              placeholderTextColor="#9CA3AF"
              value={topicForm.description}
              onChangeText={(v) => onChangeTopic('description', v)}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.hintCard}>
            <Feather name="info" size={18} color="#2563EB" />
            <Text style={styles.hintCardText}>
              Từ vựng không thêm ở đây nữa. Vào màn <Text style={styles.hintBold}>Từ vựng</Text> trong
              quản trị, chọn đúng bộ (category = id bộ sau khi lưu) để thêm từ.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.linkToVocab}
            onPress={() => navigation.navigate('AdminVocabulary')}
            activeOpacity={0.85}>
            <Text style={styles.linkToVocabText}>Mở màn Từ vựng →</Text>
          </TouchableOpacity>

          <View style={styles.footerBtns}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.cancelBtn]}
              onPress={() => {
                setTopicForm(EMPTY_TOPIC_FORM);
              }}
              disabled={savingTopic}>
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.saveBtn]}
              onPress={onAddTopic}
              disabled={savingTopic}>
              {savingTopic ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="save" size={15} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Lưu bộ từ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <Modal visible={editTopic != null} transparent animationType="fade" onRequestClose={() => setEditTopic(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sửa bộ từ vựng</Text>
            <Text style={styles.fieldLabel}>Tên *</Text>
            <TextInput
              style={styles.input}
              value={editForm.name}
              onChangeText={(v) => setEditForm((f) => ({...f, name: v}))}
              placeholder="Tên bộ"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.fieldLabel}>Mô tả</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={editForm.description}
              onChangeText={(v) => setEditForm((f) => ({...f, description: v}))}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Icon (emoji)</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.icon}
                  onChangeText={(v) => setEditForm((f) => ({...f, icon: v}))}
                  placeholder="📘"
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Màu (hex)</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.color}
                  onChangeText={(v) => setEditForm((f) => ({...f, color: v}))}
                  placeholder="#3B82F6"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditTopic(null)}>
                <Text style={styles.cancelBtnText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEditTopic} disabled={savingEdit}>
                {savingEdit ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F3F4F6'},
  header: {paddingHorizontal: 14, paddingVertical: 12},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  headerBack: {paddingVertical: 6, paddingRight: 4},
  headerTextWrap: {flex: 1},
  headerTitle: {fontSize: 18, fontWeight: '800', color: '#FFFFFF'},
  headerSub: {fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2},
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10},
  tabBtnActive: {backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4},
  tabBtnText: {fontSize: 14, fontWeight: '600', color: '#6B7280'},
  tabBtnTextActive: {color: '#111827'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  loadingText: {marginTop: 10, color: '#6B7280'},
  listContent: {padding: 14, paddingBottom: 28},
  topicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 10,
  },
  topicRowMain: {flex: 1, flexDirection: 'row', gap: 10},
  topicRowIcon: {fontSize: 28, marginTop: 2},
  topicRowText: {flex: 1},
  topicRowTitle: {fontSize: 16, fontWeight: '700', color: '#111827'},
  topicRowMeta: {fontSize: 12, color: '#6B7280', marginTop: 4},
  topicRowDesc: {fontSize: 13, color: '#4B5563', marginTop: 6},
  topicRowActions: {flexDirection: 'row', gap: 4},
  iconBtn: {padding: 6},
  emptyBox: {padding: 24, alignItems: 'center'},
  emptyTitle: {fontSize: 16, fontWeight: '700', color: '#374151'},
  emptyHint: {fontSize: 13, color: '#9CA3AF', marginTop: 8, textAlign: 'center'},
  emptyCta: {
    marginTop: 16,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {color: '#FFFFFF', fontWeight: '700'},
  scroll: {flex: 1},
  content: {padding: 14, paddingBottom: 28},
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 12},
  fieldLabel: {fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6},
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  multiline: {minHeight: 84, textAlignVertical: 'top'},
  hintCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  hintCardText: {flex: 1, fontSize: 13, color: '#1E3A5F', lineHeight: 19},
  hintBold: {fontWeight: '800', color: '#1D4ED8'},
  linkToVocab: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 6,
  },
  linkToVocabText: {fontSize: 14, fontWeight: '700', color: '#2563EB'},
  row: {flexDirection: 'row', gap: 10},
  col: {flex: 1},
  footerBtns: {flexDirection: 'row', gap: 10, marginTop: 6},
  footerBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cancelBtn: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB'},
  cancelBtnText: {fontSize: 15, fontWeight: '700', color: '#374151'},
  saveBtn: {backgroundColor: '#2563EB'},
  saveBtnText: {fontSize: 15, fontWeight: '700', color: '#FFFFFF'},
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12},
  modalFooter: {flexDirection: 'row', gap: 10, marginTop: 8},
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
});
