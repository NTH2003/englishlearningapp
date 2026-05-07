# EnglishApp Admin Web

Web dashboard cho **Admin/Giáo viên** quản lý dữ liệu học tập, dùng chung Firestore với app mobile.

## 1) Cài đặt

```bash
cd admin-web
npm install
```

## 2) Cấu hình biến môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Điền thông tin Firebase Web app:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Phân quyền truy cập dashboard theo email:

- `VITE_ADMIN_EMAILS=admin@gmail.com`
- `VITE_TEACHER_EMAILS=teacher@gmail.com`

> Các email này cần đồng bộ với policy trong Firestore Rules.

## 3) Chạy local

```bash
npm run dev
```

Mở `http://localhost:5173`.

## 4) Dữ liệu đang quản lý

Web đọc/ghi các document trong collection `config`:

- `config/topics` -> field `topics`
- `config/vocabulary` -> field `words`
- `config/videos` -> field `videos`
- `config/dialogues` -> field `dialogues`

## 5) Gợi ý Firestore Rules cho admin web

Bạn nên thêm điều kiện role/email cho quyền ghi vào `config/*`, ví dụ:

```txt
match /config/{doc} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.auth.token.email in ['admin@gmail.com', 'teacher@gmail.com'];
}
```

Với production, nên dùng **custom claims** thay vì hard-code email trong rules.
