import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {
  getAllDialogues,
  loadDialoguesFromFirebase,
  persistDialogueConfig,
} from '../../services/dialogueService';

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

export default function AdminDialoguesScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogues, setDialogues] = useState([]);
  const [dialogueModal, setDialogueModal] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadDialoguesFromFirebase({force: true});
    setDialogues([...getAllDialogues()]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const saveAll = async (nextDialogues) => {
    setSaving(true);
    const res = await persistDialogueConfig({dialogues: nextDialogues});
    setSaving(false);
    if (!res?.ok) {
      Alert.alert('Lỗi', res?.error || 'Không lưu được dữ liệu hội thoại.');
      return false;
    }
    setDialogues(nextDialogues);
    return true;
  };

  const onDeleteDialogue = (item) => {
    Alert.alert('Xóa hội thoại', `Xóa hội thoại "${item.title}"?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          const nextDialogues = dialogues.filter((d) => d.id !== item.id);
          await saveAll(nextDialogues);
        },
      },
    ]);
  };

  const submitDialogue = async () => {
    const row = dialogueModal;
    if (!row) return;
    const id = normalizeId(row.id || row.title);
    const title = String(row.title || '').trim();
    if (!id || !title) {
      Alert.alert('Thiếu dữ liệu', 'Nhập đủ tiêu đề hội thoại.');
      return;
    }
    const exists = dialogues.some((x) => x.id === id && x.id !== row._originId);
    if (exists) {
      Alert.alert('Trùng ID', 'ID hội thoại đã tồn tại.');
      return;
    }
    const dialogue = {
      id,
      topicId: 'general',
      topicName: 'Hội thoại',
      title,
      description: String(row.description || '').trim(),
      icon: String(row.icon || '💬').trim() || '💬',
      difficultyVi: String(row.difficultyVi || 'Dễ').trim() || 'Dễ',
      accentColor: String(row.accentColor || '#2563EB').trim() || '#2563EB',
      turns: [
        {
          id: 1,
          speaker: String(row.speaker || 'Nhân vật').trim() || 'Nhân vật',
          text: String(row.opening || '').trim(),
          translation: String(row.translation || '').trim(),
        },
      ],
      suggestions: String(row.suggestions || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      completed: false,
    };
    const nextDialogues = row._originId
      ? dialogues.map((x) => (x.id === row._originId ? {...x, ...dialogue} : x))
      : [dialogue, ...dialogues];
    const ok = await saveAll(nextDialogues);
    if (ok) setDialogueModal(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Đang tải hội thoại...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.createBtn}
        onPress={() =>
          setDialogueModal({
            id: '',
            title: '',
            description: '',
            icon: '💬',
            difficultyVi: 'Dễ',
            accentColor: '#2563EB',
            speaker: 'Nhân vật',
            opening: '',
            translation: '',
            suggestions: '',
          })
        }>
        <Feather name="plus" size={16} color="#fff" />
        <Text style={styles.createText}>Thêm hội thoại</Text>
      </TouchableOpacity>
      <FlatList
        data={dialogues}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={{flex: 1}}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>Mức: {item.difficultyVi || 'Dễ'}</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                setDialogueModal({
                  _originId: item.id,
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  icon: item.icon,
                  difficultyVi: item.difficultyVi,
                  accentColor: item.accentColor,
                  speaker: item?.turns?.[0]?.speaker || 'Nhân vật',
                  opening: item?.turns?.[0]?.text || '',
                  translation: item?.turns?.[0]?.translation || '',
                  suggestions: Array.isArray(item.suggestions) ? item.suggestions.join('\n') : '',
                })
              }
              style={styles.iconBtn}>
              <Feather name="edit-2" size={18} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDeleteDialogue(item)} style={styles.iconBtn}>
              <Feather name="trash-2" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={dialogueModal != null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {dialogueModal?._originId ? 'Sửa hội thoại' : 'Thêm hội thoại'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Tiêu đề hội thoại"
              value={dialogueModal?.title || ''}
              onChangeText={(t) => setDialogueModal((x) => ({...x, title: t}))}
            />
            <TextInput
              style={styles.input}
              placeholder="Mô tả ngắn"
              value={dialogueModal?.description || ''}
              onChangeText={(t) => setDialogueModal((x) => ({...x, description: t}))}
            />
            <TextInput
              style={styles.input}
              placeholder="Câu mở đầu (tiếng Anh)"
              value={dialogueModal?.opening || ''}
              onChangeText={(t) => setDialogueModal((x) => ({...x, opening: t}))}
            />
            <TextInput
              style={[styles.input, {minHeight: 72}]}
              placeholder="Gợi ý trả lời (mỗi dòng 1 câu)"
              value={dialogueModal?.suggestions || ''}
              onChangeText={(t) => setDialogueModal((x) => ({...x, suggestions: t}))}
              multiline
            />
            <View style={styles.rowBtns}>
              <TouchableOpacity onPress={() => setDialogueModal(null)} style={styles.ghostBtn}>
                <Text>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={saving} onPress={submitDialogue} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{saving ? 'Đang lưu...' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F8FAFC', padding: 12},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  loadingText: {fontSize: 14, color: '#6B7280'},
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  createText: {color: '#fff', fontWeight: '800'},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  cardTitle: {fontSize: 15, fontWeight: '800', color: '#111827'},
  cardSub: {fontSize: 12, color: '#6B7280', marginTop: 2},
  iconBtn: {padding: 8},
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, padding: 14},
  modalTitle: {fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 10},
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  rowBtns: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4},
  ghostBtn: {paddingHorizontal: 14, paddingVertical: 10},
  primaryBtn: {backgroundColor: COLORS.PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10},
  primaryBtnText: {color: '#fff', fontWeight: '800'},
});
