module.exports = {
  reachMaxDevice: (max) => `Tài khoản chỉ được đăng nhập trên tối đa ${max} thiết bị. Nếu có thiết bị không sử dụng, bạn vui lòng vào phần quản lý thiết bị để xóa.`,
  otpMessage: (otp) => `${otp}`,
  wrongOtp: 'Mã xác nhận không đúng, bạn vui lòng nhập lại!',
  locked: 'Tài khoản đã bị khóa',
  kickByOther: 'Phiên đăng nhập của bạn đã bị đẩy ra từ một thiết bị khác cùng tài khoản. Bạn vui lòng đăng nhập lại!',
  invalidParam: 'Thông tin sai định dạng, bạn vui lòng kiểm tra lại!',
  invalidPhone: 'Sai thông tin số điện thoại, bạn vui lòng kiểm tra lại!',
  overwritePackage: (name, expire) => `Bạn đang sử dụng gói ${name}, còn thời hạn đến ${expire}. Đăng ký gói mới sẽ thay thế hoàn toàn gói cũ. `,
  enoughCoinByPackage: (name, month) => `Tài khoản của bạn đủ để đăng ký gói ${name} thời gian ${month} tháng. `,
  enoughCoinByMovie: (name) => `Tài khoản của bạn đủ để mua phim ${name}. `,
  enoughCoinByClip: (name) => `Tài khoản của bạn đủ để mua clip ${name}. `,
  notEnoughCoinByMovie: (remain, require, name) => (remain ? `Tài khoản của bạn còn ${remain}. ` : '') + `Bạn cần ${require}đ để mua phim ${name}. `,
  notEnoughCoinByClip: (remain, require, name) => (remain ? `Tài khoản của bạn còn ${remain}. ` : '') + `Bạn cần ${require}đ để mua clip ${name}. `,
  registerConfirm: `Bạn có muốn đăng ký không?`,
  buyConfirm: `Bạn có muốn mua không?`,
  notEnoughBuyPackage: (amount) => `Số tiền bạn nạp không đủ để mua gói, bạn được cộng ${amount}đ vào tài khoản.`,
  notEnoughBuyMovie: (amount) => `Số tiền bạn nạp không đủ để mua phim, bạn được cộng ${amount}đ vào tài khoản.`,
  notEnoughBuyClip: (amount) => `Số tiền bạn nạp không đủ để mua clip, bạn được cộng ${amount}đ vào tài khoản.`,
  buyPackageSuccess: `Mua gói thành công.`,
  buyMovieSuccess: `Mua phim thành công.`,
  buyClipSuccess: `Mua clip thành công.`,
  buyPackageExcess: (excess) => `Mua gói thành công, bạn còn thừa ${excess}đ trong tài khoản.`,
  buyMovieExcess: (excess) => `Mua phim thành công, bạn còn thừa ${excess}đ trong tài khoản.`,
  buyClipExcess: (excess) => `Mua clip thành công, bạn còn thừa ${excess}đ trong tài khoản.`,
  notEnoughCoinBuyPackage: `Tài khoản không đủ để mua gói!`,
  wrongGiftCode: 'Mã quà tặng không đúng, mời bạn nhập lại!',
  enterGiftCodeOneTime: 'Tài khoản của bạn chỉ được nhập 01 mã quà tặng!',
  overwritePackageGiftCode: (oldName, newName) => `Bạn đang dùng gói ${oldName}, bạn không thể nhập mã quà tặng để chuyển sang gói ${newName}. Vui lòng giữ lại để dùng sau!`,
  giftCodeSuccess: (name, month) => 'Nhập mã quà tặng thành công' + (!month ? '' : `, bạn được sử dụng gói dịch vụ ${month} tháng.`),
  contentDenied: (packageCode, name = 'nội dung này') => `Bạn vui lòng mua gói cước ${packageCode} để xem ${name}!`,
  contentDeniedKaraoke: (limit, packageCode, name) => `Bạn đã hát ${limit} bài miễn phí trong ngày hôm nay. Bạn vui lòng mua gói cước ${packageCode} để hát không giới hạn 50 nghìn bài hát từ Prosing`,
  wrongQRCode: `Mã đăng nhập không đúng, bạn vui lòng kiểm tra lại!`,
  loginQRTVOK: `Đăng nhập TV thành công.`,
  spam: (minutes) => `Bạn vui lòng quay lại sau ${minutes} phút!`,
  updateMessage: (date) => `Ứng dụng đã có phiên bản mới vào ngày ${date}, mời bạn cập nhật và trải nghiệm!`,
  wrongCardCode: 'Mã thẻ không đúng, bạn vui lòng nhập lại!',
  back: 'Bỏ qua',
  enterGiftCode: 'Mã quà tặng',
  buyPackage: 'Mua gói cước',
  buyMovie: 'Mua phim',
  buyClip: 'Mua clip',
  letBuyMovie: (price) => `Bạn vui lòng mua phim với giá ${price}đ`,
  letBuyClip: (price) => `Bạn vui lòng mua clip với giá ${price}đ`,
  timeDuration: (month) => `${month} tháng`,
  bonusDescription: (month, danet) => `Tặng ${month} tháng` + (danet ? ` và dùng thử gói DANET trong ${danet} ngày` : ''),
  discountDescription: (discount) => `Chiết khấu ${discount}%`,
  youMayLike: 'CÓ THỂ BẠN THÍCH',
  sameActorMovies: 'PHIM CÙNG DIỄN VIÊN',
  sameActorClips: 'CLIP CÙNG DIỄN VIÊN',
  paymentMessage: '(Thanh toán tối thiểu 20.000 VNĐ khi dùng thẻ ngân hàng, tiền thừa sẽ được lưu lại tài khoản)',
  channel: 'KÊNH TRUYỀN HÌNH',
  clip: 'CLIP',
  movie: 'PHIM',
  dailyPay: 'Mời bạn gọi đến số điện thoại sau để được hướng dẫn thanh toán',
  outVnBlock: 'Ứng dụng chỉ được sử dụng trên lãnh thổ Việt Nam',
  applicationBlock: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận Chăm Sóc Khách Hàng (SĐT: 1900 585868) để được hỗ trợ',
  loginRequire: 'Bạn vui lòng đăng nhập để xem nội dung này.',
  thankPRCode: 'Nhập mã giới thiệu thành công. Cảm ơn bạn!',
  sendSMSToGetOTP: (phone, syntax, port) => `Bạn vui lòng dùng SĐT ${phone} soạn tin nhắn ${syntax} gửi đến ${port} để lẫy mã OTP đăng nhập.`,
  enterOTP: (phone) => `Bạn vui lòng nhập mã xác nhận đã được gửi đến số ${phone}`,
  wrongPRCode: `Mã giới thiệu không đúng. Bạn vui lòng nhập lại!`,
  reachMaxScreen: (max) => `Tài khoản chỉ được xem trên tối đa ${max} màn hình`,
  loginMessageWhenExpire: 'Mời bạn đăng nhập để xem với chất lượng cao nhất!',
  loginMessage: (freeUntil) => `Mời bạn đăng nhập để xem với chất lượng cao nhất!`, //Bạn được sử dụng miễn phí dịch vụ đến ${freeUntil}.
  loginMessageVideo: (freeUntil) => `Mời bạn đăng nhập để trải nghiệm ứng dụng tốt nhất!`, // Bạn được sử dụng miễn phí dịch vụ đến ${freeUntil}.
  channelNotFound: 'Không tìm thấy nội dung này. Bạn vui lòng chọn lại',
  package: (name) => name ? `Gói: ${name}` : '',
  free: 'Miễn Phí',
  bought: 'Đã mua',
  boughtMovie: `Bạn đã mua phim này rồi!`,
  boughtClip: `Bạn đã mua clip này rồi!`
}