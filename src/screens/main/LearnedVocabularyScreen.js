import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {getLearnedWordsForDisplay} from '../../services/vocabularyService';
import InlineAudioPlayer from '../../components/InlineAudioPlayer';

const TEXT_GRAY_900 = '#111827';
const TEXT_GRAY_600 = '#4B5563';
const TEXT_GRAY_500 = '#6B7280';

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch (_) {
  Tts = null;
}

const LearnedVocabularyScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [remoteAudio, setRemoteAudio] = useState({uri: null, key: 0});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getLearnedWordsForDisplay();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!Tts) return undefined;
    try {
      if (typeof Tts.setDefaultLanguage === 'function') {
        Tts.setDefaultLanguage('en-US');
      }
      if (typeof Tts.setDefaultRate === 'function') {
        Tts.setDefaultRate(0.48);
      }
      if (typeof Tts.setDefaultPitch === 'function') {
        Tts.setDefaultPitch(1.0);
      }
    } catch (_) {}
    return undefined;
  }, []);

  useEffect(() => {
    if (!Tts?.addEventListener) return undefined;
    const onEnd = () => setPlayingId(null);
    const s1 = Tts.addEventListener('tts-finish', onEnd);
    const s2 = Tts.addEventListener('tts-cancel', onEnd);
    return () => {
      try {
        s1?.remove?.();
        s2?.remove?.();
      } catch (_) {}
    };
  }, []);

  const goReview = useCallback(() => {
    navigation.getParent()?.navigate('VocabularyTab', {
      screen: 'Vocabulary',
      params: {initialVocabTab: 'review'},
    });
  }, [navigation]);

  const handlePlayPronunciation = useCallback((item) => {
    const text = String(item.word || '').trim();
    const audioUrl = String(item.audioUrl || '').trim();

    try {
      Tts?.stop?.();
    } catch (_) {}

    if (audioUrl) {
      setRemoteAudio((a) => ({uri: audioUrl, key: a.key + 1}));
      setPlayingId(item.id);
      return;
    }

    setRemoteAudio((a) => ({uri: null, key: a.key}));

    if (Tts && text) {
      try {
        setPlayingId(item.id);
        Tts.speak(text);
      } catch (_) {
        setPlayingId(null);
      }
    }
  }, []);

  const canPlayItem = item => {
    const text = String(item.word || '').trim();
    const audioUrl = String(item.audioUrl || '').trim();
    return Boolean(audioUrl || (Tts && text));
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({item}) => {
              const ipa = String(item.pronunciation || '').trim();
              const pos = String(item.partOfSpeechVi || '').trim();
              const isPlaying = playingId === item.id;
              const playable = canPlayItem(item);

              return (
                <View style={styles.wordCard}>
                  <View style={styles.wordTopRow}>
                    <Text style={styles.en} numberOfLines={2}>
                      {item.word}
                    </Text>
                    {playable ? (
                      <TouchableOpacity
                        style={[
                          styles.playBtn,
                          isPlaying && styles.playBtnActive,
                        ]}
                        onPress={() => handlePlayPronunciation(item)}
                        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                        accessibilityLabel="Phát âm">
                        <Feather
                          name="volume-2"
                          size={20}
                          color={isPlaying ? '#FFFFFF' : COLORS.PRIMARY}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {ipa ? (
                    <Text style={styles.ipa} numberOfLines={2}>
                      {ipa}
                    </Text>
                  ) : null}

                  {pos ? (
                    <View style={styles.posWrap}>
                      <Text style={styles.posText}>{pos}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.vi} numberOfLines={6}>
                    {item.meaning}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="inbox" size={32} color={TEXT_GRAY_500} />
                </View>
                <Text style={styles.emptyTitle}>Chưa có từ nào</Text>
                <Text style={styles.emptyText}>
                  Học trong tab Từ vựng hoặc đánh dấu khi xem video — mọi từ sẽ hiện ở đây.
                </Text>
              </View>
            }
            contentContainerStyle={[
              styles.listContent,
              items.length === 0 && styles.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
          />

          <TouchableOpacity
            style={[styles.cta, {bottom: Math.max(16, insets.bottom + 8)}]}
            onPress={goReview}
            activeOpacity={0.88}>
            <Feather name="rotate-ccw" size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Ôn tập từ vựng</Text>
            <Feather name="chevron-right" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <InlineAudioPlayer
            uri={remoteAudio.uri}
            playKey={remoteAudio.key}
            onEnd={() => {
              setRemoteAudio((a) => ({...a, uri: null}));
              setPlayingId(null);
            }}
            onError={() => {
              setRemoteAudio((a) => {
                if (a.uri) {
                  Linking.openURL(a.uri).catch(() => {});
                }
                return {...a, uri: null};
              });
              setPlayingId(null);
            }}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: THEME.spacing.md,
    paddingTop: THEME.spacing.sm,
    paddingBottom: 112,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  wordCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: THEME.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...THEME.shadow.soft,
  },
  wordTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  en: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_GRAY_900,
    letterSpacing: 0.15,
  },
  playBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnActive: {
    backgroundColor: COLORS.PRIMARY,
  },
  ipa: {
    fontSize: 14,
    fontStyle: 'italic',
    color: TEXT_GRAY_500,
    marginTop: 6,
    lineHeight: 20,
  },
  posWrap: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
    backgroundColor: 'rgba(255, 140, 66, 0.12)',
  },
  posText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.PRIMARY_DARK,
  },
  vi: {
    fontSize: 14,
    color: TEXT_GRAY_600,
    marginTop: 10,
    lineHeight: 21,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.xl,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
    ...THEME.shadow.soft,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_GRAY_900,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_GRAY_500,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    position: 'absolute',
    left: THEME.spacing.md,
    right: THEME.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 15,
    borderRadius: THEME.radius.lg,
    ...THEME.shadow.floating,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default LearnedVocabularyScreen;
