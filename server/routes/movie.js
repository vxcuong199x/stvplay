'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const moment = require('moment')
const utils = require('../utils/utils')
const cdnSecure = require('../utils/viettel-secure-token')
const checkSpam = require('../utils/check-spam')
const PushManager = require('../services/push-manager')
const TokenHandler = require('../logic/token-handler')
const PersonalMemory = require('../logic/personal-memory')
const Validator = require('../lib/validator')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi')
const Payment = require('../logic/payment')
const PayGate = require('../services/pay-gate')
const CacheHandler = require('../logic/cache-handler')
const jwt = require('jsonwebtoken')
const Momo = require('../services/momo-service')
const geoip = require('geoip-lite')
const numeral = require('numeral')
numeral.locale('vi')

module.exports = function(Movie) {

  Movie.beforeRemote('*', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if (!role) {
      const filterFields = _.get(ctx, 'args.filter.fields', [])
      if (_.isArray(filterFields)) {
        const fields = {}
        _.forEach(filterFields, field => {
          fields[field] = true
        })

        _.set(ctx, 'args.filter.fields', fields)
        _.set(ctx, 'args.filter.fields.createdAt', true) // todo remove when DRM LG, tizen
      }

      _.set(ctx, 'args.filter.fields.source', false)
    }

    next()
  })

  Movie.beforeRemote('find', (ctx, option, next) => {
    // hide unlicensed content
    if (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(ctx.req)) {
      _.set(ctx, 'args.filter.where.activatedStore', true)
    }

    next()
  })

  Movie.afterRemote('find', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if ((!role) && ctx.result && Array.isArray(ctx.result)) {
      _.each(ctx.result, (movie, i) => {
        // todo remove when DRM LG, tizen
        if (movie.createdAt <= '2018-10-01' && [consts.PLATFORM.LG, consts.PLATFORM.TIZEN].indexOf(ctx.req.platform) >= 0) {
          ctx.result.splice(i, 1)
        }

        movie.providerLogo = _.get(consts, `PACKAGE.${movie.packageCode}.logo`) || null
        // movie.trailer = 'http://vod.tv247.vn/vodsctv/_definst_/ngoaihanganh/2012-_Man_United_comeback_from_3-0_down_v._Chelsea_1509596059.mp4/playlist.m3u8'
      })
    }

    next()
  })

  Movie.remoteMethod('getInfo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get movie info'
  })

  Movie.getInfo = (req, id, filter, cb) => {
    if (filter.fields) {
      filter.fields.price = true
    }
    filter.cacheTime = config.CACHE_TIME

    Movie.findById(id, filter)
      .then((movie) => {
        if (!movie) {
          return Promise.reject('Item not found '+id)
        }

        cb(null, movie)
      })
      .catch(e => {
        console.error('get movie info err', e.stack || e)
        cb(e)
      })
  }

  Movie.remoteMethod('getDetail', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get movie detail'
  })

  Movie.getDetail = (req, id, filter, cb) => {
    filter.cacheTime = config.CACHE_TIME

    if (filter.fields) {
      filter.fields.activated = true
      filter.fields.activatedStore = true
      filter.fields.price = true
      filter.fields.duration = true
      filter.fields.source = true
      filter.fields.packageCode = true
    }

    const personalUsername = req.username === 'GUEST' ? req.guestId : req.username

    Promise.all([
      Movie.findById(id, filter),
      PersonalMemory.getUserMovie(personalUsername, id),
      req.username != 'GUEST' ? PersonalMemory.checkBuyMovie(personalUsername, id) : false
    ])
      .spread((movie, state, bought) => {
        if (!movie || !movie.activated || (utils.isFromStore(req) && config.DISABLE_UNLICENSED_CONTENT && !movie.activatedStore)) {
          console.error('Item not found '+id)
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.channelNotFound,
            id
          })
        }

        if (state) {
          movie.state = state
          if (movie.source && movie.source.indexOf('youtube')) {
            movie.youtubeId = movie.source.split('=')[1]
          }
          movie.source = undefined

          if (
            movie.duration
            && movie.state.second
            && (movie.state.second/60) >= (movie.duration - 6)
            && movie.type == consts.MOVIE_TYPE.MANY_EPISODE
            && movie.state.episode < movie.episodeCount
          ) {
            movie.state = {
              episode: movie.state.episode + 1,
              second: 0
            }
          }

          movie.duration *= 60
        }

        if (!movie.state) {
          movie.state = {
            episode: 1,
            second: 0
          }
        }

        const inReview = utils.inReview(req)

        if (!movie.price || bought || inReview) {
          movie.bought = true
        }

        cb(null, movie)
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('get movie detail err', e.stack || e)
        cb(e)
      })
  }

  Movie.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', required: true},
      {arg: 'resolution', type: 'number'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get movie source'
  })

  Movie.getSource = (req, id, resolution, cb) => {
    const now = moment().unix()
    let movie
    let name
    let packagePrice
    let maxDevice
    let accessToken
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const inReview = (utils.inReview(req) || geo.country != 'VN')

    Movie.findById(id, {
      fields: ['source', 'name', 'packageCode', 'price', 'movieCatalogIds', 'showPhoneInterval', 'showPhoneTime'],
      cacheTime: config.CACHE_TIME
    })
      .then((movieData) => {
        if (!movieData) {
          return Promise.reject('Item not found '+id)
        }

        movie = movieData
        packagePrice = _.get(consts, `PACKAGE.${movie.packageCode}.price`)
        // const isNotFreeGuest = (req.username == 'GUEST' && (!req.freeUntil || req.freeUntil <= now))

        if (req.username == 'GUEST' && (movie.price || packagePrice) && !inReview) {
          return Promise.reject({
            statusCode: consts.CODE.LOGIN_REQUIRE,
            message: lang.loginRequire
          })
        }

        return [
          (movie.price || packagePrice) && req.username !== 'GUEST' ? PersonalMemory.checkBuyMovie(req.username, id) : true,
          req.username !== 'GUEST' ? TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session) : null
        ]
      })
      .spread((bought, token) => {
        accessToken = token
        const userPackage = token && token.packages ? _.find(token.packages, ['code', movie.packageCode]) : null
        if (movie.price && !bought && !inReview) {
          return Promise.reject(confirmBuyMovie(movie))
        } else if (packagePrice && !userPackage && !bought && !inReview) {
          return Promise.reject(confirmBuyPackage(movie, req))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        return Movie.app.models.Ads.getAds(consts.ADS_TYPE.MOVIE, movie)
      })
      .then(ads => {
        if (movie.source.indexOf('youtube') > -1) {
          return Promise.reject({
            id,
            ads,
            movieId: id,
            youtubeId: movie.source.split('=')[1]
          })
        }

        name = movie.name
        movie.name = undefined

        const secureOpts = _.assign({}, config.VIETTEL_SECURE_MOVIE)
        secureOpts.clientIp = secureOpts.includeClientIp ? utils.getIp(req) : undefined
        let source
        const telco = Movie.app.models.TelcoMap.getTelco(ip)
        if (telco == 'viettel') {
          source = movie.source
            .replace('http://vod.sphim.tv', 'https://vodottvt.gviet.vn')
            .replace('https://vodstvvnpt.gviet.vn', 'https://vodstvvt.gviet.vn')
        } else {
          source = movie.source.replace('http://vod.sphim.tv', 'https://vodottvnpt.gviet.vn')
        }

        source = source.replace('http://vod.tv247.vn', 'https://vodtv247vt.gviet.vn')

        // todo check for LG and Tizen
        if (req.platform != consts.PLATFORM.LG && req.platform != consts.PLATFORM.TIZEN) {
          source = source.replace('/film/', '/stv/')
        }

        const jwtToken = (req.username !== 'GUEST' && (packagePrice || movie.price) && !inReview)
          ? jwt.sign({
            username: req.username,
            deviceId: req.deviceId,
            maxDevice: maxDevice,
            group: movie.packageCode,
            contentId: id,
            iat: moment().unix() + secureOpts.ttl
          }, secret.MULTI_SCREEN_SECRET)
          : undefined

        return Promise.props({
          source: source.trim(), //cdnSecure(source, secureOpts),
          // ads: {adsType: "facebook", "data":[{"type":"start", "id": "1865190850222891_2048250761916898"}, {"type":"end", "id": "1865190850222891_2048250761916898"}, {"type":"time", "data":"15:00,16:30", "id": "1865190850222891_2048250761916898"}]},
          ttl: secureOpts.ttl,
          jwtToken: undefined, // jwtToken
          ads
        })

      })
      .then(result => {
        result.id = id
        result.movieId = id

        if (req.freeUntil && !req.isPreset) {
          const freeUntil = moment(req.freeUntil * 1000)
          result.guestControl = {
            loginMessage: freeUntil.isAfter(moment()) ? lang.loginMessage(freeUntil.format('DD/MM/YYYY')) : lang.loginMessageWhenExpire,
            skipTime: 60
          }
        }

        result.ads = (inReview || (accessToken && accessToken.packages && accessToken.packages.length >= 2)) ? 0 : 1
        // console.log('result.ads', inReview, packagePrice, accessToken, result.ads)

        cb(null, result)

        console.log('MOVIE_URL', result.source)

        publishView(req, id, name, movie.movieCatalogIds)
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        else if (e.youtubeId) return cb(null, e)
        console.error('get movie source err', e.stack || e)
        cb(e)
      })
  }

  function confirmBuyMovie(movie) {
    return {
      statusCode: consts.CODE.ACCESS_DENIED,
      message: lang.letBuyMovie(numeral(Number(movie.price)).format('0,0')),
      details: [
        {label: lang.back, action: consts.ACTION.BACK},
        {label: lang.buyMovie, action: consts.ACTION.GO_BUY_MOVIE, isFocus: 1}
      ]
    }
  }

  function confirmBuyPackage(movie, req) {
    const confirm = {
      statusCode: consts.CODE.ACCESS_DENIED,
      message: lang.contentDenied(consts.BUY_GROUP[movie.packageCode].name),
      details: [
        {label: lang.back, action: consts.ACTION.BACK},
        {
          label: lang.buyPackage,
          action: consts.ACTION.GO_BUY_PACKAGE,
          isFocus: 1,
          choices: [
            {key: 'PACKAGE', groupId: consts.BUY_GROUP[movie.packageCode].groupId, name: consts.BUY_GROUP[movie.packageCode].name},
            {key: 'TIME', time: 'P6M', name: '6 tháng'}
          ]
        }
      ]
    }

    return confirm
  }

  function publishView(req, id, name, movieCatalogIds) {
    Movie.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.MOVIE,
      data: {
        id,
        name,
        movieCatalogIds,
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

  Movie.remoteMethod('updateState', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true},
      {arg: 'episode', type: 'number', required: true, default: 0},
      {arg: 'second', type: 'number', default: 1}
    ],
    returns: {type: 'object', root: true},
    description: 'update personal movie state'
  })

  Movie.updateState = (req, movieId, episode, second, cb) => {
    cb(null, {})

    Movie.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.MOVIE,
      data:{
        id: movieId,
        episode: episode,
        second: Math.round(Number(second)),
        username: req.username === 'GUEST' ? req.guestId : req.username,
        deviceId: req.deviceId,
        deviceType: req.deviceType,
        dtId: req.dtId,
        spId: req.spId,
        ip: utils.getIp(req),
        time: moment().unix()
      }
    })
  }

  Movie.remoteMethod('getRelate', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object', required: true, description: '{"id":"abc"}'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'get relate movies -> [{title: "Tiêu đề", data: [mảng phim]}, {…}]'
  })

  Movie.getRelate = (req, query, cb) => {
    // todo fix for LG, tizen DRM
    if ([consts.PLATFORM.LG, consts.PLATFORM.TIZEN].indexOf(req.platform) >= 0) {
      return utils.invokeCallback(cb, null, [])
    }

    if (!query.id) return utils.invokeCallback(cb, null, {
      statusCode: consts.CODE.INVALID_PARAM,
      message: lang.invalidParam
    })

    let relateIds = [], actorIds = []

    const promise = Movie
      .findById(query.id, {
        fields: ['name', 'keywords', 'actors'],
        cacheTime: config.CACHE_TIME
      })
      .then(movie => {
        if (!movie) {
          return Promise.reject(`Movie ${query.id} not found`)
        }

        return Movie.searchRelate(movie)
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

        return CacheHandler.getListCache('Movie', { id: relateIds.concat(actorIds) }, { fields: 'default' })

        // return Movie.find({
        //   where: {id: {inq: relateIds.concat(actorIds)}},
        //   fields: 'default'
        // })
      })
      .then((movies) => {
        const movieMap = {}
        _.forEach(movies, movie => {
          movieMap[movie.id] = movie
        })

        const relates = []

        if (relateIds.length && movies && movies.length) {
          relates.push({
            title: lang.youMayLike,
            data: _(relateIds)
              .map(id => movieMap[id] || null)
              .filter(item => !!item && item.activatedStore)
              .value()
          })
        }

        if (actorIds.length && movies && movies.length) {
          const sameActors = _(actorIds)
            .map(id => movieMap[id] || null)
            .filter(item => !!item && item.activatedStore)
            .value()
          if (sameActors && sameActors.length)
            relates.push({
              title: lang.sameActorMovies,
              data: sameActors
            })
        }

        return utils.invokeCallback(cb, null, relates)
      })
      .catch(e => {
        console.error('get relate movie err', e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Movie.beforeRemote('buyMovieCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyMovieCard',
      ctx: ctx,
      key: 'ip',
      limit: 45,
      next: next
    })
  })

  Movie.beforeRemote('buyMovieCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyMovieCard',
      ctx: ctx,
      key: 'req.username',
      limit: 30,
      next: next
    })
  })

  Movie.remoteMethod('buyMovieCard', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true},
      {arg: 'telco', type: 'number', required: true, description: 'Nhà mạng (1: mobi, 2: viettel, 3: vina, 4: FPT)'},
      {arg: 'serial', type: 'string', required: true},
      {arg: 'pin', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy movie by use card'
  })

  const cardRule = {
    serial: 'required|alpha_dash|between:8,15',
    pin: 'required|alpha_dash|between:8,15',
    movieId: 'required|alpha_dash'
  }

  Movie.buyMovieCard = (req, movieId, telco, serial, pin, cb) => {
    const validator = new Validator({movieId, serial, pin}, cardRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyMovie({ req, movieId, telco, serial, pin, buyType: consts.TRANSACTION_TYPE.BUY_CARD })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyMovieCard err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Movie.remoteMethod('buyMovieCoin', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy movie by coin'
  })

  const coinRule = {
    movieId: 'required|alpha_dash'
  }

  Movie.buyMovieCoin = (req, movieId, cb) => {
    const validator = new Validator({movieId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyMovie({ req, movieId, buyType: consts.TRANSACTION_TYPE.BUY_COIN })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyMovieCoin err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Movie.remoteMethod('getNotice', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get notice movie'
  })

  Movie.getNotice = (req, movieId, cb) => {
    const validator = new Validator({movieId}, coinRule)
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

    PersonalMemory.checkBuyMovie(req.username, movieId)
      .then(bought => {
        if (bought) {
          return Promise.reject(new Promise.CancellationError())
        }

        return Payment.calculateMovieAmount({ movieId, username: req.username })
      })
      .then(({ movie, currentCoin, totalAmount, requireAmount }) => {
        if (requireAmount <= 0) {
          cb(null, {
            notice: lang.enoughCoinByMovie(movie.name) + lang.buyConfirm,
            action: consts.PACKAGE_ACTION.BUY_COIN,
            amount: 0,
            message: lang.paymentMessage
          })
        } else {
          cb(null, {
            notice: '', //lang.notEnoughCoinByMovie(numeral(Number(currentCoin)).format('0,0'), numeral(Number(requireAmount)).format('0,0'), movie.name) + lang.buyConfirm,
            action: req.deviceType === consts.DEVICE_TYPE.MOBILE ? consts.ACTION.GO_BUY_MOVIE : consts.PACKAGE_ACTION.NEXT, // todo check when new mobile version
            amount: requireAmount,
            message: lang.paymentMessage
          })
        }
      })
      .catch(Promise.CancellationError, e => {
        cb(null, {
          message: lang.boughtMovie,
          action: consts.PACKAGE_ACTION.BOUGHT
        })
      })
      .catch(e => {
        console.error('getNotice err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Movie.remoteMethod('buyMovieBank', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true},
      {arg: 'bankCode', type: 'string'}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy movie by coin'
  })

  Movie.buyMovieBank = (req, movieId, bankCode, cb) => {
    const validator = new Validator({movieId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    const orderInfo = [movieId, reqObj, consts.CLIENT_COMMAND.BUY_MOVIE]

    Payment
      .calculateMovieAmount({ movieId, username: req.username })
      .then(({ requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_MOVIE,
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
        console.error('buyMovieBank err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Movie.remoteMethod('buyMovieMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy movie by momo'
  })

  Movie.buyMovieMomo = (req, movieId, cb) => {

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    const orderInfo = [movieId, reqObj, consts.CLIENT_COMMAND.BUY_MOVIE]
    let amount, orderId

    Payment
      .calculateMovieAmount({ movieId: movieId, username: req.username })
      .then(({ requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_MOVIE,
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
        console.error('buyMovieMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Movie.remoteMethod('buyMovieVerifyMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'orderId', type: 'string', required: true},
      {arg: 'movieId', type: 'string', required: true},
      {arg: 'customerNumber', type: 'string', required: true},
      {arg: 'customerUsername', type: 'string', required: true},
      {arg: 'appData', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package verify momo'
  })

  Movie.buyMovieVerifyMomo = (req, orderId, movieId, customerNumber, customerUsername, appData, cb) => {
    const validator = new Validator({movieId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    // const orderInfo = [movieId, reqObj, consts.CLIENT_COMMAND.BUY_PACKAGE]
    let amount

    Payment
      .calculateMovieAmount({ movieId, username: req.username })
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
          .buyMovie({ req, movieId, amount: result.amount, buyType: consts.TRANSACTION_TYPE.MOMO })
      })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        console.error('buyMovieMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }
}
