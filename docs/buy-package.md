## Logic phần mua gói

### Hàm chung: atomicUpdate
- Truyền vào groupObj, time, device, amount
- Loop để lock và check lock user (interval 0.3s)
- Lấy info user
- Check nếu đã chọn số device rồi thì dùng luôn số đó (không dùng device user truyền lên)
- Tính amount còn lại và amount nạp thêm xem đã đủ chưa, nếu chưa đủ thì chỉ update amount user user
- Với mỗi gói, nếu đã có -> cộng lên, nếu chưa có -> set mới
- Update cả packages cho user
- Mở lock user

### 1. Mua gói dùng thẻ cào
- Client truyền lên packageGroupId, time, device, telco, serial, pin
- Server lấy ra thông tin group, check có tồn tại và time đúng
- Server gọi use card
- Nếu thẻ sai báo lỗi luôn
- atomicUpdate
- Update token cho user
- Trả về kết quả
- Ghi log transaction

### 2. Mua gói dùng coin
- Client truyền lên packageGroupId, time, device
- Server lấy ra thông tin group, check có tồn tại và time đúng
- atomicUpdate
- Update token cho user
- Trả về kết quả
- Ghi log transaction

### 3. Mua gói dùng ngân hàng
- Client truyền lên packageGroupId, time, device
- Server lấy ra thông tin group, check có tồn tại và time đúng
- Lấy info user
- Check nếu đã chọn số device rồi thì dùng luôn số đó (không dùng device user truyền lên)
- Tính amount còn lại và amount cần nạp thêm
- Gọi API sang bank để lấy về link redirect (ghi log gọi bank)
- Trả về kết quả link ảnh QRcode và info

### 4. Nhận notify từ bank
- Client kết nối vào onEvent
- onBank -> xử lí cộng gói
- atomicUpdate
- Update token cho user
- Push về client
- Ghi log transaction

### 5. get notice
- Client truyền lên packageGroupId, time, device
- Server lấy ra thông tin group, check có tồn tại và time đúng
- Lấy info user
- Check nếu đã chọn số device rồi thì dùng luôn số đó (không dùng device user truyền lên)
- Tính amount còn lại xem có đủ không
- Trả về notice

