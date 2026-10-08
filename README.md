# Quản lý công việc – source phục hồi & tái cấu trúc

Project Electron + React + Vite được phục hồi từ bộ cài `quanlycongviec-Setup.exe`.

## Trạng thái
- Backend gốc đã phục hồi: Express + TypeScript, lưu dữ liệu JSON cục bộ.
- Giao diện React mới đã được tái cấu trúc thành source TSX dễ sửa.
- Có Dashboard, Công việc, Kanban, Ghi chú.
- Có fallback localStorage cho danh sách công việc khi API không khả dụng.
- Bundle giao diện cũ vẫn được giữ trong `src/ui-recovered/` để đối chiếu khi phục hồi tiếp.

## Cài đặt
```bash
npm install
npm run dev
```
Mở URL Vite hiển thị trong terminal. Backend chạy riêng:
```bash
npm run dev:server
```
Hoặc chạy Electron sau khi build frontend/server theo cấu hình phù hợp.

## Build
```bash
npm run build
npm run build:server
```

## GitHub
Không commit `node_modules`, `.env`, dữ liệu cá nhân hoặc file build không cần thiết. Xem `.gitignore`.

## Lưu ý
Source UI gốc không tồn tại đầy đủ trong file cài đặt; phần `src/ui-recovered/` là bundle đã build dùng để đối chiếu. Các màn hình mới trong `src/pages/` và `src/components/` là bản tái cấu trúc có thể chỉnh sửa.
