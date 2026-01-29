// Dữ liệu tình huống hội thoại theo chủ đề

export const dialogueScenarios = [
  {
    id: 'coffee_order_beginner',
    topicId: 'Food',
    level: 'Beginner',
    title: 'Đặt mua cà phê yêu thích của bạn',
    description:
      'Bạn đang ở một quán cà phê mới trong khu phố của mình. Hãy gọi món cà phê yêu thích của bạn.',
    goal:
      'Luyện cách gọi món lịch sự bằng tiếng Anh trong quán cà phê. Bạn có thể sử dụng gợi ý nếu gặp khó khăn.',
    situation:
      'Bạn bước vào quán cà phê. Nhân viên nói: “Hi, what can I get for you today?”. Bạn sẽ trả lời như thế nào?',
    rolePlayPrompt: 'Hãy nhập câu trả lời của bạn bằng tiếng Anh, giống như bạn đang nói với nhân viên.',
    turns: [
      {
        id: 1,
        speaker: 'Nhân viên',
        text: 'Hi, what can I get for you today?',
        translation: 'Chào bạn, hôm nay tôi có thể phục vụ bạn món gì?',
      },
    ],
    suggestions: [
      "Hi, can I have a latte, please?",
      "I’d like an iced coffee with milk, please.",
      "Can I get a cappuccino to go, please?",
    ],
  },
];

export const getDialogueById = id =>
  dialogueScenarios.find(dialogue => dialogue.id === id);

export const getDialoguesByTopic = topicId =>
  dialogueScenarios.filter(dialogue => dialogue.topicId === topicId);

