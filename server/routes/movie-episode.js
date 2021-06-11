'use strict'

const _ = require('lodash')
const moment = require('moment')
const outputCache = require('../utils/output-cache')
const PersonalMemory = require('../logic/personal-memory')
const TokenHandler = require('../logic/token-handler')
const utils = require('../utils/utils')
const numeral = require('numeral')
const jwt = require('jsonwebtoken')
const geoip = require('geoip-lite')
numeral.locale('vi')

const cdnSecure = require('../utils/viettel-secure-token')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi')

module.exports = function(MovieEpisode) {

  MovieEpisode.beforeRemote('*', (ctx, config, next) => {
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

  MovieEpisode.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'movieId', type: 'string', required: true},
      {arg: 'episode', type: 'number', required: true},
      {arg: 'resolution', type: 'number'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get movie source'
  })

  MovieEpisode.getSource = (req, movieId, episode, resolution, cb) => {
    const now = moment().unix()
    let movie
    let episodeInfo
    let name
    let packagePrice
    let maxDevice
    let accessToken
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const inReview = (utils.inReview(req) || geo.country != 'VN')

    Promise.all([
      MovieEpisode.findOne({
        where: { movieId, episode },
        fields: ['source'],
        cacheTime: config.CACHE_TIME
      }),
      MovieEpisode.app.models.Movie.findById(movieId, {
        fields: ['source', 'name', 'packageCode', 'price', 'movieCatalogIds'],
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((episodeData, movieData) => {
        if (!episodeData || !movieData) {
          return Promise.reject('Item not found')
        }

        episodeInfo = episodeData
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
          (movie.price || packagePrice) && req.username !== 'GUEST' ? PersonalMemory.checkBuyMovie(req.username, movieId) : true,
          req.username !== 'GUEST' ? TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session) : null
        ]
      })
      .spread((bought, token) => {
        accessToken = token
        const userPackage = token && token.packages ? _.find(token.packages, ['code', movie.packageCode]) : null
        if (movie.price && !bought && !inReview) {
          return Promise.reject(confirmBuyMovie(movie))
        } else if (packagePrice && !userPackage && !bought && !inReview) {
          return Promise.reject(confirmBuyPackage(movie))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        return MovieEpisode.app.models.Ads.getAds(consts.ADS_TYPE.MOVIE, movie)
      })
      .then(ads => {
        if (episodeInfo.source.indexOf('youtube') > -1) {
          return Promise.reject({
            movieId,
            id: movieId,
            youtubeId: episodeInfo.source.split('=')[1],
            ads
          })
        }

        name = movie.name
        movie.name = undefined

        const secureOpts = _.assign({}, config.VIETTEL_SECURE_MOVIE)
        secureOpts.clientIp = secureOpts.includeClientIp ? utils.getIp(req) : undefined

        let source
        const telco = MovieEpisode.app.models.TelcoMap.getTelco(ip)
        if (telco == 'viettel') {
          source = episodeInfo.source
            .replace('http://vod.sphim.tv', 'https://vodottvt.gviet.vn')
            .replace('https://vodstvvnpt.gviet.vn', 'https://vodstvvt.gviet.vn')
        } else {
          source = episodeInfo.source.replace('http://vod.sphim.tv', 'https://vodottvnpt.gviet.vn')
        }

        source = source.replace('http://vod.tv247.vn', 'https://vodtv247vt.gviet.vn')

        // todo check for LG and Tizen
        if (req.platform != consts.PLATFORM.LG && req.platform != consts.PLATFORM.TIZEN) { //  && (movieId != '59fb417129923a2779608ff2' || episode != 41)
          source = source.replace('/film/', '/stv/')
        }

        const jwtToken = (req.username !== 'GUEST' && (packagePrice || movie.price) && !inReview)
          ? jwt.sign({
              username: req.username,
              deviceId: req.deviceId,
              maxDevice: maxDevice,
              group: movie.packageCode,
              contentId: movieId,
              iat: moment().unix() + secureOpts.ttl
            }, secret.MULTI_SCREEN_SECRET)
          : undefined

        return Promise.props({
          source: source.trim(), //cdnSecure(source, secureOpts),
          ads,
          // ads: {adsType: "facebook", data:[{"type":"start", "id": "1865190850222891_2048250761916898"}, {"type":"end", "id": "1865190850222891_2048250761916898"}, {"type":"time", "data":"15:00,16:30", "id": "1865190850222891_2048250761916898"}]},
          ttl: secureOpts.ttl,
          jwtToken: undefined, // jwtToken
        })
      })
      .then(result => {
        result.id = movieId
        result.movieId = movieId

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

        publishView(req, movieId, name, episode, movie.movieCatalogIds)
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

  function confirmBuyPackage(movie) {
    return {
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
  }

  function publishView(req, id, name, episode, movieCatalogIds) {
    MovieEpisode.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.MOVIE,
      data: {
        id,
        episode,
        name,
        movieCatalogIds,
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
