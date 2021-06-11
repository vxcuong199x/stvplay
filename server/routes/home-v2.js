'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const numeral = require('numeral')
const consts = require('../config/consts')
const config = require('../config/config')
const partnerConfig = require('../config/partner')
const lang = require('../config/lang.vi.js')
const utils = require('../utils/utils')
const CacheHandler = require('../logic/cache-handler')
const CustomerMemory = require('../logic/customer-memory')
const PersonalMemory = require('../logic/personal-memory')
const geoip = require('geoip-lite')
numeral.locale('vi')

const DEFAULT_LIMIT = 20
const HOME_BACKGROUND = 1551084442711 //1545734054258
const DEFAULT_BACKGROUND = 1551084552038 // 1546489645711 //1551084552038
const MENU = [
  {image: 1545734195862, background: 1557131777001, id: '1', name: 'Truyền Hình', type: consts.MENU_TYPE.ALL_CHANNEL},
  // {image: 1545734182358, background: 1557131777001, id: '2', name: 'Karaoke Prosing', type: consts.MENU_TYPE.KARAOKE},
  {image: 1545734137626, background: 1557131777001, id: '3', name: 'Phim', catalogId: '5bf4cd1c168a371d3897272d', type: consts.MENU_TYPE.MOVIE}, // Phim SCTV
  {image: 1545734155889, background: 1557131777001, id: '4', name: 'Giải Trí', catalogId: '5c37047e056d2477d7321b8b', type: consts.MENU_TYPE.CLIP}, // Giải trí 5c402af207876655dba1f8be
  // {image: 1545734228153, background: 1557131777001, id: '5', name: 'Sóng Vàng', catalogId: '5bf4d2daf461ff1d62db3753', type: consts.MENU_TYPE.MOVIE}, // Sóng Vàng
  {image: 1547208648467, background: 1557131777001, id: '6', name: 'Thiếu Nhi', catalogId: '5cc2f32beddcd07f451791ec', type: consts.MENU_TYPE.CLIP}, // Trẻ em 5c38654b77f2bb5b7b2e5c22
  {image: 1547208581089, background: 1557131777001, id: '7', name: 'Clip HOT', catalogId: '5bf4cf3f8d1113314ca3a82a', type: consts.MENU_TYPE.CLIP}, // Clip HOT
  {image: 1546593105501, background: 1557131777001, id: '8', name: 'Thể Thao', catalogId: '5a4ed319a99d28575cc4ffee', type: consts.MENU_TYPE.CLIP}, // thể thao
  {image: 1547208624811, background: 1557131777001, id: '9', name: 'Gói Cước', type: consts.MENU_TYPE.PACKAGE}, // Gói cước
  {image: 1545734105658, background: 1557131777001, id: '10', name: 'Cài Đặt', type: consts.MENU_TYPE.SETTING} // setting
]

const SHOW_POPUP_TIME = 3 * 86400

const DEFAULT_FIELDS = ['id', 'name', 'info', 'thumbnail', 'packageCode', 'price', 'duration', 'activatedStore']

const mapMenu = item => ({
  image: utils.getImageUrl(config.BASE_IMAGE_URL, item.image),
  name: item.name,
  contentType: 10,
  contentId: item.type,
  catalogId: item.catalogId || ''
})

const mapVod = type => item => ({
  image: utils.getImageUrl(config.BASE_IMAGE_URL, _.get(item, 'thumbnail.landscape')),
  name: item.name,
  contentType: type,
  contentId: item.id,
  catalogId: item.movieCatalogIds || item.clipCatalogIds
})

module.exports = function(Home) {

  Home.remoteMethod('getLauncher', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get catalog'
  })

  Home.getLauncher = (req, cb) => {
    let data = MENU.slice(0, -2).map(mapMenu)
    const movieFields = _.clone(DEFAULT_FIELDS)
    const clipFields = _.clone(DEFAULT_FIELDS)
    movieFields.push('movieCatalogIds')
    clipFields.push('clipCatalogIds')

    Promise.all([
      // Home.app.models.Channel.find({
      //   where: {
      //     activated: true,
      //     homeOrder: {
      //       gt: 0
      //     }
      //   },
      //   fields: ['id', 'name'],
      //   limit: DEFAULT_LIMIT,
      //   order: 'homeOrder ASC',
      //   cacheTime: config.CACHE_TIME
      // }),
      Home.app.models.Movie.find({
        where: {
          activated: true,
          // activatedStore: config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req) ? true : undefined,
          // homeOrder: {
          //   gt: 0
          // },
          // movieCatalogIds: '5bf4cd1c168a371d3897272d'
        },
        fields: movieFields,
        limit: 1000,// DEFAULT_LIMIT,
        order: 'homeOrder ASC, createdAt DESC',
        cacheTime: config.CACHE_TIME
      }),
      Home.app.models.Clip.find({
        where: {
          activated: true,
          // activatedStore: config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req) ? true : undefined,
          // homeOrder: {
          //   gt: 0
          // },
          // clipCatalogIds: '5bf4cf3f8d1113314ca3a82a'
        },
        fields: clipFields,
        limit: 1000, //DEFAULT_LIMIT,
        order: 'homeOrder ASC, createdAt DESC',
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((movies, clips) => {
        data = data.concat(movies.map(mapVod(consts.MEDIA_TYPE.MOVIE)))
        data = data.concat(clips.map(mapVod(consts.MEDIA_TYPE.CLIP) ))

        cb(null, { data })
      })
      .catch(e => {
        console.error('getLauncherError')
        cb(null, { data: [] })
      })
  }

  Home.remoteMethod('getHomeV2', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'versionCode', type: 'number'},
      {arg: 'versionJs', type: 'number'},
      {arg: 'getMenu', type: 'number'},
      {arg: 'filter', type: 'object', default: {}}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get home'
  })

  Home.getHomeV2 = (req, versionCode, versionJs, getMenu, filter, cb) => {
    if (!req || !req.username) {
      return cb({ statusCode: consts.CODE.KICK })
    }

    const deviceDtId = req.query.dtId || (filter.dtId || req.dtId)
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}

    const inReview = (utils.inReview(req, filter) || geo.country != 'VN')

    const operators = {
      slide: Home.app.models.Slide.find({
        where: {
          activated: true
        },
        fields: ['foreignId', 'background', 'type', 'rank', 'activatedStore'],
        cacheTime: config.CACHE_TIME
      })
    }

    versionCode = versionCode || (filter.versionCode || 0)
    if (versionCode) {
      operators.config = Home.app.models.Config.getConfigByRequest(req, ['version'], filter)
    }

    Promise.props(operators)
      .then(data => {

        const result = {
          background: HOME_BACKGROUND,
          defaultBackground: DEFAULT_BACKGROUND,
          config: Home.config,
          username: req.username !== 'GUEST' ? req.username : req.guestId,
          displayUsername: req.username !== 'GUEST' ? req.username.replace('84', '0') : req.guestId,
          uid: req.username !== 'GUEST' ? Number(req.username.substring(2)).toString(16).toUpperCase() : req.guestId,
          inReview: inReview ? 1 : 0
        }

        result.slide = _(data.slide)
          .filter(item => {
            return !(config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) || !!item.activatedStore
          })
          .map(item => ({
            id: item.foreignId,
            image: item.background,
            type: item.type
          }))
          .sortBy(['rank'])
          .value()

        // result.slide.push(Object.assign(result.slide[0], { type: consts.SLIDE_TYPE.MENU, data: {type: consts.MENU_TYPE.KARAOKE}}))

        if (partnerConfig.POPUP_DISTRIBUTOR[deviceDtId]) {
          if (req.username === 'GUEST') {
            result.slide.unshift({
              id: '0',
              image: partnerConfig.POPUP_DISTRIBUTOR[deviceDtId].GUEST_SLIDE,
              type: consts.SLIDE_TYPE.MENU,
              data: { type: consts.MENU_TYPE.PACKAGE }
            })
          } else {
            // if (Number(req.createdAt) >= moment().unix() - SHOW_POPUP_TIME) {
              result.slide.unshift({
                id: '0',
                image: partnerConfig.POPUP_DISTRIBUTOR[deviceDtId].LOGIN_SLIDE,
                type: consts.SLIDE_TYPE.MENU,
                data: { type: consts.MENU_TYPE.ALL_CHANNEL }
              })
            // }
          }
        }

        result.menu = MENU

        // todo remove when license or review
        if (inReview) {
          const hide = { '8': true, '9': true }
          result.menu = _.filter(MENU, item => !hide[item.id])
        }

        const isWebPlatform = req.platform == consts.PLATFORM.WEB
          || req.platform == consts.PLATFORM.LG
          || req.platform == consts.PLATFORM.TIZEN
        result.config.pingUrl = isWebPlatform ? config.PING_URL_WEB : config.PING_URL_APP

        const version = (data.config && data.config.version) || {}

        if (
          versionCode
          && version.version
          && versionCode < version.version
        ) {
          result.newVersion = {
            version: version.version,
            message: lang.updateMessage(moment(version.version, 'YYYYMMDD').format('DD/MM/YYYY')),
            updateUrl: version.updateUrl,
            forceUpdate: version.forceUpdate ? 1 : 0,
            type: version.type || 1,
            fileSize: version.fileSize || 0
          }
        }

        const adsId = req.platform === consts.PLATFORM.IOS
          ? '258793'
          : (
            req.deviceType === consts.DEVICE_TYPE.MOBILE
              ? '258770'
              : '262681'
          )

        // result.config.ads =  {
        //   adsId: adsId,
        //   maxDay: 20,
        //   maxSession: 5,
        //   delayTime: 600,
        //   delayContent: 0,
        //   midrollTime: [600]
        // }

        cb(null, result)

        publishGetHome(req)
      })
      .catch(e => {
        console.error('getHome err', e.stack || e)
        cb(e)
      })
  }

  Home.remoteMethod('getMenuHome', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', default: 1},
      {arg: 'catalogId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get menu home'
  })

  Home.getMenuHome = (req, type, catalogId, cb) => {
    const deviceDtId = req.dtId
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}

    const inReview = (utils.inReview({ dtId: deviceDtId, platform: req.platform }) || geo.country != 'VN')

    let catalogModel, model, catalogIdField, personalFunction, getBuyFunction
    let watchingMap

    switch (type) {
      case consts.MENU_TYPE.MOVIE:
        catalogModel = 'MovieCatalog'
        model = 'Movie'
        catalogIdField = 'movieCatalogIds'
        personalFunction = PersonalMemory.getUserMovies
        getBuyFunction = PersonalMemory.getBuyMovies
        break

      case consts.MENU_TYPE.CLIP:
        catalogModel = 'ClipCatalog'
        model = 'Clip'
        catalogIdField = 'clipCatalogIds'
        personalFunction = PersonalMemory.getUserClips
        getBuyFunction = PersonalMemory.getBuyClips
        break
    }

    if (!catalogModel)
      return cb(null, {data: []})

    const personalUsername = req.username === 'GUEST' ? req.guestId : req.username
    personalFunction(personalUsername, catalogId, 5)
      .then(watchingList => {
        const watchingIds = Object.keys(watchingList)
        watchingMap = watchingList

        return Promise.all([
          Home.app.models[catalogModel].find({
            where: {
              activated: true,
              parentId: catalogId
            },
            fields: ['id', 'name', 'rank'],
            cacheTime: config.CACHE_TIME
          }),
          Home.app.models[model].find({
            where: {
              activated: true,
              activatedStore: config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req) ? true : undefined,
              homeOrder: {
                gt: 0
              },
              [catalogIdField]: catalogId
            },
            fields: DEFAULT_FIELDS,
            limit: DEFAULT_LIMIT,
            order: 'homeOrder ASC',
            cacheTime: config.CACHE_TIME
          }),
          Home.getMenuItem(req, type, catalogId, 0, false),
          CacheHandler.getListCache(model, { id: watchingIds }, {
            where: {
              activated: true
            },
            fields: DEFAULT_FIELDS
          }),
          req.username !== 'GUEST' ? getBuyFunction(req.username) : []
        ])
      })
      .spread((menu, slide, list, watchingItems, buyList) => {
        const markBuy = {}
        buyList.forEach(item => markBuy[item] = true)

        watchingItems = _.map(
          watchingItems,
          item => _.assign(
            item,
            {
              type,
              percent: Math.min(99, Math.floor((((watchingMap[item.id] || 0)/60) / (item.duration || (type == consts.MENU_TYPE.MOVIE ? 43 : 10))) * 100)),
              current: (watchingMap[item.id] || 0),
              image: item.thumbnail.landscape,
              info: item.price && !inReview
                ? (markBuy[item.id] ? lang.bought : (numeral(Number(item.price)).format('0,0')+' đ'))
                : (item.packageCode === 'FREE' ? (item.info || lang.free) : lang.package(consts.BUY_GROUP[item.packageCode].name))
            }
          )
        )

        list.data = _(list.data)
          .filter(item => {
            return watchingMap[item.id] === undefined
          })
          .map(item => {
            if (markBuy[item.id]) {
              item.info = lang.bought
            }

            return item
          })
          .value()

        const menuList = _(menu)
          .sortBy(['rank'])
          .map(item => ({ id: item.id, name: item.name, type: type }))
          .value()

        menuList.unshift({ id: catalogId, name: 'Đề Xuất', type: type })

        cb(null, {
          menu: menuList,
          slide: _(slide)
            .map(item => ({
              type,
              id: item.id,
              name: item.name,
              image: (item.thumbnail.landscapeLarge || item.thumbnail.landscape) }))
            .value(),
          data: watchingItems.concat(list.data || []),
          dataTitle: 'Đề Xuất',
          page: 0
        })
      })
      .catch(e => {
        console.error('getMenuHome err', e.stack || e)
        cb(null, {menu: [], data: []})
      })
  }

  Home.remoteMethod('getMenuItem', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', default: 1},
      {arg: 'catalogId', type: 'string', required: true},
      {arg: 'page', type: 'number', default: 0},
      {arg: 'checkBuy', type: 'number', default: 0}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get menu item'
  })

  Home.getMenuItem = (req, type, catalogId, page, checkBuy, cb) => {
    const deviceDtId = req.dtId
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}

    const inReview = (utils.inReview({ dtId: deviceDtId, platform: req.platform }) || geo.country != 'VN')

    let model, catalogIdField, getBuyFunction

    switch (type) {
      case consts.MENU_TYPE.MOVIE:
        model = 'Movie'
        catalogIdField = 'movieCatalogIds'
        getBuyFunction = PersonalMemory.getBuyMovies
        break

      case consts.MENU_TYPE.CLIP:
        model = 'Clip'
        catalogIdField = 'clipCatalogIds'
        getBuyFunction = PersonalMemory.getBuyClips
        break
    }

    if (!model)
      return utils.invokeCallback(cb, null, {data: []})

    const promise = Promise.all([
      Home.app.models[model].find({
        where : {
          activated : true,
          activatedStore: config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req) ? true : undefined,
          [catalogIdField]: catalogId
        },
        order: 'updatedAt DESC',
        fields: DEFAULT_FIELDS,
        limit: DEFAULT_LIMIT,
        skip: page * DEFAULT_LIMIT,
        cacheTime: config.CACHE_TIME
      }),
      req.username !== 'GUEST' ? getBuyFunction(req.username) : []
    ])
      .spread((data, buyList) => {
        const markBuy = {}
        buyList.forEach(item => markBuy[item] = true)

        return utils.invokeCallback(cb, null, {
          data: _(data)
            .map(item => ({
              type: Number(type),
              id: item.id,
              image: item.thumbnail.landscape,
              name: item.name,
              info: item.price && !inReview
                ? markBuy[item.id] ? lang.bought : (numeral(Number(item.price)).format('0,0')+' đ')
                : (item.packageCode === 'FREE' ? (item.info || lang.free) : lang.package(_.get(consts.BUY_GROUP, `[${item.packageCode}].name`, '')))
            }))
            .value(),
          page: page
        })
      })
      .catch(e => {
        console.error('getMenuItem err', e.stack || e)
        return utils.invokeCallback(cb, null, {data: []})
      })

    if (!cb) return promise
  }

  function publishGetHome(req) {
    return Home.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.HOME,
      data: {
        time: moment().unix(),
        username: req.username,
        deviceId: req.deviceId,
        deviceType: req.deviceType,
        dtId: req.dtId,
        spId: req.spId,
        ip: utils.getIp(req)
      }
    })
  }

  const mapIndexToType = {
    'movie': consts.MENU_TYPE.MOVIE,
    'clip': consts.MENU_TYPE.CLIP,
    'channel': consts.MENU_TYPE.CHANNEL
  }

  Home.remoteMethod('suggestV2', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'query', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Search suggestion'
  })

  Home.suggestV2 = (req, query, cb) => {
    if (query.length < 2)
      cb(null, { data: [] })

    query = utils.locDauTV(query).toLowerCase()

    const elastic = Home.app.get('elastic')
    const fields = ['name', 'nameKoDau', 'nameCompress', 'actors']

    elastic.search({
      index: 'movie,channel,clip',
      body: {
        _source: ['name'],
        query: {
          multi_match: {
            query: query,
            fields: fields
          }
        },
        size: 6
      }
    })
      .then(rs => {
        const result = rs.hits
          ? _(rs.hits.hits).map(item => ({
            name: _.get(item, '_source.name'),
            id: _.get(item, '_id'),
            type: mapIndexToType[_.get(item, '_index')]
          })).value()
          : []

        console.log('DEBUG_COMMAND', result)

        const hits = _(rs.hits.hits)
        const movieIds = hits
          .filter(item => item._index == 'movie')
          .map(item => item._id.toString())
          .value()

        const channelIds = hits
          .filter(item => item._index == 'channel')
          .map(item => item._id.toString())
          .value()

        const clipIds = hits
          .filter(item => item._index == 'clip')
          .map(item => item._id.toString())
          .value()

        const listMovies = movieIds && movieIds.length && (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req))
          ? CacheHandler.getListCache('Movie', { id: movieIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        const listChannels = channelIds && channelIds.length && (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req))
          ? CacheHandler.getListCache('Channel', { id: channelIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        const listClips = clipIds && clipIds.length && (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req))
          ? CacheHandler.getListCache('Clip', { id: clipIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        return Promise.all([
          result,
          listMovies,
          listChannels,
          listClips
        ])
      })
      .spread((result, movies, channels, clips) => {
        const map = {
          [consts.MENU_TYPE.MOVIE]: {},
          [consts.MENU_TYPE.CHANNEL]: {},
          [consts.MENU_TYPE.CLIP]: {}
        }

        movies.forEach(item => map[consts.MENU_TYPE.MOVIE][item.id] = item)
        channels.forEach(item => map[consts.MENU_TYPE.CHANNEL][item.id] = item)
        clips.forEach(item => map[consts.MENU_TYPE.CLIP][item.id] = item)

        result = result.filter(item => !(config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) || !!_.get(map, `[${item.type}][${item.id}].activatedStore`))

        cb(null, { data: result })
      })
      .catch(e => {
        console.error('search suggestion error', e.stack || e)
        cb(null, { data: [] })
      })
  }

  Home.remoteMethod('searchV2', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'query', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Search'
  })

  Home.searchV2 = (req, query, cb) => {
    if (query.length < 2)
      return cb(null, [])

    const deviceDtId = req.dtId
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}

    const inReview = (utils.inReview({ dtId: deviceDtId, platform: req.platform }) || geo.country != 'VN')

    query = query.toLowerCase()

    const elastic = Home.app.get('elastic')
    let movieIds, channelIds, clipIds
    const fields = ['name', 'nameKoDau', 'nameCompress', 'actors']

    elastic.search({
      index: 'movie,channel,clip',
      body: {
        _source: false,
        query: {
          multi_match: {
            query: query,
            type: query.split(' ').length >= 3 ? 'phrase' : 'best_fields',
            fields: fields
          }
        },
        size: 20
      }
    })
      .then(rs => {
        if (!rs || !rs.hits) {
          return Promise.reject(new Promise.CancellationError())
        }

        const hits = _(rs.hits.hits)
        movieIds = hits
          .filter(item => item._index == 'movie')
          .map(item => item._id.toString())
          .value()

        channelIds = hits
          .filter(item => item._index == 'channel')
          .map(item => item._id.toString())
          .value()

        clipIds = hits
          .filter(item => item._index == 'clip')
          .map(item => item._id.toString())
          .value()

        const listMovies = movieIds && movieIds.length
          ? CacheHandler.getListCache('Movie', { id: movieIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        const listChannels = channelIds && channelIds.length
          ? CacheHandler.getListCache('Channel', { id: channelIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        const listClips = clipIds && clipIds.length
          ? CacheHandler.getListCache('Clip', { id: clipIds.slice() }, { fields: DEFAULT_FIELDS })
          : Promise.resolve([])

        return Promise.all([
          listMovies,
          listChannels,
          listClips
        ])
      })
      .spread((movies, channels, clips) => {
        let result = []
        const filter = (item) => {
          return !(config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) || !!item.activatedStore
        }

        if (channels && channels.length) {
          result = result.concat(_(channels)
            .filter(item => filter(item))
            .sortBy(item => channelIds.indexOf(item.id.toString()))
            .map(item => itemMap(item, consts.MENU_TYPE.CHANNEL, inReview))
            .value())
        }

        if (movies && movies.length) {
          result = result.concat(_(movies)
            .filter(item => filter(item))
            .sortBy(item => movieIds.indexOf(item.id.toString()))
            .map(item => itemMap(item, consts.MENU_TYPE.MOVIE, inReview))
            .value())
        }

        if (clips && clips.length) {
          result = result.concat(_(clips)
            .filter(item => filter(item))
            .sortBy(item => clipIds.indexOf(item.id.toString()))
            .map(item => itemMap(item, consts.MENU_TYPE.CLIP, inReview))
            .value())
        }

        cb(null, { data: result, query })
      })
      .catch(Promise.CancellationError, e => {
        cb(null, { data: [], query })
      })
      .catch(e => {
        console.error('search error', e.stack || e)
        cb(null, { data: [], query })
      })
  }

  function itemMap(item, type, inReview) {
    return {
      type: type,
      id: item.id,
      image: type == consts.MENU_TYPE.CHANNEL ? (item.thumbnail.portrait || item.thumbnail.landscape) : item.thumbnail.landscape,
      name: item.name,
      info: item.price && !inReview
        ? ' ' //(numeral(Number(item.price)).format('0,0')+' đ')
        : (item.packageCode === 'FREE' ? lang.free : lang.package(consts.BUY_GROUP[item.packageCode].name))
    }
  }

  Home.remoteMethod('getHot', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get hot home'
  })

  Home.getHot = (req, cb) => {
    Home.app.models.Channel.findAll(req, {
      where: {
        activated: true,
        homeOrder: {
          gt: 0
        }
      },
      order: "homeOrder ASC",
      limit: 10,
      fields: 'default',
      cacheTime: consts.CACHE_TIME
    })
      .then(result => {
        result = _.map(result, item => {
          const imageId = item.logo || (item.thumbnail.landscape || null)
          return {
            id: item.id,
            name: item.program || item.name,
            image: utils.getImageUrl(config.BASE_IMAGE_URL, imageId),
            source: !item.isSecure ? item.source : item.source_secue
              .replace('hd.smil', `hd-360.stream`)
              .replace('sd.smil', `sd-360.stream`)
          }
        })

        cb(null, {data: result} )
      })
      .catch(e => {
        console.error('getHot home err, ', e.stack || e)
        cb(null, {data: []})
      })
  }
}
