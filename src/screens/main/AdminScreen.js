import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Image,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import {COLORS} from '../../constants';
import {
  getTopics,
  saveTopics,
  saveWordMedia,
  getWordMedia,
  getCurrentUser,
  isCurrentUserAdmin,
} from '../../services/firebaseService';
import {getAllVocabulary} from '../../services/vocabularyService';
import {uploadImageToCloudinary} from '../../services/cloudinaryService';

const EMPTY_TOPIC_FORM = {
  id: '',
  name: '',
  description: '',
  icon: '',
  color: '#60A5FA',
};

const AdminScreen = () => {
  const navigation = useNavigation();
  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicForm, setTopicForm] = useState(EMPTY_TOPIC_FORM);
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedWordId, setSelectedWordId] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState('');
  const [wordMediaById, setWordMediaById] = useState({});
  const [loadingWordMedia, setLoadingWordMedia] = useState(false);

  const user = getCurrentUser();
  const email = user?.email || 'anonymous';
  const allWords = getAllVocabulary();

  const wordsInSelectedTopic = useMemo(() => {
    if (!selectedTopicId) return [];
    return allWords.filter(word => String(word.category) === String(selectedTopicId));
  }, [allWords, selectedTopicId]);

  const selectedWordMedia = useMemo(() => {
    if (!selectedWordId) return null;
    return wordMediaById[String(selectedWordId)] || null;
  }, [selectedWordId, wordMediaById]);

  const loadWordMediaForSelectedTopic = useCallback(async () => {
    if (!selectedTopicId) {
      setWordMediaById({});
      return;
    }
    setLoadingWordMedia(true);
    try {
      const ids = wordsInSelectedTopic.map(w => String(w.id));
      if (ids.length === 0) {
        setWordMediaById({});
        return;
      }
      const entries = await Promise.all(
        ids.map(async id => {
          const media = await getWordMedia(id);
          return [id, media];
        }),
      );
      const next = {};
      for (const [id, media] of entries) {
        next[id] = media;
      }
      setWordMediaById(next);
    } finally {
      setLoadingWordMedia(false);
    }
  }, [getWordMedia, selectedTopicId, wordsInSelectedTopic]);

  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    try {
      const list = await getTopics();
      const topicList = Array.isArray(list) ? list : [];
      setTopics(topicList);
      if (topicList.length > 0) {
        const nextTopicId = selectedTopicId || topicList[0].id;
        setSelectedTopicId(nextTopicId);
        const topicWords = allWords.filter(word => String(word.category) === String(nextTopicId));
        setSelectedWordId(topicWords.length > 0 ? String(topicWords[0].id) : '');
      } else {
        setSelectedTopicId('');
        setSelectedWordId('');
      }
    } finally {
      setLoadingTopics(false);
    }
  }, [allWords, selectedTopicId]);

  useFocusEffect(
    useCallback(() => {
      const allowed = isCurrentUserAdmin();
      setIsAdmin(allowed);
      if (!allowed) {
        Alert.alert('Không có quyền', 'Chỉ tài khoản admin mới truy cập được màn hình này.', [
          {text: 'OK', onPress: () => navigation.goBack()},
        ]);
        return undefined;
      }
      loadTopics();
      return undefined;
    }, [loadTopics, navigation]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return undefined;
      loadWordMediaForSelectedTopic();
      return undefined;
    }, [isAdmin, loadWordMediaForSelectedTopic]),
  );

  const onChangeTopic = (key, value) => {
    setTopicForm(prev => ({...prev, [key]: value}));
  };

  const onAddTopic = async () => {
    if (!topicForm.id.trim() || !topicForm.name.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập ít nhất ID và tên chủ đề.');
      return;
    }
    if (topics.some(t => t.id === topicForm.id.trim())) {
      Alert.alert('Trùng ID', 'ID chủ đề đã tồn tại. Hãy dùng ID khác.');
      return;
    }
    setSavingTopic(true);
    try {
      const next = [
        ...topics,
        {
          id: topicForm.id.trim(),
          name: topicForm.name.trim(),
          description: topicForm.description.trim(),
          icon: topicForm.icon.trim() || '📘',
          color: topicForm.color.trim() || '#60A5FA',
        },
      ];
      const result = await saveTopics(next);
      if (result.ok) {
        setTopics(next);
        setTopicForm(EMPTY_TOPIC_FORM);
        Alert.alert('Thành công', 'Đã thêm chủ đề mới.');
      } else {
        Alert.alert('Lỗi', result.error || 'Không thể lưu chủ đề.');
      }
    } finally {
      setSavingTopic(false);
    }
  };

  const onDeleteTopic = async (topicId) => {
    const next = topics.filter(t => t.id !== topicId);
    const result = await saveTopics(next);
    if (result.ok) {
      setTopics(next);
    } else {
      Alert.alert('Lỗi', result.error || 'Không thể xóa chủ đề.');
    }
  };

  const onSelectTopicForMedia = (topicId) => {
    setSelectedTopicId(topicId);
    const topicWords = allWords.filter(word => String(word.category) === String(topicId));
    setSelectedWordId(topicWords.length > 0 ? String(topicWords[0].id) : '');
    setSelectedImageUri('');
  };

  const onPickImage = async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
      });

      if (res.didCancel) return;
      const asset = Array.isArray(res.assets) && res.assets.length > 0 ? res.assets[0] : null;
      const uri = asset?.uri || '';
      if (!uri) {
        Alert.alert('Lỗi', 'Không lấy được ảnh từ thiết bị.');
        return;
      }
      setSelectedImageUri(uri);
    } catch (error) {
      Alert.alert('Lỗi', error?.message || 'Không thể mở thư viện ảnh.');
    }
  };

  const onSaveMedia = async () => {
    if (!selectedTopicId) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng chọn chủ đề.');
      return;
    }
    if (!selectedWordId) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng chọn từ vựng.');
      return;
    }
    if (!selectedImageUri) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng chọn ảnh từ thiết bị.');
      return;
    }
    setSavingMedia(true);
    try {
      const uploadResult = await uploadImageToCloudinary(selectedImageUri);
      if (!uploadResult.ok || !uploadResult.url) {
        Alert.alert('Lỗi', uploadResult.error || 'Upload ảnh thất bại.');
        return;
      }

      const result = await saveWordMedia(selectedWordId, {
        imageUrl: uploadResult.url,
        cloudinaryPublicId: uploadResult.publicId,
      });
      if (result.ok) {
        setSelectedImageUri('');
        setWordMediaById(prev => ({
          ...prev,
          [String(selectedWordId)]: {
            ...(prev[String(selectedWordId)] || {}),
            imageUrl: uploadResult.url,
            cloudinaryPublicId: uploadResult.publicId,
          },
        }));
        Alert.alert('Thành công', 'Đã lưu ảnh cho từ vựng.');
      } else {
        Alert.alert('Lỗi', result.error || 'Không thể lưu ảnh.');
      }
    } finally {
      setSavingMedia(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Quản trị dữ liệu</Text>
        <Text style={styles.subtitle}>Đăng nhập: {email}</Text>

        {!isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              Bạn không có quyền truy cập tính năng quản trị.
            </Text>
          </View>
        ) : null}

        {isAdmin && <View style={styles.card}>
          <Text style={styles.cardTitle}>Thêm chủ đề mới</Text>
          <TextInput
            style={styles.input}
            placeholder="ID chủ đề (vd: Business)"
            value={topicForm.id}
            onChangeText={v => onChangeTopic('id', v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Tên hiển thị"
            value={topicForm.name}
            onChangeText={v => onChangeTopic('name', v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Mô tả ngắn"
            value={topicForm.description}
            onChangeText={v => onChangeTopic('description', v)}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Icon (emoji)"
              value={topicForm.icon}
              onChangeText={v => onChangeTopic('icon', v)}
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Màu (#60A5FA)"
              value={topicForm.color}
              onChangeText={v => onChangeTopic('color', v)}
            />
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAddTopic}
            disabled={savingTopic}>
            <Text style={styles.primaryButtonText}>
              {savingTopic ? 'Đang lưu...' : 'Thêm chủ đề'}
            </Text>
          </TouchableOpacity>
        </View>}

        {isAdmin && <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Danh sách chủ đề</Text>
            <TouchableOpacity onPress={loadTopics}>
              <Text style={styles.linkText}>{loadingTopics ? 'Đang tải...' : 'Làm mới'}</Text>
            </TouchableOpacity>
          </View>
          {topics.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có chủ đề.</Text>
          ) : (
            topics.map(topic => (
              <View key={topic.id} style={styles.topicRow}>
                <Text style={styles.topicText}>
                  {topic.icon || '📘'} {topic.name} ({topic.id})
                </Text>
                <TouchableOpacity onPress={() => onDeleteTopic(topic.id)}>
                  <Text style={styles.deleteText}>Xóa</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>}

        {isAdmin && <View style={styles.card}>
          <Text style={styles.cardTitle}>Gán ảnh cho từ vựng</Text>

          <Text style={styles.fieldLabel}>1) Chọn chủ đề</Text>
          <View style={styles.selectWrap}>
            {topics.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có chủ đề để chọn.</Text>
            ) : (
              topics.map(topic => (
                <TouchableOpacity
                  key={topic.id}
                  style={[
                    styles.selectChip,
                    String(selectedTopicId) === String(topic.id) && styles.selectChipActive,
                  ]}
                  onPress={() => onSelectTopicForMedia(topic.id)}>
                  <Text
                    style={[
                      styles.selectChipText,
                      String(selectedTopicId) === String(topic.id) && styles.selectChipTextActive,
                    ]}>
                    {topic.icon || '📘'} {topic.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <Text style={styles.fieldLabel}>2) Chọn từ vựng</Text>
          <View style={styles.selectWrap}>
            {wordsInSelectedTopic.length === 0 ? (
              <Text style={styles.emptyText}>Chủ đề này chưa có từ vựng.</Text>
            ) : (
              wordsInSelectedTopic.map(word => {
                const wordId = String(word.id);
                const hasImage = Boolean(wordMediaById[wordId]?.imageUrl);
                return (
                  <TouchableOpacity
                    key={wordId}
                    style={[
                      styles.selectChip,
                      selectedWordId === wordId && styles.selectChipActive,
                    ]}
                    onPress={() => {
                      setSelectedWordId(wordId);
                      setSelectedImageUri('');
                    }}>
                    <Text
                      style={[
                        styles.selectChipText,
                        selectedWordId === wordId && styles.selectChipTextActive,
                      ]}>
                      {word.word} ({word.id}){hasImage ? '  🖼' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <View style={styles.currentImageRow}>
            <Text style={styles.currentImageLabel}>
              Ảnh hiện tại {loadingWordMedia ? '(đang tải...)' : ''}
            </Text>
            <TouchableOpacity onPress={loadWordMediaForSelectedTopic} disabled={loadingWordMedia}>
              <Text style={styles.linkText}>
                {loadingWordMedia ? '...' : 'Làm mới'}
              </Text>
            </TouchableOpacity>
          </View>
          {selectedWordMedia?.imageUrl ? (
            <View style={styles.previewWrap}>
              <Image source={{uri: selectedWordMedia.imageUrl}} style={styles.previewImage} />
            </View>
          ) : (
            <Text style={styles.emptyText}>Từ này chưa có ảnh.</Text>
          )}

          <Text style={styles.fieldLabel}>3) Chọn ảnh từ thiết bị</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onPickImage}
            disabled={savingMedia}>
            <Text style={styles.secondaryButtonText}>Chọn ảnh</Text>
          </TouchableOpacity>
          {selectedImageUri ? (
            <View style={styles.previewWrap}>
              <Image source={{uri: selectedImageUri}} style={styles.previewImage} />
            </View>
          ) : (
            <Text style={styles.emptyText}>Chưa chọn ảnh.</Text>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onSaveMedia}
            disabled={savingMedia}>
            <Text style={styles.primaryButtonText}>
              {savingMedia ? 'Đang upload và lưu...' : 'Lưu ảnh cho từ'}
            </Text>
          </TouchableOpacity>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.BACKGROUND},
  scroll: {flex: 1},
  content: {padding: 16, paddingBottom: 32},
  title: {fontSize: 24, fontWeight: '700', color: COLORS.TEXT, marginBottom: 4},
  subtitle: {fontSize: 13, color: COLORS.TEXT_SECONDARY, marginBottom: 14},
  card: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {fontSize: 16, fontWeight: '700', color: COLORS.TEXT, marginBottom: 10},
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 8,
    marginTop: 4,
  },
  currentImageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  currentImageLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  cardHeaderRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  selectWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  selectChip: {
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: COLORS.BACKGROUND,
  },
  selectChipActive: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderColor: COLORS.PRIMARY_DARK,
  },
  selectChipText: {
    color: COLORS.TEXT,
    fontSize: 13,
    fontWeight: '500',
  },
  selectChipTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.TEXT,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  row: {flexDirection: 'row', gap: 8},
  halfInput: {flex: 1},
  primaryButton: {
    marginTop: 4,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButton: {
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY_DARK,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
    backgroundColor: COLORS.BACKGROUND_WHITE,
  },
  secondaryButtonText: {
    color: COLORS.PRIMARY_DARK,
    fontWeight: '600',
  },
  previewWrap: {
    width: 150,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: COLORS.BORDER,
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  primaryButtonText: {color: '#fff', fontWeight: '600'},
  linkText: {fontSize: 13, color: COLORS.PRIMARY_DARK, fontWeight: '600'},
  emptyText: {fontSize: 13, color: COLORS.TEXT_SECONDARY},
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  topicText: {fontSize: 13, color: COLORS.TEXT, flex: 1, paddingRight: 8},
  deleteText: {fontSize: 13, color: COLORS.ERROR, fontWeight: '600'},
});

export default AdminScreen;

