# Cấu hình Firebase cho English Learning App

App đã tích hợp **Firestore** và **Authentication (Anonymous)** để lưu tiến độ học tập và từ yêu thích. Khi chưa cấu hình Firebase, app vẫn chạy bình thường và dùng AsyncStorage trên máy.

## 1. Tạo project Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/).
2. Chọn **Add project** → đặt tên (ví dụ: `EnglishLearningApp`) → tạo.
3. Bật **Google Analytics** (tùy chọn) → tiếp tục.

## 2. Bật Authentication

1. Trong project: **Build** → **Authentication** → **Get started**.
2. Tab **Sign-in method**:
   - Chọn **Anonymous** → **Enable** → **Save** (để app chạy ngay khi mở, tiến độ lưu tạm).
   - Chọn **Email/Password** → **Enable** (phần “Email/Password” bật, “Email link” tùy chọn) → **Save** (để dùng Đăng nhập / Đăng ký trong app).

## 3. Tạo Firestore Database

1. **Build** → **Firestore Database** → **Create database**.
2. Chọn **Start in test mode** (hoặc production với rules phù hợp).
3. Chọn region (ví dụ: `asia-southeast1`) → **Enable**.

**Quy tắc bảo mật (Security rules)** – nên dùng ngay hoặc sau khi test ổn:

Trong Firestore → **Rules**, xóa hết rules hiện tại và dán đoạn sau, rồi bấm **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Chủ đề học: user đăng nhập được đọc/ghi (để app lưu danh sách chủ đề)
    match /config/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- `request.auth != null`: phải đăng nhập (Anonymous hoặc email/…).
- `request.auth.uid == userId`: chỉ được đọc/ghi document có ID trùng với UID của user.
- `config`: dùng cho dữ liệu dùng chung như danh sách chủ đề (`config/topics`).

**Nếu app báo lỗi `firestore/permission-denied`:**  
Vào Firestore → **Rules**, đảm bảo có đủ **hai** block `match` (users và config) như trên, rồi bấm **Publish**. Đợi vài giây rồi thử lại trong app.

## 4. Thêm app Android

1. Trong Firebase project: biểu tượng **Android** (Add app).
2. **Android package name**: `com.englishlearningapp` (phải trùng với `applicationId` trong `android/app/build.gradle`).
3. (Tùy chọn) Nickname, SHA-1.
4. **Register app** → tải file **google-services.json**.
5. Đặt file **google-services.json** vào thư mục:
   ```
   android/app/google-services.json
   ```
   (cùng cấp với `build.gradle` trong `android/app`).

## 5. Thêm app iOS (nếu build iOS)

1. Trong Firebase: **Add app** → chọn **iOS**.
2. **iOS bundle ID**: lấy từ Xcode (ví dụ: `org.reactjs.native.example.EnglishLearningApp`).
3. **Register app** → tải **GoogleService-Info.plist**.
4. Kéo file vào project Xcode (vào thư mục `ios/EnglishLearningApp`).
5. Trong `ios/Podfile`, đảm bảo có:
   ```ruby
   # Uncomment nếu dùng Firebase
   # require_relative '../node_modules/@react-native-firebase/app/firebase_ios_podspec'
   ```
   Rồi chạy: `cd ios && pod install`.

## 6. Cài dependency và chạy app

```bash
npm install
cd android && ./gradlew clean
cd ..
npx react-native run-android
```

(Nếu dùng iOS: `cd ios && pod install && cd ..` rồi `npx react-native run-ios`.)

## Cấu trúc dữ liệu trên Firestore

### users/{uid}

- **Collection**: `users`
- **Document ID**: UID của user (Anonymous Auth).
- **Cấu trúc document**:
  ```json
  {
    "data": {
      "learningProgress": {
        "wordsLearned": [1, 2, 3],
        "lessonsCompleted": [],
        "videosWatched": ["video_1"],
        "favoriteWords": [1, 4, 7]
      },
      "userData": null
    }
  }
  ```

### config/topics (chủ đề học)

- **Collection**: `config`
- **Document ID**: `topics`
- **Cấu trúc**: một document với field `topics` là mảng các chủ đề:
  ```json
  {
    "topics": [
      {
        "id": "Food",
        "name": "Thực phẩm",
        "icon": "🍔",
        "color": "#FF6B6B",
        "description": "Học từ vựng về các loại thực phẩm, món ăn và nhà hàng"
      }
    ]
  }
  ```
- Màn **Học từ vựng** (TopicSelectionScreen) tải danh sách chủ đề từ đây; nếu trống hoặc lỗi thì dùng danh sách mặc định trong app. Bạn có thể thêm/sửa document này trên Firebase Console hoặc từ app (qua `saveTopics`).

Khi Firebase đã cấu hình đúng, mọi thao tác lưu/đọc tiến độ và từ yêu thích sẽ dùng Firestore. Nếu chưa cấu hình hoặc lỗi kết nối, app tự động dùng AsyncStorage.

## Khởi tạo khi mở app

- Khi app mở, `initStorageSync()` (trong `storageService`) được gọi: khởi tạo Firebase (đăng nhập ẩn danh) và chạy **migration một lần** từ AsyncStorage lên Firestore.
- Nếu trên máy đã có tiến độ lưu bằng AsyncStorage, lần đầu có Firebase sẽ gộp dữ liệu local với Firebase và lưu lên Firestore, sau đó xóa bản local để lần sau chỉ dùng Firebase.
