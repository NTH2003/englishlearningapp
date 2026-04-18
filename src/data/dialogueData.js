// Dữ liệu tình huống hội thoại theo chủ đề / cấp độ
// accentColor, difficultyVi, durationMinutes, completed — phục vụ UI màn giới thiệu

export const dialogueScenarios = [
  {
    id: 'intro_self_beginner',
    topicId: 'Daily Life',
    icon: '👋',
    title: 'Giới thiệu bản thân',
    description: 'Học cách tự giới thiệu',
    difficultyVi: 'Dễ',
    durationMinutes: 5,
    completed: true,
    accentColor: '#2563EB',
    goal: 'Luyện cách giới thiệu tên, nơi đến và sở thích ngắn gọn bằng tiếng Anh.',
    situation:
      'Bạn tham gia một buổi gặp nhóm mới. Một người nói: “Hi! Nice to meet you. What’s your name?”',
    rolePlayPrompt:
      'Hãy nhập câu trả lời bằng tiếng Anh để giới thiệu bản thân.',
    turns: [
      {
        id: 1,
        speaker: 'Bạn mới',
        text: "Hi! Nice to meet you. What's your name and where are you from?",
        translation:
          'Chào bạn! Rất vui được gặp bạn. Bạn tên gì và đến từ đâu?',
      },
    ],
    suggestions: [
      "Hi! My name is Linh. I'm from Vietnam.",
      "Nice to meet you too. I'm a student and I love learning English.",
      "I'm from Hanoi. What about you?",
    ],
  },
  {
    id: 'coffee_order_beginner',
    topicId: 'Food',
    icon: '☕',
    title: 'Đặt mua cà phê yêu thích của bạn',
    description:
      'Bạn đang ở một quán cà phê mới trong khu phố của mình. Hãy gọi món cà phê yêu thích của bạn.',
    difficultyVi: 'Trung bình',
    durationMinutes: 8,
    completed: false,
    accentColor: '#22C55E',
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
      'Hi, can I have a latte, please?',
      'I’d like an iced coffee with milk, please.',
      'Can I get a cappuccino to go, please?',
    ],
  },
  {
    id: 'hotel_checkin_intermediate',
    topicId: 'Travel',
    icon: '🏨',
    title: 'Làm thủ tục nhận phòng khách sạn',
    description:
      'Bạn đến quầy lễ tân của một khách sạn ở nước ngoài để nhận phòng đã đặt trước.',
    difficultyVi: 'Khó',
    durationMinutes: 10,
    completed: false,
    accentColor: '#EA580C',
    goal:
      'Luyện cách giới thiệu bản thân, xác nhận đặt phòng và hỏi thêm thông tin cần thiết khi nhận phòng khách sạn.',
    situation:
      'Lễ tân nói: “Good evening. Do you have a reservation with us?”. Bạn sẽ giới thiệu và xác nhận đặt phòng như thế nào?',
    rolePlayPrompt:
      'Hãy nhập câu trả lời bằng tiếng Anh để xác nhận đặt phòng và hỏi thêm thông tin (wifi, bữa sáng, giờ trả phòng...).',
    turns: [
      {
        id: 1,
        speaker: 'Lễ tân',
        text: 'Good evening. Do you have a reservation with us?',
        translation: 'Chào buổi tối. Bạn đã đặt phòng trước tại khách sạn chúng tôi chưa?',
      },
    ],
    suggestions: [
      "Good evening. Yes, I have a reservation under the name of [Your Name].",
      'Yes, I booked a double room for two nights.',
      'Could you please tell me the check-out time and if breakfast is included?',
    ],
  },
];

export const getDialogueById = id =>
  dialogueScenarios.find(dialogue => dialogue.id === id);
