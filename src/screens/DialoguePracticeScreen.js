import React, {useState} from 'react';
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
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS} from '../constants';
import {getDialogueById} from '../data/dialogueData';

const DialoguePracticeScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {scenarioId} = route.params || {};

  const scenario = getDialogueById(scenarioId);

  const [userAnswer, setUserAnswer] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [messages, setMessages] = useState(() => {
    const firstStaffText =
      scenario?.turns?.[0]?.text ||
      '[smiling] Good morning, what coffee would you like?';
    const firstStaffTrans =
      scenario?.turns?.[0]?.translation ||
      '[mỉm cười] Chào buổi sáng, bạn muốn uống loại cà phê nào?';
    return [
      {
        id: 'staff-1',
        from: 'staff',
        text: firstStaffText,
        translation: firstStaffTrans,
      },
    ];
  });

  const handleBack = () => {
    navigation.goBack();
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

  const handleShowSuggestions = () => {
    setShowSuggestions(true);
  };

  const handleSendAnswer = () => {
    const trimmed = userAnswer.trim();
    if (!trimmed) {
      return;
    }

    // Thêm tin nhắn của người học
    const newMessages = [
      ...messages,
      {
        id: `user-${messages.length + 1}`,
        from: 'user',
        text: trimmed,
      },
    ];

    // Đếm số câu của nhân viên đã nói
    const staffCount = messages.filter(m => m.from === 'staff').length;

    // Nếu đây là lần trả lời đầu tiên, cho nhân viên nói câu tiếp theo dựa trên câu trả lời
    if (staffCount === 1) {
      const lower = trimmed.toLowerCase();
      let drink = null;
      if (lower.includes('latte')) {
        drink = 'latte';
      } else if (lower.includes('cappuccino')) {
        drink = 'cappuccino';
      } else if (lower.includes('espresso')) {
        drink = 'espresso';
      } else if (lower.includes('iced coffee') || lower.includes('ice coffee')) {
        drink = 'iced coffee';
      }

      let replyText = '';
      let replyTrans = '';

      if (drink) {
        replyText = `Great choice! I'll prepare your ${drink} now.`;
        replyTrans = `Tuyệt vời! Tôi sẽ chuẩn bị ${drink} cho bạn ngay.`;
      } else {
        replyText = 'How about a Cappuccino, Espresso, or Iced Coffee?';
        replyTrans =
          'Ví dụ, bạn có thể chọn Cappuccino, Espresso hoặc Cà phê đá.';
      }

      newMessages.push({
        id: `staff-${staffCount + 1}`,
        from: 'staff',
        text: replyText,
        translation: replyTrans,
      });
    }

    setMessages(newMessages);
    setUserAnswer('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Thực hành hội thoại</Text>
          <View style={{width: 60}} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <Text style={styles.icon}>☕</Text>
            <View style={{flex: 1}}>
              <Text style={styles.title}>{scenario.title}</Text>
              <Text style={styles.levelText}>Mức: Sơ cấp</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Mục tiêu</Text>
            <Text style={styles.blockText}>{scenario.goal}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Tình huống</Text>
            <Text style={styles.blockText}>{scenario.situation}</Text>
          </View>

          {/* Đoạn hội thoại dạng chat giữa 2 người */}
          <View style={styles.conversationBlock}>
            <Text style={styles.agentLabel}>Nhân viên pha chế cà phê ☕</Text>

            {messages.map(message => {
              if (message.from === 'staff') {
                return (
                  <View key={message.id} style={styles.messageRow}>
                    <View style={styles.avatarOther}>
                      <Text style={styles.avatarText}>👩‍🍳</Text>
                    </View>
                    <View style={[styles.bubble, styles.bubbleOther]}>
                      <Text style={styles.messageTextBold}>{message.text}</Text>
                      {message.translation ? (
                        <Text style={styles.messageSubText}>
                          {message.translation}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              }

              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, styles.messageRowRight]}>
                  <View style={styles.bubbleSpacer} />
                  <View style={[styles.bubble, styles.bubbleMe]}>
                    <Text style={styles.messageTextBold}>{message.text}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Nhiệm vụ của bạn</Text>
            <Text style={styles.blockText}>{scenario.rolePlayPrompt}</Text>
          </View>

          <View style={styles.answerBlock}>
            <Text style={styles.answerLabel}>Câu trả lời của bạn (bằng tiếng Anh)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                multiline
                placeholder="Ví dụ: Hi, can I have a latte, please?"
                value={userAnswer}
                onChangeText={setUserAnswer}
              />
              <TouchableOpacity
                style={styles.sendButton}
                activeOpacity={0.8}
                onPress={handleSendAnswer}>
                <Text style={styles.sendButtonText}>Gửi</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!showSuggestions && (
            <TouchableOpacity
              style={styles.suggestionButton}
              activeOpacity={0.8}
              onPress={handleShowSuggestions}>
              <Text style={styles.suggestionButtonText}>Xem gợi ý câu trả lời</Text>
            </TouchableOpacity>
          )}

          {showSuggestions && (
            <View style={styles.suggestionsBlock}>
              <Text style={styles.blockLabel}>Gợi ý mẫu câu</Text>
              {scenario.suggestions.map((s, index) => (
                <View key={index} style={styles.suggestionItem}>
                  <Text style={styles.suggestionBullet}>•</Text>
                  <Text style={styles.suggestionText}>{s}</Text>
                </View>
              ))}
              <Text style={styles.noteText}>
                Hãy thử tự nói lại bằng cách dùng mẫu trên và thay đổi đồ uống theo ý bạn.
              </Text>
            </View>
          )}
        </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    color: COLORS.PRIMARY,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.TEXT,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  levelText: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
  },
  block: {
    marginBottom: 12,
  },
  blockLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  blockText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
  },
  answerBlock: {
    marginTop: 8,
    marginBottom: 12,
  },
  answerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 60,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.TEXT,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    textAlignVertical: 'top',
    marginRight: 8,
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY,
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  suggestionButton: {
    marginTop: 4,
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  suggestionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  suggestionsBlock: {
    marginTop: 16,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 14,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  conversationBlock: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  agentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarOther: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 20,
  },
  bubbleSpacer: {
    width: 32,
    marginRight: 8,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleOther: {
    backgroundColor: '#E5F8FF',
  },
  bubbleMe: {
    backgroundColor: COLORS.PRIMARY,
  },
  speakerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 2,
  },
  messageTextBold: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  messageSubText: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  suggestionBullet: {
    fontSize: 16,
    marginRight: 6,
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.TEXT,
  },
  noteText: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
});

export default DialoguePracticeScreen;

