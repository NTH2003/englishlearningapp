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
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AI_SERVER_URL, COLORS} from '../../constants';
import {getDialogueById, loadDialoguesFromFirebase} from '../../services/dialogueService';
import {getLearningProgress, saveLearningProgress} from '../../services/storageService';
import Feather from 'react-native-vector-icons/Feather';

function buildHeuristicSuggestions(latestPartnerText, scenario) {
  const q = String(latestPartnerText || '').toLowerCase();
  const scenarioTitle = String(scenario?.title || '').toLowerCase();

  if (q.includes('name') && q.includes('from')) {
    return [
      "Hi! I'm Linh, and I'm from Vietnam.",
      "My name is Linh. I come from Hanoi.",
      "Nice to meet you. I'm Linh from Vietnam.",
    ];
  }
  if (q.includes('your name')) {
    return [
      "Hi, I'm Linh.",
      "My name is Linh. Nice to meet you.",
      "I'm Linh. Glad to meet you.",
    ];
  }
  if (q.includes('what can i get for you') || q.includes('would you like')) {
    return [
      "I'd like a latte, please.",
      "Can I have an iced coffee with milk, please?",
      "A cappuccino, please. Thank you.",
    ];
  }
  if (q.includes('reservation') || q.includes('check in')) {
    return [
      "Yes, I have a reservation under the name Linh.",
      "I booked a room for two nights.",
      "Yes, I have a booking. Could you help me check in?",
    ];
  }
  if (q.includes('free time') || q.includes('hobby') || q.includes('enjoy doing')) {
    return [
      "I enjoy reading books and listening to music.",
      "In my free time, I usually play badminton.",
      "I like watching movies and practicing English.",
    ];
  }
  if (scenarioTitle.includes('giới thiệu')) {
    return [
      "I'm Linh from Vietnam, and I'm a student.",
      "Nice to meet you. I'm from Hanoi.",
      "I love learning English in my free time.",
    ];
  }
  if (scenarioTitle.includes('cà phê')) {
    return [
      "I'd like a hot latte, please.",
      "Can I get an iced Americano, please?",
      "A cappuccino to go, please.",
    ];
  }
  if (scenarioTitle.includes('nhận phòng')) {
    return [
      "Yes, I have a reservation under Linh.",
      "I booked a double room for two nights.",
      "Could you tell me the check-out time, please?",
    ];
  }
  return [
    "Could you repeat that, please?",
    "Sure. I understand. Here's my answer.",
    "Thanks. Let me explain clearly.",
  ];
}

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
  const scrollRef = useRef(null);
  const lastSuggestedMessageIdRef = useRef('');

  const appendMessage = (msg) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...msg,
      },
    ]);
  };

  const makeMessage = (msg) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

  const handleBack = () => {
    // Save progress when leaving mid-way
    (async () => {
      try {
        const lp = (await getLearningProgress()) || {};
        await saveLearningProgress({
          ...lp,
          dialogueProgress: {
            ...(lp.dialogueProgress || {}),
            [scenarioId]: {
              messages,
              updatedAt: Date.now(),
            },
          },
        });
      } catch (_) {}
      navigation.goBack();
    })();
  };

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
  const assistantName =
    String(scenario?.turns?.[0]?.speaker || '').trim() || 'Nhân vật hội thoại';
  const conversationGoal =
    String(scenario?.goal || '').trim() ||
    String(scenario?.situation || '').trim() ||
    'Hãy trả lời tự nhiên theo ngữ cảnh hội thoại này.';

  const callAI = async (nextMessages) => {
    const res = await fetch(`${AI_SERVER_URL}/dialogue/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        scenario: {
          title: scenario?.title || '',
          goal: scenario?.goal || '',
          situation: scenario?.situation || '',
        },
        messages: nextMessages.map((m) => ({
          from: m.from,
          text: m.text,
        })),
        locale: 'vi',
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Lỗi máy chủ');
    }
    return json;
  };

  const callTranslateSuggestion = async (text) => {
    const res = await fetch(`${AI_SERVER_URL}/dialogue/translate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text}),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Lỗi dịch');
    }
    return String(json?.translation || '').trim() || 'Chưa dịch được. Thử lại sau.';
  };

  const callAISuggestions = async (chatMessages) => {
    const res = await fetch(`${AI_SERVER_URL}/dialogue/suggestions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        scenario: {
          title: scenario?.title || '',
          goal: scenario?.goal || '',
          situation: scenario?.situation || '',
        },
        messages: chatMessages.map((m) => ({
          from: m.from,
          text: m.text,
        })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || 'Lỗi tạo gợi ý');
    }
    return Array.isArray(json?.suggestions) ? json.suggestions : [];
  };

  useEffect(() => {
    if (!messages.length || finished) return;
    const latestOther = [...messages]
      .reverse()
      .find((m) => m.from === 'other' && String(m.text || '').trim().length > 0);
    if (!latestOther?.id) return;
    if (lastSuggestedMessageIdRef.current === String(latestOther.id)) return;
    lastSuggestedMessageIdRef.current = String(latestOther.id);

    let cancelled = false;
    setLoadingSuggestions(true);
    const localFallback = buildHeuristicSuggestions(latestOther.text, scenario);
    (async () => {
      try {
        const suggested = await callAISuggestions(messages);
        if (cancelled) return;
        if (suggested.length > 0) {
          setDynamicSuggestions(suggested);
          setSuggestionTranslations({});
        } else {
          setDynamicSuggestions(localFallback);
        }
      } catch (_) {
        if (!cancelled) {
          setDynamicSuggestions(localFallback);
        }
      } finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, finished, scenario]);

  const handleSend = async () => {
    if (loadingReply || finished) return;
    const trimmed = String(userAnswer || '').trim();
    if (!trimmed) return;

    const userMsg = makeMessage({from: 'me', type: 'answer', text: trimmed});
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setUserAnswer('');
    setLoadingReply(true);
    try {
      const ai = await callAI(nextMessages);
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
      if (done) {
        setFinished(true);
        try {
          const lp = (await getLearningProgress()) || {};
          const completed = Array.isArray(lp.dialoguesCompleted)
            ? lp.dialoguesCompleted
            : [];
          const nextCompleted = completed.includes(scenarioId)
            ? completed
            : [...completed, scenarioId];
          await saveLearningProgress({
            ...lp,
            dialoguesCompleted: nextCompleted,
            dialogueStats: {
              ...(lp.dialogueStats || {}),
              [scenarioId]: {
                completedAt: Date.now(),
              },
            },
          });
        } catch (_) {}
      }
    } catch (error) {
      const errMsg =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      const shortMsg = friendlyDialogueError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
      setLoadingReply(false);
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
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBackButton} onPress={handleBack}>
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {scenario.title}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          ref={scrollRef}>
          {finished ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Kết quả luyện tập</Text>
              <Text style={styles.resultLine}>
                Bạn đã hoàn thành tình huống này.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Kết thúc</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.goalCard}>
                <Text style={styles.goalText}>
                  <Text style={styles.goalTextStrong}>Mục tiêu: </Text>
                  {conversationGoal}
                </Text>
              </View>
              <View style={styles.chat}>
                {messages.map((m) => {
                  if (m.from === 'me') {
                    return (
                      <View key={m.id} style={[styles.row, styles.rowRight]}>
                        <View style={[styles.bubble, styles.bubbleMe]}>
                          <Text style={styles.bubbleMeText}>{m.text}</Text>
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
            </>
          )}
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
                {loadingSuggestions ? (
                  <Text style={styles.loadingSuggestionsText}>Đang tạo gợi ý phù hợp...</Text>
                ) : Array.isArray(dynamicSuggestions) && dynamicSuggestions.length > 0 ? (
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
                ) : (
                  <Text style={styles.loadingSuggestionsText}>
                    Chưa có gợi ý phù hợp cho câu hỏi hiện tại.
                  </Text>
                )}
              </>
            ) : null}

            <View style={styles.inputDock}>
              <TextInput
                style={styles.input}
                placeholder="Nhập tin nhắn của bạn..."
                value={userAnswer}
                onChangeText={setUserAnswer}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loadingReply}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity style={styles.micBtn} activeOpacity={0.85}>
                <Feather name="mic" size={20} color={COLORS.PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sendIconBtn,
                  (!userAnswer.trim() || loadingReply) && styles.sendIconBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!userAnswer.trim() || loadingReply}
                activeOpacity={0.85}>
                <Feather name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    paddingTop: Math.max(Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0, 10),
    paddingBottom: 10,
    backgroundColor: COLORS.PRIMARY,
  },
  headerBackButton: {
    padding: 6,
    marginRight: 4,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 25,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  goalText: {
    fontSize: 14,
    color: COLORS.TEXT,
    lineHeight: 21,
  },
  goalTextStrong: {
    fontWeight: '800',
    color: COLORS.TEXT,
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
  },
  bubbleOtherText: {color: COLORS.TEXT, fontWeight: '800'},
  bubbleOtherSubText: {marginTop: 6, color: COLORS.TEXT_SECONDARY, fontSize: 13},
  bubbleMe: {backgroundColor: COLORS.PRIMARY},
  bubbleMeText: {color: COLORS.BACKGROUND_WHITE, fontWeight: '800'},
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
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
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
  resultCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  resultTitle: {fontSize: 18, fontWeight: '900', color: COLORS.TEXT, marginBottom: 10},
  resultLine: {fontSize: 14, color: COLORS.TEXT_SECONDARY, fontWeight: '700', marginBottom: 6},
  resultStrong: {color: COLORS.TEXT, fontWeight: '900'},
});

export default DialoguePracticeScreen;

