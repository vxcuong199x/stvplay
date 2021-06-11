const consts = require('./consts')

module.exports = process.env.NODE_ENV != 'production'
  ? require('./secret.development')
  :
{
  TOKEN_SECRET: '#%!ZqKMrP!H!S*K%7&qt?^SXL^-Zbfmj',
  CLIENT_SECRET: {
    ANDROID_TV: '6WbuSea-?w8YVCV%q-_WFqJL&@^e6Ku#', // 1acx4$G$KJZdYXwK
    TIZEN: 'c7yAGutbW3ccuc7RW9HqfnjxLc9hFXsu',
    WEBOS: 'p6jMLftrx4PSQzyucvnp4v43mLBSN7A3',
    ANDROID_MOBILE: 'Gh%XVD?64dVs!+_@!Xp-*7#6dhFu$Skn', // l+ETT0^Vma#3D-Lt
    IOS_MOBILE: '6WQDSHpi35f=IJ?R',
    WEB: '9X6pLA2yDuB5n5u4Zc9ePyPNQUdnDxfH',
    CMS: 'Z9zbvSTJ43JbLtWMjHktrs6D9JtFMBhf'
  },
  PAYMENT_SECRET: 'kc82jc_3@cS',
  VAS_SECRET: 'XpbZvsBDHHrM89aW',
  MULTI_SCREEN_SECRET: 'U=`D+3MH@8JvEz!h-#f4z5}z-"uM]5:&',
  getSecret: function (deviceType, platform) {
    if (deviceType == consts.DEVICE_TYPE.TV) {
      if (platform == consts.PLATFORM.ANDROID) {
        return this.CLIENT_SECRET.ANDROID_TV
      } else if (platform == consts.PLATFORM.TIZEN) {
        return this.CLIENT_SECRET.TIZEN
      } else if (platform == consts.PLATFORM.LG) {
        return this.CLIENT_SECRET.WEBOS
      }
    } else if (deviceType == consts.DEVICE_TYPE.MOBILE) {
      if (platform == consts.PLATFORM.ANDROID) {
        return this.CLIENT_SECRET.ANDROID_MOBILE
      } else if (platform == consts.PLATFORM.IOS) {
        return this.CLIENT_SECRET.IOS_MOBILE
      }
    } else if (deviceType == consts.DEVICE_TYPE.WEB) {
      return this.CLIENT_SECRET.WEB
    } else if (deviceType == consts.DEVICE_TYPE.CMS) {
      return this.CLIENT_SECRET.CMS
    }

    return 'random'
  }
}
