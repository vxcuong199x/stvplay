'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const moment = require('moment')
const utils = require('../utils/utils')
const cdnSecure = require('../utils/viettel-secure-token')
const generateDrmJwtSign = require('../utils/generate-drm-jwt-sign')
const checkSpam = require('../utils/check-spam')
const TokenHandler = require('../logic/token-handler')
const PersonalMemory = require('../logic/personal-memory')
const PushManager = require('../services/push-manager')
const Validator = require('../lib/validator')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi')
const Payment = require('../logic/payment')
const PayGate = require('../services/pay-gate')
const CacheHandler = require('../logic/cache-handler')
const jwt = require('jsonwebtoken')
const geoip = require('geoip-lite')
const Momo = require('../services/momo-service')
const numeral = require('numeral')
numeral.locale('vi')

module.exports = function(Clip) {

  Clip.beforeRemote('*', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if (!role) {
      const filterFields = _.get(ctx, 'args.filter.fields', [])
      if (_.isArray(filterFields)) {
        const fields = {}
        _.forEach(filterFields, field => {
          fields[field] = true
        })
        _.set(ctx, 'args.filter.fields', fields)
      }

      _.set(ctx, 'args.filter.fields.source', false)
    }

    next()
  })

  Clip.beforeRemote('find', (ctx, config, next) => {
    // hide unlicensed content
    if (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(ctx.req)) {
      _.set(ctx, 'args.filter.where.activatedStore', true)
    }

    next()
  })

  Clip.remoteMethod('getInfo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get clip info'
  })

  Clip.getInfo = (req, id, filter, cb) => {
    filter.cacheTime = config.CACHE_TIME

    Clip.findById(id, filter)
      .then((clip) => {
        if (!clip) {
          return Promise.reject('Item not found '+id)
        }

        cb(null, clip)
      })
      .catch(e => {
        console.error('get clip info err', e.stack || e)
        cb(e)
      })
  }

  Clip.remoteMethod('getDetail', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get clip detail'
  })

  Clip.getDetail = (req, id, filter, cb) => {
    filter.cacheTime = config.CACHE_TIME

    if (filter.fields) {
      filter.fields.activated = true
      filter.fields.activatedStore = true
      filter.fields.price = true
      filter.fields.source = true
      filter.fields.packageCode = true
    }

    const personalUsername = req.username === 'GUEST' ? req.guestId : req.username

    Promise.all([
      Clip.findById(id, filter),
      PersonalMemory.getUserClip(personalUsername, id),
      req.username != 'GUEST' ? PersonalMemory.checkBuyClip(personalUsername, id) : false
    ])
      .spread((clip, state, bought) => {
        if (!clip || !clip.activated || (utils.isFromStore(req) && config.DISABLE_UNLICENSED_CONTENT && !clip.activatedStore)) {
          console.error('Item not found '+id)
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.channelNotFound
          })
        }

        clip.state = state

        if (clip.source && clip.source.indexOf('youtube')) {
          clip.youtubeId = clip.source.split('=')[1]
        }
        clip.source = undefined

        if (
          clip.state
          && clip.state.second
          && (clip.state.second/60) >= (clip.duration - 6)
          && clip.type == consts.MOVIE_TYPE.MANY_EPISODE
          && clip.state.episode < clip.episodeCount
        ) {
          clip.state = {
            episode: clip.state.episode + 1,
            second: 0
          }
        }

        if (!clip.state) {
          clip.state = {
            episode: 1,
            second: 0
          }
        }

        const inReview = utils.inReview(req)

        if (!clip.price || bought || inReview) {
          clip.bought = true
        }

        cb(null, clip)
      })
      .catch(e => {
        console.error('get clip detail err', e.stack || e)
        cb(e)
      })
  }

  Clip.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'resolution', type: 'number'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get clip source'
  })

  Clip.getSource = (req, id, resolution, cb) => {
    let clip
    let name
    let packagePrice
    let maxDevice
    let accessToken
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const inReview = (utils.inReview(req) || geo.country != 'VN')

    Clip.findById(id, {
      fields: ['source', 'name', 'packageCode', 'price'],
      cacheTime: config.CACHE_TIME
    })
      .then((clipData) => {
        if (!clipData) {
          return Promise.reject('Item not found '+id)
        }

        clip = clipData
        packagePrice = _.get(consts, `PACKAGE.${clip.packageCode}.price`)
        // const isNotFreeGuest = (req.username == 'GUEST' && (!req.freeUntil || req.freeUntil <= now))
        if (req.username == 'GUEST' && (clip.price || packagePrice) && !inReview) {
          return Promise.reject({
            statusCode: consts.CODE.LOGIN_REQUIRE,
            message: lang.loginRequire
          })
        }

        return [
          (clip.price || packagePrice) && req.username !== 'GUEST' ? PersonalMemory.checkBuyClip(req.username, id) : true,
          req.username !== 'GUEST' ? TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session) : null
        ]
      })
      .spread((bought, token) => {
        accessToken = token
        const userPackage = token && token.packages ? _.find(token.packages, ['code', clip.packageCode]) : null
        if (clip.price && !bought && !inReview) {
          return Promise.reject(confirmBuyClip(clip))
        } else if (packagePrice && !userPackage && !bought && !inReview) {
          return Promise.reject(confirmBuyPackage(clip, req))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        return Clip.app.models.Ads.getAds(consts.ADS_TYPE.CLIP, clip)
      })
      .then(ads => {
        if (clip.source.indexOf('youtube') > -1) {
          return Promise.reject({
            id,
            ads,
            clipId: id,
            youtubeId: clip.source.split('=')[1]
          })
        }

        name = clip.name
        clip.name = undefined

        const secureOpts = _.assign({}, config.VIETTEL_SECURE_MOVIE)
        secureOpts.clientIp = secureOpts.includeClientIp ? utils.getIp(req) : undefined
        let source = clip.source
          .replace('http://vod.sphim.tv', 'https://vodottvt.gviet.vn')
          .replace('http://vod.tv247.vn', 'https://vodtv247vt.gviet.vn')

        // todo check DRM for LG and Tizen
        if (req.platform != consts.PLATFORM.LG && req.platform != consts.PLATFORM.TIZEN) {
          source = source.replace('/film/', '/stv/')
        }

        const jwtToken = (req.username !== 'GUEST' && (packagePrice || clip.price) && !inReview)
          ? jwt.sign({
            username: req.username,
            deviceId: req.deviceId,
            maxDevice: maxDevice,
            group: clip.packageCode,
            contentId: id,
            iat: moment().unix() + secureOpts.ttl
          }, secret.MULTI_SCREEN_SECRET)
          : undefined

        return Promise.props({
          source: (source.startsWith('https://vodstvvnpt.gviet.vn') || source.startsWith('http://vodrestreamobj.5b1df984.cdnviet.com') || source.startsWith('http://vodsctvobj.5b1df984.cdnviet.com')) ? source : cdnSecure(source, secureOpts),
          // ads: {adsType: "facebook", "data":[{"type":"start", "id": "1865190850222891_2048250761916898"}, {"type":"end", "id": "1865190850222891_2048250761916898"}, {"type":"time", "data":"15:00,16:30", "id": "1865190850222891_2048250761916898"}]},
          ttl: secureOpts.ttl,
          ads,
          jwtToken: undefined //jwtToken
        })

      })
      .then(result => {
        result.id = id
        result.clipId = id
        result.source = result.source.trim().replace(/ /g, '%20')

        if (req.freeUntil && !req.isPreset) {
          const freeUntil = moment(req.freeUntil * 1000)
          result.guestControl = {
            loginMessage: freeUntil.isAfter(moment()) ? lang.loginMessage(freeUntil.format('DD/MM/YYYY')) : lang.loginMessageWhenExpire,
            skipTime: 60
          }
        }

        result.ads = (inReview || (accessToken && accessToken.packages && accessToken.packages.length >= 2)) ? 0 : 1
        cb(null, result)

        console.log('CLIP_URL', result.source)

        publishView(req, id, name)
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        else if (e.youtubeId) return cb(null, e)
        console.error('get clip source err', e.stack || e)
        cb(e)
      })
  }

  function confirmBuyClip(clip) {
    return {
      statusCode: consts.CODE.ACCESS_DENIED,
      message: lang.letBuyClip(numeral(Number(clip.price)).format('0,0')),
      details: [
        {label: lang.back, action: consts.ACTION.BACK},
        {label: lang.buyClip, action: consts.ACTION.GO_BUY_CLIP, isFocus: 1}
      ]
    }
  }

  function confirmBuyPackage(clip, req) {
    const confirm = {
      statusCode: consts.CODE.ACCESS_DENIED,
      message: lang.contentDenied(consts.BUY_GROUP[clip.packageCode].name),
      details: [
        {label: lang.back, action: consts.ACTION.BACK},
        {
          label: lang.buyPackage,
          action: consts.ACTION.GO_BUY_PACKAGE,
          isFocus: 1,
          choices: [
            {key: 'PACKAGE', groupId: consts.BUY_GROUP[clip.packageCode].groupId, name: consts.BUY_GROUP[clip.packageCode].name},
            {key: 'TIME', time: 'P6M', name: '6 tháng'}
          ]
        }
      ]
    }

    return confirm
  }

  function publishView(req, id, name) {
    Clip.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.CLIP,
      data: {
        id,
        name,
        username: req.username === 'GUEST' ? req.guestId : req.username,
        deviceId: req.deviceId,
        deviceType: req.deviceType,
        platform: req.platform,
        dtId: req.dtId,
        spId: req.spId,
        ip: utils.getIp(req),
        time: moment().unix()
      }}
    )
  }

  Clip.remoteMethod('updateState', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true},
      {arg: 'episode', type: 'number', required: true, default: 0},
      {arg: 'second', type: 'number', default: 1}
    ],
    returns: {type: 'object', root: true},
    description: 'update personal clip state'
  })

  Clip.updateState = (req, clipId, episode, second, cb) => {
    cb(null, {})

    // Clip.app.get('rabbit').publish({
    //   channel: consts.RABBIT_CHANNEL.CLIP,
    //   data:{
    //     id: clipId,
    //     episode: episode,
    //     second: Math.round(Number(second)),
    //     username: req.username === 'GUEST' ? req.guestId : req.username,
    //     deviceId: req.deviceId,
    //     deviceType: req.deviceType,
    //     dtId: req.dtId,
    //     spId: req.spId,
    //     ip: utils.getIp(req),
    //     time: moment().unix()
    //   }
    // })
  }

  Clip.remoteMethod('getRelate', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object', required: true, description: '{"id":"abc"}'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'get relate clips -> [{title: "Tiêu đề", data: [mảng phim]}, {…}]'
  })

  Clip.getRelate = (req, query, cb) => {
    // todo fix for LG, tizen DRM
    if ([consts.PLATFORM.LG, consts.PLATFORM.TIZEN].indexOf(req.platform) >= 0) {
      return utils.invokeCallback(cb, null, [])
    }

    if (!query.id) return utils.invokeCallback(cb, null, {
      statusCode: consts.CODE.INVALID_PARAM,
      message: lang.invalidParam
    })

    let relateIds = [], actorIds = []
    let clipKeywords

    const promise = Clip
      .findById(query.id, {
        fields: ['name', 'keywords', 'actors'],
        cacheTime: config.CACHE_TIME
      })
      .then(clip => {
        if (!clip) {
          return Promise.reject(`Clip ${query.id} not found`)
        }

        clipKeywords = clip.keywords || []

        if (!clip.keywords || !clip.keywords.length) {
          return Promise.reject(Promise.CancellationError())
        }

        return Clip.searchRelate(clip)
      })
      .spread((relate, actors) => {
        actorIds = _(actors.hits.hits)
            .filter(item => item._id != query.id)
            .map(item => item._id)
            .value() || []

        relateIds = _(relate.hits.hits)
          .filter(item => item._id != query.id && actorIds.indexOf(item._id) == -1)
          .map(item => item._id)
          .value() || []

        return CacheHandler.getListCache('Clip', { id: relateIds.concat(actorIds) }, { fields: 'default' })

        // return Clip.find({
        //   where: {id: {inq: relateIds.concat(actorIds)}},
        //   fields: 'default',
        //   fields: ["id", "name", "type", "thumbnail", "viewerCount", "hd", "imdb", "banner", "episodeCount", "totalEpisodes", "updatedAt", "keywords"],
        //   cacheTime: config.CACHE_TIME
        // })
      })
      .then((clips) => {
        const clipMap = {}
        _.forEach(clips, clip => {
          clipMap[clip.id] = clip
        })

        const relates = []

        if (relateIds.length && clips && clips.length) {
          relates.push({
            title: lang.youMayLike,
            data: _(relateIds)
              .map(id => clipMap[id] || null)
              .filter(item => !!item && (_.intersection(clipKeywords||[], item.keywords||[]).length))
              .value()
          })
        }

        if (actorIds.length && clips && clips.length) {
          const sameActors = _(actorIds).map(id => clipMap[id] || null).filter(item => !!item).value()
          if (sameActors && sameActors.length)
            relates.push({
              title: lang.sameActorClips,
              data: sameActors
            })
        }

        return utils.invokeCallback(cb, null, relates)
      })
      .catch(Promise.CancellationError, e => {
        return utils.invokeCallback(cb, null, [])
      })
      .catch(e => {
        console.error('get relate clip err', e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Clip.beforeRemote('buyClipCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyClipCard',
      ctx: ctx,
      key: 'ip',
      limit: 45,
      next: next
    })
  })

  Clip.beforeRemote('buyClipCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyClipCard',
      ctx: ctx,
      key: 'req.username',
      limit: 30,
      next: next
    })
  })

  Clip.remoteMethod('buyClipCard', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true},
      {arg: 'telco', type: 'number', required: true, description: 'Nhà mạng (1: mobi, 2: viettel, 3: vina, 4: FPT)'},
      {arg: 'serial', type: 'string', required: true},
      {arg: 'pin', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy clip by use card'
  })

  const cardRule = {
    serial: 'required|alpha_dash|between:8,15',
    pin: 'required|alpha_dash|between:8,15',
    clipId: 'required|alpha_dash'
  }

  Clip.buyClipCard = (req, clipId, telco, serial, pin, cb) => {
    const validator = new Validator({clipId, serial, pin}, cardRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyClip({ req, clipId, telco, serial, pin, buyType: consts.TRANSACTION_TYPE.BUY_CARD })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyClipCard err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Clip.remoteMethod('buyClipCoin', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy clip by coin'
  })

  const coinRule = {
    clipId: 'required|alpha_dash'
  }

  Clip.buyClipCoin = (req, clipId, cb) => {
    const validator = new Validator({clipId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyClip({ req, clipId, buyType: consts.TRANSACTION_TYPE.BUY_COIN })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyClipCoin err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Clip.remoteMethod('getNotice', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get notice clip'
  })

  Clip.getNotice = (req, clipId, cb) => {
    const validator = new Validator({clipId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    if (req.username == 'GUEST') {
      return cb({
        statusCode: consts.CODE.LOGIN_REQUIRE,
        message: lang.loginRequire
      })
    }

    PersonalMemory.checkBuyClip(req.username, clipId)
      .then(bought => {
        if (bought) {
          return Promise.reject(new Promise.CancellationError())
        }

        return Payment.calculateClipAmount({ clipId, username: req.username })
      })
      .then(({ clip, totalAmount, requireAmount }) => {
        if (requireAmount <= 0) {
          cb(null, {
            notice: lang.enoughCoinByClip(clip.name) + lang.buyConfirm,
            action: consts.PACKAGE_ACTION.BUY_COIN,
            amount: 0,
            message: lang.paymentMessage
          })
        } else {
          cb(null, {
            notice: '',
            action: req.deviceType === consts.DEVICE_TYPE.MOBILE ? consts.ACTION.GO_BUY_CLIP : consts.PACKAGE_ACTION.NEXT, // todo check when new mobile version
            amount: totalAmount,
            message: lang.paymentMessage
          })
        }
      })
      .catch(Promise.CancellationError, e => {
        cb(null, {
          message: lang.boughtClip,
          action: consts.PACKAGE_ACTION.BOUGHT
        })
      })
      .catch(e => {
        console.error('getNotice err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Clip.remoteMethod('buyClipBank', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true},
      {arg: 'bankCode', type: 'string'}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy clip by bank'
  })

  Clip.buyClipBank = (req, clipId, bankCode, cb) => {
    const validator = new Validator({clipId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    const orderInfo = [clipId, reqObj, consts.CLIENT_COMMAND.BUY_CLIP]

    Payment
      .calculateClipAmount({ clipId, username: req.username })
      .then(({ requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_CLIP,
        //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
        //   })
        // }, 3000)

        return PayGate.getBankLink({
          username: req.username,
          amount: requireAmount,
          bankCode: (req.deviceType === consts.DEVICE_TYPE.MOBILE ? 'all' : 'VNPAYQR'),
          ip: utils.getIp(req),
          orderInfo: new Buffer(JSON.stringify(orderInfo)).toString('base64')
        })
      })
      .then(link => cb(null, { link }))
      .catch(e => {
        console.error('buyClipBank err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Clip.remoteMethod('buyClipMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy clip by momo'
  })

  Clip.buyClipMomo = (req, clipId, cb) => {

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    const orderInfo = [clipId, reqObj, consts.CLIENT_COMMAND.BUY_CLIP]
    let amount, orderId

    Payment
      .calculateClipAmount({ clipId, username: req.username })
      .then(({ requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_CLIP,
        //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
        //   })
        // }, 3000)

        orderId = consts.PAYMENT_METHOD.MOMO.partnerCode + '_' + Date.now()
        const orderInfoBase64 = new Buffer(JSON.stringify(orderInfo)).toString('base64')
        amount = requireAmount
        return Payment.setOrderInfo(orderId, orderInfoBase64)
      })
      .then(() => {
        return Momo.getQR({
          username: req.username,
          orderInfo: `Phone: ${req.username}, Price: ${amount}`,
          amount,
          orderId
        })
      })
      .then(qrCode => cb(null, { qrCode, expireIn: 300, link: config.MOMO_WEBVIEW_URL(qrCode, 300, amount) }))
      .catch(e => {
        console.error('buyClipMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Clip.remoteMethod('buyClipVerifyMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'orderId', type: 'string', required: true},
      {arg: 'clipId', type: 'string', required: true},
      {arg: 'customerNumber', type: 'string', required: true},
      {arg: 'customerUsername', type: 'string', required: true},
      {arg: 'appData', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy clip verify momo'
  })

  Clip.buyClipVerifyMomo = (req, orderId, clipId, customerNumber, customerUsername, appData, cb) => {
    const validator = new Validator({clipId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    // const orderInfo = [clipId, reqObj, consts.CLIENT_COMMAND.BUY_PACKAGE]
    let amount

    Payment
      .calculateClipAmount({ clipId, username: req.username })
      .then(({ totalAmount, requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_PACKAGE,
        //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
        //   })
        // }, 76000)

        amount = totalAmount

        return Momo.verify({
          username: req.username,
          orderInfo: `Phone: ${req.username}, Price: ${amount}`,
          amount,
          orderId,
          customerNumber,
          customerUsername,
          appData
        })
      })
      .then(result => {
        if (!result || !result.amount || result.status) {
          return Promise.reject(result)
        }

        return Payment
          .buyClip({ req, clipId, amount: result.amount, buyType: consts.TRANSACTION_TYPE.MOMO })
      })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        console.error('buyClipMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }
}
