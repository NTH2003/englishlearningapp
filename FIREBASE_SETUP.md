# Cấu hình Firebase cho English Learning App

App **chỉ chạy trên Android**. Đã tích hợp **Firestore** và **Authentication (Anonymous)** để lưu tiến độ học tập và từ yêu thích. Khi chưa cấu hình Firebase, app vẫn chạy bình thường và dùng AsyncStorage trên máy.

---

## Hướng dẫn nhanh: Đăng nhập bằng Google (Android)

Làm lần lượt 4 bước sau.

### Bước 1 – Bật Google trong Firebase Authentication

1. Vào [Firebase Console](https://console.firebase.google.com/) → chọn project của bạn.
2. **Build** → **Authentication** → tab **Sign-in method**.
3. Chọn **Google** → bật **Enable** → chọn email hỗ trợ → **Save**.

### Bước 2 – Lấy Web Client ID

1. Trong Firebase: bấm **⚙️ (Project Settings)** cạnh "Project Overview".
2. Ở tab **General**, kéo xuống **Your apps**.
3. Nếu **chưa có Web app** (icon `</>`):
   - Bấm **Add app** → chọn **Web** (`</>`) → đặt tên (ví dụ: "EasyEng Web") → **Register app**.
4. Trong phần Web app, tìm **Web client ID** (dạng `123456789-xxxx.apps.googleusercontent.com`) → **Copy**.

### Bước 3 – Thêm Web Client ID vào code

1. Mở file `src/constants/index.js` trong project.
2. Tìm dòng: `export const GOOGLE_WEB_CLIENT_ID = '';`
3. Dán Web client ID vừa copy vào giữa hai dấu nháy, ví dụ:
   ```js
   export const GOOGLE_WEB_CLIENT_ID = '123456789-xxxxxxxxxx.apps.googleusercontent.com';
   ```
4. Lưu file.

### Bước 4 – Thêm SHA-1 cho app Android (bắt buộc)

1. Mở terminal/command tại **thư mục gốc project** (có file `package.json`).
2. Chạy lệnh (Windows):
   ```bash
   cd android
   gradlew.bat signingReport
   ```
3. Đợi chạy xong, tìm mục **Variant: debug** → dòng **SHA1** (dạng `A1:B2:C3:...`) → copy.
4. Vào Firebase Console → **Project Settings** → **Your apps** → chọn app **Android** (`com.englishlearningapp`).
5. Ở **SHA certificate fingerprints** → **Add fingerprint** → dán SHA1 → **Save**.

Sau khi xong 4 bước, chạy lại app (`npm run android`), mở màn **Đăng nhập** và bấm **Đăng nhập với Google**. Nếu báo lỗi, kiểm tra lại: Google đã bật trong Authentication, Web Client ID đúng trong `constants/index.js`, và SHA-1 đã thêm cho app Android.

---

## 1. Tạo project Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/).
2. Chọn **Add project** → đặt tên (ví dụ: `EnglishLearningApp`) → tạo.
3. Bật **Google Analytics** (tùy chọn) → tiếp tục.

## 2. Bật Authentication

1. Trong project: **Build** → **Authentication** → **Get started**.
2. Tab **Sign-in method**:
   - Chọn **Anonymous** → **Enable** → **Save** (để app chạy ngay khi mở, tiến độ lưu tạm).
   - Chọn **Google** → **Enable** → chọn project email → **Save** (để dùng Đăng nhập với Google).
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
      allow read: if request.auth != null && (
        request.auth.uid == userId ||
        request.auth.token.email == 'admin@gmail.com'
      );
      allow write: if request.auth != null && request.auth.uid == userId;
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

### Cấu hình Google Sign-In (Đăng nhập với Google)

1. Trong Firebase Console: **Project Settings** (⚙️) → **General** → cuộn xuống **Your apps**.
2. Nếu chưa có **Web app**, bấm **Add app** → chọn **Web** (</>) → đặt tên → **Register app**.
3. Copy **Web client ID** (dạng `xxxxx-xxxxx.apps.googleusercontent.com`).
4. Mở `src/constants/index.js`, tìm `GOOGLE_WEB_CLIENT_ID` và gán giá trị:
   ```js
   export const GOOGLE_WEB_CLIENT_ID = 'xxxxx-xxxxx.apps.googleusercontent.com';
   ```
5. Đảm bảo **Google** đã được bật trong Authentication → Sign-in method.
6. **Quan trọng cho Android:** Vào lại app Android trong Firebase → **SDK setup and configuration** → **Add fingerprint** → thêm **SHA-1** (chạy `cd android && gradlew.bat signingReport`, copy SHA1 của variant debug).

## 5. Cài dependency và chạy app (Android)

```bash
npm install
cd android && gradlew.bat clean
cd ..
npm run android
```

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
