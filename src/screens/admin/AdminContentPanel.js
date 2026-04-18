import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getTopics, saveTopics, saveVideos} from '../../services/firebaseService';
import {
  loadVocabularyFromFirebase,
  getAllVocabulary,
  wordBelongsToTopic,
  persistFullVocabulary,
} from '../../services/vocabularyService';
import {loadVideosFromFirebase, getAllVideos, replaceVideoCache} from '../../services/videoService';
import {getAllDialogues, loadDialoguesFromFirebase} from '../../services/dialogueService';
import {ADMIN_DASHBOARD} from './adminStyles';

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: {elevation: 2},
  default: {},
});

const TOPIC_MODAL_LIST_MAX = Math.min(460, Math.round(Dimensions.get('window').height * 0.5));

function countWordsInTopic(topicId, words) {
  return words.filter((w) => wordBelongsToTopic(w, topicId)).length;
}

function ContentCard({title, subtitle, topicId, line1Text, onView, onEdit, onDelete}) {
  const desc = String(subtitle || '').trim();
  return (
    <View style={styles.card}>
      <View style={styles.cardMainCol}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        {desc ? (
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {desc}
          </Text>
        ) : (
          <Text style={styles.cardIdLine} numberOfLines={1}>
            ID: {topicId != null ? String(topicId) : '—'}
          </Text>
        )}
        <View style={styles.cardChipWrap}>
          <View style={styles.cardChip}>
            <Feather name="book-open" size={15} color={ADMIN_DASHBOARD.BLUE} />
            <Text style={styles.cardChipText}>{line1Text}</Text>
          </View>
        </View>
      </View>
      <View style={styles.vActionsCol}>
        <TouchableOpacity onPress={onView} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="eye" size={20} color="#1F2937" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="edit-2" size={20} color="#1F2937" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="trash-2" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatViewsLabel(raw) {
  const n = parseInt(String(raw ?? '0').replace(/\D/g, ''), 10);
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('vi-VN')} lượt xem`;
}

/** Thẻ video admin — layout ngang theo mẫu (thumbnail, mô tả, thống kê, hành động). */
function VideoAdminCard({video, onView, onEdit, onDelete}) {
  const title = String(video.title || '').trim() || '—';
  const desc = String(video.description || '').trim();
  const dur = String(video.duration || '').trim();
  const durLabel = dur && dur !== '0:00' ? dur : '—';
  const thumbUrl = String(video.thumbnailUrl || '').trim();
  const subCount = Array.isArray(video.subtitles) ? video.subtitles.length : 0;
  const wordCount = Array.isArray(video.videoWords) ? video.videoWords.length : 0;

  return (
    <View style={styles.vCard}>
      <View style={styles.vThumbWrap}>
        {thumbUrl ? (
          <Image source={{uri: thumbUrl}} style={styles.vThumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.vThumbPlaceholder}>
            <View style={styles.vThumbPlaceholderInner} />
          </View>
        )}
        <View style={styles.vDurBadge}>
          <Text style={styles.vDurBadgeText}>{durLabel}</Text>
        </View>
      </View>

      <View style={styles.vMain}>
        <Text style={styles.vTitle} numberOfLines={2}>
          {title}
        </Text>

        {desc ? (
          <Text style={styles.vDesc} numberOfLines={2}>
            {desc}
          </Text>
        ) : (
          <Text style={styles.vDescMuted} numberOfLines={1}>
            Chưa có mô tả
          </Text>
        )}

        <View style={styles.vStatsRow}>
          <Feather name="eye" size={13} color="#9CA3AF" />
          <Text style={styles.vStatText}>{formatViewsLabel(video.views)}</Text>
          <Text style={styles.vStatDot}>·</Text>
          <Feather name="message-circle" size={13} color="#9CA3AF" />
          <Text style={styles.vStatText}>{subCount} phụ đề</Text>
          <Text style={styles.vStatDot}>·</Text>
          <Feather name="book-open" size={13} color="#9CA3AF" />
          <Text style={styles.vStatText}>{wordCount} từ</Text>
        </View>
      </View>

      <View style={styles.vActionsCol}>
        <TouchableOpacity onPress={onView} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="eye" size={20} color="#1F2937" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="edit-2" size={20} color="#1F2937" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.vIconBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
          <Feather name="trash-2" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminContentPanel({navigation}) {
  const [subTab, setSubTab] = useState('topics');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [topics, setTopics] = useState([]);
  const [videos, setVideos] = useState([]);
  const [dialogues, setDialogues] = useState([]);
  const [words, setWords] = useState([]);
  /** null | { topic, items } — items = từ thuộc chủ đề (theo category/topicId). */
  const [topicVocabModal, setTopicVocabModal] = useState(null);
  /** null | { id, word, meaning } — modal sửa từ (chồng lên modal chủ đề). */
  const [wordEditor, setWordEditor] = useState(null);
  const [vocabMutating, setVocabMutating] = useState(false);
  const [videoMutating, setVideoMutating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Bước 1: hiển thị ngay dữ liệu seed/cache (không chờ mạng).
      setTopics((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : []));
      setVideos([...getAllVideos()]);
      setDialogues([...getAllDialogues()]);
      setWords([...getAllVocabulary()]);

      // Bước 2: đồng bộ Firebase ở nền (có timeout) — không chặn UI.
      setLoading(false);
      setSyncing(true);

      const withTimeout = (p, ms) =>
        Promise.race([
          p,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
        ]);

      void (async () => {
        try {
          await Promise.allSettled([
            withTimeout(loadVocabularyFromFirebase({force: true}), 12000),
            withTimeout(loadVideosFromFirebase({force: true}), 12000),
            withTimeout(loadDialoguesFromFirebase({force: true}), 12000),
            withTimeout(getTopics(), 12000),
          ]);

          const t = await getTopics();
          setTopics(Array.isArray(t) && t.length > 0 ? t : []);
          setVideos([...getAllVideos()]);
          setDialogues([...getAllDialogues()]);
          setWords([...getAllVocabulary()]);
        } catch (_) {
          // ignore
        } finally {
          setSyncing(false);
        }
      })();
    } catch (e) {
      console.warn('AdminContentPanel refresh', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return undefined;
    }, [refresh]),
  );

  const q = search.trim().toLowerCase();

  const filteredTopics = useMemo(() => {
    if (!q) return topics;
    return topics.filter((t) => {
      const id = String(t?.id ?? '').toLowerCase();
      const name = String(t?.name ?? '').toLowerCase();
      const desc = String(t?.description ?? '').toLowerCase();
      return id.includes(q) || name.includes(q) || desc.includes(q);
    });
  }, [topics, q]);

  const filteredVideos = useMemo(() => {
    if (!q) return videos;
    return videos.filter((v) => {
      const title = String(v?.title ?? '').toLowerCase();
      const desc = String(v?.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [videos, q]);

  const filteredDialogues = useMemo(() => {
    if (!q) return dialogues;
    return dialogues.filter((d) => {
      const title = String(d?.title || '').toLowerCase();
      const desc = String(d?.description || '').toLowerCase();
      const topic = String(d?.topicName || d?.topicId || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || topic.includes(q);
    });
  }, [dialogues, q]);

  const onCreateNew = () => {
    if (subTab === 'topics') {
      navigation.navigate('AdminTopics');
    } else if (subTab === 'dialogues') {
      navigation.navigate('AdminDialogues');
    } else {
      navigation.navigate('AdminVideos');
    }
  };

  const openTopicVocabulary = useCallback(
    (topic) => {
      const items = words.filter((w) => wordBelongsToTopic(w, topic.id));
      setTopicVocabModal({topic, items});
    },
    [words],
  );

  const closeTopicVocabulary = useCallback(() => {
    setTopicVocabModal(null);
    setWordEditor(null);
  }, []);

  const resyncTopicModalItems = useCallback(() => {
    setTopicVocabModal((prev) => {
      if (!prev?.topic) return prev;
      const tid = prev.topic.id;
      const items = getAllVocabulary().filter((w) => wordBelongsToTopic(w, tid));
      return {...prev, items};
    });
  }, []);

  const deleteTopicWord = useCallback(
    (item) => {
      const w = String(item?.word || '').trim() || 'từ này';
      Alert.alert('Xóa từ vựng', `Xóa "${w}" khỏi kho trên Firestore?`, [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setVocabMutating(true);
            try {
              const next = getAllVocabulary().filter((x) => x.id !== item.id);
              const res = await persistFullVocabulary(next);
              if (!res.ok) {
                Alert.alert('Lỗi', res.error || 'Không lưu được.');
                return;
              }
              setWords([...getAllVocabulary()]);
              resyncTopicModalItems();
            } finally {
              setVocabMutating(false);
            }
          },
        },
      ]);
    },
    [resyncTopicModalItems],
  );

  const saveWordEdit = useCallback(async () => {
    const ed = wordEditor;
    if (!ed) return;
    const en = String(ed.word || '').trim();
    const vi = String(ed.meaning || '').trim();
    if (!en || !vi) {
      Alert.alert('Thiếu dữ liệu', 'Nhập đủ từ (Anh) và nghĩa (Việt).');
      return;
    }
    setVocabMutating(true);
    try {
      const next = getAllVocabulary().map((w) =>
        w.id === ed.id ? {...w, word: en, meaning: vi} : w,
      );
      const res = await persistFullVocabulary(next);
      if (!res.ok) {
        Alert.alert('Lỗi', res.error || 'Không lưu được.');
        return;
      }
      setWords([...getAllVocabulary()]);
      resyncTopicModalItems();
      setWordEditor(null);
    } finally {
      setVocabMutating(false);
    }
  }, [wordEditor, resyncTopicModalItems]);

  const deleteTopic = (topic) => {
    Alert.alert('Xóa bộ từ vựng', `Xóa "${topic.name}" và toàn bộ từ vựng thuộc bộ này?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          const nextTopics = topics.filter((t) => t.id !== topic.id);
          const nextWords = getAllVocabulary().filter(
            (w) => !wordBelongsToTopic(w, topic.id),
          );

          setVocabMutating(true);
          try {
            const topicResult = await saveTopics(nextTopics);
            if (!topicResult.ok) {
              Alert.alert('Lỗi', topicResult.error || 'Không thể lưu danh sách bộ từ vựng.');
              return;
            }

            const vocabResult = await persistFullVocabulary(nextWords);
            if (!vocabResult.ok) {
              Alert.alert(
                'Lỗi',
                vocabResult.error || 'Đã xóa bộ nhưng chưa xóa được từ vựng liên quan.',
              );
              return;
            }

            setTopics(nextTopics);
            setWords([...getAllVocabulary()]);
            resyncTopicModalItems();
          } finally {
            setVocabMutating(false);
          }
        },
      },
    ]);
  };

  const videoToFirestoreRow = (v) => {
    const o = {
      id: v.id,
      title: v.title,
      description: v.description,
      thumbnail: v.thumbnail,
      videoUrl: v.videoUrl,
      duration: v.duration,
      views: v.views,
    };
    if (v.level) o.level = v.level;
    if (v.thumbnailUrl) o.thumbnailUrl = v.thumbnailUrl;
    if (v.subtitles?.length) o.subtitles = v.subtitles;
    if (v.cloudinaryPublicId) o.cloudinaryPublicId = v.cloudinaryPublicId;
    if (v.videoWords?.length) {
      o.videoWords = v.videoWords.map((w) => ({word: w.word, meaning: w.meaning}));
    }
    return o;
  };

  const persistVideosAfterDelete = async (nextVideos) => {
    const payload = nextVideos.map(videoToFirestoreRow);
    const result = await Promise.race([
      saveVideos(payload),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
    ]);
    if (!result.ok) {
      throw new Error(result.error || 'Không thể lưu.');
    }
    // Lưu thành công -> cập nhật cache local ngay để phản hồi tức thì.
    replaceVideoCache(nextVideos);
    setVideos([...getAllVideos()]);
  };

  const deleteVideo = (video) => {
    if (videoMutating) return;
    const title = String(video?.title || '').trim() || 'video này';
    Alert.alert('Xóa video', `Xóa "${title}" vĩnh viễn trên Firestore?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          if (videoMutating) return;
          const prev = videos;
          const next = prev.filter((v) => v.id !== video.id);
          // Optimistic: gỡ ngay khỏi UI để cảm giác nhanh.
          setVideos(next);
          setVideoMutating(true);
          try {
            await persistVideosAfterDelete(next);
          } catch (e) {
            // Rollback nếu lưu thất bại.
            setVideos(prev);
            Alert.alert('Lỗi', e?.message || 'Không thể xóa video.');
          } finally {
            setVideoMutating(false);
          }
        },
      },
    ]);
  };

  const searchPlaceholder =
    subTab === 'topics'
      ? 'Tìm kiếm từ vựng...'
      : subTab === 'dialogues'
        ? 'Tìm kiếm hội thoại...'
        : 'Tìm kiếm video...';

  return (
    <View style={styles.wrap}>
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'topics' && styles.subTabBtnActive]}
          onPress={() => setSubTab('topics')}
          activeOpacity={0.85}>
          <Feather
            name="book-open"
            size={18}
            color={subTab === 'topics' ? ADMIN_DASHBOARD.BLUE : '#6B7280'}
          />
          <Text style={subTab === 'topics' ? styles.subTabLabelActive : styles.subTabLabel}>
            Từ vựng
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'dialogues' && styles.subTabBtnActive]}
          onPress={() => setSubTab('dialogues')}
          activeOpacity={0.85}>
          <Feather
            name="message-circle"
            size={18}
            color={subTab === 'dialogues' ? ADMIN_DASHBOARD.BLUE : '#6B7280'}
          />
          <Text style={subTab === 'dialogues' ? styles.subTabLabelActive : styles.subTabLabel}>
            Hội thoại
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'video' && styles.subTabBtnActive]}
          onPress={() => setSubTab('video')}
          activeOpacity={0.85}>
          <Feather
            name="video"
            size={18}
            color={subTab === 'video' ? ADMIN_DASHBOARD.BLUE : '#6B7280'}
          />
          <Text style={subTab === 'video' ? styles.subTabLabelActive : styles.subTabLabel}>Video</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={onCreateNew} activeOpacity={0.88}>
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.createBtnText}>Tạo mới</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={ADMIN_DASHBOARD.BLUE} />
          <Text style={styles.loadingText}>Đang tải nội dung...</Text>
        </View>
      ) : (
        <View style={styles.listBlock}>
          {syncing ? <Text style={styles.syncText}>Đang đồng bộ…</Text> : null}
          {subTab === 'topics' ? (
            filteredTopics.length === 0 ? (
              <Text style={styles.emptyText}>
                {topics.length === 0
                  ? 'Chưa có chủ đề. Bấm Tạo mới để thêm trên Firestore.'
                  : 'Không khớp tìm kiếm.'}
              </Text>
            ) : (
              filteredTopics.map((topic) => {
                const n = countWordsInTopic(topic.id, words);
                return (
                  <ContentCard
                    key={String(topic.id)}
                    title={topic.name || topic.id}
                    subtitle={topic.description}
                    topicId={topic.id}
                    line1Text={`${n} từ vựng`}
                    onView={() => openTopicVocabulary(topic)}
                    onEdit={() => navigation.navigate('AdminTopics')}
                    onDelete={() => deleteTopic(topic)}
                  />
                );
              })
            )
          ) : subTab === 'dialogues' ? (
            filteredDialogues.length === 0 ? (
              <Text style={styles.emptyText}>
                {dialogues.length === 0
                  ? 'Chưa có hội thoại. Bấm Tạo mới để thêm.'
                  : 'Không khớp tìm kiếm.'}
              </Text>
            ) : (
              filteredDialogues.map((item) => (
                <ContentCard
                  key={item.id}
                  title={item.title || item.id}
                  subtitle={item.description || `Chủ đề: ${item.topicName || item.topicId || '—'}`}
                  topicId={item.id}
                  line1Text={`Chủ đề: ${item.topicName || item.topicId || '—'} · Tổng ${
                    dialogues.length
                  } hội thoại`}
                  onView={() =>
                    Alert.alert(
                      item.title || 'Hội thoại',
                      [
                        item.description,
                        item?.turns?.[0]?.text ? `Mở đầu: ${item.turns[0].text}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n\n') || 'Không có mô tả.',
                    )
                  }
                  onEdit={() => navigation.navigate('AdminDialogues')}
                  onDelete={() =>
                    Alert.alert('Gợi ý', 'Vào màn Hội thoại để xóa và quản lý chi tiết.')
                  }
                />
              ))
            )
          ) : filteredVideos.length === 0 ? (
            <Text style={styles.emptyText}>
              {videos.length === 0
                ? 'Chưa có video. Bấm Tạo mới để thêm.'
                : 'Không khớp tìm kiếm.'}
            </Text>
          ) : (
            filteredVideos.map((video) => (
              <VideoAdminCard
                key={video.id}
                video={video}
                onView={() =>
                  Alert.alert(
                    video.title || 'Video',
                    [
                      video.description,
                      video.videoUrl ? `URL: ${String(video.videoUrl).slice(0, 120)}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n\n') || 'Không có mô tả.',
                  )
                }
                onEdit={() => navigation.navigate('AdminVideos')}
                onDelete={() => deleteVideo(video)}
              />
            ))
          )}
        </View>
      )}

      <Modal
        visible={topicVocabModal != null}
        animationType="fade"
        transparent
        onRequestClose={closeTopicVocabulary}>
        <View style={styles.topicModalBackdrop}>
          <TouchableOpacity
            style={styles.topicModalBackdropHit}
            activeOpacity={1}
            onPress={closeTopicVocabulary}
            accessibilityLabel="Đóng"
          />
          <View style={styles.topicModalSheet}>
            <View style={styles.topicModalHeader}>
              <View style={styles.topicModalHeaderText}>
                <Text style={styles.topicModalTitle} numberOfLines={2}>
                  {topicVocabModal?.topic?.name || topicVocabModal?.topic?.id || 'Chủ đề'}
                </Text>
                <Text style={styles.topicModalMeta}>
                  ID: {topicVocabModal?.topic?.id != null ? String(topicVocabModal.topic.id) : '—'} ·{' '}
                  {topicVocabModal?.items?.length ?? 0} từ
                </Text>
                {String(topicVocabModal?.topic?.description || '').trim() ? (
                  <Text style={styles.topicModalDesc} numberOfLines={3}>
                    {String(topicVocabModal?.topic?.description || '').trim()}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={closeTopicVocabulary}
                style={styles.topicModalClose}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                accessibilityLabel="Đóng">
                <Feather name="x" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={topicVocabModal?.items ?? []}
              keyExtractor={(item) => `w-${item.id}`}
              style={[styles.topicModalList, {maxHeight: TOPIC_MODAL_LIST_MAX}]}
              contentContainerStyle={styles.topicModalListContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.topicModalEmpty}>
                  Chưa có từ vựng nào gắn chủ đề này (kiểm tra trường category / topicId của từ trên
                  Firestore).
                </Text>
              }
              renderItem={({item}) => (
                <View style={styles.topicWordRow}>
                  <View style={styles.topicWordBody}>
                    <Text style={styles.topicWordEn} numberOfLines={2}>
                      {item.word || '—'}
                    </Text>
                    <Text style={styles.topicWordVi} numberOfLines={3}>
                      {item.meaning || '—'}
                    </Text>
                    {String(item.pronunciation || '').trim() ? (
                      <Text style={styles.topicWordMeta} numberOfLines={2}>
                        Phiên âm: {String(item.pronunciation).trim()}
                      </Text>
                    ) : null}
                    {String(item.example || '').trim() ? (
                      <Text style={styles.topicWordMeta} numberOfLines={3}>
                        Ví dụ: {String(item.example).trim()}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.vActionsCol}>
                    <TouchableOpacity
                      onPress={() =>
                        setWordEditor({
                          id: item.id,
                          word: String(item.word || ''),
                          meaning: String(item.meaning || ''),
                        })
                      }
                      style={styles.vIconBtn}
                      disabled={vocabMutating}
                      hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
                      <Feather name="edit-2" size={20} color="#1F2937" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteTopicWord(item)}
                      style={styles.vIconBtn}
                      disabled={vocabMutating}
                      hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
                      <Feather name="trash-2" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={wordEditor != null}
        animationType="fade"
        transparent
        onRequestClose={() => !vocabMutating && setWordEditor(null)}>
        <View style={styles.editWordBackdrop}>
          <TouchableOpacity
            style={styles.editWordBackdropHit}
            activeOpacity={1}
            onPress={() => !vocabMutating && setWordEditor(null)}
            accessibilityLabel="Đóng"
          />
          <View style={styles.editWordSheet}>
            <Text style={styles.editWordTitle}>Sửa từ vựng</Text>
            <Text style={styles.editWordLabel}>Tiếng Anh</Text>
            <TextInput
              style={styles.editWordInput}
              value={wordEditor?.word ?? ''}
              onChangeText={(t) => setWordEditor((e) => (e ? {...e, word: t} : e))}
              placeholder="Từ"
              placeholderTextColor="#9CA3AF"
              editable={!vocabMutating}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.editWordLabel}>Nghĩa tiếng Việt</Text>
            <TextInput
              style={[styles.editWordInput, styles.editWordInputMultiline]}
              value={wordEditor?.meaning ?? ''}
              onChangeText={(t) => setWordEditor((e) => (e ? {...e, meaning: t} : e))}
              placeholder="Nghĩa"
              placeholderTextColor="#9CA3AF"
              editable={!vocabMutating}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.editWordBtns}>
              <TouchableOpacity
                style={styles.editWordBtnGhost}
                onPress={() => setWordEditor(null)}
                disabled={vocabMutating}>
                <Text style={styles.editWordBtnGhostText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editWordBtnPrimary}
                onPress={saveWordEdit}
                disabled={vocabMutating}>
                {vocabMutating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.editWordBtnPrimaryText}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 0,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  subTabBtnActive: {
    backgroundColor: '#E8F0FF',
    borderColor: ADMIN_DASHBOARD.BLUE,
  },
  subTabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  subTabLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: ADMIN_DASHBOARD.BLUE,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {marginRight: 4},
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: COLORS.TEXT,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ADMIN_DASHBOARD.BLUE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
  },
  listBlock: {paddingBottom: 8, gap: 12},
  emptyText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  syncText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    paddingHorizontal: 12,
    marginBottom: -2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    ...cardShadow,
  },
  cardMainCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  cardChipWrap: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
    lineHeight: 22,
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
  cardIdLine: {
    marginTop: 6,
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(33,105,255,0.12)',
  },
  cardChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },

  vCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EAED',
    ...cardShadow,
  },
  vThumbWrap: {
    width: 108,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    marginRight: 10,
  },
  vThumbImg: {
    width: '100%',
    aspectRatio: 16 / 11,
    backgroundColor: '#E5E7EB',
  },
  vThumbPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F6',
  },
  vThumbPlaceholderInner: {
    width: '100%',
    height: '100%',
    backgroundColor: '#EEF2F6',
  },
  vDurBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  vDurBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  vMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  vTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  vDesc: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 6,
  },
  vDescMuted: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  vStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  vStatText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  vStatDot: {
    fontSize: 11,
    color: '#D1D5DB',
    marginHorizontal: 2,
  },
  vActionsCol: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 4,
    paddingVertical: 2,
  },
  vIconBtn: {
    paddingVertical: 8,
  },

  topicModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  topicModalBackdropHit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topicModalSheet: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '88%',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    ...cardShadow,
  },
  topicModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  topicModalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  topicModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 22,
  },
  topicModalMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  topicModalDesc: {
    marginTop: 8,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  topicModalClose: {
    padding: 4,
    marginTop: -4,
  },
  topicModalList: {},
  topicModalListContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 4,
    flexGrow: 1,
  },
  topicModalEmpty: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  topicWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  topicWordBody: {
    flex: 1,
    minWidth: 0,
  },
  topicWordEn: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  topicWordVi: {
    marginTop: 4,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  topicWordMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },

  editWordBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  editWordBackdropHit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  editWordSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 18,
    ...cardShadow,
  },
  editWordTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },
  editWordLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  editWordInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  editWordInputMultiline: {
    minHeight: 88,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
  },
  editWordBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  editWordBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  editWordBtnGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  editWordBtnPrimary: {
    backgroundColor: ADMIN_DASHBOARD.BLUE,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  editWordBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
