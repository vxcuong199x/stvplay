'use strict'

const _ = require('lodash')
const moment = require('moment')
const outputCache = require('../utils/output-cache')
const utils = require('../utils/utils')
const numeral = require('numeral')
const jwt = require('jsonwebtoken')
const geoip = require('geoip-lite')
numeral.locale('vi')

const cdnSecure = require('../utils/viettel-secure-token')
const generateDrmJwtSign = require('../utils/generate-drm-jwt-sign')
const TokenHandler = require('../logic/token-handler')
const PersonalMemory = require('../logic/personal-memory')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi')

module.exports = function(ClipEpisode) {

  ClipEpisode.beforeRemote('*', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if ((!role) && ctx.args.filter) {
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

  ClipEpisode.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'clipId', type: 'string', required: true},
      {arg: 'episode', type: 'number', required: true},
      {arg: 'resolution', type: 'number'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get clip source'
  })

  ClipEpisode.getSource = (req, clipId, episode, resolution, cb) => {
    const now = moment().unix()
    let clip
    let episodeInfo
    let name
    let packagePrice
    let maxDevice
    let accessToken
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const inReview = (utils.inReview(req) || geo.country != 'VN')

    Promise.all([
      ClipEpisode.findOne({
        where: { clipId, episode },
        fields: ['source'],
        cacheTime: config.CACHE_TIME
      }),
      ClipEpisode.app.models.Clip.findById(clipId, {
        fields: ['source', 'name', 'packageCode', 'price'],
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((episodeData, clipData) => {
        if (!episodeData || !clipData) {
          return Promise.reject('Item not found')
        }

        episodeInfo = episodeData
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
          (clip.price || packagePrice) && req.username !== 'GUEST' ? PersonalMemory.checkBuyMovie(req.username, clipId) : true,
          req.username !== 'GUEST' ? TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session) : null
        ]
      })
      .spread((bought, token) => {
        accessToken = token
        const userPackage = token && token.packages ? _.find(token.packages, ['code', clip.packageCode]) : null
        if (clip.price && !bought && !inReview) {
          return Promise.reject(confirmBuyClip(clip))
        } else if (packagePrice && !userPackage && !bought && !inReview) {
          return Promise.reject(confirmBuyPackage(clip))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        return ClipEpisode.app.models.Ads.getAds(consts.ADS_TYPE.CLIP, clip)
      })
      .then(ads => {
        if (episodeInfo.source.indexOf('youtube') > -1) {
          return Promise.reject({
            clipId,
            ads,
            id: clipId,
            youtubeId: episodeInfo.source.split('=')[1]
          })
        }

        name = clip.name
        clip.name = undefined

        const secureOpts = _.assign({}, config.VIETTEL_SECURE_MOVIE)
        secureOpts.clientIp = secureOpts.includeClientIp ? utils.getIp(req) : undefined
        let source = episodeInfo.source
          .replace('http://vod.sphim.tv', 'https://vodottvt.gviet.vn')
          .replace('http://vod.tv247.vn', 'https://vodtv247vt.gviet.vn')
          .replace('/film/', '/stv/')

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
            contentId: clipId,
            iat: moment().unix() + secureOpts.ttl
          }, secret.MULTI_SCREEN_SECRET)
          :undefined

        return Promise.props({
          source: source.startsWith('https://vodstvvnpt.gviet.vn') ? source : cdnSecure(source, secureOpts),
          // ads: {adsType: "facebook", "data":[{"type":"start", "id": "1865190850222891_2048250761916898"}, {"type":"end", "id": "1865190850222891_2048250761916898"}, {"type":"time", "data":"15:00,16:30", "id": "1865190850222891_2048250761916898"}]},
          ttl: secureOpts.ttl,
          ads,
          jwtToken: undefined //jwtToken
        })
      })
      .then(result => {
        result.id = clipId
        result.clipId = clipId
        result.source = result.source.trim()

        if (req.freeUntil && !req.isPreset) {
          const freeUntil = moment(req.freeUntil * 1000)
          result.guestControl = {
            loginMessage: freeUntil.isAfter(moment()) ? lang.loginMessage(freeUntil.format('DD/MM/YYYY')) : lang.loginMessageWhenExpire,
            skipTime: 60
          }
        }

        result.ads = (inReview || (accessToken && accessToken.packages && accessToken.packages.length >= 2)) ? 0 : 1
        cb(null, result)

        publishView(req, clipId, episode, name)
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

  function confirmBuyPackage(clip) {
    return {
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
  }

  function publishView(req, id, episode, name) {
    ClipEpisode.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.CLIP,
      data: {
        id,
        episode,
        name,
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
