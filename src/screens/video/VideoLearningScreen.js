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
  getVideoWordsLearnedMap,
} from '../../services/vocabularyService';
import {
  addVideoWatched,
  incrementVideoViewCount,
  awardXPIfFirst,
  setVideoNeedsPractice,
} from '../../services/storageService';
import {XP} from '../../services/levelService';
import {
  LEARNING_PROGRESS_UPDATED,
} from '../../services/learningProgressEvents';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const VIDEO_WIDTH = SCREEN_WIDTH - 24;
const VIDEO_HEIGHT = VIDEO_WIDTH * 0.5625;
const RATES = [0.75, 1, 1.25, 1.5];

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
  const seekBarWidth = useRef(1);
  const currentTimeRef = useRef(0);
  const insets = useSafeAreaInsets();

  const [paused, setPaused] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rateIndex, setRateIndex] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVideoDoneModal, setShowVideoDoneModal] = useState(false);
  const [showNextActionModal, setShowNextActionModal] = useState(false);
  const [nextActionTitle, setNextActionTitle] = useState('Hoàn thành video');
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

  const videoWordsList = useMemo(() => {
    if (!video) {
      return [];
    }
    return getVideoWordsListForVideo(video);
  }, [video]);

  const refreshVideoWordsLearnedMap = useCallback(async () => {
    await loadVocabularyFromFirebase();
    const m = await getVideoWordsLearnedMap(videoWordsList);
    setLearnedMap(m);
  }, [videoWordsList]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await loadVocabularyFromFirebase();
        const m = await getVideoWordsLearnedMap(videoWordsList);
        if (!cancelled) {
          setLearnedMap(m);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [videoWordsList]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEARNING_PROGRESS_UPDATED, () => {
      void refreshVideoWordsLearnedMap();
    });
    return () => sub.remove();
  }, [refreshVideoWordsLearnedMap]);

  const currentCaption = useMemo(() => {
    if (!ccEnabled || !hasSubtitles) {
      return '';
    }
    let line = '';
    let bestT = -1;
    for (const s of subtitles) {
      const t = parseSubTime(s.time);
      if (t <= currentTime && t >= bestT) {
        bestT = t;
        line = s.text;
      }
    }
    return line;
  }, [ccEnabled, hasSubtitles, subtitles, currentTime]);

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

  const handleVideoLoad = (data) => {
    setIsLoading(false);
    if (data?.duration && Number.isFinite(data.duration)) {
      setDuration(data.duration);
    }
    const t = currentTimeRef.current;
    if (t > 0.05) {
      videoRef.current?.seek(t);
    }
  };

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

  const handleVideoEnd = useCallback(() => {
    setPaused(true);
    setShowControls(true);
    if (video?.id != null) {
      void addVideoWatched(video.id);
      void awardXPIfFirst(
        `video_watch_complete_${String(video.id)}`,
        XP.VIDEO_WATCH_COMPLETE,
      );
    }
    if (!videoWordsList.length) {
      return;
    }
    setShowVideoDoneModal(true);
  }, [video?.id, videoWordsList]);

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

  const openVideoStudyModeSelection = useCallback(() => {
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
    navigateToVocabularyTab('VideoVocabularyStudyMode', {
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
    if (parent) {
      parent.navigate('HomeTab');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const openNextActionModal = useCallback((title) => {
    setNextActionTitle(title);
    setShowNextActionModal(true);
  }, []);

  const handleVideoNotUnderstood = useCallback(() => {
    setShowVideoDoneModal(false);
    openNextActionModal('Bạn chưa hiểu hết video');
    void (async () => {
      if (video?.id != null) {
        await setVideoNeedsPractice(video.id, true);
      }
    })();
  }, [openNextActionModal, video?.id]);

  const handleVideoUnderstood = useCallback(() => {
    setShowVideoDoneModal(false);
    openNextActionModal('Tuyệt vời! Bạn đã hiểu video');
    void (async () => {
      try {
        for (const w of videoWordsList) {
          if (w?.id != null) {
            await markWordAsLearned(w.id, true);
          }
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
    return (
      <View style={outerStyle}>
        <Video
          ref={videoRef}
          source={mp4Source}
          style={videoStyle}
          controls={false}
          paused={paused}
          muted={muted}
          rate={playbackRate}
          resizeMode="contain"
          progressUpdateInterval={250}
          onLoad={handleVideoLoad}
          onProgress={({currentTime: ct}) => setCurrentTime(ct)}
          onEnd={handleVideoEnd}
          onError={(error) => {
            if (__DEV__) {
              console.warn('[Video playback]', friendlyPlaybackError(error));
            }
            setPlaybackError(friendlyPlaybackError(error));
            setIsLoading(false);
          }}
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
        {currentCaption ? (
          <View style={styles.captionWrap} pointerEvents="none">
            <Text style={styles.captionText}>{currentCaption}</Text>
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
        {showBottomBar ? (
          <View style={styles.controlsBar} pointerEvents="box-none">
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
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, {paddingTop: headerTopPad}]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={handleBack}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Feather name="chevron-left" size={26} color={COLORS.TEXT} />
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
            <TouchableOpacity
              style={styles.markDoneBtn}
              onPress={handleVideoEnd}
              activeOpacity={0.85}>
              <Text style={styles.markDoneBtnText}>Tôi đã xem xong</Text>
            </TouchableOpacity>
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
                  <Text style={styles.sectionTitle}>Phụ đề / script</Text>
                  <Text style={styles.transcriptHint}>
                    {isYoutube
                      ? 'Chạm dòng → mở YouTube đúng mốc'
                      : 'Chạm dòng để tua video'}
                  </Text>
                </View>
                {subtitles.map((line, idx) => (
                  <TouchableOpacity
                    key={`sub-${idx}-${String(line?.time ?? '')}`}
                    style={styles.transcriptRow}
                    onPress={() => seekToSubtitleTime(line?.time)}
                    activeOpacity={0.7}>
                    <Text style={styles.transcriptTime}>{String(line?.time ?? '').trim()}</Text>
                    <Text style={styles.transcriptText}>{String(line?.text ?? '').trim()}</Text>
                    {isYoutube ? (
                      <Feather
                        name="external-link"
                        size={16}
                        color={COLORS.TEXT_LIGHT}
                        style={styles.transcriptLinkIcon}
                      />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.videoWordsSectionHead}>
              <View style={[styles.sectionHeadRow, styles.sectionHeadRowDense]}>
                <Text style={styles.sectionTitle}>Từ vựng trong video</Text>
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
      animationType="fade"
      onRequestClose={() => setShowVideoDoneModal(false)}>
      <View style={styles.promptOverlay}>
        <View style={styles.promptCard}>
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
      animationType="fade"
      onRequestClose={() => setShowNextActionModal(false)}>
      <View style={styles.promptOverlay}>
        <View style={styles.promptCard}>
          <View style={styles.promptIconWrap}>
            <Feather name="book-open" size={22} color={COLORS.PRIMARY_DARK} />
          </View>
          <Text style={styles.promptTitle}>{nextActionTitle}</Text>
          <Text style={styles.promptMessage}>Bạn muốn làm gì tiếp theo?</Text>
          <View style={styles.promptBtnCol}>
            <TouchableOpacity
              style={[styles.promptBtnWide, styles.promptBtnPrimary]}
              onPress={() => {
                setShowNextActionModal(false);
                openVideoStudyModeSelection();
              }}
              activeOpacity={0.9}>
              <Text style={[styles.promptBtnText, styles.promptBtnPrimaryText]}>
                Học từ mới
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
                Quay lại trang chủ
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
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderBottomWidth: 0,
  },
  headerBack: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerBody: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.TEXT,
    lineHeight: 23,
  },
  videoCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F0F0F',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
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
    bottom: 100,
    left: 16,
    right: 16,
    alignItems: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.58)',
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
  markDoneBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  markDoneBtnText: {
    color: COLORS.PRIMARY_LIGHT,
    fontSize: 15,
    fontWeight: '600',
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  transcriptBlock: {
    marginBottom: 20,
  },
  transcriptHint: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    maxWidth: '48%',
    textAlign: 'right',
  },
  transcriptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  transcriptTime: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.PRIMARY,
    fontVariant: ['tabular-nums'],
    minWidth: 48,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  countBadge: {
    backgroundColor: COLORS.PRIMARY_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
  },
  wordCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  promptCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
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
