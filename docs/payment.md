## Hướng dẫn ghép payment

### Quy trình mua gói có 4 bước chính: (Chi tiết xem design)
 - Chọn gói (basic, premium, danet, qnet ...)
 - Chọn thời gian (1, 3,6,12 tháng)
 - Chọn loại (lẻ, 2 máy, 4 máy)
 - Thanh toán (thẻ cào, ngân hàng)

** Chú ý: sau mỗi bước, client tự lưu lại lựa chọn của user và hiển thị lên

### Chi tiêt API từng bước
1. Chọn gói:
- API lấy  list gói: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageGroup/PackageGroup_getList

2. Chọn thời gian:
- API lấy list time: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageType/PackageType_getTimeList

3. Chọn loại:
- API lấy list loại: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageType/PackageType_getList
- Sau bước này cần gọi getNotice để lấy về thông báo từ server trước khi mua: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageGroup/PackageGroup_getNotice
- getNotice sẽ trả về: { notice, action, amount } (amount là tổng số tiền cần thanh toán, notice là thông báo cần hiện liên, nếu notice == '' thì không cần hiện nữa mà next luôn, action sẽ là nút với command do server qui định: ACTION: { BACK: 2, GO_BUY_PACKAGE: 1, GO_BUY_MOVIE: 3 })

4. Thanh toán:
- API lấy list thẻ cào: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageType/PackageType_getBankList
- API lấy list thẻ cào: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageType/PackageType_getTelcoList
- API mua thẻ: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageGroup/PackageGroup_buyPackageCard
- API mua bằng coin: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageGroup/PackageGroup_buyPackageCoin
- API mua bằng bank: http://123.30.235.63:5300/explorer_thudo92834513/#!/PackageGroup/PackageGroup_buyPackageBank

5. Mua phim
- (Khi get detail phim, nếu thấy có price và ko có trường bought thì sẽ hiện giá và bắt mua)
- Khi bấm mua, đầu tiên phải gọi getNotice để lấy thông báo từ server: http://123.30.235.63:5300/explorer_thudo92834513/#!/Movie/Movie_getNotice
- getNotice sẽ trả về: { notice, action, amount } (amount là tổng số tiền cần thanh toán, notice là thông báo cần hiện liên, nếu notice == '' thì không cần hiện nữa mà next luôn, action sẽ là nút với command do server qui định: ACTION: { BACK: 2, GO_BUY_PACKAGE: 1, GO_BUY_MOVIE: 3 })
- API mua thẻ: http://123.30.235.63:5300/explorer_thudo92834513/#!/Movie/Movie_buyPackageCard
- API mua bằng coin: http://123.30.235.63:5300/explorer_thudo92834513/#!/Movie/Movie_buyPackageCoin
- API mua bằng bank: http://123.30.235.63:5300/explorer_thudo92834513/#!/Movie/Movie_buyPackageBank

6. Sau khi mua xong:
- Nếu thành công trả về { data: { code, message } } (code=0: đủ tiền, code=1: chưa đủ tiền, client quay lại về màn hình chọn loại thanh toán)
- Nếu không thành công trả về http code 497 và message

7. Khi bấm xem phim hoặc kênh mà chưa mua gói
- Server sẽ trả về HTTP_CODE = 497 kèm theo data sau

```javascript
ACTION: { BACK: 2, GO_BUY_PACKAGE: 1, GO_BUY_MOVIE: 3 }

{
  statusCode: 497,
  message: 'Thông báo',
  details: [
    {label: 'Quay lại', action: ACTION}, // action theo qui định trên
    {
      label: 'Mua',
      action: ACTION,
      isFocus: 1, // nếu có isFocus thì client sẽ focus mặc định vào nút đó
      choices: [ // khi có choices, client sẽ chọn sẵn các bước mà không bắt user phải chọn (key = PACKAGE|TIME|TYPE)
        {key: 'PACKAGE', groupId: groupId, name: 'Tên gói'},
        {key: 'TIME', time: 'P6M', name: '6 tháng'}
      ]
    }
  ]
}

// VD về choices có tối đa 3 lựa chọn
choices: [
  {key: 'PACKAGE', groupId, name},
  {key: 'TIME', time, name},
  {key: 'TYPE', packageTypeId, name}
]
```

8. Khi bấm xem mà phim cần mua lẻ
- Server sẽ trả về HTTP_CODE = 497 kèm theo data sau

```javascript
ACTION: { BACK: 2, GO_BUY_PACKAGE: 1, GO_BUY_MOVIE: 3 }

{
  statusCode: 497,
  message: 'Thông báo',
  details: [
   {label: 'Quay lại', action: ACTION}, // action theo qui định trên
   {label: 'Mua', action: ACTION, isFocus: 1} // nếu có isFocus thì client sẽ focus mặc định vào nút đó
  ]
}
```
