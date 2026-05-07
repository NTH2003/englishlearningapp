import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Linking,
  ScrollView,
  Platform,
  StatusBar,
  Image,
  Modal,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {CommonActions, useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {
  markWordAsLearned,
  isWordLearned,
  commitFlashcardSessionWords,
  commitReviewFlashcardSession,
  getFlashcardSelfReport,
  buildExplicitChuaBietSetFromStored,
  buildExplicitChuaBietSetFromReviewWrong,
} from '../../services/vocabularyService';
import {getWordMedia} from '../../services/firebaseService';
import {searchPexelsPhoto} from '../../services/pexelsService';
import {saveContinueLearning, CONTINUE_KIND} from '../../services/continueLearning';
import InlineAudioPlayer from '../../components/InlineAudioPlayer';
import {emitLearningProgressUpdated} from '../../services/learningProgressEvents';

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (e) {
  console.warn('react-native-tts không khả dụng:', e?.message);
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');
/** Hai mặt thẻ dùng cùng khung (mặt trước có ảnh minh họa cao 160px + pill + chữ — nếu chỉ minHeight thấp thì mặt sau trông nhỏ hơn). */
const FLASHCARD_FACE_MIN_HEIGHT = 500;
const SWIPE_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

const TEXT_NAVY = '#0F172A';
const ORANGE_DEEP = '#EA580C';
const HEADER_ORANGE = COLORS.PRIMARY;
const POST_FLASHCARD_AUTO_MS = 5000;
const POST_FLASHCARD_AUTO_SECONDS = Math.ceil(POST_FLASHCARD_AUTO_MS / 1000);

function getPartOfSpeechLabel(word) {
  if (!word) return 'Từ vựng';
  const vi = String(word.partOfSpeechVi || '').trim();
  if (vi) return vi;
  const raw = String(word.partOfSpeech || '').trim();
  if (raw) return raw;
  return 'Từ vựng';
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

/** Ảnh tùy chỉnh (Firestore / admin) — nếu có thì không gọi Pexels. */
function pickStaticImageUrl(word, media) {
  const candidates = [
    word?.imageUrl,
    word?.thumbnailUrl,
    word?.photoUrl,
    word?.image,
    media?.imageUrl,
    media?.thumbnailUrl,
    media?.photoUrl,
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (u && isHttpUrl(u)) {
      return u;
    }
  }
  return '';
}

function buildPexelsQuery(word) {
  return String(word?.word || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

async function resolveFlashcardImageUrl(word, media) {
  const preset = pickStaticImageUrl(word, media);
  if (preset) {
    return preset;
  }
  const q = buildPexelsQuery(word);
  if (!q) {
    return '';
  }
  try {
    return (await searchPexelsPhoto(q)) || '';
  } catch (_) {
    return '';
  }
}

function buildInstantFallbackImageUrl(word) {
  const seed = encodeURIComponent(
    String(word?.word || word?.text || word?.id || 'vocab').trim().toLowerCase(),
  );
  return `https://picsum.photos/seed/${seed}/900/560`;
}

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function runAfterUiSettled(task) {
  const ric = globalThis?.requestIdleCallback;
  if (typeof ric === 'function') {
    ric(() => task());
    return;
  }
  setTimeout(task, 0);
}

const VocabularyFlashcardScreen = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {words, topicId, topicName, topic} = route.params || {};
  const topicTitle = topicName || topic?.name || 'Từ vựng';
  const isReviewSession = topicId === 'review';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [wordStatus, setWordStatus] = useState({});
  const [wordMedia, setWordMedia] = useState(null);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  /** Phát file âm thanh trong app (khi không dùng TTS) */
  const [remoteAudio, setRemoteAudio] = useState({uri: null, key: 0});
  /** Ảnh minh họa mặt trước thẻ: ưu tiên URL tĩnh, sau đó Pexels theo từ tiếng Anh */
  const [cardImageUrl, setCardImageUrl] = useState('');
  const [postFlashcardSheetVisible, setPostFlashcardSheetVisible] =
    useState(false);
  const [postFlashcardCountdown, setPostFlashcardCountdown] = useState(
    POST_FLASHCARD_AUTO_SECONDS,
  );

  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const swipeAnimatingRef = useRef(false);
  /** Chỉ khi user chủ động bấm "Chưa biết" — kết phiên không coi là đã học. Còn lại (lật thẻ/xem hết) vẫn lưu đã học. */
  const explicitChuaBietRef = useRef(new Set());
  /** Từ đã bấm Đã biết / Chưa biết trong phiên — tránh seed async ghi đè lựa chọn vừa chọn. */
  const userPressedFlashcardRef = useRef(new Set());
  /** Tăng mỗi lần đổi thẻ — async getWordMedia/Pexels không ghi đè thẻ mới. */
  const cardSyncIdRef = useRef(0);
  const postFlashcardShownRef = useRef(false);
  const postFlashcardChoiceMadeRef = useRef(false);
  const postFlashcardAutoTimerRef = useRef(null);
  const postFlashcardCountdownTimerRef = useRef(null);

  const clearPostFlashcardTimers = useCallback(() => {
    if (postFlashcardAutoTimerRef.current != null) {
      clearTimeout(postFlashcardAutoTimerRef.current);
      postFlashcardAutoTimerRef.current = null;
    }
    if (postFlashcardCountdownTimerRef.current != null) {
      clearInterval(postFlashcardCountdownTimerRef.current);
      postFlashcardCountdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPostFlashcardTimers();
  }, [clearPostFlashcardTimers]);

  /** Khôi phục “Chưa biết” đã lưu cho cả phiên (kết phiên cần đúng bộ). */
  useEffect(() => {
    if (!Array.isArray(words) || !words.length) return;
    let cancelled = false;
    userPressedFlashcardRef.current = new Set();
    const loader = isReviewSession
      ? buildExplicitChuaBietSetFromReviewWrong(words)
      : buildExplicitChuaBietSetFromStored(words);
    loader.then((storedSet) => {
      if (cancelled) return;
      const next = new Set(storedSet);
      for (const w of words) {
        const sid = String(w.id);
        if (userPressedFlashcardRef.current.has(sid)) {
          next.delete(sid);
          if (explicitChuaBietRef.current.has(sid)) next.add(sid);
        }
      }
      explicitChuaBietRef.current = next;
      if (isReviewSession) {
        const st = {};
        for (const w of words) {
          const sid = String(w.id);
          st[sid] = next.has(sid) ? false : true;
        }
        setWordStatus(st);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [words, isReviewSession]);

  useFocusEffect(
    useCallback(() => {
      if (!topicId || topicId === 'review') return;
      void saveContinueLearning({
        kind: CONTINUE_KIND.VOCAB_FLASHCARD,
        topicId: String(topicId),
        topicName: String(topicTitle || '').slice(0, 120),
      });
    }, [topicId, topicTitle]),
  );

  const currentWord = words && words[currentIndex] ? words[currentIndex] : null;
  const totalWords = Array.isArray(words) ? words.length : 0;

  /** Trạng thái nút theo đúng từ đang xem — gắn với wordStatus[id], không dùng state riêng (tránh dính từ trước khi đổi thẻ). */
  const flashcardUiChoice = useMemo(() => {
    if (!currentWord?.id) return null;
    const v = wordStatus[String(currentWord.id)];
    if (v === true) return 'known';
    if (v === false) return 'unknown';
    return null;
  }, [currentWord?.id, wordStatus]);

  const hasKnownWordsForPractice = useMemo(() => {
    if (!Array.isArray(words) || !words.length) return false;
    return words.some((w) => wordStatus[String(w?.id)] === true);
  }, [words, wordStatus]);

  const progressRatio =
    totalWords > 0 ? (currentIndex + 1) / totalWords : 0;

  useEffect(() => {
    try {
      if (Tts && typeof Tts.setDefaultLanguage === 'function') {
        Tts.setDefaultLanguage('en-US');
        Tts.setDefaultRate(0.48);
        Tts.setDefaultPitch(1.0);
        setTtsAvailable(true);
      }
    } catch (e) {
      console.warn('TTS init:', e?.message);
      setTtsAvailable(false);
    }
    return () => {
      try {
        Tts?.stop?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (!Tts?.addEventListener) return undefined;
    const onEnd = () => setIsSpeaking(false);
    const subFinish = Tts.addEventListener('tts-finish', onEnd);
    const subCancel = Tts.addEventListener('tts-cancel', onEnd);
    return () => {
      try {
        subFinish?.remove?.();
        subCancel?.remove?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    setIsFlipped(false);
    position.setValue({x: 0, y: 0});
    opacity.setValue(1);

    let cancelled = false;
    const wordId = currentWord?.id;
    const syncId = ++cardSyncIdRef.current;

    const isStale = () => cancelled || syncId !== cardSyncIdRef.current;

    const syncStatuses = async () => {
      if (!currentWord || wordId == null) {
        if (!isStale()) {
          setWordMedia(null);
          setCardImageUrl('');
        }
        return;
      }
      if (!isStale()) {
        const staticImage = pickStaticImageUrl(currentWord, null);
        // Hiển thị ảnh ngay khi vào thẻ: ưu tiên ảnh tĩnh có sẵn, nếu không có dùng fallback theo seed.
        setCardImageUrl(staticImage || buildInstantFallbackImageUrl(currentWord));
      }
      try {
        const sid = String(currentWord.id);
        if (isReviewSession) {
          const media = await withTimeout(getWordMedia(currentWord.id), 3500).catch(() => null);
          if (isStale()) return;
          setWordMedia(media);
          const img = await withTimeout(
            resolveFlashcardImageUrl(currentWord, media),
            4500,
          ).catch(() => '');
          if (isStale()) return;
          if (img) setCardImageUrl(img);
          return;
        }
        const report = await getFlashcardSelfReport(currentWord.id);
        const learnedGlobal = await isWordLearned(currentWord.id);
        if (isStale()) return;

        let choice = null;
        if (report === true) choice = 'known';
        else if (report === false) choice = 'unknown';
        else if (learnedGlobal) choice = 'known';

        setWordStatus((prev) => ({
          ...prev,
          [sid]:
            choice === 'known' ? true : choice === 'unknown' ? false : undefined,
        }));

        const media = await withTimeout(getWordMedia(currentWord.id), 3500).catch(() => null);
        if (isStale()) return;
        setWordMedia(media);
        const img = await withTimeout(
          resolveFlashcardImageUrl(currentWord, media),
          4500,
        ).catch(() => '');
        if (isStale()) return;
        if (img) setCardImageUrl(img);
      } catch (_) {
        // giữ placeholder tĩnh khi lỗi tải ảnh
      }
    };
    syncStatuses();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, currentWord?.id, isReviewSession]);

  useEffect(() => {
    try {
      Tts?.stop?.();
    } catch (_) {}
    setIsSpeaking(false);
    setRemoteAudio({uri: null, key: 0});
  }, [currentIndex, currentWord?.id]);

  const animateCardBackToCenter = () => {
    Animated.parallel([
      Animated.spring(position, {
        toValue: {x: 0, y: 0},
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: false,
      }),
    ]).start();
  };

  /** Một lần ghi wordsLearned + XP — tránh 5 lần lưu tuần tự bị cắt khi thoát app. */
  const finalizeSessionProgress = useCallback(() => {
    if (!Array.isArray(words) || !words.length) return Promise.resolve();
    if (isReviewSession) {
      return commitReviewFlashcardSession(words, [
        ...explicitChuaBietRef.current,
      ]).finally(() => {
        emitLearningProgressUpdated({resetTopicFilters: true});
      });
    }
    return commitFlashcardSessionWords(words, [
      ...explicitChuaBietRef.current,
    ]).finally(() => {
      emitLearningProgressUpdated({resetTopicFilters: true});
    });
  }, [words, isReviewSession]);

  const onPostFlashcardGoHome = useCallback(() => {
    if (postFlashcardChoiceMadeRef.current) return;
    postFlashcardChoiceMadeRef.current = true;
    clearPostFlashcardTimers();
    setPostFlashcardSheetVisible(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{name: 'Vocabulary'}],
      }),
    );
    const tabNav = navigation.getParent?.();
    tabNav?.navigate('HomeTab', {screen: 'Home'});
    runAfterUiSettled(() => {
      emitLearningProgressUpdated({resetTopicFilters: true});
    });
  }, [clearPostFlashcardTimers, navigation]);

  const onPostFlashcardReplay = useCallback(() => {
    if (postFlashcardChoiceMadeRef.current) return;
    postFlashcardChoiceMadeRef.current = true;
    clearPostFlashcardTimers();
    setPostFlashcardSheetVisible(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setWordStatus({});
    explicitChuaBietRef.current = new Set();
    userPressedFlashcardRef.current = new Set();
    postFlashcardShownRef.current = false;
    setPostFlashcardCountdown(POST_FLASHCARD_AUTO_SECONDS);
  }, [clearPostFlashcardTimers]);

  const onPostFlashcardPractice = useCallback(() => {
    if (postFlashcardChoiceMadeRef.current) return;
    postFlashcardChoiceMadeRef.current = true;
    clearPostFlashcardTimers();
    setPostFlashcardSheetVisible(false);
    const list = Array.isArray(words) ? words : [];
    const knownOnly = list.filter(
      (w) => wordStatus[String(w?.id)] === true,
    );
    if (knownOnly.length === 0) {
      onPostFlashcardReplay();
      return;
    }
    navigation.replace('VocabularyQuiz', {
      words: [...knownOnly]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(12, knownOnly.length)),
      topicId,
      topicName: topicTitle,
      topic,
      mixedPractice: true,
      hideQuizTimer: true,
    });
  }, [
    clearPostFlashcardTimers,
    navigation,
    words,
    wordStatus,
    topicId,
    topicTitle,
    topic,
    onPostFlashcardReplay,
  ]);

  const runPostFlashcardAuto = useCallback(() => {
    onPostFlashcardPractice();
  }, [onPostFlashcardPractice]);

  const openPostFlashcardSheet = useCallback(() => {
    postFlashcardChoiceMadeRef.current = false;
    setPostFlashcardCountdown(POST_FLASHCARD_AUTO_SECONDS);
    setPostFlashcardSheetVisible(true);
    finalizeSessionProgress().catch((e) =>
      console.warn('finalizeSessionProgress', e?.message),
    );
    if (hasKnownWordsForPractice) {
      postFlashcardCountdownTimerRef.current = setInterval(() => {
        setPostFlashcardCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      postFlashcardAutoTimerRef.current = setTimeout(() => {
        runPostFlashcardAuto();
      }, POST_FLASHCARD_AUTO_MS);
    }
  }, [finalizeSessionProgress, hasKnownWordsForPractice, runPostFlashcardAuto]);

  const handleNext = () => {
    if (!Array.isArray(words) || !words.length) return;
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }
    if (postFlashcardShownRef.current) return;
    postFlashcardShownRef.current = true;
    openPostFlashcardSheet();
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const swipeToDirection = direction => {
    if (swipeAnimatingRef.current) return;
    if (!Array.isArray(words) || totalWords <= 0) {
      animateCardBackToCenter();
      return;
    }
    const canMove =
      direction === 'next'
        ? currentIndex < totalWords - 1
        : currentIndex > 0;
    if (!canMove) {
      animateCardBackToCenter();
      return;
    }
    swipeAnimatingRef.current = true;
    const toX = direction === 'next' ? -SCREEN_WIDTH * 1.1 : SCREEN_WIDTH * 1.1;
    Animated.parallel([
      Animated.timing(position, {
        toValue: {x: toX, y: 0},
        duration: 170,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 0.22,
        duration: 140,
        useNativeDriver: false,
      }),
    ]).start(({finished}) => {
      if (finished) {
        if (direction === 'next') handleNext();
        else handlePrevious();
      }
      swipeAnimatingRef.current = false;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const dx = Math.abs(gestureState.dx);
        const dy = Math.abs(gestureState.dy);
        if (swipeAnimatingRef.current) return false;
        // Chỉ bắt gesture vuốt ngang rõ ràng, tránh cướp cuộn dọc.
        return dx > 8 && dx > dy * 1.2;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (swipeAnimatingRef.current) return;
        position.setValue({x: gestureState.dx, y: 0});
        const alpha = Math.max(0.28, 1 - Math.abs(gestureState.dx) / SCREEN_WIDTH);
        opacity.setValue(alpha);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (swipeAnimatingRef.current) return;
        const distancePass = Math.abs(gestureState.dx) > SWIPE_THRESHOLD;
        const velocityPass =
          Math.abs(gestureState.dx) > 36 &&
          Math.abs(gestureState.vx) > SWIPE_VELOCITY_THRESHOLD;
        if (distancePass || velocityPass) {
          swipeToDirection(gestureState.dx > 0 ? 'previous' : 'next');
          return;
        }
        animateCardBackToCenter();
      },
      onPanResponderTerminate: () => {
        if (swipeAnimatingRef.current) return;
        animateCardBackToCenter();
      },
    }),
  ).current;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleSetLearned = async (value) => {
    if (!currentWord) return;
    const sid = String(currentWord.id);
    const newLearnedStatus = Boolean(value);
    userPressedFlashcardRef.current.add(sid);
    if (newLearnedStatus) {
      explicitChuaBietRef.current.delete(sid);
    } else {
      explicitChuaBietRef.current.add(sid);
    }
    setWordStatus((prev) => ({
      ...prev,
      [sid]: newLearnedStatus,
    }));
    if (isReviewSession) {
      emitLearningProgressUpdated({resetTopicFilters: false});
      return;
    }
    // Không ghi Firestore theo từng lần bấm (rất chậm khi học nhanh nhiều từ).
    // Tiến độ phiên sẽ được ghi một lần ở finalizeSessionProgress().
    emitLearningProgressUpdated({resetTopicFilters: false});
  };

  const hasRemoteAudio = Boolean(
    wordMedia?.audioUrl ||
      wordMedia?.soundUrl ||
      currentWord?.audioUrl,
  );

  const canPlayPronunciation = ttsAvailable || hasRemoteAudio;

  const handlePlayPronunciation = () => {
    if (!currentWord) return;
    const audioUrl =
      wordMedia?.audioUrl ||
      wordMedia?.soundUrl ||
      currentWord?.audioUrl;
    const text = String(currentWord.word || '').trim();
    if (!text && !audioUrl) return;

    if (ttsAvailable && Tts && text) {
      try {
        Tts.stop();
        setIsSpeaking(true);
        Tts.speak(text);
      } catch (e) {
        setIsSpeaking(false);
        if (audioUrl) {
          setRemoteAudio((a) => ({uri: audioUrl, key: a.key + 1}));
          setIsSpeaking(true);
        }
      }
      return;
    }
    if (audioUrl) {
      setRemoteAudio((a) => ({uri: audioUrl, key: a.key + 1}));
      setIsSpeaking(true);
      return;
    }
  };

  if (!currentWord) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Không có từ vựng nào</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View
        style={[
          styles.headerOrange,
          {
            paddingTop:
              Math.max(
                insets.top,
                Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
              ) + 6,
          },
        ]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          activeOpacity={0.7}>
          <Feather name="chevron-left" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {topicTitle}
          </Text>
          <Text style={styles.headerSub}>
            {currentIndex + 1}/{totalWords} từ
          </Text>
        </View>
        <View style={styles.headerSideSpacer} />
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, {width: `${progressRatio * 100}%`}]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollMain}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Animated.View
          style={[
            styles.cardOuter,
            {
              transform: [{translateX: position.x}, {translateY: position.y}],
              opacity,
            },
          ]}
          {...panResponder.panHandlers}>
          {!isFlipped ? (
            <View style={[styles.cardFront, styles.shadowCard]}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={handleFlip}
                style={[styles.cardFacePressable, styles.cardFacePressableFront]}>
                <View style={styles.posPill}>
                  <Text style={styles.posPillText}>
                    {getPartOfSpeechLabel(currentWord)}
                  </Text>
                </View>
                {!!cardImageUrl && (
                  <View style={styles.cardImageSlot}>
                    <Image
                      source={{uri: cardImageUrl}}
                      style={styles.cardImage}
                      resizeMode="cover"
                      accessibilityRole="image"
                      accessibilityLabel={`Minh họa: ${currentWord.word || 'từ vựng'}`}
                    />
                  </View>
                )}
                {!cardImageUrl && (
                  <View style={styles.cardImageFallback}>
                    <Feather name="image" size={24} color={COLORS.TEXT_LIGHT} />
                    <Text style={styles.cardImageFallbackText}>Chưa có ảnh minh họa</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.wordEnglish,
                    !!cardImageUrl && styles.wordEnglishWithImage,
                  ]}>
                  {currentWord.word}
                </Text>
                <Text style={styles.ipaText}>{currentWord.pronunciation}</Text>
                <TouchableOpacity
                  style={[
                    styles.audioCircle,
                    !canPlayPronunciation && styles.audioCircleDisabled,
                    isSpeaking && styles.audioCircleActive,
                  ]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    if (canPlayPronunciation) handlePlayPronunciation();
                  }}
                  disabled={!canPlayPronunciation}
                  activeOpacity={0.8}>
                  <Feather
                    name="volume-2"
                    size={22}
                    color={
                      canPlayPronunciation ? ORANGE_DEEP : COLORS.TEXT_LIGHT
                    }
                  />
                </TouchableOpacity>

                <Text style={styles.hintFront}>Chạm để xem nghĩa</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.cardBack, styles.shadowCard]}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={handleFlip}
                style={[styles.cardFacePressable, styles.cardFacePressableBack]}>
                <Text style={styles.meaningLarge}>{currentWord.meaning}</Text>
                <View style={styles.exampleBox}>
                  <Text style={styles.exampleLabel}>Ví dụ:</Text>
                  {currentWord.example ? (
                    <>
                      <Text style={styles.exampleEn}>{currentWord.example}</Text>
                      {!!currentWord.exampleMeaning && (
                        <Text style={styles.exampleVi}>
                          {currentWord.exampleMeaning}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.exampleMissing}>
                      Chưa có ví dụ cho từ này.
                    </Text>
                  )}
                </View>
                <Text style={styles.hintBack}>Chạm để xem từ</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.choiceBtnBase,
              styles.btnUnknown,
              flashcardUiChoice === 'unknown' && styles.btnUnknownSelected,
              flashcardUiChoice === 'known' && styles.btnChoiceMuted,
            ]}
            onPress={() => handleSetLearned(false)}
            activeOpacity={0.85}>
            <View style={styles.choiceIconWrapUnknown}>
              <Feather name="x" size={20} color="#EF4444" />
            </View>
            <View style={styles.choiceTextCol}>
              <Text style={styles.btnUnknownText}>Chưa biết</Text>
              <Text style={styles.choiceSubTextUnknown}>Ôn lại từ này</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.choiceBtnBase,
              styles.btnKnown,
              flashcardUiChoice === 'known' && styles.btnKnownSelected,
              flashcardUiChoice === 'unknown' && styles.btnChoiceMuted,
            ]}
            onPress={() => handleSetLearned(true)}
            activeOpacity={0.85}>
            <View style={styles.choiceIconWrapKnown}>
              <Feather name="check" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.choiceTextCol}>
              <Text style={styles.btnKnownText}>Đã biết</Text>
              <Text style={styles.choiceSubTextKnown}>Đánh dấu đã nhớ</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[
              styles.navPill,
              currentIndex === 0 && styles.navPillDisabled,
            ]}
            onPress={handlePrevious}
            disabled={currentIndex === 0}
            activeOpacity={0.8}>
            <Feather
              name="chevron-left"
              size={20}
              color={currentIndex === 0 ? COLORS.TEXT_LIGHT : TEXT_NAVY}
            />
            <Text
              style={[
                styles.navPillText,
                currentIndex === 0 && styles.navPillTextDisabled,
              ]}>
              Trước
            </Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {words.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.navPill}
            onPress={handleNext}
            activeOpacity={0.8}>
            <Text style={styles.navPillText}>
              {currentIndex < words.length - 1 ? 'Sau' : 'Xong'}
            </Text>
            <Feather name="chevron-right" size={20} color={TEXT_NAVY} />
          </TouchableOpacity>
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <InlineAudioPlayer
        uri={remoteAudio.uri}
        playKey={remoteAudio.key}
        onEnd={() => {
          setRemoteAudio((a) => ({...a, uri: null}));
          setIsSpeaking(false);
        }}
        onError={() => {
          setRemoteAudio((a) => {
            if (a.uri) {
              Linking.openURL(a.uri).catch(() => {});
            }
            return {...a, uri: null};
          });
          setIsSpeaking(false);
        }}
      />

      <Modal
        visible={postFlashcardSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={onPostFlashcardGoHome}>
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <View style={[styles.sheetWrap, {paddingBottom: Math.max(insets.bottom, 16)}]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Hoàn thành flashcard</Text>
            <Text style={styles.sheetSubtitle}>Tiếp tục củng cố để nhớ từ lâu hơn.</Text>
            <TouchableOpacity
              style={styles.sheetPrimaryBtn}
              onPress={
                hasKnownWordsForPractice
                  ? onPostFlashcardPractice
                  : onPostFlashcardReplay
              }
              activeOpacity={0.88}>
              <Feather name="play-circle" size={18} color="#FFFFFF" />
              <Text style={styles.sheetPrimaryBtnText}>
                {hasKnownWordsForPractice
                  ? `Tiếp tục (${postFlashcardCountdown}s)`
                  : 'Học lại bộ từ'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetSecondaryBtn}
              onPress={onPostFlashcardGoHome}
              activeOpacity={0.88}>
              <Feather name="home" size={18} color={COLORS.PRIMARY_DARK} />
              <Text style={styles.sheetSecondaryBtnText}>Về trang chủ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  headerOrange: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: HEADER_ORANGE,
    paddingTop: 12,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  /** Cân layout với nút back bên trái */
  headerSideSpacer: {
    width: 44,
    height: 44,
  },
  progressWrap: {
    backgroundColor: HEADER_ORANGE,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#292524',
  },
  scrollMain: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  cardOuter: {
    minHeight: FLASHCARD_FACE_MIN_HEIGHT,
    width: '100%',
    marginBottom: 16,
  },
  shadowCard: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  cardFront: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    minHeight: FLASHCARD_FACE_MIN_HEIGHT,
    width: '100%',
    overflow: 'visible',
  },
  cardBack: {
    backgroundColor: HEADER_ORANGE,
    borderRadius: 20,
    minHeight: FLASHCARD_FACE_MIN_HEIGHT,
    width: '100%',
    overflow: 'visible',
  },
  cardFacePressable: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: FLASHCARD_FACE_MIN_HEIGHT,
  },
  cardFacePressableFront: {
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  cardFacePressableBack: {
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  posPill: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  posPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  wordEnglish: {
    fontSize: 36,
    fontWeight: '800',
    color: TEXT_NAVY,
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 8,
  },
  wordEnglishWithImage: {
    marginTop: 12,
  },
  cardImageSlot: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginTop: 44,
    marginBottom: 4,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginTop: 44,
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardImageFallbackText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  ipaText: {
    fontSize: 17,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  audioCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  audioCircleDisabled: {
    opacity: 0.45,
  },
  audioCircleActive: {
    opacity: 0.75,
  },
  hintFront: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  meaningLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  exampleBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  exampleLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '700',
    marginBottom: 8,
  },
  exampleEn: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  exampleVi: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 20,
  },
  exampleMissing: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontStyle: 'italic',
  },
  hintBack: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  choiceBtnBase: {
    flex: 1,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  btnUnknown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  btnUnknownText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
  },
  btnKnown: {
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#22C55E',
    shadowColor: '#16A34A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  choiceIconWrapUnknown: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIconWrapKnown: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTextCol: {
    alignItems: 'flex-start',
  },
  choiceSubTextUnknown: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  choiceSubTextKnown: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  /** Đã lưu: Chưa biết — nền nhạt để thấy rõ đang chọn */
  btnUnknownSelected: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#DC2626',
  },
  /** Đã lưu: Đã biết — viền đậm */
  btnKnownSelected: {
    borderWidth: 3,
    borderColor: '#15803D',
  },
  /** Nút kia đang được chọn — làm mờ nhẹ */
  btnChoiceMuted: {
    opacity: 0.5,
  },
  btnKnownText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  navPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  navPillDisabled: {
    opacity: 0.45,
  },
  navPillText: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_NAVY,
  },
  navPillTextDisabled: {
    color: COLORS.TEXT_LIGHT,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
    flexWrap: 'wrap',
    maxWidth: SCREEN_WIDTH * 0.36,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    width: 22,
    height: 7,
    backgroundColor: HEADER_ORANGE,
  },
  bottomSpacer: {
    height: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheetWrap: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: COLORS.TEXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  sheetPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: HEADER_ORANGE,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  sheetPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sheetSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND,
    marginBottom: 4,
  },
  sheetSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
});

export default VocabularyFlashcardScreen;
