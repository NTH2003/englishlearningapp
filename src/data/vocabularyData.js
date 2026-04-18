/**
 * Bài học (metadata trong app). Danh sách từ gắn bài học lấy từ Firestore qua getAllVocabulary()
 * — điền `words` là mảng id từ khớp với document config/vocabulary trên Firebase.
 */
export const lessonsData = [
  {
    id: 1,
    title: 'Gia đình và bạn bè',
    category: 'Giao tiếp',
    level: 'Sơ cấp',
    words: [1, 6],
    progress: 0,
    description: 'Học các từ vựng về gia đình và bạn bè',
  },
  {
    id: 2,
    title: 'Công việc và nghề nghiệp',
    category: 'Chuyên ngành',
    level: 'Trung cấp',
    words: [3, 4, 5],
    progress: 0,
    description: 'Từ vựng về công việc và nghề nghiệp',
  },
  {
    id: 3,
    title: 'Sức khỏe và y tế',
    category: 'Y tế',
    level: 'Sơ cấp',
    words: [8],
    progress: 0,
    description: 'Học từ vựng về sức khỏe',
  },
];
