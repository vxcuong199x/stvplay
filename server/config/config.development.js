module.exports = {
  STORE_DT_ID: [6, 8, 10],
  STORE_REVIEW_DT_ID: [6, 8, 10],
  DISABLE_UNLICENSED_CONTENT: false,
  PR_CODE_DT_ID: [6],
  HIDE_SCTV: false,
  DEBUG: true,
  OUT_VN_BLOCK: false,
  MAX_ADD_COIN_ADMIN: 50000000,
  MAX_ADD_COIN_USER: 20000000,
  CACHE_TIME: 10,
  FREE_PER_DEVICE: 30*86400,
  MAX_RESOLUTION_TIME: 86400,
  UPDATE_CHANNEL_VIEW_INTERVAL: 180,
  UPDATE_MOVIE_VIEW_INTERVAL: 180,
  UPDATE_CLIP_VIEW_INTERVAL: 180,
  SCREEN_PING_INTERVAL: 5,
  MAX_DEVICE: 1,
  OTP_EXPIRE: 300,
  LONG_OTP_EXPIRE: 90*86400,
  TOKEN_EXPIRE: 1800,
  HOME_REFRESH_TIME: 300,
  CHANNEL_REFRESH_TIME: 300,
  MENU_REFRESH_TIME: 720,
  MARQUEE_RUN_TIME: 2,
  MARQUEE_INTERVAL: 60,
  PING_INTERVAL: 180,
  MAX_KARAOKE_TODAY: 2000,
  API_BASE_URL: 'http://123.30.235.63:5300/api/v1',
  NOTIFY_URL: 'http://123.30.235.63:5301/events',
  PING_URL_WEB: 'http://123.30.235.63:5300/api/v1/customer/ping',
  PING_URL_APP: 'http://123.30.235.63:5300/api/v1/customer/ping',
  BASE_IMAGE_URL: 'http://rsnj.vgame.us/sctv/',
  KARAOKE_URL: 'http://123.30.235.198:6243/prosing/',
  YOUTUBE_PROCESSING_URL: 'http://yt.stvplay.vn/get_video_info',
  DRM_URLS: [],
  MAINTENANCE_URL: 'https://alerts.gviet.vn/alerts/kenhkhongcobanquyen.stream/playlist.m3u8',
  MOMO_WEBVIEW_URL: (qrCode, expireTime, amount) => `https://stvplay.vn/momo?expireTime=${expireTime}&qrCode=${qrCode}&amount=${amount}`,
  witService: {
    version: '20181016',
    token: 'XDHOIPFDJFQWXYO2ZEV547VX3B63KRSH'
  },
  tsSample: {
    version: 20181221,
    sample: {
      '360': 'https://vodstvvnpt.gviet.vn/sample/360.ts',
      '480': 'https://vodstvvnpt.gviet.vn/sample/480.ts',
      '720': 'https://vodstvvnpt.gviet.vn/sample/720.ts',
      '1080': 'https://vodstvvnpt.gviet.vn/sample/1080.ts'
    }
  },
  VIETTEL_SECURE_CHANNEL: {
    secret: 'STV$2018&sctv',
    includeClientIp: false,
    prefix: 'thudo',
    hostnames: {
      'vod.tv247.vn': 'vodsctvtt.gviet.vn',
      'live.tv247.vn': 'livesctvtt.gviet.vn'
    },
    ttl: 5*86400
  },
  VIETTEL_SECURE_INCLUDE_IP: {
    secret: 'sctv!secret$2016#',
    includeClientIp: true,
    prefix: 'thudo',
    hostnames: {
      'vod.tv247.vn': 'vodsctvtt.gviet.vn',
      'live.tv247.vn': 'livesctvtt.gviet.vn'
    },
    ttl: 5*86400
  },
  VIETTEL_SECURE_MOVIE: {
    secret: 'sctv!secret$2016#',
    includeClientIp: false,
    prefix: 'thudo',
    hostnames: {
      'vod.tv247.vn': 'vodsctvtt.gviet.vn',
      'live.tv247.vn': 'livesctvtt.gviet.vn'
    },
    ttl: 5*86400
  }
}
