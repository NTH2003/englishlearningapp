import React, {useCallback, useMemo, useState, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
  RefreshControl,
  Modal,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import {launchImageLibrary} from 'react-native-image-picker';
import Video from 'react-native-video';
import {saveVideos} from '../../services/firebaseService';
import {
  loadVideosFromFirebase,
  getAllVideos,
  normalizeVideoFromFirestore,
  replaceVideoCache,
} from '../../services/videoService';
import {uploadVideoToCloudinary} from '../../services/cloudinaryService';
import {
  suggestVideoWordRowsFromVideoContent,
} from '../../services/vocabularyService';
import {AI_SERVER_URL, COLORS} from '../../constants';
import {CLOUDINARY} from '../../constants';

const EMPTY_FORM = {
  title: '',
  description: '',
  thumbnail: '',
  thumbnailUrl: '',
  videoUrl: '',
  cloudinaryPublicId: '',
  duration: '0:00',
  subtitleDraft: '',
};

function buildCloudinaryVideoThumbnailUrl(publicId) {
  const pid = String(publicId || '').trim();
  if (!pid) return '';
  const cloud = String(CLOUDINARY?.CLOUD_NAME || '').trim();
  if (!cloud) return '';
  // Lấy frame đầu (so_0) làm thumbnail.
  return `https://res.cloudinary.com/${cloud}/video/upload/so_0/${pid}.jpg`;
}

function normalizeUrlForCompare(uri) {
  return String(uri || '').trim().replace(/\/+$/, '').toLowerCase();
}

/** Chuỗi hiển thị thời lượng (vd 10:25 hoặc 1:05:30). */
function formatDurationHuman(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function normalizeSubtitleTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const parts = s.split(':').map((x) => x.trim());
  if (parts.length !== 2 && parts.length !== 3) return '';
  const nums = parts.map((x) => parseInt(x, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return '';
  if (parts.length === 2) {
    const [m, sec] = nums;
    if (sec > 59) return '';
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  const [h, m, sec] = nums;
  if (m > 59 || sec > 59) return '';
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function secondsToTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function parseSrtTimeToSeconds(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const clean = s.replace(',', '.');
  const parts = clean.split(':').map((x) => x.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((x) => parseFloat(x));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let seconds = 0;
  if (parts.length === 2) {
    seconds = nums[0] * 60 + nums[1];
  } else {
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return Math.max(0, Math.floor(seconds));
}

function parseSrtLikeDraft(draft) {
  const normalized = String(draft || '').replace(/\r/g, '').trim();
  if (!normalized) {
    return {subtitles: [], invalidCount: 0, totalLines: 0, mode: 'empty'};
  }
  const blocks = normalized.split(/\n\s*\n/);
  const out = [];
  let invalid = 0;
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    let ptr = 0;
    if (/^\d+$/.test(lines[0])) {
      ptr = 1;
    }
    const timeline = lines[ptr] || '';
    const m = timeline.match(
      /(\d{1,2}:\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?|\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?|\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)/,
    );
    if (!m) {
      invalid += 1;
      continue;
    }
    const startSec = parseSrtTimeToSeconds(m[1]);
    const text = lines.slice(ptr + 1).join(' ').trim();
    if (!Number.isFinite(startSec) || !text) {
      invalid += 1;
      continue;
    }
    out.push({time: secondsToTimestamp(startSec), text});
  }
  return {
    subtitles: out,
    invalidCount: invalid,
    totalLines: blocks.length,
    mode: 'srt',
  };
}

function parseSubtitleDraft(draft) {
  const lines = String(draft || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    return {subtitles: [], invalidCount: 0, totalLines: 0, mode: 'empty'};
  }

  // 1) Hỗ trợ format SRT/VTT (không cần đổi tay).
  const srtLike = parseSrtLikeDraft(draft);
  if (srtLike.subtitles.length > 0) {
    return srtLike;
  }

  // 2) Hỗ trợ format cũ: mm:ss|text
  const byPipe = [];
  let pipeInvalid = 0;
  for (const line of lines) {
    const idx = line.indexOf('|');
    if (idx <= 0) {
      pipeInvalid += 1;
      continue;
    }
    const timeRaw = line.slice(0, idx).trim();
    const text = line.slice(idx + 1).trim();
    const time = normalizeSubtitleTime(timeRaw);
    if (!time || !text) {
      pipeInvalid += 1;
      continue;
    }
    byPipe.push({time, text});
  }
  if (byPipe.length > 0) {
    return {
      subtitles: byPipe,
      invalidCount: pipeInvalid,
      totalLines: lines.length,
      mode: 'pipe',
    };
  }

  // 3) Nếu chỉ dán nội dung từng dòng, tự gán timestamp tăng dần để tiết kiệm thao tác.
  const plain = lines
    .filter((x) => !/^vtt$/i.test(x) && !/^\d+$/.test(x) && !/-->/.test(x))
    .map((text, idx) => ({
      time: secondsToTimestamp(idx * 3),
      text,
    }));
  if (plain.length > 0) {
    return {
      subtitles: plain,
      invalidCount: 0,
      totalLines: lines.length,
      mode: 'plain',
    };
  }
  return {subtitles: [], invalidCount: lines.length, totalLines: lines.length, mode: 'unknown'};
}

function subtitlesToDraftLines(subtitles) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) return '';
  return subtitles
    .map((s) => {
      const t = String(s?.time || '').trim();
      const text = String(s?.text || '').replace(/\s+/g, ' ').trim();
      if (!t || !text) return '';
      return `${t}|${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function FieldLabel({children, required}) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required ? <Text style={styles.requiredStar}> *</Text> : null}
    </Text>
  );
}

/** Đổi video đã chuẩn hóa → state form chỉnh sửa */
function videoToEditForm(video) {
  if (!video || typeof video !== 'object') {
    return {...EMPTY_FORM};
  }
  const subs = Array.isArray(video.subtitles) ? video.subtitles : [];
  const draft = subtitlesToDraftLines(subs);
  return {
    title: String(video.title ?? ''),
    description: String(video.description ?? ''),
    thumbnail: String(video.thumbnail ?? ''),
    thumbnailUrl: String(video.thumbnailUrl ?? ''),
    videoUrl: String(video.videoUrl ?? ''),
    cloudinaryPublicId: String(video.cloudinaryPublicId ?? ''),
    duration: String(video.duration ?? '0:00'),
    subtitleDraft: draft,
  };
}

function videoWordsToGeneratedState(video) {
  const arr = Array.isArray(video?.videoWords) ? video.videoWords : [];
  return arr.map((w) => ({
    word: String(w?.word ?? ''),
    meaning: String(w?.meaning ?? ''),
    pronunciation: String(w?.pronunciation ?? ''),
    partOfSpeechVi: String(w?.partOfSpeechVi ?? ''),
    example: String(w?.example ?? ''),
    exampleMeaning: String(w?.exampleMeaning ?? ''),
    level: String(w?.level ?? ''),
  }));
}

export default function AdminVideosScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [videos, setVideos] = useState([]);
  const [listRefreshing, setListRefreshing] = useState(false);
  /** Tab quản lý: danh sách | form thêm mới */
  const [videoTab, setVideoTab] = useState('list');
  /** null = thêm mới; string id = đang sửa video đó */
  const [editingVideoKey, setEditingVideoKey] = useState(null);
  /** Modal xem chi tiết */
  const [detailVideo, setDetailVideo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCloudinary, setUploadingCloudinary] = useState(false);
  const [autoSubtitling, setAutoSubtitling] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [generatedVideoWords, setGeneratedVideoWords] = useState([]);
  const [probeUri, setProbeUri] = useState(null);
  const probeGenRef = useRef(0);
  const probeResolverRef = useRef(null);
  const probeTimeoutRef = useRef(null);

  const durationDisplay = useMemo(() => {
    const d = String(form.duration || '').trim();
    if (!d || d === '0:00') {
      return '—';
    }
    return d;
  }, [form.duration]);

  const subtitlePreviewItems = useMemo(() => {
    const parsed = parseSubtitleDraft(form.subtitleDraft);
    return Array.isArray(parsed?.subtitles) ? parsed.subtitles : [];
  }, [form.subtitleDraft]);

  const fetchMp4AutoSubtitles = useCallback(async (url) => {
    const resp = await fetch(`${AI_SERVER_URL}/video/subtitles/mp4-auto`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({videoUrl: url, lang: 'en'}),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error || 'Không thể tạo phụ đề tự động cho MP4.');
    }
    const subtitles = Array.isArray(json?.subtitles) ? json.subtitles : [];
    if (!subtitles.length) {
      throw new Error('Không trích xuất được nội dung lời nói từ video.');
    }
    return subtitles;
  }, []);

  const enrichSubtitleRows = useCallback(async (subtitles, options = {}) => {
    const {allowFallback = true} = options;
    const lines = Array.isArray(subtitles)
      ? subtitles.map((s) => String(s?.text || '').trim()).filter(Boolean)
      : [];
    if (!lines.length) return [];
    try {
      const resp = await fetch(`${AI_SERVER_URL}/video/subtitles/enrich`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lines}),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || 'Không thể xử lý nghĩa/phiên âm phụ đề.');
      }
      const items = Array.isArray(json?.items) ? json.items : [];
      const map = new Map(
        items.map((it) => [
          String(it?.text || '').trim().toLowerCase(),
          {
            meaning: String(it?.meaning || '').trim(),
            pronunciation: String(it?.pronunciation || '').trim(),
            partOfSpeechVi: String(it?.partOfSpeechVi || '').trim(),
          },
        ]),
      );
      return lines.map((line) => {
        const key = line.toLowerCase();
        const row = map.get(key) || {};
        return {
          word: line,
          meaning: row.meaning || line,
          pronunciation: row.pronunciation || '',
          partOfSpeechVi: row.partOfSpeechVi || 'phrase',
          example: '',
          exampleMeaning: '',
          level: '',
        };
      });
    } catch (e) {
      if (allowFallback) {
        return suggestVideoWordRowsFromVideoContent({subtitles});
      }
      throw e;
    }
  }, []);

  const reload = useCallback(async () => {
    await loadVideosFromFirebase({force: true});
    setVideos([...getAllVideos()]);
  }, []);

  const onPullRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      await reload();
    } finally {
      setListRefreshing(false);
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {};
    }, [reload]),
  );

  const onChange = (key, value) => {
    setForm((prev) => ({...prev, [key]: value}));
  };

  const updateSubtitleItem = useCallback((index, field, value) => {
    const parsed = parseSubtitleDraft(form.subtitleDraft);
    const items = Array.isArray(parsed?.subtitles) ? [...parsed.subtitles] : [];
    if (!items[index]) return;
    const nextVal = String(value || '');
    if (field === 'time') {
      items[index].time = nextVal;
    } else {
      items[index].text = nextVal;
    }
    setForm((prev) => ({...prev, subtitleDraft: subtitlesToDraftLines(items)}));
  }, [form.subtitleDraft]);

  const updateGeneratedWordItem = useCallback((index, field, value) => {
    setGeneratedVideoWords((prev) =>
      prev.map((row, i) =>
        i === index ? {...row, [field]: String(value || '')} : row,
      ),
    );
  }, []);

  const removeGeneratedWordItem = useCallback((index) => {
    setGeneratedVideoWords((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addGeneratedWordItem = useCallback(() => {
    setGeneratedVideoWords((prev) => [
      ...prev,
      {
        word: '',
        meaning: '',
        pronunciation: '',
        partOfSpeechVi: '',
        example: '',
        exampleMeaning: '',
        level: '',
      },
    ]);
  }, []);

  const probeVideoDuration = useCallback((uri) => {
    const u = String(uri || '').trim();
    if (!u) {
      return Promise.resolve(0);
    }
    const gen = ++probeGenRef.current;
    return new Promise((resolve) => {
      if (probeTimeoutRef.current) {
        clearTimeout(probeTimeoutRef.current);
        probeTimeoutRef.current = null;
      }
      probeTimeoutRef.current = setTimeout(() => {
        probeTimeoutRef.current = null;
        if (probeGenRef.current === gen) {
          probeResolverRef.current = null;
          setProbeUri(null);
        }
        resolve(0);
      }, 28000);
      probeResolverRef.current = (sec) => {
        if (probeGenRef.current !== gen) {
          return;
        }
        if (probeTimeoutRef.current) {
          clearTimeout(probeTimeoutRef.current);
          probeTimeoutRef.current = null;
        }
        probeResolverRef.current = null;
        setProbeUri(null);
        resolve(Number.isFinite(sec) && sec > 0 ? sec : 0);
      };
      setProbeUri(u);
    });
  }, []);

  const onProbeLoaded = useCallback((data) => {
    const s = data?.duration;
    const sec = Number.isFinite(s) && s > 0 ? s : 0;
    probeResolverRef.current?.(sec);
  }, []);

  const onProbeError = useCallback(() => {
    probeResolverRef.current?.(0);
  }, []);

  const tryAutoSubtitleForUrl = useCallback(
    async (rawUrl, {showError = true} = {}) => {
      const url = String(rawUrl || '').trim();
      if (!url) return '';
      if (!/^https?:\/\//i.test(url) || !/\.mp4($|[?#])/i.test(url)) return '';
      setAutoSubtitling(true);
      try {
        const autoSubtitles = await fetchMp4AutoSubtitles(url);
        const draft = subtitlesToDraftLines(autoSubtitles);
        setForm((prev) => ({...prev, subtitleDraft: draft}));
        return draft;
      } catch (e) {
        if (showError) {
          Alert.alert('Không thể tạo phụ đề tự động', e?.message || 'Lỗi tạo phụ đề MP4.');
        }
        return '';
      } finally {
        setAutoSubtitling(false);
      }
    },
    [fetchMp4AutoSubtitles],
  );

  const onPickUploadCloudinary = async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'video',
        selectionLimit: 1,
      });
      if (res.didCancel) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Lỗi', 'Không lấy được file video.');
        return;
      }
      setUploadingCloudinary(true);
      const up = await uploadVideoToCloudinary({
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
      setUploadingCloudinary(false);
      if (!up.ok || !up.url) {
        Alert.alert(
          'Upload',
          up.error || 'Upload thất bại. Kiểm tra preset cho phép Video.',
        );
        return;
      }
      onChange('videoUrl', up.url);
      const pid = up.publicId ? String(up.publicId) : '';
      onChange('cloudinaryPublicId', pid);
      const thumb = buildCloudinaryVideoThumbnailUrl(pid);
      if (thumb) {
        onChange('thumbnailUrl', thumb);
      }
      let sec = 0;
      if (asset.duration != null) {
        const d = Number(asset.duration);
        if (Number.isFinite(d) && d > 0) {
          sec = d > 10000 ? d / 1000 : d;
        }
      }
      if (sec <= 0) {
        sec = await probeVideoDuration(up.url);
      }
      if (sec > 0) {
        onChange('duration', formatDurationHuman(sec));
      } else {
        onChange('duration', '0:00');
      }
      await tryAutoSubtitleForUrl(up.url, {showError: false});
      setGeneratedVideoWords([]);
      Alert.alert('Đã upload', 'Xong.');
    } catch (e) {
      setUploadingCloudinary(false);
      Alert.alert('Lỗi', e?.message || 'Không thể chọn / upload video.');
    }
  };

  const nextAutoVideoId = (list) => {
    if (!Array.isArray(list) || list.length === 0) return 1;
    const maxId = Math.max(...list.map((v) => (Number.isFinite(v?.id) ? v.id : 0)));
    return maxId + 1;
  };

  const persistList = async (nextList) => {
    setSaving(true);
    try {
      const result = await Promise.race([
        saveVideos(nextList),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
      ]);
      if (result.ok) {
        // Cập nhật cache local ngay để phản hồi nhanh, đồng bộ server để nền xử lý.
        replaceVideoCache(nextList);
        setVideos([...nextList]);
        void loadVideosFromFirebase({force: true}).catch(() => {});
        return true;
      }
      Alert.alert('Lỗi', result.error || 'Không thể lưu video.');
      return false;
    } catch (e) {
      const msg =
        e?.message === 'timeout'
          ? 'Lưu video quá lâu (timeout). Kiểm tra mạng/Firestore rules rồi thử lại.'
          : e?.message || 'Không thể lưu video.';
      Alert.alert('Lỗi', msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onDeleteVideo = (video) => {
    const title = String(video?.title || '').trim() || 'Video';
    Alert.alert('Xóa video?', `Xóa «${title}» khỏi ứng dụng?`, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          const next = videos.filter((x) => String(x.id) !== String(video.id));
          const ok = await persistList(next);
          if (ok && detailVideo && String(detailVideo.id) === String(video.id)) {
            setDetailVideo(null);
          }
        },
      },
    ]);
  };

  const onOpenVideoDetail = (v) => {
    setDetailVideo(v);
  };

  const onOpenVideoEdit = (v) => {
    setForm(videoToEditForm(v));
    setGeneratedVideoWords(videoWordsToGeneratedState(v));
    setEditingVideoKey(String(v.id));
    setVideoTab('add');
  };

  const onAdd = async () => {
    const isEdit = editingVideoKey != null;
    const existingVideo = isEdit
      ? videos.find((x) => String(x.id) === String(editingVideoKey))
      : null;

    if (!form.title.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập tiêu đề video.');
      return;
    }
    const url = form.videoUrl.trim();
    if (!url) {
      Alert.alert(
        'Thiếu dữ liệu',
        'Vui lòng nhập URL video hoặc chọn video từ máy rồi chờ upload xong.',
      );
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('URL không hợp lệ', 'URL video phải bắt đầu bằng http:// hoặc https://');
      return;
    }
    if (!/\.mp4($|[?#])/i.test(url)) {
      Alert.alert(
        'Chỉ hỗ trợ MP4',
        'Vui lòng dùng link file .mp4 (HTTPS). Không dùng link YouTube.',
      );
      return;
    }
    const duplicate = videos.some((v) => {
      if (isEdit && String(v.id) === String(editingVideoKey)) {
        return false;
      }
      return normalizeUrlForCompare(v?.videoUrl) === normalizeUrlForCompare(url);
    });
    if (duplicate) {
      Alert.alert('Video đã tồn tại', 'URL này đã có trong danh sách video.');
      return;
    }
    if (isEdit && !existingVideo) {
      Alert.alert('Lỗi', 'Không tìm thấy video để cập nhật.');
      return;
    }
    const id = isEdit && existingVideo ? existingVideo.id : nextAutoVideoId(videos);

    let subtitleDraftNext = String(form.subtitleDraft || '').trim();
    let autoDraft = '';
    // Nếu admin đã có/sửa phụ đề rồi thì giữ nguyên, không auto ghi đè lại.
    if (!subtitleDraftNext) {
      autoDraft = await tryAutoSubtitleForUrl(url, {showError: false});
      if (autoDraft) {
        subtitleDraftNext = autoDraft;
      }
      if (!autoDraft && !subtitleDraftNext) {
        Alert.alert(
          'Không thể tạo phụ đề tự động',
          'Chưa lấy được phụ đề tự động cho video này. Bạn có thể thử lại hoặc nhập phụ đề thủ công.',
        );
      }
    }

    const subtitleParsed = parseSubtitleDraft(subtitleDraftNext);
    if (subtitleParsed.totalLines > 0 && subtitleParsed.subtitles.length === 0) {
      Alert.alert(
        'Phụ đề chưa đúng định dạng',
        'Phụ đề không hợp lệ, vui lòng kiểm tra lại nội dung phụ đề.',
      );
      return;
    }

    const durationStr = String(form.duration || '').trim() || '0:00';

    const manualWords = Array.isArray(generatedVideoWords)
      ? generatedVideoWords
          .map((w) => ({
            word: String(w?.word || '').trim(),
            meaning: String(w?.meaning || '').trim(),
            pronunciation: String(w?.pronunciation || '').trim(),
            partOfSpeechVi: String(w?.partOfSpeechVi || '').trim(),
            example: '',
            exampleMeaning: '',
            level: '',
          }))
          .filter((w) => w.word && w.meaning)
      : [];
    const videoWordsPayload =
      manualWords.length > 0
        ? manualWords
        : await enrichSubtitleRows(subtitleParsed.subtitles, {allowFallback: true});

    const raw = {
      id,
      title: form.title.trim(),
      description: form.description.trim(),
      videoUrl: url,
      duration: durationStr,
      views: isEdit && existingVideo
        ? String(existingVideo.views ?? '0')
        : '0',
      ...(subtitleParsed.subtitles.length > 0
        ? {subtitles: subtitleParsed.subtitles}
        : {}),
      ...(videoWordsPayload.length > 0 ? {videoWords: videoWordsPayload} : {}),
    };
    const cp = String(form.cloudinaryPublicId || '').trim();
    if (cp) {
      raw.cloudinaryPublicId = cp;
    }
    const thumbUrl = String(form.thumbnailUrl || '').trim();
    if (thumbUrl) {
      raw.thumbnailUrl = thumbUrl;
    }
    const normalized = normalizeVideoFromFirestore(raw);
    if (!normalized) {
      Alert.alert('Lỗi', 'Dữ liệu không hợp lệ sau khi chuẩn hóa.');
      return;
    }

    const next = isEdit
      ? videos.map((v) =>
          String(v.id) === String(editingVideoKey) ? normalized : v,
        )
      : [...videos, normalized];
    const ok = await persistList(next);
    if (ok) {
      setForm(EMPTY_FORM);
      setGeneratedVideoWords([]);
      setEditingVideoKey(null);
      setVideoTab('list');
      if (subtitleParsed.invalidCount > 0) {
        Alert.alert(
          isEdit ? 'Đã cập nhật' : 'Đã thêm video',
          `Đã lưu ${subtitleParsed.subtitles.length} dòng phụ đề hợp lệ, bỏ qua ${subtitleParsed.invalidCount} dòng chưa đúng định dạng.`,
        );
      } else if (subtitleParsed.mode === 'plain' && subtitleParsed.subtitles.length > 0) {
        Alert.alert(
          isEdit ? 'Đã cập nhật' : 'Đã thêm video',
          `Đã tự gán mốc thời gian cho ${subtitleParsed.subtitles.length} dòng phụ đề.`,
        );
      } else {
        Alert.alert(
          'Thành công',
          isEdit ? 'Đã lưu thay đổi video.' : 'Đã thêm video.',
        );
      }
    }
  };

  const onGenerateWordsFromSubtitles = useCallback(async () => {
    const parsed = parseSubtitleDraft(form.subtitleDraft);
    const subtitles = Array.isArray(parsed?.subtitles) ? parsed.subtitles : [];
    if (subtitles.length === 0) {
      Alert.alert('Chưa có phụ đề', 'Vui lòng có phụ đề trước khi tạo từ vựng.');
      return;
    }
    setAutoSubtitling(true);
    try {
      const rows = await enrichSubtitleRows(subtitles, {allowFallback: false});
      setGeneratedVideoWords(rows);
      Alert.alert('Đã tạo', `Đã tạo ${rows.length} mục từ vựng từ phụ đề.`);
    } catch (e) {
      Alert.alert(
        'Lỗi tạo tự động',
        e?.message ||
          'Không thể tạo nghĩa/phiên âm/loại từ tự động. Kiểm tra AI server rồi thử lại.',
      );
    } finally {
      setAutoSubtitling(false);
    }
  }, [enrichSubtitleRows, form.subtitleDraft]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {probeUri ? (
        <Video
          source={{uri: probeUri}}
          paused
          muted
          resizeMode="contain"
          style={styles.hiddenProbe}
          onLoad={onProbeLoaded}
          onError={onProbeError}
        />
      ) : null}
      <LinearGradient
        colors={['#7C3AED', '#A855F7', '#DB2777']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={[
          styles.headerGradient,
          {paddingTop: insets.top + 10},
        ]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
            style={styles.headerIconBtn}>
            <Feather name="arrow-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Quản lý video</Text>
            <Text style={styles.headerSubtitle}>Danh sách video và thêm nội dung mới</Text>
          </View>
          <View style={styles.headerRightSpacer} />
        </View>
      </LinearGradient>

      <View style={styles.tabBarOuter}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, videoTab === 'list' && styles.tabBtnActive]}
            onPress={() => setVideoTab('list')}
            activeOpacity={0.85}>
            <Feather
              name="list"
              size={18}
              color={videoTab === 'list' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[
                styles.tabBtnLabel,
                videoTab === 'list' && styles.tabBtnLabelActive,
              ]}>
              Danh sách
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, videoTab === 'add' && styles.tabBtnActive]}
            onPress={() => {
              setEditingVideoKey(null);
              setForm(EMPTY_FORM);
              setGeneratedVideoWords([]);
              setVideoTab('add');
            }}
            activeOpacity={0.85}>
            <Feather
              name="plus-circle"
              size={18}
              color={videoTab === 'add' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[
                styles.tabBtnLabel,
                videoTab === 'add' && styles.tabBtnLabelActive,
              ]}>
              Thêm mới
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {videoTab === 'list' ? (
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
            <Text style={styles.cardTitle}>Danh sách video ({videos.length})</Text>
            {videos.length === 0 ? (
              <Text style={styles.listEmptyText}>
                Chưa có video nào. Chuyển sang tab «Thêm mới» để tải video lên.
              </Text>
            ) : (
              <View style={styles.videoList}>
                {videos.map((v) => {
                  const thumbUrl = String(v?.thumbnailUrl || '').trim();
                  const emoji = String(v?.thumbnail || '📹').trim() || '📹';
                  const subN = Array.isArray(v.subtitles) ? v.subtitles.length : 0;
                  const vwN = Array.isArray(v.videoWords) ? v.videoWords.length : 0;
                  const desc = String(v.description || '').trim();
                  return (
                    <View key={String(v.id)} style={styles.videoListCard}>
                      <TouchableOpacity
                        style={styles.videoListRowTop}
                        activeOpacity={0.88}
                        onPress={() => onOpenVideoDetail(v)}>
                        <View style={styles.videoListThumb}>
                          {thumbUrl ? (
                            <Image
                              source={{uri: thumbUrl}}
                              style={styles.videoListThumbImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.videoListThumbEmoji}>{emoji}</Text>
                          )}
                        </View>
                        <View style={styles.videoListMeta}>
                          <Text style={styles.videoListTitle} numberOfLines={2}>
                            {v.title || '—'}
                          </Text>
                          <Text style={styles.videoListSub} numberOfLines={1}>
                            {String(v.duration || '—').trim() || '—'} ·{' '}
                            {String(v.views ?? '0')} lượt xem
                          </Text>
                          <View style={styles.videoListChips}>
                            {v.level != null && String(v.level).trim() !== '' ? (
                              <View style={styles.videoListChip}>
                                <Feather name="layers" size={11} color="#7C3AED" />
                                <Text style={styles.videoListChipText}>
                                  Cấp {String(v.level)}
                                </Text>
                              </View>
                            ) : null}
                            <View style={styles.videoListChip}>
                              <Feather name="align-left" size={11} color="#6366F1" />
                              <Text style={styles.videoListChipText}>
                                {subN} phụ đề
                              </Text>
                            </View>
                            <View style={styles.videoListChip}>
                              <Feather name="book-open" size={11} color="#6366F1" />
                              <Text style={styles.videoListChipText}>{vwN} từ</Text>
                            </View>
                          </View>
                          {desc ? (
                            <Text style={styles.videoListDesc} numberOfLines={2}>
                              {desc}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                      <View style={styles.videoListActions}>
                        <TouchableOpacity
                          style={[styles.videoListActionPill, styles.videoListActionPillEdit]}
                          onPress={() => onOpenVideoEdit(v)}
                          activeOpacity={0.88}>
                          <Text style={styles.videoListActionPillEditText}>Sửa</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.videoListActionPill, styles.videoListActionPillDel]}
                          onPress={() => onDeleteVideo(v)}
                          activeOpacity={0.88}>
                          <Text style={styles.videoListActionPillDelText}>Xóa</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {editingVideoKey ? 'Sửa video' : 'Thêm video mới'}
            </Text>

            <TouchableOpacity
            style={styles.cloudinaryBtn}
            onPress={onPickUploadCloudinary}
            disabled={uploadingCloudinary || saving}>
            {uploadingCloudinary ? (
              <View style={styles.cloudinaryRow}>
                <ActivityIndicator color={COLORS.PRIMARY_DARK} />
                <Text style={styles.cloudinaryBtnText}>Đang upload...</Text>
              </View>
            ) : (
              <Text style={styles.cloudinaryBtnText}>Chọn video từ máy</Text>
            )}
          </TouchableOpacity>

          <FieldLabel required>Tiêu đề video</FieldLabel>
          <TextInput
            style={styles.input}
            placeholder="Tiêu đề hiển thị trong app"
            placeholderTextColor="#9CA3AF"
            value={form.title}
            onChangeText={(v) => onChange('title', v)}
          />

          <FieldLabel>Mô tả</FieldLabel>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Mô tả nội dung video..."
            placeholderTextColor="#9CA3AF"
            value={form.description}
            onChangeText={(v) => onChange('description', v)}
            multiline
            textAlignVertical="top"
          />

          <FieldLabel>Thời lượng</FieldLabel>
          <View style={styles.durationInfo}>
            <Text style={styles.durationInfoText}>{durationDisplay}</Text>
          </View>

          {String(form.videoUrl || '').trim() ? (
            <View style={styles.previewWrap}>
              <Text style={styles.previewTitle}>Video đã chọn</Text>
              <View style={styles.previewPlayerBox}>
                <Video
                  source={{uri: String(form.videoUrl).trim()}}
                  style={styles.previewVideo}
                  resizeMode="contain"
                  paused
                  controls
                />
              </View>
            </View>
          ) : null}

          <FieldLabel>Phụ đề</FieldLabel>
          {autoSubtitling ? (
            <View style={styles.autoSubtitleRowInline}>
              <ActivityIndicator color={COLORS.PRIMARY_DARK} />
              <Text style={styles.autoSubtitleInlineText}>Đang tự tạo phụ đề MP4...</Text>
            </View>
          ) : null}
          {subtitlePreviewItems.length > 0 ? (
            <View style={styles.subtitlePreviewBox}>
              <Text style={styles.subtitlePreviewTitle}>
                Phụ đề ({subtitlePreviewItems.length} dòng)
              </Text>
              {subtitlePreviewItems.map((row, idx) => (
                <View key={`subtitle-preview-${idx}`} style={styles.subtitlePreviewRow}>
                  <TextInput
                    style={styles.subtitleTimeInput}
                    value={String(row.time || '')}
                    onChangeText={(v) => updateSubtitleItem(idx, 'time', v)}
                    placeholder="00:00"
                    placeholderTextColor="#94A3B8"
                  />
                  <TextInput
                    style={styles.subtitleLineInput}
                    value={String(row.text || '')}
                    onChangeText={(v) => updateSubtitleItem(idx, 'text', v)}
                    placeholder="Nội dung phụ đề"
                    placeholderTextColor="#94A3B8"
                    multiline
                  />
                </View>
              ))}
            </View>
          ) : !autoSubtitling ? (
            <View style={styles.subtitleEmptyBox} />
          ) : null}

          <FieldLabel>Từ vựng từ phụ đề</FieldLabel>
          <TouchableOpacity
            style={styles.generateWordsBtn}
            onPress={onGenerateWordsFromSubtitles}
            disabled={autoSubtitling || saving || uploadingCloudinary}
            activeOpacity={0.9}>
            <Feather name="list" size={14} color="#1E40AF" />
            <Text style={styles.generateWordsBtnText}>Tạo từ vựng từ phụ đề</Text>
          </TouchableOpacity>
          {generatedVideoWords.length > 0 ? (
            <View style={styles.generatedWordsBox}>
              {generatedVideoWords.map((row, idx) => (
                <View key={`gen-word-${idx}`} style={styles.generatedWordItem}>
                  <View style={styles.generatedWordHead}>
                    <Text style={styles.generatedWordItemTitle}>Mục {idx + 1}</Text>
                    <TouchableOpacity
                      onPress={() => removeGeneratedWordItem(idx)}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Feather name="trash-2" size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.generatedFieldLabel}>Tiếng Anh</Text>
                  <TextInput
                    style={styles.generatedWordInput}
                    value={String(row.word || '')}
                    onChangeText={(v) => updateGeneratedWordItem(idx, 'word', v)}
                    placeholder="Tiếng Anh"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.generatedFieldLabel}>Nghĩa tiếng Việt</Text>
                  <TextInput
                    style={styles.generatedWordInput}
                    value={String(row.meaning || '')}
                    onChangeText={(v) => updateGeneratedWordItem(idx, 'meaning', v)}
                    placeholder="Nghĩa tiếng Việt"
                    placeholderTextColor="#94A3B8"
                  />
                  <View style={styles.generatedRow2Col}>
                    <View style={styles.generatedCol}>
                      <Text style={styles.generatedFieldLabel}>Phiên âm</Text>
                      <TextInput
                        style={styles.generatedWordInput}
                        value={String(row.pronunciation || '')}
                        onChangeText={(v) => updateGeneratedWordItem(idx, 'pronunciation', v)}
                        placeholder="/ˈhæpi/"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={styles.generatedCol}>
                      <Text style={styles.generatedFieldLabel}>Loại từ</Text>
                      <TextInput
                        style={styles.generatedWordInput}
                        value={String(row.partOfSpeechVi || '')}
                        onChangeText={(v) => updateGeneratedWordItem(idx, 'partOfSpeechVi', v)}
                        placeholder="Danh từ"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addGeneratedWordBtn} onPress={addGeneratedWordItem}>
                <Feather name="plus" size={14} color="#1E40AF" />
                <Text style={styles.addGeneratedWordBtnText}>Thêm mục</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.subtitleEmptyBox} />
          )}

          <TouchableOpacity
            style={styles.submitVideoBtn}
            onPress={onAdd}
            disabled={saving || uploadingCloudinary || autoSubtitling}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitVideoBtnText}>
                {editingVideoKey ? 'Lưu thay đổi' : 'Thêm video'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        </ScrollView>
      )}

      <Modal
        visible={detailVideo != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailVideo(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chi tiết video</Text>
              <TouchableOpacity
                onPress={() => setDetailVideo(null)}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <Feather name="x" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            {detailVideo ? (
              <ScrollView
                style={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <Text style={styles.modalVideoTitle} numberOfLines={3}>
                  {detailVideo.title || '—'}
                </Text>
                <View style={styles.modalStatRow}>
                  <View style={styles.modalStatChip}>
                    <Feather name="clock" size={14} color="#7C3AED" />
                    <Text style={styles.modalStatChipText}>
                      {String(detailVideo.duration || '—').trim() || '—'}
                    </Text>
                  </View>
                  <View style={styles.modalStatChip}>
                    <Feather name="eye" size={14} color="#7C3AED" />
                    <Text style={styles.modalStatChipText}>
                      {String(detailVideo.views ?? '0')} lượt xem
                    </Text>
                  </View>
                  {detailVideo.level != null &&
                  String(detailVideo.level).trim() !== '' ? (
                    <View style={styles.modalStatChip}>
                      <Feather name="layers" size={14} color="#7C3AED" />
                      <Text style={styles.modalStatChipText}>
                        Cấp {String(detailVideo.level)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.modalStatRow}>
                  <View style={styles.modalStatChipMuted}>
                    <Feather name="align-left" size={13} color="#6B7280" />
                    <Text style={styles.modalStatChipMutedText}>
                      {Array.isArray(detailVideo.subtitles)
                        ? detailVideo.subtitles.length
                        : 0}{' '}
                      dòng phụ đề
                    </Text>
                  </View>
                  <View style={styles.modalStatChipMuted}>
                    <Feather name="book-open" size={13} color="#6B7280" />
                    <Text style={styles.modalStatChipMutedText}>
                      {Array.isArray(detailVideo.videoWords)
                        ? detailVideo.videoWords.length
                        : 0}{' '}
                      từ gắn video
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalSectionLabel}>Mô tả</Text>
                <View style={styles.modalContentBox}>
                  <Text style={styles.modalBodyText}>
                    {String(detailVideo.description || '').trim() || '—'}
                  </Text>
                </View>
                <Text style={styles.modalSectionLabel}>URL video (MP4)</Text>
                <View style={styles.modalUrlBox}>
                  <Feather name="link" size={14} color="#2563EB" />
                  <Text style={styles.modalUrl} selectable>
                    {String(detailVideo.videoUrl || '')}
                  </Text>
                </View>
                {String(detailVideo.cloudinaryPublicId || '').trim() ? (
                  <>
                    <Text style={styles.modalSectionLabel}>Cloudinary</Text>
                    <View style={styles.modalCodeBox}>
                      <Text
                        style={styles.modalCodeText}
                        selectable
                        numberOfLines={3}>
                        {String(detailVideo.cloudinaryPublicId)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            ) : null}
            {detailVideo ? (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalFooterBtnEdit]}
                  onPress={() => {
                    const v = detailVideo;
                    setDetailVideo(null);
                    onOpenVideoEdit(v);
                  }}
                  activeOpacity={0.88}>
                  <Text style={styles.modalFooterBtnEditText}>Sửa</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalFooterBtnDel]}
                  onPress={() => onDeleteVideo(detailVideo)}
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
  hiddenProbe: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    left: -200,
    top: -200,
  },
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 14,
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
  submitVideoBtn: {
    marginTop: 4,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitVideoBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  durationInfo: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  durationInfoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    flex: 1,
  },
  previewWrap: {
    marginTop: -2,
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  previewPlayerBox: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#111827',
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
    marginBottom: 14,
  },
  listEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  videoList: {},
  videoListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
  },
  videoListRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  videoListThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoListThumbImg: {
    width: 52,
    height: 52,
  },
  videoListThumbEmoji: {
    fontSize: 26,
  },
  videoListMeta: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  videoListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  videoListSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  videoListChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  videoListChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  videoListChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  videoListDesc: {
    marginTop: 6,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  videoListActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  videoListActionPill: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoListActionPillEdit: {
    backgroundColor: '#7C3AED',
    shadowColor: '#5B21B6',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  videoListActionPillEditText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  videoListActionPillDel: {
    backgroundColor: '#DC2626',
    shadowColor: '#991B1B',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  videoListActionPillDelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
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
  modalVideoTitle: {
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
  },
  modalStatChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
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
  },
  modalContentBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalUrlBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  modalCodeBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalCodeText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
    ...Platform.select({
      ios: {fontFamily: 'Menlo'},
      android: {fontFamily: 'monospace'},
      default: {},
    }),
  },
  modalSectionLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.4,
  },
  modalBodyText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 21,
  },
  modalUrl: {
    flex: 1,
    fontSize: 12,
    color: '#2563EB',
    lineHeight: 18,
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
  cloudinaryBtn: {
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    alignItems: 'center',
  },
  cloudinaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cloudinaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5B21B6',
  },
  subtitleHint: {
    marginTop: -6,
    marginBottom: 12,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  subtitlePreviewBox: {
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 7,
  },
  subtitlePreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  subtitlePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitleTimeInput: {
    minWidth: 54,
    maxWidth: 70,
    borderRadius: 7,
    backgroundColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  subtitleLineInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  subtitleEmptyBox: {
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  autoSubtitleRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: -2,
  },
  autoSubtitleInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  generateWordsBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  generateWordsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  generatedWordsBox: {
    marginTop: -2,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  generatedWordItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    gap: 5,
  },
  generatedWordItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  generatedWordHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  generatedFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  generatedWordInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
  },
  generatedRow2Col: {
    flexDirection: 'row',
    gap: 8,
  },
  generatedCol: {
    flex: 1,
    gap: 5,
  },
  addGeneratedWordBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  addGeneratedWordBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
});
