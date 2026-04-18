import React, {useState, useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  SafeAreaView,
  Linking,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
import InlineAudioPlayer from '../../components/InlineAudioPlayer';

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (e) {
  console.warn('react-native-tts không khả dụng:', e?.message);
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

const TEXT_NAVY = '#0F172A';
const ORANGE_DEEP = '#EA580C';
const HEADER_ORANGE = COLORS.PRIMARY;

function getPartOfSpeechLabel(word) {
  if (!word) return 'Từ vựng';
  if (word.partOfSpeechVi) return word.partOfSpeechVi;
  return 'Từ vựng';
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

  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  /** Chỉ khi user chủ động bấm "Chưa biết" — kết phiên không coi là đã học. Còn lại (lật thẻ/xem hết) vẫn lưu đã học. */
  const explicitChuaBietRef = useRef(new Set());
  /** Từ đã bấm Đã biết / Chưa biết trong phiên — tránh seed async ghi đè lựa chọn vừa chọn. */
  const userPressedFlashcardRef = useRef(new Set());

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

    const syncStatuses = async () => {
      if (!currentWord || wordId == null) {
        if (!cancelled) {
          setWordMedia(null);
        }
        return;
      }
      try {
        const sid = String(currentWord.id);
        if (isReviewSession) {
          if (cancelled) return;
          const media = await getWordMedia(currentWord.id);
          if (cancelled) return;
          setWordMedia(media);
          return;
        }
        const report = await getFlashcardSelfReport(currentWord.id);
        const learnedGlobal = await isWordLearned(currentWord.id);
        if (cancelled) return;

        let choice = null;
        if (report === true) choice = 'known';
        else if (report === false) choice = 'unknown';
        else if (learnedGlobal) choice = 'known';

        setWordStatus((prev) => ({
          ...prev,
          [sid]:
            choice === 'known' ? true : choice === 'unknown' ? false : undefined,
        }));

        const media = await getWordMedia(currentWord.id);
        if (cancelled) return;
        setWordMedia(media);
      } catch (_) {}
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        position.setValue({x: gestureState.dx, y: gestureState.dy});
        opacity.setValue(1 - Math.abs(gestureState.dx) / SCREEN_WIDTH);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
          if (gestureState.dx > 0) {
            handlePrevious();
          } else {
            handleNext();
          }
        } else {
          Animated.spring(position, {
            toValue: {x: 0, y: 0},
            useNativeDriver: false,
          }).start();
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  /** Một lần ghi wordsLearned + XP — tránh 5 lần lưu tuần tự bị cắt khi thoát app. */
  const finalizeSessionProgress = () => {
    if (!Array.isArray(words) || !words.length) return Promise.resolve();
    if (isReviewSession) {
      return commitReviewFlashcardSession(words, [
        ...explicitChuaBietRef.current,
      ]);
    }
    return commitFlashcardSessionWords(words, [
      ...explicitChuaBietRef.current,
    ]);
  };

  const handleNext = () => {
    if (!Array.isArray(words) || !words.length) return;
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }
    const finalWordStatus = {};
    let rem = 0;
    for (const w of words) {
      const sid = String(w.id);
      const known = !explicitChuaBietRef.current.has(sid);
      finalWordStatus[sid] = known;
      if (known) rem += 1;
    }
    const total = words.length;
    /** Sang tổng kết ngay — không await lưu (Firebase/getLearningProgress có thể treo → màn hình không mở). */
    navigation.replace('FlashcardResult', {
      topicId,
      topicName,
      topic,
      words,
      wordStatus: finalWordStatus,
      rememberedCount: rem,
      notRememberedCount: Math.max(0, total - rem),
    });
    finalizeSessionProgress().catch((e) =>
      console.warn('finalizeSessionProgress', e?.message),
    );
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

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
      return;
    }
    await markWordAsLearned(currentWord.id, newLearnedStatus);
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
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Không có từ vựng nào</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
                <Text style={styles.wordEnglish}>{currentWord.word}</Text>
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
                {currentWord.example ? (
                  <View style={styles.exampleBox}>
                    <Text style={styles.exampleLabel}>Ví dụ:</Text>
                    <Text style={styles.exampleEn}>{currentWord.example}</Text>
                    {!!currentWord.exampleMeaning && (
                      <Text style={styles.exampleVi}>
                        {currentWord.exampleMeaning}
                      </Text>
                    )}
                  </View>
                ) : null}
                <Text style={styles.hintBack}>Chạm để xem từ</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.btnUnknown,
              flashcardUiChoice === 'unknown' && styles.btnUnknownSelected,
              flashcardUiChoice === 'known' && styles.btnChoiceMuted,
            ]}
            onPress={() => handleSetLearned(false)}
            activeOpacity={0.85}>
            <Feather name="x" size={22} color="#EF4444" />
            <Text style={styles.btnUnknownText}>Chưa biết</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnKnown,
              flashcardUiChoice === 'known' && styles.btnKnownSelected,
              flashcardUiChoice === 'unknown' && styles.btnChoiceMuted,
            ]}
            onPress={() => handleSetLearned(true)}
            activeOpacity={0.85}>
            <Feather name="check" size={22} color="#FFFFFF" />
            <Text style={styles.btnKnownText}>Đã biết</Text>
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
    minHeight: 340,
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
    minHeight: 300,
    overflow: 'visible',
  },
  cardBack: {
    backgroundColor: HEADER_ORANGE,
    borderRadius: 20,
    minHeight: 300,
    overflow: 'visible',
  },
  cardFacePressable: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  cardFacePressableFront: {
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  cardFacePressableBack: {
    paddingVertical: 24,
    paddingHorizontal: 18,
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
  btnUnknown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnUnknownText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
  },
  btnKnown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingVertical: 14,
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
    opacity: 0.42,
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
});

export default VocabularyFlashcardScreen;
