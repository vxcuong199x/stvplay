'use strict'

const _ = require('lodash')
const moment = require('moment')
const outputCache = require('../utils/output-cache')
const cdnSecure = require('../utils/viettel-secure-token')
const generateDrmJwtSign = require('../utils/generate-drm-jwt-sign')
const TokenHandler = require('../logic/token-handler')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi')
const geoip = require('geoip-lite')
const ObjectId = require('mongodb').ObjectId
const jwt = require('jsonwebtoken')
const numeral = require('numeral')
const DRMToday = require('../services/drm-today')
numeral.locale('vi')

module.exports = function(Channel) {

  Channel.beforeRemote('*', (ctx, config, next) => {
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

      // _.set(ctx, 'args.filter.fields.source', false)
      // _.set(ctx, 'args.filter.fields.source_secure', false)
    }
    next()
  })

  Channel.remoteMethod('findAll', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object', default: {}}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Find all instances of the model matched by filter from the data'
  })

  Channel.findAll = (req, filter, cb) => {
    const inReview = utils.inReview(req)
    const originFilter = _.clone(filter)
    let channels
    filter = filter || {}
    _.set(filter, 'where.activated', true)
    filter.cacheTime = config.CACHE_TIME
    filter.fields = 'default'

    // hide unlicensed content
    if (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) {
      _.set(filter, 'where.activatedStore', true)
    }

    const promise = Channel.find(filter)
      .then(result => {
        channels = result || []
        let channelIds = _.map(channels, channel => channel.id)

        if (!channelIds.length)
          return Promise.resolve([])

        return Channel.app.models.ChannelProgram.getLivePrograms(channelIds)
      })
      .then(programs => {
        const programMap = {}
        _.forEach(_.sortBy(programs, ['livedAt']), program => {
          programMap[program.channelId] = program
        })

        // else {
        //   // kênh địa phương chỉ lấy lân cận
        //   const ip = utils.getIp(req)
        //   const geo = geoip.lookup(ip) || {}
        //   const city = (geo.city || '').toLowerCase()
        //   channels = _.filter(channels, channel => {
        //     const channelCatalogIds = []
        //     _.each(channel.channelCatalogIds, id => channelCatalogIds.push(id.toString()))
        //     if (channelCatalogIds.indexOf('5a8f8ecd4d6ca32966ad4fdf') != -1) {
        //       if (!channel.keywords || !channel.keywords.length || channel.keywords.indexOf(city) == -1) {
        //         return false
        //       }
        //     }
        //     return true
        //   })
        // }

        // todo hide kênh địa phương on Web (because crawler and prevent cross domain by content source)
        if (req.deviceType == consts.DEVICE_TYPE.WEB) {
          channels = _.filter(channels, channel => {
            const channelCatalogIds = []
            _.each(channel.channelCatalogIds, id => channelCatalogIds.push(id.toString()))
            return (
              channelCatalogIds.indexOf('5a8f8ecd4d6ca32966ad4fdf') == -1
              && channelCatalogIds.indexOf('5b8a67b66afba86eafc73f10') == -1
              && channelCatalogIds.indexOf('5b8a67c6a1e221397c8bb28d') == -1
              && channelCatalogIds.indexOf('5b8a67d26afba86eafc73f12') == -1
              // && channelCatalogIds.indexOf('5cbfecb0e206062d879bce8a') == -1
            )
          })
        }

        if (inReview) {
          channels = _.filter(channels, channel => {
            const channelCatalogIds = []
            _.each(channel.channelCatalogIds, id => channelCatalogIds.push(id.toString()))
            return (
              channelCatalogIds.indexOf('5a8f8ecd4d6ca32966ad4fdf') == -1
              && channelCatalogIds.indexOf('5b8a67b66afba86eafc73f10') == -1
              && channelCatalogIds.indexOf('5b8a67c6a1e221397c8bb28d') == -1
              && channelCatalogIds.indexOf('5b8a67d26afba86eafc73f12') == -1
              && channelCatalogIds.indexOf('5954d3f5b5d2b22f697bff69') == -1
            )
          })
        }

        _.forEach(channels, (channel, i) => {
          const programTitle = _.get(programMap, `${channel.id}.name`)
          channels[i].program = programTitle ? utils.toLowerCase(programTitle) : channels[i].name
        })

        // sort buy alphabet and Sctv
        if (!originFilter.hasOwnProperty('where')) {
          channels.sort((a, b) => {
            if (a.name.startsWith('SCTV') && !b.name.startsWith('SCTV')) return -1
            else if (!a.name.startsWith('SCTV') && b.name.startsWith('SCTV')) return 1
            else if (a.name.startsWith('SCTV') && b.name.startsWith('SCTV')) {
              return a.name.slice(-2) > b.name.slice(-2) ? 1 : -1
            }
            else if (a.name < b.name) return -1
            else if (a.name > b.name) return 1
            return 0
          })
        }

        channels = _(channels)
          .sortBy(['index'])
          .value()

        return utils.invokeCallback(cb, null, channels) // _.orderBy(channels, ['viewerCount'], ['desc'])
      })
      .catch(e => {
        console.error('find channel err', e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Channel.findWithProgram = (filter, cb) => {
    let channels
    filter = filter || {}
    _.set(filter, 'where.activated', true)
    filter.cacheTime = config.CACHE_TIME
    filter.fields = 'default'

    const promise = Channel.find(filter)
      .then(result => {
        channels = result || []
        let channelIds = _.map(channels, channel => channel.id)

        if (!channelIds.length)
          return Promise.resolve([])

        return Channel.app.models.ChannelProgram.getLivePrograms(channelIds)
      })
      .then(programs => {
        const programMap = {}
        _.forEach(_.sortBy(programs, ['livedAt']), program => {
          programMap[program.channelId] = program
        })

        channels = _.forEach(channels, (channel, i) => {
          channels[i].program = _.get(programMap, `${channel.id}.name`, channels[i].name)
        })

        return utils.invokeCallback(cb, null, channels) // _.orderBy(channels, ['viewerCount'], ['desc'])
      })
      .catch(e => {
        console.error('find channel err', e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Channel.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string', default: ''},
      {arg: 'resolution', type: 'number', default: 1000},
      {arg: 'index', type: 'number', default: 0},
      {arg: 'codec', type: 'string', default: ''},
      {arg: 'versionCode', type: 'number', default: 1}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get channel source'
  })

  Channel.getSource = (req, id, resolution, index, codec, versionCode, cb) => {
    if (req.platform === consts.PLATFORM.WEB && (id == '5cc187e9c61180021f2c628c' || id == '5cc188fa4d9ad602636b17ca' || id == '5cc1884fcc9c8e6069670dd7' || id == '5cc186738d070c606876b421')) {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: 'Kênh đang bảo trì. Bạn vui lòng quay lại sau!'
      })
    }

    req.versionCode = versionCode
    req.isPreset = Number(req.isPreset) || 0
    const now = moment().unix()
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    let maxDevice

    if (config.OUT_VN_BLOCK && geo.country != 'VN') {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.outVnBlock
      })
    }

    if (!id && !index) {
      return cb({
        statusCode: consts.CODE.DATA_MISSING,
        message: lang.channelNotFound
      })
    }

    if (req.username === 'GUEST' && id != '5a713b2ec57d340af8b84f2f') {
      return Promise.reject({
        statusCode: consts.CODE.LOGIN_REQUIRE,
        message: lang.loginRequire
      })
    }

    let name, channel, log, packagePrice, inReview, accessToken
    inReview = false //(utils.inReview(req) || geo.country != 'VN')

    codec = codec || ''
    const checkCodec = {}
    const codecArray = codec.split(',')
    codecArray.forEach(codec => checkCodec[codec] = true)

    const filter = {
      fields: ['id', 'index', 'source', 'source_secue', 'name', 'drmURL', 'drmSecret', 'packageCode', 'channelCatalogIds', 'isSecure', 'h265', 'p2p', 'activated', 'activatedStore'],
      cacheTime: config.CACHE_TIME
    }

    const operator = index
      ? Channel.findOne(_.assign({where: { index }}, filter))
      : Channel.findById(id, filter)

    operator
      .then(channelData => {
        if (!channelData || !channelData.activated || (utils.isFromStore(req) &&config.DISABLE_UNLICENSED_CONTENT && !channelData.activatedStore)) {
          console.error('CHANNEL_NOT_EXIST:', id || index)
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.channelNotFound
          })
        }

        packagePrice = _.get(consts, `PACKAGE.${channelData.packageCode}.price`)
        if (req.username === 'GUEST' && packagePrice) {
          return Promise.reject({
            statusCode: consts.CODE.LOGIN_REQUIRE,
            message: lang.loginRequire
          })
        }

        // const isNotFreeGuest = (req.username === 'GUEST' && (!req.freeUntil || req.freeUntil <= now))
        // if (packagePrice && isNotFreeGuest && !inReview) {
        //   return Promise.reject({
        //     statusCode: consts.CODE.LOGIN_REQUIRE,
        //     message: lang.loginRequire
        //   })
        // }

        channel = channelData

        return (req.username !== 'GUEST')
          ? TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session)
          : null
      })
      .then(token => {
        accessToken = token
        const userPackage = token && token.packages ? _.find(token.packages, ['code', channel.packageCode]) : null
        console.log(accessToken, userPackage)
        const userNotBuyPackage = (packagePrice && req.username !== 'GUEST' && (!token || !userPackage))

        if (packagePrice && !inReview && userNotBuyPackage) {
          return Promise.reject(confirmBuy(channel, req))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        return Channel.app.models.Ads.getAds(consts.ADS_TYPE.CHANNEL, _.clone(channel))
      })
      .then(ads => {
        if (channel.source.indexOf('youtube') > -1) {
          return Promise.reject({
            id,
            ads,
            youtubeId: channel.source.split('=')[1]
          })
        }

        const result = routingSource(req, resolution, checkCodec, channel)
        log = `CHANNEL_URL ip:${result.ip} telco:${result.telco} `
        const jwtToken = (req.username !== 'GUEST' && !inReview)
          ? jwt.sign({
            username: req.username,
            deviceId: req.deviceId,
            maxDevice: maxDevice,
            group: channel.packageCode,
            contentId: id,
            iat: moment().unix() + config.VIETTEL_SECURE_CHANNEL.ttl
          }, secret.MULTI_SCREEN_SECRET)
          :undefined

        return Promise.props({
          id: channel.id,
          name: channel.name,
          index: channel.index,
          source: result.source,
          sourceLow: result.sourceLow,
          ttl: config.VIETTEL_SECURE_CHANNEL.ttl,
          p2p: channel.p2p && !checkCodec.WEAK ? 1 : 0,
          jwtToken: undefined, //todo jwtToken
          ads
          // ads: {adsType: "facebook", "data":[{"type":"start", "id": "1865190850222891_2048250761916898"}, {"type":"end", "id": "1865190850222891_2048250761916898"}, {"type":"time", "data":"15:00,16:30", "id": "1865190850222891_2048250761916898"}]},
        })
      })
      .then(result => {

        if (req.platform != consts.PLATFORM.WEB) result.ads = undefined

        if (req.freeUntil && !req.isPreset && (req.platform != consts.PLATFORM.TIZEN && req.platform != consts.PLATFORM.LG)) { // todo remove where up LG, tizen
          const freeUntil = moment(Number(req.freeUntil) * 1000)
          result.guestControl = {
            sourceLow: result.sourceLow,
            loginMessage: freeUntil.isAfter(moment()) ? lang.loginMessage(freeUntil.format('DD/MM/YYYY')) : lang.loginMessageWhenExpire,
            skipTime: 60
          }
        }

        result.ads = (inReview || (accessToken && accessToken.packages && accessToken.packages.length >= 2)) ? 0 : 1
        // console.log('result.ads', inReview, packagePrice, accessToken, result.ads)

        // console.log('result123', result)

        if (packagePrice) {
          result.drmInfo = {
            operator: 11,
            userId: req.username + '1',
            session: jwt.sign({
              operatorId: DRMToday.OPERATOR_ID,
              userId: DRMToday.OPERATOR_ID + '-' + req.username + '1',
              sessionId: Date.now().toString(),
              timestamp: Date.now() - (86400*100)
            }, DRMToday.JWT_SECRET)
          }
        }

        cb(null, result)

        log += result.source
        console.log(log)

        publishView(req, id, channel.name, channel.channelCatalogIds)
      })
      .catch(e => {
        console.error(e.stack || e)
        if (e && e.youtubeId) return cb(null, e)
        if (!e.statusCode)
          console.error('get channel source err', e.stack || e)
        cb(e) // statusCode: consts.CODE.SERVER_ERROR
      })
  }

  function routingSource(req, resolution, checkCodec, channel) {

    const now = moment().unix()
    if (!channel.isSecure) return { source: channel.source }

    // // todo check khi làm xong DRM trên tizen và samsung
    // let isSecureEnabled = true
    let isSecureEnabled = req.platform == consts.PLATFORM.ANDROID
      || req.platform == consts.PLATFORM.WEB
      || req.deviceType == consts.DEVICE_TYPE.MOBILE
      || req.versionCode >= 20190116

    const secureOpts = isSecureEnabled
      ? _.assign({}, config.VIETTEL_SECURE_CHANNEL)
      : _.assign({}, config.VIETTEL_SECURE_INCLUDE_IP)
    secureOpts.includeClientIp = false
    secureOpts.clientIp = secureOpts.includeClientIp ? utils.getIp(req) : undefined

    let source = isSecureEnabled ? channel.source_secue : channel.source

    const ip = utils.getIp(req)
    const telco = Channel.app.models.TelcoMap.getTelco(ip)
    if (telco == 'viettel') {
      source = source
        .replace('liveottvnpt.gviet.vn', 'liveottvt.gviet.vn')
    }

    source = source.replace('https://kdpvnpt.gviet.vn/', 'https://kdpvt.gviet.vn/')

    let sourceLow
    if (req.freeUntil && !req.isPreset) {
      const low = req.deviceType === consts.DEVICE_TYPE.MOBILE ? '360p.stream' : '480p.stream'

      sourceLow = source
        .replace('hd.smil', `hd-${low}`)
        .replace('sd.smil', `sd-${low}`)
      // sourceLow = cdnSecure(sourceLow, secureOpts)
    }

    const isH265 = checkCodec.H256
      && channel.h265
      && req.platform != consts.PLATFORM.IOS
      && (req.deviceType != consts.DEVICE_TYPE.MOBILE || resolution >= 1000)

    if (req.platform == consts.PLATFORM.LG || req.platform == consts.PLATFORM.TIZEN) {
      resolution = 600
    } else if (req.freeUntil && !req.isPreset && req.createdAt + config.MAX_RESOLUTION_TIME <= now) {
      resolution = 600
    }

    // resolution switch
    if (resolution >= 1000) {
      // if (isH265) {
      //   source = source.replace('hd.smil', `mb.smil`)
      // } else {
      //   source = source.replace('hd.smil', `mb.smil`)
      // }
    } else if (resolution >= 600) {
      if (isH265) {
        source = source.replace('hd.smil', `mb.smil`)
      } else {
        source = source.replace('hd.smil', `mb.smil`)
      }
    } else {
      if (isH265) {
        source = source.replace('hd.smil', `mb.smil`)
      } else {
        source = source.replace('hd.smil', `mb.smil`)
      }
    }

    // if (checkCodec.WEAK && channel.source.indexOf('vtvcab') === -1) {
    //   source = source
    //     .replace('https://liveottvnpt.gviet.vn/live-origin/', 'http://live6s.gviet.vn/origin6s/') //http://live6s.gviet.vn
    //     .replace('https://liveottvt.gviet.vn/live-origin/', 'http://live6s.gviet.vn/origin6s/')
    //     .replace('hd.smil', `mb.smil`)
    //     .replace('sd.smil', `mb.smil`)
    //     .replace('mb.smil', 'mb-6s.smil')
    //
    //   channel.p2p = false
    // }

    if (req.platform != consts.PLATFORM.WEB) { // (channel.name.startsWith('VTV') || ['SCTV 17', 'SCTV 15', 'BTV 5'].indexOf(channel.name) !== -1) &&
      source = source
        .replace('https://liveottvnpt.gviet.vn/live-origin/', 'http://live4s.gviet.vn/live-origin/')
        .replace('https://liveottvt.gviet.vn/live-origin/', 'http://live4s.gviet.vn/live-origin/')
        .replace('https://liveonplayvtvcabvnpt.gviet.vn/vtvcab/', 'http://live4s-vtvcab.gviet.vn/vtvcab/')

      channel.p2p = false
    }

    if (req.platform == consts.PLATFORM.TIZEN || req.dtId == 4) {
      source = source.replace('hd.smil', 'hd-720p.stream').replace('mb.smil', 'hd-720p.stream')
    }

    if (!isSecureEnabled) {
      source = cdnSecure(source, secureOpts)
    }

    // todo remove
    if (req.dtId == 6 || req.dtId == 4 || req.dtId == 39)
      channel.p2p = false

    // if (channel.name == 'SCTV 8') {
    //   channel.p2p = true
    // }

    channel.p2p = false // todo check p2p

    source = source.replace('livestvsbd.gviet.vn', 'livestv-cacheplus.gviet.vn')

    return { source, sourceLow, ip, telco }
  }

  function confirmBuy(channel, req) {
    const confirm = {
      statusCode: consts.CODE.ACCESS_DENIED,
      message: lang.contentDenied(consts.BUY_GROUP[channel.packageCode].name, `kênh ${channel.name}`),
      details: [
        {
          label: lang.back,
          action: consts.ACTION.BACK
        },
        {
          label: lang.buyPackage,
          action: consts.ACTION.GO_BUY_PACKAGE,
          isFocus: 1,
          choices: [
            {key: 'PACKAGE', groupId: consts.BUY_GROUP[channel.packageCode].groupId, name: consts.BUY_GROUP[channel.packageCode].name},
            {key: 'TIME', time: 'P1M', name: '1 tháng'}
          ]
        }
      ]
    }

    return confirm
  }

  function publishView(req, id, name, channelCatalogIds) {
    Channel.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.CHANNEL,
      data: {
        id,
        name,
        channelCatalogIds,
        time: moment().unix(),
        username: req.username === 'GUEST' ? req.guestId : req.username,
        deviceId: req.deviceId,
        deviceType: req.deviceType,
        dtId: req.dtId,
        spId: req.spId,
        ip: utils.getIp(req)
      }
    })
  }
}
