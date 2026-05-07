import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AI_SERVER_URL, COLORS} from '../../constants';
import {getDialogueById, loadDialoguesFromFirebase} from '../../services/dialogueService';
import {getLearningProgress, saveLearningProgress} from '../../services/storageService';
import {saveContinueLearning, CONTINUE_KIND} from '../../services/continueLearning';
import {computeLevelName} from '../../services/levelService';
import {emitLearningProgressUpdated} from '../../services/learningProgressEvents';
import Feather from 'react-native-vector-icons/Feather';

const MAX_USER_TURNS_PER_DIALOGUE = 6;
const DIALOGUE_XP_FIRST_COMPLETE = 20;
const DIALOGUE_XP_RETRY_COMPLETE = 6;
const MAX_AI_CONTEXT_MESSAGES = 10;

function friendlyDialogueError(message) {
  const raw = String(message || '').trim();
  const upper = raw.toUpperCase();
  if (!raw) {
    return 'Máy chủ hội thoại đang bận. Vui lòng thử lại sau.';
  }
  if (
    upper.includes('429') ||
    upper.includes('QUOTA') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('RATE LIMIT')
  ) {
    return 'Hệ thống AI đang tạm hết lượt sử dụng. Bạn thử lại sau ít phút nhé.';
  }
  if (upper.includes('FETCH') || upper.includes('NETWORK') || upper.includes('TIMEOUT')) {
    return 'Không kết nối được máy chủ hội thoại. Kiểm tra mạng và thử lại.';
  }
  return 'Máy chủ hội thoại đang bận. Vui lòng thử lại sau.';
}

async function postJsonWithTimeout(url, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    let json = {};
    try {
      json = await res.json();
    } catch (_) {
      json = {};
    }
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      String(error.name) === 'AbortError'
    ) {
      throw new Error('timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function withHardTimeout(promise, timeoutMs = 10000, label = 'timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label)), timeoutMs),
    ),
  ]);
}

function normalizeTextForCompare(s) {
  return String(s || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractMisspelledPairs(original, corrected) {
  const src = String(original || '').trim();
  const dst = String(corrected || '').trim();
  if (!src || !dst) return [];
  const srcTokens = src.split(/\s+/).filter(Boolean);
  const dstTokens = dst.split(/\s+/).filter(Boolean);
  const maxLen = Math.max(srcTokens.length, dstTokens.length);
  const pairs = [];
  for (let i = 0; i < maxLen; i += 1) {
    const from = String(srcTokens[i] || '').trim();
    const to = String(dstTokens[i] || '').trim();
    if (!from && !to) continue;
    if (normalizeTextForCompare(from) === normalizeTextForCompare(to)) continue;
    pairs.push({from, to});
    if (pairs.length >= 6) break;
  }
  return pairs;
}

const DialoguePracticeScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const {scenarioId} = route.params || {};

  const [scenario, setScenario] = useState(() => getDialogueById(scenarioId));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadDialoguesFromFirebase();
      if (!cancelled) {
        setScenario(getDialogueById(scenarioId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  useEffect(() => {
    if (!scenarioId) return;
    const title = scenario?.title || scenario?.name || '';
    void saveContinueLearning({
      kind: CONTINUE_KIND.DIALOGUE,
      scenarioId: String(scenarioId),
      scenarioTitle: String(title || '').slice(0, 160),
    });
  }, [scenarioId, scenario?.title, scenario?.name]);

  const [userAnswer, setUserAnswer] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [finished, setFinished] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageTranslations, setMessageTranslations] = useState({});
  const [translatingMessageId, setTranslatingMessageId] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [translatingSuggestionIdx, setTranslatingSuggestionIdx] = useState(null);
  const [suggestionTranslations, setSuggestionTranslations] = useState({});
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [completionSummary, setCompletionSummary] = useState(null);
  const [showSummarySheet, setShowSummarySheet] = useState(false);
  const [spellcheckByMessageId, setSpellcheckByMessageId] = useState({});
  const scrollRef = useRef(null);
  const lastSuggestedMessageIdRef = useRef('');
  const latestOtherMessageIdRef = useRef('');
  const completedOnceRef = useRef(false);
  const isMountedRef = useRef(true);
  const messageIdCounterRef = useRef(0);
  const suggestionDebounceRef = useRef(null);
  const [refreshSuggestions, setRefreshSuggestions] = useState(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
  }, []);

  const makeStableMessageId = () => {
    messageIdCounterRef.current += 1;
    return `${Date.now()}-${messageIdCounterRef.current}`;
  };

  const appendMessage = (msg) => {
    setMessages((prev) => [
      ...prev,
      {
        id: makeStableMessageId(),
        ...msg,
      },
    ]);
  };

  const makeMessage = (msg) => ({
    id: makeStableMessageId(),
    ...msg,
  });

  // Start conversation: show scenario opening line
  useEffect(() => {
    if (!scenario) return;
    if (messages.length) return;
    const opening =
      scenario.turns?.[0]?.text ||
      scenario.situation ||
      'Hi! How can I help you today?';
    appendMessage({
      from: 'other',
      type: 'prompt',
      text: opening,
      time: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  useEffect(() => {
    // scroll to end after new message
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({animated: true});
    }, 80);
    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    if (finished) {
      setShowSummarySheet(true);
    }
  }, [finished]);

  const handleBack = () => {
    // Không lưu lịch sử chat khi rời màn hội thoại.
    navigation.goBack();
  };

  const assistantName =
    String(scenario?.turns?.[0]?.speaker || '').trim() || 'Nhân vật hội thoại';
  const dialogueProgressId =
    String(scenarioId || scenario?.id || scenario?.title || '')
      .trim()
      .toLowerCase() || '';
  const conversationGoal =
    String(scenario?.goal || '').trim() ||
    String(scenario?.situation || '').trim() ||
    'Hãy trả lời tự nhiên theo ngữ cảnh hội thoại này.';

  const markDialogueCompleted = async () => {
    if (!dialogueProgressId || completedOnceRef.current) return;
    completedOnceRef.current = true;
    try {
      const lp = (await getLearningProgress()) || {};
      const completed = Array.isArray(lp.dialoguesCompleted) ? lp.dialoguesCompleted : [];
      const isFirstComplete = !completed.includes(dialogueProgressId);
      const nextCompleted = isFirstComplete ? [...completed, dialogueProgressId] : completed;
      const xpGain = isFirstComplete
        ? DIALOGUE_XP_FIRST_COMPLETE
        : DIALOGUE_XP_RETRY_COMPLETE;
      const nextXP = Math.max(0, Number(lp.totalXP) || 0) + xpGain;
      const nextLevel = computeLevelName(nextXP);
      await saveLearningProgress({
        ...lp,
        totalXP: nextXP,
        level: nextLevel,
        dialoguesCompleted: nextCompleted,
        dialogueStats: {
          ...(lp.dialogueStats || {}),
          [dialogueProgressId]: {
            completedAt: Date.now(),
            lastXpGain: xpGain,
            isFirstComplete,
          },
        },
      });
      emitLearningProgressUpdated({dialogueId: dialogueProgressId});
      setCompletionSummary({
        xpGain,
        totalXP: nextXP,
        level: nextLevel,
        isFirstComplete,
      });
    } catch (_) {
      completedOnceRef.current = false;
    }
  };

  const callAI = async (nextMessages) => {
    const trimmedMessages = Array.isArray(nextMessages)
      ? nextMessages.slice(-MAX_AI_CONTEXT_MESSAGES)
      : [];
    const json = await postJsonWithTimeout(
      `${AI_SERVER_URL}/dialogue/chat`,
      {
        scenario: {
          title: scenario?.title || '',
          goal: scenario?.goal || '',
          situation: scenario?.situation || '',
        },
        messages: trimmedMessages.map((m) => ({
          from: m.from,
          text: m.text,
        })),
        locale: 'vi',
      },
      20000,
    );
    return json;
  };

  const callTranslateSuggestion = async (text) => {
    const json = await postJsonWithTimeout(`${AI_SERVER_URL}/dialogue/translate`, {text}, 15000);
    return String(json?.translation || '').trim() || 'Chưa dịch được. Thử lại sau.';
  };

  const callSpellcheck = async (text) => {
    const json = await postJsonWithTimeout(
      `${AI_SERVER_URL}/dialogue/spellcheck`,
      {text},
      16000,
    );
    return {
      correctedText: String(json?.correctedText ?? '').trim(),
      explanationVi: String(json?.explanationVi ?? '').trim(),
    };
  };

  const callAISuggestions = async (chatMessages) => {
    const trimmedMessages = Array.isArray(chatMessages)
      ? chatMessages.slice(-MAX_AI_CONTEXT_MESSAGES)
      : [];
    const json = await withHardTimeout(
      postJsonWithTimeout(
        `${AI_SERVER_URL}/dialogue/suggestions`,
        {
          scenario: {
            title: scenario?.title || '',
            goal: scenario?.goal || '',
            situation: scenario?.situation || '',
          },
          messages: trimmedMessages.map((m) => ({
            from: m.from,
            text: m.text,
          })),
        },
        45000,
      ),
      40000,
      'suggestions-timeout',
    );
    return Array.isArray(json?.suggestions) ? json.suggestions : [];
  };

  useEffect(() => {
    if (!messages.length || finished) return;
    const latestOther = [...messages]
      .reverse()
      .find((m) => m.from === 'other' && String(m.text || '').trim().length > 0);
    if (!latestOther?.id) return;
    latestOtherMessageIdRef.current = String(latestOther.id);
    if (lastSuggestedMessageIdRef.current === String(latestOther.id)) return;

    let cancelled = false;
    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }
    suggestionDebounceRef.current = setTimeout(() => {
      if (cancelled) return;
      setDynamicSuggestions([]);
      setSuggestionTranslations({});
      setLoadingSuggestions(true);
      const forceStopTimer = setTimeout(() => {
        if (!cancelled && isMountedRef.current) {
          setLoadingSuggestions(false);
        }
      }, 42000);
      (async () => {
        let suggested = [];
        try {
          suggested = await callAISuggestions(messages);
        } catch (_) {
          suggested = [];
        }
        if (cancelled || !isMountedRef.current) {
          clearTimeout(forceStopTimer);
          return;
        }
        if (suggested.length > 0) {
          // Chỉ đánh dấu đã xử lý khi call thành công, để lỗi timeout/network có thể retry.
          lastSuggestedMessageIdRef.current = String(latestOther.id);
          setDynamicSuggestions(suggested.slice(0, 2));
        } else {
          // Nếu lỗi/rỗng thì cho phép thử lại cùng message id.
          lastSuggestedMessageIdRef.current = '';
        }
        setLoadingSuggestions(false);
        clearTimeout(forceStopTimer);
      })();
    }, 800);
    return () => {
      cancelled = true;
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
  }, [messages, finished, scenario, refreshSuggestions]);

  useEffect(() => {
    // Người dùng mở khung gợi ý mà đang trống -> thử gọi lại 1 lần cho câu "other" gần nhất.
    if (!showSuggestions || finished || loadingSuggestions) return;
    if (Array.isArray(dynamicSuggestions) && dynamicSuggestions.length > 0) return;
    const latestId = String(latestOtherMessageIdRef.current || '');
    if (!latestId) return;
    if (lastSuggestedMessageIdRef.current === latestId) {
      // Đã gọi thành công nhưng AI trả rỗng -> không spam gọi lại liên tục.
      return;
    }
    setRefreshSuggestions((x) => x + 1);
  }, [showSuggestions, finished, loadingSuggestions, dynamicSuggestions]);

  if (!scenario) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Không tìm thấy tình huống hội thoại.</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSend = async () => {
    if (loadingReply || finished || userTurnCount >= MAX_USER_TURNS_PER_DIALOGUE) return;
    const trimmed = String(userAnswer || '').trim();
    if (!trimmed) return;
    const nextUserTurnCount = userTurnCount + 1;

    const userMsg = makeMessage({from: 'me', type: 'answer', text: trimmed});
    const nextMessages = [...messages, userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setSpellcheckByMessageId((prev) => {
      if (!prev?.[String(userMsg.id)]) return prev;
      const next = {...prev};
      delete next[String(userMsg.id)];
      return next;
    });
    setUserAnswer('');
    setLoadingReply(true);
    // Tự kiểm tra chính tả sau khi người học gửi tin nhắn.
    void (async () => {
      try {
        const {correctedText: aiCorrected, explanationVi} = await callSpellcheck(trimmed);
        if (!isMountedRef.current) return;
        const correctedText = String(aiCorrected || '').trim();
        if (!correctedText) return;
        if (normalizeTextForCompare(correctedText) === normalizeTextForCompare(trimmed)) {
          return;
        }
        setSpellcheckByMessageId((prev) => ({
          ...prev,
          [String(userMsg.id)]: {
            correctedText,
            pairs: extractMisspelledPairs(trimmed, correctedText),
            explanationVi: String(explanationVi || '').trim(),
          },
        }));
      } catch (_) {}
    })();
    try {
      const ai = await callAI(nextMessages);
      if (!isMountedRef.current) return;
      const rawReply = String(ai?.replyText || '').trim() || '...';
      const splitIdx = rawReply.indexOf('|');
      const replyText =
        splitIdx >= 0 ? rawReply.slice(0, splitIdx).trim() || rawReply : rawReply;
      const done = Boolean(ai?.done);
      const newMsg = makeMessage({
        from: 'other',
        type: 'reply',
        text: replyText,
        time: new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
      setMessages((prev) => [...prev, newMsg]);
      if (done || nextUserTurnCount >= MAX_USER_TURNS_PER_DIALOGUE) {
        setFinished(true);
        await markDialogueCompleted();
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      const errMsg =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      const shortMsg = friendlyDialogueError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: makeStableMessageId(),
          from: 'other',
          type: 'reply',
          text: shortMsg,
          time: new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } finally {
      if (isMountedRef.current) {
        setLoadingReply(false);
      }
    }
  };

  const handleUseSuggestion = (text) => {
    if (loadingReply || finished) return;
    setUserAnswer(text);
  };

  const handleTranslateSuggestion = async (text, idx) => {
    if (!text || translatingSuggestionIdx === idx) return;
    if (suggestionTranslations[idx]) return;
    setTranslatingSuggestionIdx(idx);
    try {
      const translated = await callTranslateSuggestion(text);
      setSuggestionTranslations((prev) => ({...prev, [idx]: translated}));
    } catch (_) {
      setSuggestionTranslations((prev) => ({
        ...prev,
        [idx]: 'Chưa dịch được. Thử lại sau.',
      }));
    } finally {
      setTranslatingSuggestionIdx(null);
    }
  };

  const handleTranslateMessage = async (msg) => {
    if (!msg?.id || !msg?.text) return;
    const messageId = String(msg.id);
    if (messageTranslations[messageId]) {
      return;
    }
    if (translatingMessageId === messageId) {
      return;
    }
    setTranslatingMessageId(messageId);
    try {
      const translated = await callTranslateSuggestion(msg.text);
      setMessageTranslations((prev) => ({...prev, [messageId]: translated}));
    } catch (_) {
      setMessageTranslations((prev) => ({
        ...prev,
        [messageId]: 'Chưa dịch được. Thử lại sau.',
      }));
    } finally {
      setTranslatingMessageId(null);
    }
  };

  const accent = String(scenario?.accentColor || COLORS.PRIMARY).trim() || COLORS.PRIMARY;
  const userTurnCount = messages.filter((m) => m.from === 'me').length;
  const dialogueTurnCount = messages.length;
  const remainingTurns = Math.max(0, MAX_USER_TURNS_PER_DIALOGUE - userTurnCount);

  const handleReplayDialogue = () => {
    completedOnceRef.current = false;
    lastSuggestedMessageIdRef.current = '';
    latestOtherMessageIdRef.current = '';
    setFinished(false);
    setShowSummarySheet(false);
    setCompletionSummary(null);
    setMessages([]);
    setMessageTranslations({});
    setSuggestionTranslations({});
    setDynamicSuggestions([]);
    setShowSuggestions(false);
    setUserAnswer('');
    setLoadingReply(false);
    setSpellcheckByMessageId({});
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.header,
            {paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 8 : 6)},
          ]}>
          <TouchableOpacity style={styles.headerBackButton} onPress={handleBack}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {scenario?.title || 'Hội thoại'}
            </Text>
          </View>
          <View style={styles.headerAccentDot}>
            <View style={[styles.headerAccentInner, {backgroundColor: accent}]} />
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          ref={scrollRef}>
          <View style={[styles.goalCard, {borderLeftColor: accent}]}>
            <View style={styles.goalCardTop}>
              <Feather name="target" size={16} color={accent} />
              <Text style={[styles.goalCardLabel, {color: accent}]}>Mục tiêu</Text>
            </View>
            <Text style={styles.goalText}>{conversationGoal}</Text>
          </View>
          <View style={styles.chat}>
            {messages.map((m) => {
              if (m.from === 'me') {
                const spellRow = spellcheckByMessageId[String(m.id)];
                return (
                  <View key={m.id} style={[styles.row, styles.rowRight]}>
                    <View style={[styles.bubble, styles.bubbleMe]}>
                      <Text style={styles.bubbleMeText}>{m.text}</Text>
                      {spellRow?.correctedText ? (
                        <View style={styles.inlineSpellcheckWrap}>
                          <Text style={styles.inlineSpellcheckLabel}>Sửa gợi ý</Text>
                          {Array.isArray(spellRow.pairs) && spellRow.pairs.length > 0 ? (
                            <View style={styles.inlineSpellcheckPairsWrap}>
                              {spellRow.pairs.map((pair, idx) => (
                                <View key={`${String(m.id)}-pair-${idx}`} style={styles.inlineSpellcheckPairChip}>
                                  <Text style={styles.inlineSpellcheckPairFrom}>
                                    {pair.from || '...'}
                                  </Text>
                                  <Text style={styles.inlineSpellcheckPairArrow}>{' -> '}</Text>
                                  <Text style={styles.inlineSpellcheckPairTo}>
                                    {pair.to || '...'}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.inlineSpellcheckText}>
                              {spellRow.correctedText}
                            </Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              }
              // other (prompt)
              return (
                <View key={m.id} style={styles.row}>
                  <Text style={styles.senderName}>{assistantName}</Text>
                  <View style={styles.rowMessageWrap}>
                  <View style={[styles.bubble, styles.bubbleOther]}>
                    <Text style={styles.bubbleOtherText}>{m.text}</Text>
                    {messageTranslations[String(m.id)] ? (
                      <Text style={styles.bubbleOtherSubText}>
                        {messageTranslations[String(m.id)]}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.messageTranslateBtn}
                    onPress={() => handleTranslateMessage(m)}
                    activeOpacity={0.85}
                    disabled={translatingMessageId === String(m.id)}>
                    <Text style={styles.messageTranslateGlyph}>文A</Text>
                    <Text style={styles.messageTranslateText}>
                      {translatingMessageId === String(m.id) ? 'Đang dịch...' : 'Dịch'}
                    </Text>
                  </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {!finished ? (
          <View
            style={[
              styles.bottomPanel,
              {paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 10) + 10},
            ]}>
            <TouchableOpacity
              style={styles.suggestionToggleBtn}
              onPress={() => setShowSuggestions((v) => !v)}
              activeOpacity={0.85}>
              <Feather name="lightbulb" size={16} color={COLORS.PRIMARY_DARK} />
              <Text style={styles.suggestionToggleBtnText}>Gợi ý trả lời</Text>
              <Feather
                name={showSuggestions ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.TEXT_SECONDARY}
              />
            </TouchableOpacity>
            {showSuggestions ? (
              <>
                {Array.isArray(dynamicSuggestions) && dynamicSuggestions.length > 0 ? (
                  <>
                    {loadingSuggestions ? (
                      <Text style={styles.loadingSuggestionsText}>
                        Đang tối ưu gợi ý bằng AI...
                      </Text>
                    ) : null}
                    <ScrollView
                      style={styles.suggestionScroll}
                      contentContainerStyle={styles.suggestionScrollContent}
                      showsVerticalScrollIndicator={false}>
                      {dynamicSuggestions.map((s, idx) => (
                        <View key={`sg-${idx}`} style={styles.suggestionRow}>
                          <View style={styles.suggestionCardRow}>
                            <TouchableOpacity
                              style={styles.suggestionChip}
                              onPress={() => handleUseSuggestion(s)}
                              activeOpacity={0.85}>
                              <Text style={styles.suggestionChipText}>{s}</Text>
                              {suggestionTranslations[idx] ? (
                                <Text style={styles.suggestionTranslationInline}>
                                  {suggestionTranslations[idx]}
                                </Text>
                              ) : null}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.translateBtn}
                              onPress={() => handleTranslateSuggestion(s, idx)}
                              activeOpacity={0.85}
                              disabled={translatingSuggestionIdx === idx}>
                              <Text style={styles.translateGlyph}>文A</Text>
                              <Text style={styles.translateBtnText}>
                                {translatingSuggestionIdx === idx ? '...' : 'Dịch'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : loadingSuggestions ? (
                  <Text style={styles.loadingSuggestionsText}>Đang tạo gợi ý phù hợp...</Text>
                ) : (
                  <ScrollView
                    style={styles.suggestionScroll}
                    contentContainerStyle={styles.suggestionScrollContent}
                    showsVerticalScrollIndicator={false}>
                    <Text style={styles.loadingSuggestionsText}>
                      Chưa có gợi ý phù hợp cho câu hỏi hiện tại.
                    </Text>
                  </ScrollView>
                )}
              </>
            ) : null}

            <View style={styles.inputDock}>
              <TextInput
                style={styles.input}
                placeholder={
                  remainingTurns > 0
                    ? `Nhập tin nhắn của bạn... (còn ${remainingTurns} lượt)`
                    : 'Đã đạt giới hạn lượt hội thoại'
                }
                value={userAnswer}
                onChangeText={(t) => {
                  setUserAnswer(t);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loadingReply && remainingTurns > 0}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[
                  styles.sendIconBtn,
                  (!userAnswer.trim() || loadingReply || remainingTurns <= 0) &&
                    styles.sendIconBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!userAnswer.trim() || loadingReply || remainingTurns <= 0}
                activeOpacity={0.85}>
                <Feather name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <Modal
        visible={showSummarySheet && finished}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSummarySheet(false)}>
        <View style={styles.summaryBackdrop}>
          <View style={styles.summarySheet}>
            <View style={styles.summaryHandle} />
            <Text style={styles.summaryTitle}>Hoàn thành hội thoại</Text>
            <View style={styles.summaryXpCard}>
              <View style={styles.summaryXpHead}>
                <Feather name="message-circle" size={14} color="#0EA5E9" />
                <Text style={styles.summaryXpHeadText}>Thưởng luyện tập</Text>
              </View>
              <Text style={styles.summaryXpValue}>
                +{Math.max(0, Number(completionSummary?.xpGain) || 0)} XP
              </Text>
              <Text style={styles.summaryXpDesc}>
                {completionSummary?.isFirstComplete
                  ? 'Bạn vừa hoàn thành lần đầu tình huống này.'
                  : 'Bạn vừa hoàn thành một lượt luyện lại.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.summaryPrimaryButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}>
              <Text style={styles.summaryPrimaryButtonText}>Tiếp tục</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.summarySecondaryButton}
              onPress={handleReplayDialogue}
              activeOpacity={0.85}>
              <Text style={styles.summarySecondaryButtonText}>Phát lại hội thoại này</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: COLORS.PRIMARY,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerBackButton: {
    padding: 6,
    marginRight: 2,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 23,
  },
  headerAccentDot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAccentInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12,
  },
  goalCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {elevation: 2},
    }),
  },
  goalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  goalCardLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  goalText: {
    fontSize: 14,
    color: COLORS.TEXT,
    lineHeight: 21,
    fontWeight: '600',
  },
  chat: {gap: 10, paddingBottom: 12},
  row: {gap: 5},
  rowMessageWrap: {maxWidth: '82%'},
  rowRight: {alignItems: 'flex-end'},
  senderName: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginLeft: 4,
    fontWeight: '500',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleOther: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {elevation: 1},
    }),
  },
  bubbleOtherText: {color: COLORS.TEXT, fontWeight: '800'},
  bubbleOtherSubText: {marginTop: 6, color: COLORS.TEXT_SECONDARY, fontSize: 13},
  bubbleMe: {backgroundColor: COLORS.PRIMARY},
  bubbleMeText: {color: COLORS.BACKGROUND_WHITE, fontWeight: '800'},
  inlineSpellcheckWrap: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.26)',
    paddingTop: 8,
  },
  inlineSpellcheckLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FEF3C7',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  inlineSpellcheckText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  inlineSpellcheckPairsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  inlineSpellcheckPairChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineSpellcheckPairFrom: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FECACA',
  },
  inlineSpellcheckPairArrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E5E7EB',
  },
  inlineSpellcheckPairTo: {
    fontSize: 12,
    fontWeight: '800',
    color: '#BBF7D0',
  },
  messageTranslateBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFEDD5',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FDBA74',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  messageTranslateGlyph: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  messageTranslateText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    color: COLORS.TEXT,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    flex: 1,
  },
  bottomPanel: {
    paddingTop: 8,
    backgroundColor: COLORS.BACKGROUND,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  suggestionToggleBtn: {
    marginHorizontal: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionToggleBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
  },
  loadingSuggestionsText: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  suggestionScroll: {
    maxHeight: 170,
  },
  suggestionScrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 10,
  },
  suggestionRow: {
    gap: 6,
  },
  suggestionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#FDBA74',
    flex: 1,
  },
  suggestionChipText: {
    color: COLORS.PRIMARY_DARK,
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionTranslationInline: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  translateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFEDD5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  translateGlyph: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
    lineHeight: 13,
  },
  translateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  sendIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIconBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  turnLimitHint: {
    paddingHorizontal: 12,
    paddingTop: 6,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  turnLimitHintStrong: {
    fontStyle: 'normal',
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: 'center',
  },
  secondaryText: {color: COLORS.TEXT, fontWeight: '900'},
  primaryButton: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
  },
  primaryButtonText: {color: COLORS.BACKGROUND_WHITE, fontWeight: '900'},
  disabledButton: {opacity: 0.6},
  summaryBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
  },
  summarySheet: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  summaryHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 2,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.TEXT,
    textAlign: 'center',
  },
  summaryXpCard: {
    borderWidth: 1,
    borderColor: '#CFFAFE',
    backgroundColor: '#ECFEFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  summaryXpHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryXpHeadText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0E7490',
  },
  summaryXpValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 34,
  },
  summaryXpDesc: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 18,
    fontWeight: '600',
  },
  summaryPrimaryButton: {
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 13,
    alignItems: 'center',
  },
  summaryPrimaryButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  summarySecondaryButton: {
    borderRadius: 14,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 12,
    alignItems: 'center',
  },
  summarySecondaryButtonText: {
    fontSize: 16,
    color: COLORS.TEXT,
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default DialoguePracticeScreen;

