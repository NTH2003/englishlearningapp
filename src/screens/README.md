# Màn hình (Screens)

Các màn hình được phân theo nhóm chức năng để dễ tìm và bảo trì.

| Thư mục | Nội dung |
|--------|----------|
| **auth/** | Đăng nhập, Đăng ký |
| **main/** | Trang chủ, Hồ sơ, Hoạt động của tôi |
| **vocabulary/** | Học từ vựng: chọn chủ đề, chọn chế độ học, flashcard, quiz, gõ từ, nghe, từ của tôi |
| **video/** | Chọn video, Xem video |
| **dialogue/** | Giới thiệu hội thoại, Thực hành hội thoại |
| **lesson/** | Chi tiết bài học |

**Import trong code:** Dùng `src/screens/index.js` – file này export tất cả màn hình. Ví dụ trong `AppNavigator`: `import { HomeScreen, LoginScreen, ... } from '../screens';`
