'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi.js')
const utils = require('../utils/utils')
const CacheHandler = require('../logic/cache-handler')
const TokenHandler = require('../logic/token-handler')
const CustomerMemory = require('../logic/customer-memory')
const PersonalMemory = require('../logic/personal-memory')
const geoip = require('geoip-lite')
const ObjectId = require('mongodb').ObjectId
const jwt = require('jsonwebtoken')
const numeral = require('numeral')
numeral.locale('vi')

const LIMIT = 10

module.exports = function(Karaoke) {

  Karaoke.remoteMethod('search', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'query', type: 'string', required: true},
      {arg: 'page', type: 'number', default: 0}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Search karaoke'
  })

  Karaoke.search = (req, query, page, cb) => {
    if (query.length < 2)
      return cb(null, { data: [], query, page })

    query = query.toLowerCase()

    const elastic = Karaoke.app.get('elastic')
    const fields = ['index', 'name', 'nameKoDau', 'nameCompress', 'singer', 'singerKoDau', 'singerCompress']

    elastic.search({
      index: 'karaoke',
      body: {
        _source: ['index', 'name', 'singer'],
        query: {
          multi_match: {
            query: query,
            type: query.split(' ').length >= 3 ? 'phrase' : 'best_fields',
            fields: fields
          }
        },
        size: LIMIT,
        from: page * LIMIT
      }
    })
      .then(rs => {
        if (!rs || !rs.hits) {
          return Promise.reject(new Promise.CancellationError())
        }

        const data = _(rs.hits.hits)
          .map(item => ({
            id: Number(item._id),
            name: _.get(item, '_source.name'),
            singer: _.get(item, '_source.singer')
          }))
          .value()

        cb(null, { data, query, page })
      })
      .catch(Promise.CancellationError, e => {
        cb(null, { data: [], query, page })
      })
      .catch(e => {
        console.error('search error', e.stack || e)
        cb(null, { data: [], query, page })
      })
  }

  Karaoke.remoteMethod('getSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'number', required: true}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get karaoke'
  })

  Karaoke.getSource = (req, id, cb) => {
    let maxDevice

    if (!id) {
      return cb({
        statusCode: consts.CODE.DATA_MISSING,
        message: lang.channelNotFound
      })
    }

    let karaoke, log

    Karaoke.findOne({
      where: { index: id },
      fields: ['id', 'index', 'source', 'name', 'activated', 'catalog'],
      cacheTime: config.CACHE_TIME
    })
      .then(data => {
        if (!data || !data.activated) {
          console.error('KARAOKE_NOT_EXIST:', id)
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.channelNotFound
          })
        }

        karaoke = data

        return [
          TokenHandler.getTokenByDevice(req.username, req.deviceId, req.session),
          PersonalMemory.getKaraokeToday(req.username)
        ]
      })
      .spread((token, count) => {
        const inReview = (config.STORE_REVIEW_DT_ID.indexOf(req.dtId) != -1)
        const userPackage = token && token.packages ? _.find(token.packages, ['code', 'KARAOKE']) : null

        if (!inReview && !userPackage && count >= config.MAX_KARAOKE_TODAY) {
          return Promise.reject(confirmBuy(karaoke, req))
        }

        maxDevice = userPackage ? userPackage.maxDevice : 1

        log = `KARAOKE_URL `
        const jwtToken = jwt.sign({
            username: req.username,
            deviceId: req.deviceId,
            maxDevice: maxDevice,
            group: 'KARAOKE',
            contentId: id,
            iat: moment().unix() + config.VIETTEL_SECURE_CHANNEL.ttl
          }, secret.MULTI_SCREEN_SECRET)

        let url = '' + ((id / 1000) | 0) + '/' + id + '/master.m3u8'

        if (req.platform == consts.PLATFORM.TIZEN || req.platform == consts.PLATFORM.LG) {
          url = url.replace('master.m3u8', 'master2.m3u8')
        }

        const result = {
          id: karaoke.index,
          name: karaoke.name,
          source: config.KARAOKE_URL + url,
          jwtToken: undefined, //todo jwtToken
        }

        cb(null, result)

        log += result.source
        console.log(log)

        PersonalMemory.markKaraokeToday(req.username, id)
        publishView(req, id, karaoke.name, karaoke.catalog)
      })
      .catch(e => {
        if (!e.statusCode)
          console.error('get karaoke source err', e.stack || e)
        cb(e)
      })
  }

  function confirmBuy(karaoke, req) {
    const confirm = {
      statusCode: consts.CODE.ACCESS_DENIED_KARAOKE,
      requireBuy: 1,
      message: lang.contentDeniedKaraoke(config.MAX_KARAOKE_TODAY, consts.BUY_GROUP.KARAOKE.name, `Bài hát: ${karaoke.name}`),
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
            {key: 'PACKAGE', groupId: consts.BUY_GROUP.KARAOKE.groupId, name: consts.BUY_GROUP.KARAOKE.name},
            {key: 'TIME', time: 'P6M', name: '6 tháng'}
          ]
        }
      ]
    }

    return confirm
  }

  function publishView(req, id, name, catalog) {
    Karaoke.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.KARAOKE,
      data: {
        id,
        name,
        catalog,
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

  Karaoke.remoteMethod('like', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'number', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'like karaoke'
  })

  Karaoke.like = (req, id, cb) => {
    cb(null, { id })

    PersonalMemory.markLikeKaraoke(req.username, id)
  }

  Karaoke.remoteMethod('unlike', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'number', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'unlike karaoke'
  })

  Karaoke.unlike = (req, id, cb) => {
    cb(null, { id })

    PersonalMemory.markUnLikeKaraoke(req.username, id)
  }

  Karaoke.remoteMethod('getFavorite', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'page', type: 'number', default: 0}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'like karaoke'
  })

  Karaoke.getFavorite = (req, page, cb) => {

    PersonalMemory.getUserKaraokes(req.username, LIMIT, page)
      .then(ids => {
        return CacheHandler.getListCache('Karaoke', { index: ids }, { fields: ['index', 'name', 'singer'] })
      })
      .then(list => {
        cb(null, { data: _.map(list, item => _.assign(item, { id: Number(item.index) })), page })
      })
      .catch(e => {
        e && console.error('Karaoke getFavorite error: ', e.stack || e)
        cb(null, { data: [], page })
      })
  }

  Karaoke.remoteMethod('getFavoriteIds', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'get favorite karaoke'
  })

  Karaoke.getFavoriteIds = (req, cb) => {

    PersonalMemory.getUserKaraokes(req.username, 100)
      .then(ids => {
        cb(null, { data: _.map(ids, id => Number(id)) })
      })
      .catch(e => {
        e && console.error('Karaoke getFavoriteIds error: ', e.stack || e)
        cb(null, { data: [] })
      })
  }
}
