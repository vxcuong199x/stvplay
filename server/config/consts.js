module.exports = {
  PRODUCT_ID: 6,
  DEFAULT_TV_LIMIT: 10,
  DEFAULT_MOBILE_LIMIT: 15,
  MORE_LOGIN_DEVICE: 0,
  PHONE: '1900 585868',
  OTP_SYNTAX: 'OTP STV',
  OTP_PORT: '6194',
  SEARCH_SCORE_THRESHOLD: 6,
  CODE: {
    INVALID_PARAM: 497,
    ACCESS_DENIED: 497,
    ACCESS_DENIED_KARAOKE: 496,
    DATA_MISSING: 404,
    WRONG_FLOW: 497,
    SERVER_ERROR: 500,
    KICK: 401,
    LOGIN_REQUIRE: 402,
    DISABLE_GUEST: 405
  },
  PACKAGE_ACTION: {
    NEXT: 1,
    BUY_COIN: 2,
    BOUGHT: 3
  },
  PLATFORM: {
    IOS: 1,
    ANDROID: 2,
    WP: 3,
    TIZEN: 4,
    LG: 5,
    WEB: 6
  },
  ADS_TYPE: {
    CHANNEL: 'channel',
    MOVIE: 'movie',
    CLIP: 'clip'
  },
  SCREEN: {
    HOME: 'HOME',
    MENU: 'MENU',
    CHANNEL_DETAIL: 'CHANNEL_DETAIL',
    MOVIE_DETAIL: 'MOVIE_DETAIL',
    CLIP_DETAIL: 'CLIP_DETAIL',
    PERSONAL: 'PERSONAL',
    CHARGE: 'CHARGE',
    UNKNOWN: 'UNKNOWN',
    SEARCH: 'SEARCH'
  },
  TRANSACTION_TYPE: {
    BUY_CARD: 1,
    BUY_COIN: 2,
    GIFT_CODE: 3,
    BANK: 4,
    MOMO: 6,
    ADD_COIN: 5,
    VNM_VAS: 7,
    MOBIFONE: 8
  },
  TRANSACTION_STATUS: {
    SUCCESS: 0,
    FAIL: 1,
    SUCCESS_NOT_ENOUGH: 2
  },
  TRANSACTION_STATUS_MAP: {
    0: 'Thành công',
    1: 'Thất bại',
    2: 'Không đủ tiền'
  },
  TRANSACTION_MAP: {
    1: 'Thẻ cào',
    2: 'Dùng số dư',
    3: 'Mã quà tặng',
    4: 'Ngân hàng',
    5: 'Cộng từ admin'
  },
  GIFT_CODE_STATUS: {
    ACTIVE: 1,
    SENT: 2,
    RECEIVED: 3
  },
  RABBIT_CHANNEL: {
    MOVIE: 'ott:movie:view',
    KARAOKE: 'ott:karaoke:view',
    CLIP: 'ott:clip:view',
    BUY_MOVIE: 'ott:movie:buy',
    BUY_CLIP: 'ott:clip:buy',
    CHANNEL: 'ott:channel:view',
    TRANSACTION: 'ott:transaction',
    REGISTER: 'ott:register',
    LOGIN: 'ott:login',
    OPEN_APP: 'ott:open-app',
    PING: 'ott:ping',
    HOME: 'ott:home',
    CHANGE_NPP: 'ott:change-npp'
  },
  MEDIA_TYPE: {
    CHANNEL: 1,
    MOVIE: 2,
    CLIP: 4,
    PROGRAM: 5
  },
  SLIDE_TYPE: {
    CHANNEL: 1,
    MOVIE: 2,
    CLIP: 4,
    MENU: 10
  },
  BUY_CONTENT_TYPE: {
    PACKAGE: 1,
    MOVIE: 2,
    CLIP: 3,
    ADD_COIN: 4
  },
  MENU_TYPE: {
    CHANNEL: 1,
    MOVIE: 2,
    CLIP: 4,
    ACCOUNT: 5,
    ALL_CHANNEL: 6,
    MIX: 7,
    KARAOKE: 8,
    PACKAGE: 9,
    SETTING: 10
  },
  NOTIFY_TYPE: {
    ONLINE: 1,
    OFFLINE: 3,
    COMMAND: 4,
    SMS: 5
  },
  DEVICE_TYPE: {
    TV: 1,
    MOBILE: 2,
    WEB: 3,
    CMS: 9
  },
  MOVIE_TYPE: {
    ONE_EPISODE: 1,
    MANY_EPISODE: 2
  },
  ACTION: {
    BACK: 2,
    GO_BUY_PACKAGE: 1,
    GO_BUY_MOVIE: 3,
    GO_BUY_CLIP: 4,
    ENTER_GIFT_CODE: 5
  },
  AFTER_BUY_CODE: {
    ENOUGH: 0,
    NOT_ENOUGH: 1
  },
  PACKAGE_BONUS: {
    // 12: 2, // months
    // 6: 1,
    // 3: 0,
    // 2: 0,
    1: 0,
    0: 0
  },
  CLIENT_COMMAND: {
    BUY_PACKAGE: 'buy_package',
    BUY_MOVIE: 'buy_movie',
    BUY_CLIP: 'buy_clip'
  },
  BUY_GROUP: {
    'BASIC': { groupId: '5c18c9e427cc329d0eb7759e', name: 'STV Cơ Bản' },
    'SCTV': { groupId: '59ae7ff3e32a0e011ce9445a', name: 'STV VIP' },
    'KARAOKE': { groupId: '5c36c8e871ac1b34cd24cffc', name: 'Karaoke' },
    'SONG-VANG': { groupId: '5c36ceb671ac1b34cd24cffd', name: 'Sóng Vàng' },
    'DANET': { groupId: '59ae80d3e32a0e011ce9445c', name: 'PHIM HOT' },
    'MAX': { groupId: '59ae818de32a0e011ce94460', name: 'MAX+' },
    'EPL': { groupId: '59ae80f9e32a0e011ce9445d', name: 'THỂ THAO' }
  },
  ADD_COIN_TYPE: {
    TO_NPP: 1,
    TO_DAILY: 2,
    TO_USER: 3
  },
  CMS_USER_TYPE: {
    NPP: 1,
    DAILY: 2,
    CSKH: 3,
    KETOAN: 4,
    VH: 4
  },
  ROLES: {
    admin: 'Admin',
    npp: 'CmsUser',
    daily: 'CmsUser',
    ketoan: 'CmsUser',
    cskh: 'CmsUser',
    vh: 'CmsUser',
    partner: 'CmsUser',
    content: 'CmsUser',
    qnet: 'CmsUser',
    qnet2: 'CmsUser'
  },
  PACKAGE: {
    FREE: {
      code: 'FREE',
      logo: null,
      price: 0
    },
    SCTV: {
      code: 'SCTV',
      logo: 1556677040680,  //1548997351667
      price: 55000
    },
    BASIC: {
      code: 'BASIC',
      logo: 1556676988435, //1545128603726
      price: 20000
    },
    KARAOKE: {
      code: 'KARAOKE',
      logo: 1547094505954,
      price: 35000
    },
    'SONG-VANG': {
      code: 'SONG-VANG',
      logo: 1547095841144,
      price: 30000
    },
    MAX: {
      code: 'MAX',
      logo: 1576639357913, // 1573547864744 1573547479070
      price: 80000
    },
    DANET: {
      code: 'DANET',
      logo: 1505536719376,
      price: 20000
    },
    EPL: {
      code: 'EPL',
      logo: 1505536756263,
      price: 50000
    }
  },
  PAYMENT_METHOD: {
    // CARD: {
    //   id: 1,
    //   name: 'Dùng thẻ Gate, VCoin'
    // },
    BANK: {
      id: 2,
      name: 'Dành cho thuê bao Mobifone'
    },
    // MOMO: {
    //   id: 4,
    //   name: 'Dùng ví MoMo',
    //   partnerCode: 'MOMO48AS20181010', // MOMOIQA420180417
    //   partnerName: 'STV Play',
    //   env: 1 // 1 is production
    // },
    // DAILY: {
    //   id: 3,
    //   name: 'Liên hệ đại lý'
    // }
  },
  TELCO: {
    // VIETTEL: {
    //   id: 2,
    //   name: 'Viettel',
    //   logo: 1504663505625
    // },
    // VINAPHONE: {
    //   id: 3,
    //   name: 'Vinaphone',
    //   logo: 1504663516152
    // },
    // MOBIFONE: {
    //   id: 1,
    //   name: 'Mobifone',
    //   logo: 1504663493120
    // }
    GATE: {
      id: 5,
      name: 'Thẻ GATE',
      logo: 1536139927364
    },
    VCOIN: {
      id: 6,
      name: 'Thẻ VCOIN',
      logo: 1536140011815
    }
  },
  TELCO_CODE: {
    VIETTEL: 2,
    MOBIFONE: 1,
    VINAPHONE: 3,
    FPT: 4,
    GATE: 5,
    VCOIN: 6,
    VIETNAM_MOBILE: 7
  },
  BANK_CODE: {
    VIETCOMBANK: {
      code: 'VIETCOMBANK',
      logo: 1504666572958
    },
    VIETINBANK: {
      code: 'VIETINBANK',
      logo: 1504666759592
    },
    BIDV: {
      code: 'BIDV',
      logo: 1504666775191
    },
    AGRIBANK: {
      code: 'AGRIBANK',
      logo: 1504666792579
    },
    SACOMBANK: {
      code: 'SACOMBANK',
      logo: 1504666805076
    },
    TECHCOMBANK: {
      code: 'TECHCOMBANK',
      logo: 1504666827700
    },
    ACB: {
      code: 'ACB',
      logo: 1504666842126
    },
    VPBANK: {
      code: 'VPBANK',
      logo: 1504666854806
    },
    SHB: {
      code: 'SHB',
      logo: 1504667296318
    },
    DONGABANK: {
      code: 'DONGABANK',
      logo: 1504667177236
    },
    EXIMBANK: {
      code: 'EXIMBANK',
      logo: 1504667195528
    },
    TPBANK: {
      code: 'TPBANK',
      logo: 1504667213115
    },
    NCB: {
      code: 'NCB',
      logo: 1504667225726
    },
    OJB: {
      code: 'OJB',
      logo: 1504667241418
    },
    MSBANK: {
      code: 'MSBANK',
      logo: 1504667253494
    },
    HDBANK: {
      code: 'HDBANK',
      logo: 1504667265620
    },
    NAMABANK: {
      code: 'NAMABANK',
      logo: 1504667277299
    },
    OCB: {
      code: 'OCB',
      logo: 1504667287297
    },
    SCB: {
      code: 'SCB',
      logo: 1504667335289
    },
    ABBANK: {
      code: 'ABBANK',
      logo: 1504667345045
    },
    IVB: {
      code: 'IVB',
      logo: 1504667355334
    }
  },
  DT_ID: {
    QNET: 43
  }
}
