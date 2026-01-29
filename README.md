# English Learning App 📚

Ứng dụng học tiếng Anh được xây dựng bằng React Native CLI.

## 🚀 Bắt đầu

### Yêu cầu hệ thống

- Node.js >= 20
- React Native CLI
- Android Studio (cho Android)
- JDK (Java Development Kit)

### Cài đặt

1. **Cài đặt dependencies:**
   ```bash
   cd F:\EnglishLearningApp
   npm install
   ```

2. **Chạy Metro bundler:**
   ```bash
   npm start
   ```

3. **Chạy ứng dụng trên Android:**
   ```bash
   npm run android
   ```

## 📁 Cấu trúc dự án

```
EnglishLearningApp/
├── src/
│   ├── screens/          # Các màn hình chính
│   ├── components/        # Các component tái sử dụng
│   ├── navigation/        # Cấu hình navigation
│   ├── services/          # API services, database
│   ├── utils/             # Các hàm tiện ích
│   ├── constants/         # Hằng số, config
│   └── types/             # JSDoc type definitions
├── android/               # Native Android code
├── ios/                   # Native iOS code
└── App.js                # Entry point
```

## 🎯 Tính năng dự kiến

- [ ] Học từ vựng theo chủ đề
- [ ] Luyện nghe
- [ ] Luyện nói
- [ ] Luyện đọc
- [ ] Luyện viết
- [ ] Theo dõi tiến độ học tập
- [ ] Bài kiểm tra và đánh giá

## 📝 Scripts

- `npm start` - Khởi động Metro bundler
- `npm run android` - Chạy trên Android
- `npm run ios` - Chạy trên iOS
- `npm test` - Chạy tests
- `npm run lint` - Kiểm tra code style

## 🔧 Phát triển

### Thêm màn hình mới

1. Tạo file `.js` trong `src/screens/`
2. Thêm route trong `src/navigation/`
3. Import và sử dụng trong App.js

### Thêm component mới

1. Tạo file trong `src/components/`
2. Export component
3. Import và sử dụng trong các màn hình

## 📚 Tài liệu tham khảo

- [React Native Documentation](https://reactnative.dev)
- [React Native CLI](https://github.com/react-native-community/cli)

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón!

---

**Lưu ý:** Đảm bảo bạn đã hoàn thành [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) trước khi bắt đầu.
