// Dữ liệu video học tiếng Anh
export const videoData = [
  {
    id: 1,
    title: 'Ordering Food at a Restaurant',
    description: 'Học cách gọi món tại nhà hàng',
    thumbnail: '🍽️',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // URL mẫu, thay bằng video thực tế
    duration: '5:30',
    level: 'Beginner',
    category: 'Food',
    relatedWordIds: [1, 2, 3, 4, 5, 6, 7, 8], // IDs của từ vựng liên quan
  },
  {
    id: 2,
    title: 'Traveling to a New City',
    description: 'Học từ vựng về du lịch và khám phá',
    thumbnail: '✈️',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', // URL mẫu
    duration: '6:15',
    level: 'Intermediate',
    category: 'Travel',
    relatedWordIds: [6, 7, 8, 9, 10],
  },
  {
    id: 3,
    title: 'Daily Life Conversations',
    description: 'Hội thoại hàng ngày trong cuộc sống',
    thumbnail: '🏠',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // URL mẫu
    duration: '4:45',
    level: 'Beginner',
    category: 'Daily Life',
    relatedWordIds: [11, 12, 13, 14, 15],
  },
  {
    id: 4,
    title: 'Technology and Gadgets',
    description: 'Từ vựng về công nghệ và thiết bị',
    thumbnail: '💻',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', // URL mẫu
    duration: '7:20',
    level: 'Intermediate',
    category: 'Technology',
    relatedWordIds: [16, 17, 18, 19, 20],
  },
];

// Hàm lấy tất cả videos
export const getAllVideos = () => {
  return videoData;
};
