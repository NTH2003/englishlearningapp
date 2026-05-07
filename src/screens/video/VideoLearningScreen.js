import React, {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Linking,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Modal,
  StatusBar,
  BackHandler,
  DeviceEventEmitter,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Video from 'react-native-video';
import {WebView} from 'react-native-webview';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {
  loadVocabularyFromFirebase,
  getVideoWordsListForVideo,
  markWordAsLearned,
  markWordsLearnedBatch,
  getVideoWordsLearnedMap,
  buildVideoTokenMeaningLookup,
  lookupVideoSubtitleToken,
} from '../../services/vocabularyService';
import {saveContinueLearning, CONTINUE_KIND} from '../../services/continueLearning';
import {
  completeVideoAndAwardXP,
  incrementVideoViewCount,
  awardXPIfFirst,
  setVideoNeedsPractice,
} from '../../services/storageService';
import {XP} from '../../services/levelService';
import {
  LEARNING_PROGRESS_UPDATED,
} from '../../services/learningProgressEvents';
import {translateEnglishToVietnamese} from '../../services/quickTranslate';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const VIDEO_WIDTH = SCREEN_WIDTH - 24;
const VIDEO_HEIGHT = VIDEO_WIDTH * 0.5625;
const RATES = [0.75, 1, 1.25, 1.5];

/**
 * Surface video tách riêng để tránh re-render player khi UI (caption/seekbar) cập nhật thời gian.
 * Điều này giúp giảm nhấp nháy trên Android.
 */
const Mp4VideoSurface = React.memo(
  React.forwardRef(function Mp4VideoSurface(
    {
      source,
      style,
      paused,
      muted,
      rate,
      onLoad,
      onProgress,
      onEnd,
      onError,
    },
    ref,
  ) {
    return (
      <Video
        ref={ref}
        source={source}
        style={style}
        controls={false}
        paused={paused}
        muted={muted}
        rate={rate}
        resizeMode="contain"
        hideShutterView
        useTextureView
        progressUpdateInterval={250}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
        onLoad={onLoad}
        onProgress={onProgress}
        onEnd={onEnd}
        onError={onError}
      />
    );
  }),
);

function isYouTubeUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const u = uri.trim().toLowerCase();
  return (
    u.includes('youtube.com/watch') ||
    u.includes('youtube.com/shorts/') ||
    u.includes('m.youtube.com/shorts/') ||
    u.includes('youtu.be/') ||
    u.includes('youtube.com/embed') ||
    u.includes('m.youtube.com/')
  );
}

function normalizeOpenUrl(uri) {
  const s = String(uri || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function extractYoutubeId(rawUrl) {
  const href = normalizeOpenUrl(rawUrl);
  if (!href) return '';
  try {
    const u = new URL(href);
    const host = String(u.hostname || '').toLowerCase();
    const parts = String(u.pathname || '')
      .split('/')
      .filter(Boolean);
    if (host.includes('youtu.be') && parts[0]) return parts[0];
    if (host.includes('youtube.com') || host.includes('m.youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch (_) {}
  return '';
}

function buildYoutubeEmbedUrl(videoId, secondsTotal = 0) {
  const id = String(videoId || '').trim();
  if (!id) return '';
  const start = Math.max(0, Math.floor(Number(secondsTotal) || 0));
  const params = new URLSearchParams({
    playsinline: '1',
    controls: '1',
    rel: '0',
    modestbranding: '1',
    fs: '1',
    start: String(start),
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function buildYoutubeEmbedHtml(embedUrl) {
  const safeUrl = String(embedUrl || '').replace(/"/g, '&quot;');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
        overflow: hidden;
      }
      .wrap {
        position: fixed;
        inset: 0;
        background: #000;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <iframe
        src="${safeUrl}"
        title="YouTube player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  </body>
</html>`;
}

/** Mở YouTube/YouTube app đúng mốc thời gian (giây). Embed dùng `start=`, còn lại dùng `t=`. */
function buildYoutubeUrlAtSeconds(rawUrl, secondsTotal) {
  const href = normalizeOpenUrl(rawUrl);
  if (!href) return '';
  const s = Math.max(0, Math.floor(Number(secondsTotal) || 0));
  try {
    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    if (path.includes('/embed/')) {
      u.searchParams.set('start', String(s));
    } else {
      u.searchParams.set('t', String(s));
    }
    return u.toString();
  } catch {
    const sep = href.includes('?') ? '&' : '?';
    if (href.toLowerCase().includes('/embed/')) {
      return `${href}${sep}start=${s}`;
    }
    return `${href}${sep}t=${s}`;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Tách phụ đề thành khoảng trắng / từ tiếng Anh để chạm xem nghĩa. */
function splitSubtitleIntoTouchableParts(text) {
  const s = String(text ?? '');
  const parts = [];
  const re = /(\s+)|([A-Za-z]+(?:'[A-Za-z]+)?)/g;
  let m;
  let last = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      parts.push({type: 'text', value: s.slice(last, m.index)});
    }
    if (m[1]) {
      parts.push({type: 'text', value: m[1]});
    } else if (m[2]) {
      parts.push({type: 'word', value: m[2]});
    }
    last = re.lastIndex;
  }
  if (last < s.length) {
    parts.push({type: 'text', value: s.slice(last)});
  }
  return parts;
}

function parseSubTime(str) {
  const parts = String(str || '')
    .trim()
    .split(':')
    .map((x) => parseInt(x, 10));
  if (parts.some((n) => !Number.isFinite(n))) {
    return 0;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function friendlyPlaybackError(err) {
  if (err == null) {
    return 'Không thể phát video. Kiểm tra URL (.mp4 / HTTPS).';
  }
  const inner = err.error != null ? err.error : err;
  const code = inner?.errorCode ?? inner?.code ?? inner?.error?.code;
  const msg = String(
    inner?.localizedDescription ?? inner?.message ?? inner?.errorString ?? '',
  ).trim();
  const blob = `${msg} ${code ?? ''}`.toUpperCase();

  if (
    blob.includes('BAD_HTTP') ||
    blob.includes('IO_BAD_HTTP') ||
    blob.includes('ERROR_CODE_IO_BAD_HTTP')
  ) {
    return 'Không tải được video: link hết hạn, bị chặn hoặc máy chủ trả lỗi. Hãy dùng URL .mp4 hợp lệ hoặc upload lại trong admin.';
  }
  if (blob.includes('403') || blob.includes('404')) {
    return 'Link video không tồn tại hoặc không cho phép xem. Kiểm tra lại URL.';
  }

  const looksTechnical =
    /exo|error_code|android\.media|mediaplayer|source error|playbackexception/i.test(
      msg,
    );
  if (looksTechnical) {
    return 'Không phát được video. Kiểm tra URL .mp4 (HTTPS), mạng và quyền truy cập file.';
  }

  if (msg.length > 0 && msg.length < 160 && !msg.startsWith('{')) {
    return msg;
  }
  if (code != null && code !== '') {
    return `Không phát được (mã ${code}). Thử link file .mp4 trực tiếp.`;
  }
  return 'Không phát được video. Dùng file .mp4/HTTPS hoặc mở YouTube bằng nút “Mở YouTube”.';
}

function posLabel(word) {
  if (word.partOfSpeech) {
    return String(word.partOfSpeech);
  }
  if (word.partOfSpeechVi) {
    return String(word.partOfSpeechVi);
  }
  return 'Danh từ';
}

const VideoLearningScreen = ({route, navigation}) => {
  const {video} = route.params || {};
  const videoRef = useRef(null);
  const translateRequestRef = useRef(0);
  const seekBarWidth = useRef(1);
  const currentTimeRef = useRef(0);
  const lastProgressUiUpdateRef = useRef(0);
  const insets = useSafeAreaInsets();

  const [paused, setPaused] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rateIndex, setRateIndex] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [ccEnabled, setCcEnabled] = useState(true);
  /** Sau khi đã bấm play ít nhất một lần: cho phép hiện phụ đề khi tạm dừng giữa chừng. */
  const [playbackEverStarted, setPlaybackEverStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVideoDoneModal, setShowVideoDoneModal] = useState(false);
  const [showNextActionModal, setShowNextActionModal] = useState(false);
  const [videoComprehension, setVideoComprehension] = useState(null);
  /** id từ video -> đã biết (gồm cả trùng từ chủ đề đã học) */
  const [learnedMap, setLearnedMap] = useState({});
  const learnedMapRef = useRef(learnedMap);
  useEffect(() => {
    learnedMapRef.current = learnedMap;
  }, [learnedMap]);

  const playUrl = video?.videoUrl ? String(video.videoUrl).trim() : '';
  const isYoutube = playUrl.length > 0 && isYouTubeUrl(playUrl);
  const youtubeVideoId = useMemo(() => extractYoutubeId(playUrl), [playUrl]);
  const [youtubeSeekSeconds, setYoutubeSeekSeconds] = useState(0);
  const youtubeEmbedUrl = useMemo(
    () => buildYoutubeEmbedUrl(youtubeVideoId, youtubeSeekSeconds),
    [youtubeVideoId, youtubeSeekSeconds],
  );
  const youtubeEmbedHtml = useMemo(
    () => buildYoutubeEmbedHtml(youtubeEmbedUrl),
    [youtubeEmbedUrl],
  );
  const mp4Source = useMemo(() => ({uri: playUrl}), [playUrl]);
  const youtubeHtmlSource = useMemo(
    () => ({html: youtubeEmbedHtml}),
    [youtubeEmbedHtml],
  );
  const subtitles = Array.isArray(video?.subtitles) ? video.subtitles : [];
  const hasSubtitles = subtitles.length > 0;

  const videoStableKey = video?.id != null ? String(video.id) : playUrl;

  useEffect(() => {
    setPlaybackEverStarted(false);
  }, [videoStableKey]);

  useEffect(() => {
    if (!paused) {
      setPlaybackEverStarted(true);
    }
  }, [paused]);

  const videoWordsList = useMemo(() => {
    if (!video) {
      return [];
    }
    return getVideoWordsListForVideo(video);
  }, [video]);

  const [tokenLookupTick, setTokenLookupTick] = useState(0);
  const tokenLookup = useMemo(
    () => buildVideoTokenMeaningLookup(video),
    [video, tokenLookupTick],
  );

  const [wordPeek, setWordPeek] = useState(null);

  const refreshVideoWordsLearnedMap = useCallback(async () => {
    await loadVocabularyFromFirebase();
    const m = await getVideoWordsLearnedMap(videoWordsList);
    setLearnedMap(m);
  }, [videoWordsList]);

  useFocusEffect(
    useCallback(() => {
      if (video?.id != null) {
        void saveContinueLearning({
          kind: CONTINUE_KIND.VIDEO,
          videoId: String(video.id),
          videoTitle: String(video.title || '').slice(0, 160),
        });
      }
      let cancelled = false;
      void (async () => {
        await loadVocabularyFromFirebase();
        const m = await getVideoWordsLearnedMap(videoWordsList);
        if (!cancelled) {
          setLearnedMap(m);
          setTokenLookupTick((x) => x + 1);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [video?.id, video?.title, videoWordsList]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      void refreshVideoWordsLearnedMap();
    });
    return () => sub.remove();
  }, [refreshVideoWordsLearnedMap]);

  const subtitleTimeline = useMemo(() => {
    if (!hasSubtitles || !Array.isArray(subtitles)) {
      return [];
    }
    return subtitles
      .map((s) => ({
        t: parseSubTime(s.time),
        text: String(s.text || '').trim(),
      }))
      .filter((row) => row.text.length > 0)
      .sort((a, b) => a.t - b.t);
  }, [hasSubtitles, subtitles]);

  const subtitlePlaybackSync = useMemo(() => {
    if (!ccEnabled || subtitleTimeline.length === 0) {
      return {lineText: '', activeTime: null};
    }
    const t = currentTime;
    let lo = 0;
    let hi = subtitleTimeline.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (subtitleTimeline[mid].t <= t) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) {
      return {lineText: '', activeTime: null};
    }
    const row = subtitleTimeline[best];
    return {lineText: row.text, activeTime: row.t};
  }, [ccEnabled, subtitleTimeline, currentTime]);

  const currentCaption = subtitlePlaybackSync.lineText;

  const onSubtitleWordPress = useCallback(
    (token, contextLine) => {
      const hit = lookupVideoSubtitleToken(tokenLookup, token);
      if (hit) {
        setWordPeek({
          display: hit.display,
          meaning: hit.meaning,
          id: hit.id,
          source: hit.source,
          contextLine: contextLine || '',
          partOfSpeechVi: hit.partOfSpeechVi || '',
          loadingTranslation: false,
        });
        return;
      }
      const disp = String(token || '').trim();
      if (!disp) {
        return;
      }
      const seq = ++translateRequestRef.current;
      setWordPeek({
        display: disp,
        meaning: '',
        id: null,
        source: 'translate',
        contextLine: contextLine || '',
        partOfSpeechVi: '',
        loadingTranslation: true,
      });
      void (async () => {
        const vi = (await translateEnglishToVietnamese(disp)).trim();
        if (translateRequestRef.current !== seq) {
          return;
        }
        setWordPeek({
          display: disp,
          meaning:
            vi ||
            'Chưa dịch được. Kiểm tra mạng hoặc thử lại sau.',
          id: null,
          source: 'translate',
          contextLine: contextLine || '',
          partOfSpeechVi: '',
          loadingTranslation: false,
        });
      })();
    },
    [tokenLookup],
  );

  const playbackRate = RATES[rateIndex];

  useEffect(() => {
    setPlaybackError(null);
    if (playUrl && isYouTubeUrl(playUrl)) {
      setIsLoading(false);
    } else if (playUrl) {
      setIsLoading(true);
    }
  }, [playUrl]);

  useEffect(() => {
    setYoutubeSeekSeconds(0);
  }, [youtubeVideoId]);

  useEffect(() => {
    if (video?.id != null) {
      incrementVideoViewCount(video.id);
    }
  }, [video?.id]);

  useEffect(() => {
    if (paused || !showControls) {
      return;
    }
    const t = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(t);
  }, [paused, showControls]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    StatusBar.setHidden(isFullscreen);
    return () => {
      StatusBar.setHidden(false);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [isFullscreen]);

  const handleVideoLoad = useCallback((data) => {
    setIsLoading(false);
    if (data?.duration && Number.isFinite(data.duration)) {
      setDuration(data.duration);
    }
    const t = currentTimeRef.current;
    if (t > 0.05) {
      videoRef.current?.seek(t);
    }
  }, []);

  const handleVideoProgress = useCallback(({currentTime: ct}) => {
    const next = Number(ct) || 0;
    currentTimeRef.current = next;
    const now = Date.now();
    // Hạn chế setState quá dày gây nhấp nháy trên một số máy Android.
    if (now - lastProgressUiUpdateRef.current < 320) {
      return;
    }
    lastProgressUiUpdateRef.current = now;
    setCurrentTime((prev) => (Math.abs(prev - next) < 0.15 ? prev : next));
  }, []);

  const handleVideoError = useCallback((error) => {
    if (__DEV__) {
      console.warn('[Video playback]', friendlyPlaybackError(error));
    }
    setPlaybackError(friendlyPlaybackError(error));
    setIsLoading(false);
  }, []);

  const toggleWordLearned = useCallback(async (w) => {
    if (w?.id == null) return;
    const sid = String(w.id);
    const nextVal = !(learnedMapRef.current[sid] === true);
    setLearnedMap((prev) => ({...prev, [sid]: nextVal}));
    await markWordAsLearned(w.id, nextVal);
    if (nextVal && video?.id != null) {
      void awardXPIfFirst(
        `video_word_interaction_${String(video.id)}_${sid}`,
        XP.VIDEO_WORD_INTERACTION,
      );
    }
  }, [video?.id]);

  const markVideoWatchedNow = useCallback(() => {
    if (video?.id != null) {
      void completeVideoAndAwardXP(video.id, XP.VIDEO_WATCH_COMPLETE);
    }
  }, [video?.id]);

  const handleVideoEnd = useCallback(() => {
    setPaused(true);
    setShowControls(true);
    markVideoWatchedNow();
    if (!videoWordsList.length) {
      return;
    }
    setShowVideoDoneModal(true);
  }, [markVideoWatchedNow, videoWordsList]);

  const handleBack = () => {
    navigation.goBack();
  };

  const practiceTopicMeta = useMemo(() => {
    const vid = video?.id;
    const title = String(video?.title ?? 'Video').trim() || 'Video';
    const shortTitle = title.length > 42 ? `${title.slice(0, 40)}…` : title;
    return {
      id: `video_vocab_${vid ?? 0}`,
      name: `Từ video: ${shortTitle}`,
      icon: '📹',
      color: '#7C3AED',
      description: '',
    };
  }, [video?.id, video?.title]);

  const vocabNavParams = useMemo(
    () => ({
      words: videoWordsList,
      topicId: practiceTopicMeta.id,
      topicName: practiceTopicMeta.name,
      topic: practiceTopicMeta,
    }),
    [videoWordsList, practiceTopicMeta],
  );

  const navigateToVocabularyTab = useCallback(
    (screen, params) => {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.navigate('VocabularyTab', {screen, params});
      }
    },
    [navigation],
  );

  const openVideoPracticeLikeTopic = useCallback(() => {
    if (!videoWordsList.length) {
      Alert.alert(
        'Chưa có từ để luyện',
        'Video này chưa có từ vựng phù hợp để tạo phần luyện tập.',
      );
      return;
    }
    if (video?.id != null) {
      void awardXPIfFirst(
        `video_practice_start_${String(video.id)}`,
        XP.VIDEO_PRACTICE_START,
      );
    }
    navigateToVocabularyTab('VocabularyTopicDetail', {
      ...vocabNavParams,
      topicName: `Từ vựng video: ${String(video?.title || '').trim() || 'Video'}`,
    });
  }, [
    navigateToVocabularyTab,
    video?.id,
    video?.title,
    videoWordsList.length,
    vocabNavParams,
  ]);

  const goToHomeTab = useCallback(() => {
    const parent = navigation.getParent?.();
    // Reset stack Video trước khi đổi tab để lần sau vào Video luôn về danh sách.
    navigation.popToTop();
    if (parent) {
      parent.navigate('HomeTab');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const handleVideoNotUnderstood = useCallback(() => {
    setShowVideoDoneModal(false);
    setVideoComprehension('not_understood');
    setShowNextActionModal(true);
    void (async () => {
      if (video?.id != null) {
        await setVideoNeedsPractice(video.id, true);
      }
    })();
  }, [video?.id]);

  const handleVideoUnderstood = useCallback(() => {
    setShowVideoDoneModal(false);
    setVideoComprehension('understood');
    setShowNextActionModal(true);
    void (async () => {
      try {
        const batchIds = videoWordsList.map((w) => w?.id).filter((id) => id != null);
        if (batchIds.length) {
          await markWordsLearnedBatch(batchIds, true);
        }
        if (video?.id != null) {
          await setVideoNeedsPractice(video.id, false);
        }
        setLearnedMap((prev) => {
          const next = {...prev};
          for (const w of videoWordsList) {
            if (w?.id != null) {
              next[String(w.id)] = true;
            }
          }
          return next;
        });
      } catch (e) {
        Alert.alert('Lỗi', 'Không lưu được tiến độ. Kiểm tra mạng và thử lại.');
      }
    })();
  }, [video?.id, videoWordsList]);

  const seekToSubtitleTime = useCallback(
    (timeStr) => {
      if (!playUrl) {
        return;
      }
      const sec = parseSubTime(timeStr);
      if (isYoutube) {
        setYoutubeSeekSeconds(sec);
        return;
      }
      videoRef.current?.seek(sec);
      lastProgressUiUpdateRef.current = Date.now();
      setCurrentTime(sec);
      setPaused(false);
      setShowControls(true);
    },
    [isYoutube, playUrl],
  );

  const cycleRate = useCallback(() => {
    setRateIndex((i) => (i + 1) % RATES.length);
  }, []);

  const onSeekGrant = useCallback(
    (evt) => {
      const w = seekBarWidth.current || 1;
      const x = evt.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, x / w));
      const d = duration > 0 ? duration : 0;
      if (d > 0) {
        const t = ratio * d;
        videoRef.current?.seek(t);
        lastProgressUiUpdateRef.current = Date.now();
        setCurrentTime(t);
      }
    },
    [duration],
  );

  const endTimeLabel =
    duration > 0 ? formatTime(duration) : video?.duration || '00:00';
  const headerTopPad =
    Math.max(
      insets.top,
      Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
    ) + 8;

  if (!video) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Không tìm thấy video</Text>
          <TouchableOpacity style={styles.textLinkBtn} onPress={handleBack}>
            <Text style={styles.textLink}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const showBottomBar = paused || showControls;
  const showCenterPlay = paused && !isYoutube;

  function renderMp4Player(fullscreen) {
    const outerStyle = fullscreen ? styles.videoOuterFullscreen : styles.videoOuter;
    const videoStyle = fullscreen ? styles.videoFullscreen : styles.video;
    const renderCaptionOverlay = () => {
      if (
        !currentCaption ||
        !ccEnabled ||
        (paused && !playbackEverStarted)
      ) {
        return null;
      }
      const line = currentCaption;
      const parts = splitSubtitleIntoTouchableParts(line);
      return (
        <View
          style={[
            styles.captionWrap,
            styles.captionWrapElevated,
          ]}
          pointerEvents="box-none">
          <View style={styles.captionBubble} pointerEvents="auto">
            {parts.map((p, i) =>
              p.type === 'word' ? (
                <Pressable
                  key={`cw-${i}`}
                  style={styles.captionWordHit}
                  onPress={() => onSubtitleWordPress(p.value, line)}
                  hitSlop={{top: 6, bottom: 6, left: 3, right: 3}}>
                  <Text style={styles.captionWordText}>{p.value}</Text>
                </Pressable>
              ) : (
                <Text key={`ct-${i}`} style={styles.captionPlainText}>
                  {p.value}
                </Text>
              ),
            )}
          </View>
        </View>
      );
    };
    return (
      <View style={outerStyle}>
        <Mp4VideoSurface
          ref={videoRef}
          source={mp4Source}
          style={videoStyle}
          paused={paused}
          muted={muted}
          rate={playbackRate}
          onLoad={handleVideoLoad}
          onProgress={handleVideoProgress}
          onEnd={handleVideoEnd}
          onError={handleVideoError}
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text style={styles.loadingText}>Đang tải video...</Text>
          </View>
        )}
        {playbackError ? (
          <View style={styles.errorBannerOnVideo}>
            <Text style={styles.errorBannerText}>{playbackError}</Text>
          </View>
        ) : null}
        {showCenterPlay ? (
          <Pressable
            style={styles.centerPlayWrap}
            onPress={() => {
              setPaused(false);
              setShowControls(true);
            }}>
            <View style={styles.centerPlayCircle}>
              <Feather name="play" size={36} color="#FFF" style={{marginLeft: 4}} />
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={styles.tapReveal}
            onPress={() => setShowControls((v) => !v)}
          />
        )}
        {renderCaptionOverlay()}
        {showBottomBar ? (
          <View style={[styles.controlsBar, styles.controlsBarElevated]} pointerEvents="box-none">
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{endTimeLabel}</Text>
            </View>
            <View
              style={styles.seekTrack}
              onLayout={(e) => {
                seekBarWidth.current = e.nativeEvent.layout.width;
              }}
              onStartShouldSetResponder={() => true}
              onResponderRelease={onSeekGrant}>
              <View
                style={[
                  styles.seekFill,
                  {
                    width: `${
                      duration > 0
                        ? Math.min(100, (currentTime / duration) * 100)
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={styles.ctrlBtn}
                onPress={() => setPaused((p) => !p)}
                hitSlop={8}>
                <Feather
                  name={paused ? 'play' : 'pause'}
                  size={22}
                  color="#FFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctrlBtn}
                onPress={() => setMuted((m) => !m)}
                hitSlop={8}>
                <Feather
                  name={muted ? 'volume-x' : 'volume-2'}
                  size={22}
                  color="#FFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ccBtn, !hasSubtitles && styles.ccBtnDisabled]}
                disabled={!hasSubtitles}
                onPress={() => hasSubtitles && setCcEnabled((c) => !c)}
                activeOpacity={0.85}>
                <Text
                  style={[styles.ccBtnLabel, ccEnabled && styles.ccBtnLabelOn]}>
                  CC
                </Text>
              </TouchableOpacity>
              {!fullscreen ? (
                <TouchableOpacity
                  style={styles.ctrlBtn}
                  onPress={() => setIsFullscreen(true)}
                  hitSlop={8}
                  accessibilityLabel="Phóng to video">
                  <Feather name="maximize-2" size={22} color="#FFF" />
                </TouchableOpacity>
              ) : null}
              <View style={styles.ctrlSpacer} />
              <TouchableOpacity onPress={cycleRate} hitSlop={8}>
                <Text style={styles.speedText}>Tốc độ: {playbackRate}x</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <>
    <StatusBar
      barStyle="light-content"
      backgroundColor={COLORS.PRIMARY_DARK}
      translucent={Platform.OS === 'android'}
    />
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, {paddingTop: headerTopPad}]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={handleBack}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <Feather name="chevron-left" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {video.title}
          </Text>
        </View>
      </View>

      <View style={styles.videoCard}>
      <View style={styles.videoOuter}>
        {isYoutube ? (
          <View style={styles.youtubeFallback}>
            {youtubeEmbedUrl ? (
              <WebView
                source={youtubeHtmlSource}
                key={`yt-${youtubeVideoId}-${youtubeSeekSeconds}`}
                style={styles.youtubeWebView}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={(req) => {
                  const url = String(req?.url || '').toLowerCase();
                  // Chỉ giữ player của video hiện tại trong WebView, tránh điều hướng sang trang YouTube khác.
                  if (
                    url.startsWith('about:blank') ||
                    url.includes('youtube-nocookie.com/embed/') ||
                    url.includes('youtube.com/embed/')
                  ) {
                    return true;
                  }
                  return false;
                }}
                onError={() =>
                  setPlaybackError(
                    'Không tải được YouTube trong app. Kiểm tra mạng rồi thử lại.',
                  )
                }
              />
            ) : (
              <Text style={styles.youtubeHint}>
                Link YouTube chưa hợp lệ. Vui lòng kiểm tra lại URL video.
              </Text>
            )}
          </View>
        ) : isFullscreen ? (
          <TouchableOpacity
            style={styles.fullscreenPlaceholder}
            onPress={() => setIsFullscreen(false)}
            activeOpacity={0.88}
            accessibilityLabel="Thu nhỏ video">
            <Feather name="minimize-2" size={32} color="#FFF" />
            <Text style={styles.fullscreenPlaceholderTitle}>Đang phát toàn màn hình</Text>
            <Text style={styles.fullscreenPlaceholderHint}>Chạm để thu nhỏ</Text>
          </TouchableOpacity>
        ) : (
          renderMp4Player(false)
        )}
      </View>
      </View>
      <ScrollView
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}
        showsVerticalScrollIndicator={false}>
        <View>
            {hasSubtitles ? (
              <View style={styles.transcriptBlock}>
                <View style={styles.sectionHeadRow}>
                  <View style={styles.sectionTitleWithIcon}>
                    <View style={styles.sectionIconBubble}>
                      <Feather name="align-left" size={15} color={COLORS.PRIMARY_DARK} />
                    </View>
                    <Text style={styles.sectionTitle}>Phụ đề / script</Text>
                  </View>
                </View>
                {subtitles.map((line, idx) => {
                  const lineText = String(line?.text ?? '').trim();
                  const lineT = parseSubTime(line?.time);
                  const isSubActive =
                    subtitlePlaybackSync.activeTime != null &&
                    Math.abs(lineT - subtitlePlaybackSync.activeTime) < 0.05;
                  const parts = splitSubtitleIntoTouchableParts(lineText);
                  return (
                    <View
                      key={`sub-${idx}-${String(line?.time ?? '')}`}
                      style={[
                        styles.transcriptRow,
                        isSubActive && styles.transcriptRowActive,
                      ]}>
                      <TouchableOpacity
                        style={styles.transcriptSeekHit}
                        onPress={() => seekToSubtitleTime(line?.time)}
                        activeOpacity={0.65}
                        hitSlop={{top: 4, bottom: 4}}>
                        <Text style={styles.transcriptTime}>{String(line?.time ?? '').trim()}</Text>
                      </TouchableOpacity>
                      <View style={styles.transcriptTextWrap}>
                        {parts.map((p, j) =>
                          p.type === 'word' ? (
                            <Pressable
                              key={`tw-${idx}-${j}`}
                              style={styles.transcriptWordHit}
                              onPress={() => onSubtitleWordPress(p.value, lineText)}
                              hitSlop={2}>
                              <Text style={styles.transcriptWordText}>{p.value}</Text>
                            </Pressable>
                          ) : (
                            <Text key={`tt-${idx}-${j}`} style={styles.transcriptTextPlain}>
                              {p.value}
                            </Text>
                          ),
                        )}
                      </View>
                      {isYoutube ? (
                        <TouchableOpacity
                          onPress={() => seekToSubtitleTime(line?.time)}
                          hitSlop={8}
                          style={styles.transcriptLinkIcon}>
                          <Feather
                            name="external-link"
                            size={16}
                            color={COLORS.TEXT_LIGHT}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.videoWordsSectionHead}>
              <View style={[styles.sectionHeadRow, styles.sectionHeadRowDense]}>
                <View style={styles.sectionTitleWithIcon}>
                  <View style={styles.sectionIconBubble}>
                    <Feather name="book-open" size={15} color={COLORS.PRIMARY_DARK} />
                  </View>
                  <Text style={styles.sectionTitle}>Từ vựng trong video</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {videoWordsList.length} từ
                  </Text>
                </View>
              </View>
            </View>
            {videoWordsList.length === 0 ? (
              <Text style={styles.emptyTab}>
                Chưa có từ: thêm mô tả hoặc script (tiếng Anh) có chứa từ trong kho
                từ vựng, hoặc nhập danh sách <Text style={styles.inlineMono}>videoWords</Text>{' '}
                trên Firebase / admin. Nếu có nội dung tiếng Anh mà vẫn trống, hãy mở tab
                Từ vựng trước để app tải kho từ.
              </Text>
            ) : (
              videoWordsList.map((w) => {
                const learned = learnedMap[String(w.id)] === true;
                const partOfSpeech = posLabel(w);
                const showPartOfSpeech =
                  String(partOfSpeech || '').trim().toLowerCase() !== 'phụ đề';
                return (
                <View key={w.id} style={styles.wordCard}>
                  <View style={styles.wordTopRow}>
                    <View style={styles.wordTitleBlock}>
                      <Text style={styles.wordEn}>{w.word}</Text>
                      {showPartOfSpeech ? (
                        <View style={styles.posPill}>
                          <Text style={styles.posPillText}>{partOfSpeech}</Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.wordKnownChip,
                        learned && styles.wordKnownChipOn,
                      ]}
                      onPress={() => toggleWordLearned(w)}
                      activeOpacity={0.85}
                      hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
                      accessibilityLabel={
                        learned ? 'Đánh dấu chưa biết' : 'Đánh dấu đã biết'
                      }>
                      <Feather
                        name={learned ? 'check' : 'circle'}
                        size={13}
                        color={learned ? '#FFF' : COLORS.PRIMARY}
                      />
                      <Text
                        style={[
                          styles.wordKnownChipText,
                          learned && styles.wordKnownChipTextOn,
                        ]}>
                        {learned ? 'Đã biết' : 'Chưa'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.wordVi}>{w.meaning}</Text>
                  {String(w.pronunciation || '').trim() ? (
                    <Text style={styles.wordPronunciation}>{w.pronunciation}</Text>
                  ) : null}
                  {w.example ? (
                    <Text style={styles.wordExample}>
                      &ldquo;{w.example}&rdquo;
                    </Text>
                  ) : null}
                </View>
              );
              })
            )}
        </View>
      </ScrollView>
    </SafeAreaView>

    <Modal
      visible={wordPeek != null}
      transparent
      animationType="fade"
      onRequestClose={() => setWordPeek(null)}>
      <View style={[styles.wordPeekRoot, {paddingBottom: Math.max(24, insets.bottom + 12)}]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setWordPeek(null)}
          accessibilityRole="button"
          accessibilityLabel="Đóng"
        />
        <View style={styles.wordPeekCard}>
          <Text style={styles.wordPeekEn}>{wordPeek?.display}</Text>
          {String(wordPeek?.partOfSpeechVi || '').trim() ? (
            <Text style={styles.wordPeekPos}>{wordPeek.partOfSpeechVi}</Text>
          ) : null}
          {wordPeek?.loadingTranslation ? (
            <View style={styles.wordPeekTranslating}>
              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
              <Text style={styles.wordPeekTranslatingText}>Đang dịch…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.wordPeekVi}>{wordPeek?.meaning}</Text>
              {wordPeek?.source === 'translate' &&
              String(wordPeek?.meaning || '').trim() ? (
                <Text style={styles.wordPeekAutoNote}>Bản dịch tự động (EN → VI)</Text>
              ) : null}
            </>
          )}
          {String(wordPeek?.contextLine || '').trim() ? (
            <Text style={styles.wordPeekContext} numberOfLines={5}>
              Ngữ cảnh: {wordPeek.contextLine}
            </Text>
          ) : null}
          {wordPeek?.id != null ? (
            <TouchableOpacity
              style={styles.wordPeekLearnBtn}
              onPress={() => {
                void toggleWordLearned({
                  id: wordPeek.id,
                  word: wordPeek.display,
                });
                setWordPeek(null);
              }}
              activeOpacity={0.88}>
              <Feather
                name={
                  learnedMap[String(wordPeek.id)] === true ? 'rotate-ccw' : 'check-circle'
                }
                size={18}
                color="#FFF"
              />
              <Text style={styles.wordPeekLearnBtnText}>
                {learnedMap[String(wordPeek.id)] === true
                  ? 'Bỏ đánh dấu đã biết'
                  : 'Đánh dấu đã biết'}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.wordPeekClose}
            onPress={() => setWordPeek(null)}
            hitSlop={8}>
            <Text style={styles.wordPeekCloseText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {!isYoutube && playUrl ? (
      <Modal
        visible={isFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={[
          'portrait',
          'landscape',
          'landscape-left',
          'landscape-right',
        ]}
        onRequestClose={() => setIsFullscreen(false)}
        statusBarTranslucent>
        <View
          style={[
            styles.fullscreenRoot,
            {paddingTop: insets.top, paddingBottom: insets.bottom},
          ]}>
          <View style={styles.fullscreenTopBar}>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={() => setIsFullscreen(false)}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <Feather name="minimize-2" size={22} color="#FFF" />
              <Text style={styles.fullscreenCloseLabel}>Thu nhỏ</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.fullscreenPlayerWrap}>{renderMp4Player(true)}</View>
        </View>
      </Modal>
    ) : null}

    <Modal
      visible={showVideoDoneModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowVideoDoneModal(false)}>
      <View style={styles.promptOverlay}>
        <View style={[styles.promptCard, styles.bottomSheetCard]}>
          <View style={styles.promptIconWrap}>
            <Feather name="help-circle" size={22} color={COLORS.PRIMARY_DARK} />
          </View>
          <Text style={styles.promptTitle}>Xem hết video</Text>
          <Text style={styles.promptMessage}>
            Bạn có hiểu hết các từ vựng trong video này không?
          </Text>
          <View style={styles.promptBtnRow}>
            <TouchableOpacity
              style={[styles.promptBtn, styles.promptBtnGhost]}
              onPress={handleVideoNotUnderstood}
              activeOpacity={0.9}>
              <Text style={[styles.promptBtnText, styles.promptBtnGhostText]}>
                Chưa hiểu rõ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptBtn, styles.promptBtnPrimary]}
              onPress={handleVideoUnderstood}
              activeOpacity={0.9}>
              <Text style={[styles.promptBtnText, styles.promptBtnPrimaryText]}>
                Hiểu hết
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal
      visible={showNextActionModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowNextActionModal(false)}>
      <View style={styles.promptOverlay}>
        <View style={[styles.promptCard, styles.bottomSheetCard]}>
          <View style={styles.promptIconWrap}>
            <Feather name="book-open" size={22} color={COLORS.PRIMARY_DARK} />
          </View>
          <Text style={styles.promptTitle}>
            {videoComprehension === 'understood'
              ? 'Tuyệt vời! Bạn đã hiểu video'
              : 'Bạn chưa hiểu hết video'}
          </Text>
          <Text style={styles.promptMessage}>
            Tổng kết XP cho video này:
          </Text>
          <View style={styles.xpSummaryCard}>
            <View style={styles.xpSummaryRow}>
              <Text style={styles.xpSummaryLabel}>Hoàn thành video</Text>
              <Text style={styles.xpSummaryValue}>+{XP.VIDEO_WATCH_COMPLETE} XP</Text>
            </View>
            <View style={styles.xpSummaryRow}>
              <Text style={styles.xpSummaryLabel}>Bắt đầu luyện tập từ video</Text>
              <Text style={styles.xpSummaryValue}>+{XP.VIDEO_PRACTICE_START} XP</Text>
            </View>
          </View>
          <Text style={styles.promptMessage}>Bạn có muốn luyện tập từ vựng của video này không?</Text>
          <View style={styles.promptBtnCol}>
            <TouchableOpacity
              style={[styles.promptBtnWide, styles.promptBtnPrimary]}
              onPress={() => {
                setShowNextActionModal(false);
                openVideoPracticeLikeTopic();
              }}
              activeOpacity={0.9}>
              <Text style={[styles.promptBtnText, styles.promptBtnPrimaryText]}>
                Có, luyện tập ngay
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptBtnWide, styles.promptBtnGhost]}
              onPress={() => {
                setShowNextActionModal(false);
                goToHomeTab();
              }}
              activeOpacity={0.9}>
              <Text style={[styles.promptBtnText, styles.promptBtnGhostText]}>
                Để sau
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: COLORS.PRIMARY,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  headerBody: {
    flex: 1,
    marginLeft: 10,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  videoCard: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  videoOuter: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#0F0F0F',
    position: 'relative',
  },
  videoOuterFullscreen: {
    flex: 1,
    width: '100%',
    minHeight: 120,
    backgroundColor: '#0F0F0F',
    position: 'relative',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  videoFullscreen: {
    ...StyleSheet.absoluteFillObject,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  fullscreenCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  fullscreenCloseLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fullscreenPlayerWrap: {
    flex: 1,
  },
  fullscreenPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullscreenPlaceholderTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#F3F4F6',
    textAlign: 'center',
  },
  fullscreenPlaceholderHint: {
    marginTop: 6,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#FFF',
  },
  errorBannerOnVideo: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(185,28,28,0.92)',
    padding: 10,
    borderRadius: 8,
  },
  errorBannerText: {
    color: '#FFF',
    fontSize: 13,
    lineHeight: 18,
  },
  captionWrap: {
    position: 'absolute',
    bottom: 92,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  captionWrapElevated: {
    zIndex: 4,
  },
  captionBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.74)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    maxWidth: '90%',
  },
  captionWordHit: {
    marginHorizontal: 1,
    marginVertical: 1,
  },
  captionWordText: {
    color: '#FFF',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(253,186,116,0.95)',
  },
  captionPlainText: {
    color: '#FFF',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  captionText: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    color: '#FFF',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
  },
  tapReveal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  centerPlayWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPlayCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  controlsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  controlsBarElevated: {
    zIndex: 6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  seekTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  seekFill: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctrlBtn: {
    marginRight: 14,
    padding: 4,
  },
  ccBtn: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  ccBtnDisabled: {
    backgroundColor: '#6B7280',
    opacity: 0.6,
  },
  ccBtnLabel: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  ccBtnLabelOn: {
    textDecorationLine: 'underline',
  },
  ctrlSpacer: {flex: 1},
  speedText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  youtubeFallback: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 8,
    backgroundColor: '#111',
  },
  youtubeWebView: {
    flex: 1,
    minHeight: 140,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  youtubeHint: {
    fontSize: 14,
    color: '#E5E7EB',
    textAlign: 'center',
    lineHeight: 20,
  },
  openYoutubeBtn: {
    backgroundColor: '#FF0000',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  openYoutubeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 20,
  },
  textLinkBtn: {padding: 8},
  textLink: {
    fontSize: 16,
    color: COLORS.PRIMARY,
    fontWeight: '600',
  },
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 32,
  },
  transcriptBlock: {
    marginBottom: 22,
  },
  transcriptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  transcriptRowActive: {
    borderColor: COLORS.PRIMARY,
    backgroundColor: COLORS.PRIMARY_SOFT,
    shadowOpacity: 0.08,
  },
  transcriptSeekHit: {
    minWidth: 48,
    paddingVertical: 2,
  },
  transcriptTime: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.PRIMARY,
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  transcriptTextWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  transcriptWordHit: {
    marginRight: 2,
    marginBottom: 2,
  },
  transcriptWordText: {
    fontSize: 14,
    color: COLORS.PRIMARY,
    lineHeight: 20,
    fontWeight: '700',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(124,58,237,0.45)',
  },
  transcriptTextPlain: {
    fontSize: 14,
    color: COLORS.TEXT,
    lineHeight: 20,
  },
  transcriptText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.TEXT,
    lineHeight: 20,
  },
  transcriptLinkIcon: {
    marginTop: 2,
    alignSelf: 'flex-start',
    padding: 4,
  },
  wordPeekRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
  },
  wordPeekCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  wordPeekEn: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  wordPeekPos: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  wordPeekVi: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.TEXT,
  },
  wordPeekTranslating: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordPeekTranslatingText: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  wordPeekAutoNote: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  wordPeekContext: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  wordPeekLearnBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 12,
    borderRadius: 12,
  },
  wordPeekLearnBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  wordPeekClose: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  wordPeekCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },
  sectionHead: {
    marginBottom: 14,
    marginTop: 4,
  },
  videoWordsSectionHead: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeadRowDense: {
    marginBottom: 6,
    marginTop: 0,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  sectionIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,123,0,0.2)',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.TEXT,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  countBadge: {
    backgroundColor: COLORS.PRIMARY_SOFT,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,123,0,0.22)',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  wordCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  wordTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  wordTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
    paddingRight: 4,
  },
  wordEn: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.TEXT,
    flexShrink: 1,
  },
  posPill: {
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  posPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  wordKnownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    backgroundColor: COLORS.PRIMARY_SOFT,
  },
  wordKnownChipOn: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
  wordKnownChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
    letterSpacing: 0.2,
  },
  wordKnownChipTextOn: {
    color: '#FFF',
  },
  wordVi: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.PRIMARY,
  },
  wordPronunciation: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  wordExample: {
    marginTop: 8,
    fontSize: 14,
    fontStyle: 'italic',
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
  },
  emptyTab: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 22,
  },
  inlineMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: COLORS.TEXT,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  promptCard: {
    width: '100%',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  bottomSheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  promptIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.TEXT,
    textAlign: 'center',
  },
  promptMessage: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  promptBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  promptBtnCol: {
    gap: 10,
    marginTop: 16,
  },
  xpSummaryCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 10,
    gap: 6,
  },
  xpSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  xpSummaryLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  xpSummaryValue: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '800',
  },
  xpSummaryHint: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  promptBtn: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
  },
  promptBtnWide: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
  },
  promptBtnPrimary: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
  promptBtnGhost: {
    backgroundColor: '#FFF',
    borderColor: COLORS.BORDER,
  },
  promptBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  promptBtnPrimaryText: {
    color: '#FFF',
  },
  promptBtnGhostText: {
    color: COLORS.TEXT,
  },
});

export default VideoLearningScreen;
