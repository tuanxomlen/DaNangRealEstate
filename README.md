# DaNangRealEstate

Website bất động sản Đà Nẵng.

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** Microsoft SQL Server
- **Image storage:** Cloudinary (backend chỉ nhận và chuyển ảnh lên Cloudinary; SQL Server lưu URL)
- **Messaging:** REST API + WebSocket, có polling dự phòng

## Chạy dự án trên Windows / VS Code

> Nếu bạn đã có `backend/.env`, hãy giữ nguyên file đó. Nó chứa thông tin kết nối SQL Server, JWT và Cloudinary của bạn. Không ghi đè bằng `.env.example`.

### 1. Backend

Mở Terminal thứ nhất trong VS Code:

```powershell
cd backend
npm install
npm run dev
```

Backend mặc định chạy tại `http://localhost:4000`; WebSocket chạy tại `ws://localhost:4000/ws`.

### 2. Frontend

Mở Terminal thứ hai:

```powershell
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`.

## Cấu hình cần có trong `backend/.env`

Giữ nguyên các biến SQL Server và JWT hiện có. Kiểm tra các biến tương tự sau đã có giá trị thật:

```dotenv
USE_SQL_SERVER=true
JWT_SECRET=thay_bang_chuoi_bi_mat_dai_va_ngau_nhien
CLOUDINARY_CLOUD_NAME=ten_cloud_cua_ban
CLOUDINARY_API_KEY=api_key_cua_ban
CLOUDINARY_API_SECRET=api_secret_cua_ban
```

Không dùng các giá trị minh họa trên làm thông tin thật; không gửi `API_SECRET` cho người khác và không commit `.env` lên GitHub.

## Cơ sở dữ liệu

Dự án sử dụng SQL Server đã được cấu hình trong `backend/.env`. Nếu database đã được khởi tạo và các bảng đang tồn tại thì không cần chạy lại `npm run db:init` cho bản nâng cấp này. Khi backend khởi động, nó tự kiểm tra và thêm cột `Messages.ReadAt` nếu database cũ chưa có cột đó; thao tác này không xóa dữ liệu tin nhắn hiện có.

Chỉ chạy `npm run db:init` khi bạn chủ động cần khởi tạo schema trên database mới.

## Chức năng chính

- Tìm kiếm, lọc và xem chi tiết bất động sản.
- Đăng tin, chỉnh sửa/quản lý tin của tôi và tải tối đa 10 ảnh mỗi tin lên Cloudinary (JPG/PNG/WEBP, tối đa 5 MB mỗi ảnh).
- SQL Server lưu URL ảnh Cloudinary, không lưu file ảnh mới trong `backend/uploads`.
- Yêu thích, báo cáo tin và hồ sơ tài khoản.
- Quản trị: duyệt tin, quản lý tin đã duyệt, quản lý tài khoản, token và báo cáo.
- Nhắn tin riêng giữa hai người dùng: lưu lịch sử trong SQL Server, tìm hội thoại, số tin chưa đọc, đánh dấu đã đọc, trạng thái đã xem và cập nhật gần thời gian thực qua WebSocket. Nếu WebSocket bị chặn, giao diện tự cập nhật dự phòng theo chu kỳ.

## Khắc phục lỗi thường gặp

- **Không kết nối được SQL Server:** kiểm tra `USE_SQL_SERVER=true`, máy chủ, database, tài khoản và mật khẩu trong `backend/.env`.
- **Không tải được ảnh:** kiểm tra 3 biến `CLOUDINARY_...` và khởi động lại backend sau khi chỉnh `.env`.
- **Tin nhắn không cập nhật ngay:** kiểm tra backend đang chạy và trình duyệt có thể kết nối `ws://localhost:4000/ws`; giao diện có polling dự phòng.
- **Frontend báo lỗi package:** trong thư mục `frontend`, chạy `npm install`; tương tự với `backend`.

## Bảo mật

Đổi `JWT_SECRET` trước khi triển khai thật. Không đưa API Secret vào frontend, không commit `.env`, và cần cấu hình HTTPS/WSS, giới hạn tần suất, sao lưu database cùng quy trình kiểm thử trước khi public website.

## Xác thực email khi đăng ký

Đăng ký yêu cầu mã OTP 6 chữ số gửi qua Gmail SMTP trước khi tạo tài khoản. Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` trong `backend/.env`. Xem `HUONG_DAN_XAC_THUC_EMAIL.txt` để tạo Gmail App Password và chạy thử.


## Tính năng mở rộng trong bản này
- Trang bản đồ khu vực Đà Nẵng (OpenStreetMap) kèm danh sách tin và liên kết mở vị trí từng địa chỉ. Bản đồ hiện chưa ghim tọa độ chính xác cho từng tin vì dữ liệu bất động sản chưa có trường tọa độ.
- Công cụ tính khoản vay mua nhà (ước tính, không phải tư vấn tài chính).
- Đặt lịch xem nhà: người mua gửi yêu cầu, người đăng xác nhận/từ chối, hai bên theo dõi trong mục Lịch xem nhà; yêu cầu khởi tạo bảng `dbo.Appointments` bằng `node src/init-db.js`.
- Hồ sơ môi giới công khai qua API `GET /api/agents/:id` để dùng cho trang hồ sơ môi giới.
- Các tính năng báo cáo tin, nhắn tin, thông báo, quản trị và nhật ký giao dịch token đã có sẵn trong dự án.

## Cập nhật tính năng hồ sơ và duyệt số điện thoại

Phiên bản này bổ sung phần giới thiệu cá nhân, liên kết hồ sơ người đăng từ thẻ tin, nút nhắn tin ở hồ sơ công khai, bộ lọc nhà môi giới theo loại giao dịch/loại bất động sản và quy trình yêu cầu đổi số điện thoại chờ quản trị viên duyệt.

Nếu dùng SQL Server, hãy chạy lại bước khởi tạo/cập nhật schema theo hướng dẫn dự án (`backend/src/init-db.js`) để bổ sung các cột `Bio`, `PendingPhone` và `PhoneChangeStatus` cho bảng `Users`, sau đó khởi động lại backend. Các cột được thêm bằng `IF COL_LENGTH` nên không ảnh hưởng dữ liệu người dùng hiện có.

## Chạy bằng Docker Desktop

Bản Docker này đóng gói frontend và backend thành 2 container. SQL Server được kết nối từ máy Windows (host) để dùng lại database hiện có; ảnh tiếp tục lưu trên Cloudinary.

1. Cài và mở Docker Desktop, chờ trạng thái **Engine running**.
2. Tạo file `backend/.env` từ `backend/.env.docker.example`. Nếu đã có `backend/.env` đang chạy tốt thì giữ file đó và chỉ sửa `DB_SERVER=host.docker.internal`, `DB_ENCRYPT=false` (nếu SQL Server local không dùng mã hóa), cùng các thông tin cần thiết. Không ghi đè thông tin Cloudinary, SMTP hoặc JWT hiện tại.
3. Đảm bảo SQL Server trên Windows đang chạy, TCP/IP đã bật và cổng `1433` được mở; database `DaNangRealEstate` đã tồn tại. Tài khoản trong `.env` phải được phép đăng nhập từ Docker.
4. Mở PowerShell tại thư mục gốc `DaNangRealEstate`, chạy:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

5. Mở website tại **http://localhost:8080**. Frontend sẽ chuyển tiếp `/api` và `/ws` tới backend trong mạng Docker.

Nếu database chưa có schema, chạy lệnh sau một lần sau khi SQL Server đã sẵn sàng và file `.env` đúng:

```powershell
docker compose exec backend node src/init-db.js
```

Các lệnh quản lý:

```powershell
docker compose logs -f
docker compose down
docker compose up -d --build
```

`docker compose down` không xóa database SQL Server trên Windows. Không dùng `docker compose down -v` nếu chưa hiểu rõ tác động tới volume của các dịch vụ khác.

**Lưu ý:** Docker không tự tạo SQL Server trên máy Windows. Nếu SQL Server của bạn cũng nằm trong Docker hoặc trên máy khác, hãy thay `DB_SERVER` bằng tên service/container hoặc địa chỉ máy chủ tương ứng; không dùng `localhost` bên trong container backend.
