## Quy ước API và data

###  Quy ước chung:
- Các API dùng giao thức HTTP GET và data trả về là JSON, nếu lỗi sẽ có thêm trường message để biết
- Các thao tác nếu thành công thì trả về HTTP_CODE = 200, nếu không thành công thì trả về HTTP_CODE khác
- Phần log đăng kí, hủy và log cước đồng bộ qua FTP và lấy file (định dạng file CSV không có header)
- Các signature sẽ dùng chung SECRET = 5?f3#GrmD!yl8Ir!


### 1. Nhận MO (ngoài cú pháp đăng kí, hủy) - bên IQ làm
 - Route: /mo
 - Params:
   - mo (sms của KH)
   - msisdn (SDT của KH)
   - serviceNumber (đầu số dịch vụ)
   - signature = md5(mo + "$" + msisdn + "$" + serviceNumber + "$" + SECRET)
 - response: {}

### 2. Push MT (dùng để push MT cho KH) - Thủ Đô làm
 - Route: /pushMT
 - Params:
   - mt (nội dung MT)
   - msisdn (danh sách SDT cần gửi, cách nhau bởi dấu phảy (,) tối đa 100 số)
   - signature = md5(mo + "$" + msisdn + "$" + SECRET)
 - response: {}

### 3. Hủy dịch vụ - Thủ Đô làm
 - Route: /cancel
 - Params:
   - msisdn (SDT của KH)
   - serviceNumber (đầu số dịch vụ)
   - packageName (tên gói cần hủy)
   - signature = md5(msisdn + "$" + serviceNumber + "$" + packageName + "$" + SECRET)
 - response: {}

### 4. Qui ước log các lệnh đăng kí, hủy
 - Thư mục: /command_log
 - File (mỗi giờ 1 file): command_YYYYMMDDHH.csv (VD: command_2017092301.csv)
 - Data: (theo thứ tự)
   - id (number)
   - msisdn (SDT)
   - serviceNumber (đầu số dịch vụ)
   - command (REGISTER hoặc CANCEL)
   - packageName (tến gói)
   - price (giá gói, nếu có)
   - status (0: thành công, 1: thất bại)
   - time (unix timestamp)

### 5. Qui ước log charge tiền (gia hạn) và hủy từ vina
 - Thư mục: /charge_log
 - File (mỗi giờ 1 file):
    - charge_YYYYMMDDHH.csv (file charge tiền)
    - unsub_YYYYMMDDHH.csv (các lệnh hủy từ vina - với những thuê bao không còn hiệu lực)
 - Data: (theo thứ tự)
   - id (number)
   - msisdn (SDT)
   - serviceNumber (đầu số dịch vụ)
   - packageName (tến gói)
   - price (giá gói, nếu có)
   - time (unix timestamp)
