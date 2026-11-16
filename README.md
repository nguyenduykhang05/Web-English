# WebEnglish 1-1 Platform

Nền tảng quản trị và giảng dạy tiếng Anh **1 kèm 1 trực tuyến** xây dựng theo kiến trúc monorepo TypeScript (`apps/api`, `apps/web`, `packages/shared`).

## Khởi chạy nhanh từ máy sạch (1–2 lệnh)

> **Yêu cầu tiên quyết**: Node.js `20+ LTS` và MongoDB 7+ (chạy cục bộ tại `localhost:27017` hoặc dùng `docker compose up -d` để bật sẵn MongoDB Replica Set + Mailpit).

1. Cài đặt phụ thuộc:
   ```bash
   npm install
   ```
2. Tự động tạo `.env` (từ `.env.example`), build shared schemas, nạp dữ liệu demo (`seed`) và bật đồng thời API (`http://localhost:4000`) + Web (`http://localhost:5173`):
   ```bash
   npm run demo
   ```
   *(Hoặc tách riêng bước khởi tạo `npm run setup` rồi chạy `npm run dev` ở các lần sau.)*

- **Web Portal**: `http://localhost:5173`
- **Tài liệu OpenAPI / Swagger UI**: `http://localhost:4000/api/docs`

---

## Tài khoản Demo (Idempotent Seed)

| Vai trò | Email | Mật khẩu | Múi giờ mặc định | Ghi chú |
|---|---|---|---|---|
| **Admin** | `admin@example.com` | `Admin@123456` | `Asia/Ho_Chi_Minh` | Toàn quyền cấu hình, đối soát, cảnh báo, bảng lương |
| **Giáo viên 1** | `teacher@example.com` | `Teacher@123456` | `Asia/Ho_Chi_Minh` | Coach Claire Nguyen — IELTS 8.5 |
| **Giáo viên 2** | `teacher2@example.com` | `Teacher@123456` | `America/New_York` | Coach Daniel Miller — Demo quy đổi múi giờ |
| **Học viên** | `student@example.com` | `Student@123456` | `Asia/Ho_Chi_Minh` | Minh Anh Tran — Gói `IELTS-12` (còn `10` buổi trong `SessionLedger`) |

---

## Lệnh kiểm tra chất lượng

```bash
npm run lint       # ESLint trên apps/api, apps/web, packages/shared
npm run typecheck  # TypeScript strict trên cả 3 workspaces
npm run build      # Build shared -> api -> web
npm test           # Vitest unit & integration tests
npm run test:e2e   # Playwright E2E tests
npm run seed       # Khởi tạo dữ liệu demo
```
