'use strict'

const _ = require('lodash')
const moment = require('moment')
const Promise = require('bluebird')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const getRedis = require('../utils/get-redis')

const KEY = {
  userViewChannel: (username) => `ott:userViewChannel:${username}`,
  userViewMovie: (username, catalogId) => `ott:userViewMovie:${username}:${catalogId}`,
  userSaveMovie: (username, movieId) => `ott:userSaveMovie:${username}:${movieId}`,
  userBuyMovie: (username) => `ott:userBuyMovie:${username}`,
  userViewClip: (username, catalogId) => `ott:userViewClip:${username}:${catalogId}`,
  userSaveClip: (username, movieId) => `ott:userSaveClip:${username}:${movieId}`,
  userBuyClip: (username) => `ott:userBuyClip:${username}`,
  userMarkBuy: (username) => `ott:userMarkBuy:${username}`,
  userLikeKaraoke: (username) => `ott:userLikeKaraoke:${username}`,
  karaokeCountToday: (username) => `ott:karaokeCount:${username}`,
}

module.exports = class PersonalMemory {

  static markNotBuy(username) {
    return getRedis('redis')
      .set(KEY.userMarkBuy(username), '1')
      .catch(e => {
        console.error('markNotBuy', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markViewChannel(username, channelId) {
    return getRedis('redis')
      .zincrby(KEY.userViewChannel(username), 1, channelId)
      .catch(e => {
        console.error('markViewChannel', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markViewMovie(username, catalogIds, movieId, second = 0, episode = 0) {
    const redis = getRedis('redis')

    const operators = []
    _.forEach(catalogIds, catalogId => {
      operators.push(redis.zadd(KEY.userViewMovie(username, catalogId), moment().unix() * 10000 + second, movieId))
    })

    return Promise.all(operators)
      .spread(() => redis.setex(KEY.userSaveMovie(username, movieId), 30*86400, JSON.stringify({ second, episode })))
      .catch(e => {
        console.error('markViewMovie', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markBuyMovie(username, movieId) {
    const redis = getRedis('redis')
    return redis.del(KEY.userMarkBuy(username))
      .then(() => redis.zadd(KEY.userBuyMovie(username), 1, movieId))
      .catch(e => {
        console.error('markBuyMovie', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getBuyMovies(username) {
    const redis = getRedis('redis')
    return redis.zrange(KEY.userBuyMovie(username), 0, -1)
      .catch(e => {
        console.error('getBuyMovies', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markLikeKaraoke(username, id) {
    const redis = getRedis('redis')
    return redis.zadd(KEY.userLikeKaraoke(username), moment().unix(), id)
      .catch(e => {
        console.error('markLikeKaraoke', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markUnLikeKaraoke(username, id) {
    const redis = getRedis('redis')
    return redis.zrem(KEY.userLikeKaraoke(username), id)
      .catch(e => {
        console.error('markUnLikeKaraoke', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserKaraokes(username, limit, page = 0) {
    const start = page * limit
    return getRedis('redis')
      .zrevrange(KEY.userLikeKaraoke(username), start, start + limit)
      .catch(e => {
        console.error('getUserKaraokes', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getKaraokeToday(username) {
    const redis = getRedis('redis')
    return redis.llen(KEY.karaokeCountToday(username))
      .catch(e => {
        console.error('getKaraokeToday', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markKaraokeToday(username, id) {
    const redis = getRedis('redis')
    return redis.lpush(KEY.karaokeCountToday(username), id)
      .then(count => {
        if (count === 1) {
          // const expire = utils.momentRound(moment(), moment.duration(5, 'minutes'), 'floor')
          redis.expireat(KEY.karaokeCountToday(username), moment().endOf('day').unix())
        }
      })
      .catch(e => {
        console.error('markKaraokeToday', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markBuyMovies(username, data) {
    const params = []
    _.each(data, (time, id) => {
      params.push(time)
      params.push(id)
    })

    return getRedis('redis')
      .zadd(KEY.userBuyMovie(username), params)
      .catch(e => {
        console.error('markBuyMovies', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markViewClip(username, catalogIds, clipId, second = 0, episode = 0) {
    const redis = getRedis('redis')

    const operators = []
    _.forEach(catalogIds, catalogId => {
      operators.push(redis.zadd(KEY.userViewClip(username, catalogId), moment().unix() * 10000 + second, clipId))
    })

    return Promise.all(operators)
      .spread(() => redis.setex(KEY.userSaveClip(username, clipId), 30*86400, JSON.stringify({ second, episode })))
      .catch(e => {
        console.error('markViewClip', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markBuyClip(username, clipId) {
    const redis = getRedis('redis')
    return redis.del(KEY.userMarkBuy(username))
      .then(() => redis.zadd(KEY.userBuyClip(username), 1, clipId))
      .catch(e => {
        console.error('markBuyClip', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getBuyClips(username) {
    const redis = getRedis('redis')
    return redis.zrange(KEY.userBuyClip(username), 0, -1)
      .catch(e => {
        console.error('getBuyClips', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markBuyClips(username, data) {
    const params = []
    _.each(data, (time, id) => {
      params.push(time)
      params.push(id)
    })

    return getRedis('redis')
      .zadd(KEY.userBuyClip(username), params)
      .catch(e => {
        console.error('markBuyClips', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserChannels(username, limit) {
    return getRedis('redis')
      .zrevrange(KEY.userViewChannel(username), 0, limit - 1)
      .catch(e => {
        console.error('getUserChannels', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserMovies(username, catalogId, limit) {
    return getRedis('redis')
      .zrevrange(KEY.userViewMovie(username, catalogId), 0, limit - 1, 'WITHSCORES')
      .then(list => {
        const result = {}
        let second
        for (let i = 0; i < list.length; i+= 2) {
          second = (Number(list[i+1]) % 10000)
          result[list[i]] = second
        }

        return Promise.resolve(result)
      })
      .catch(e => {
        console.error('getUserMovies', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserMovie(username, movieId) {
    return getRedis('redis').get(KEY.userSaveMovie(username, movieId))
      .then(data => {
        return data ? JSON.parse(data) : null
      })
      .catch(e => {
        console.error('getUserMovie', e.stack || e)
        return Promise.reject(e)
      })
  }

  static checkBuyMovie(username, movieId) {
    return getRedis('redis')
      .zscore(KEY.userBuyMovie(username), movieId)
      .catch(e => {
        console.error('checkBuyMovie', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserClips(username, catalogId, limit) {
    return getRedis('redis')
      .zrevrange(KEY.userViewClip(username, catalogId), 0, limit - 1, 'WITHSCORES')
      .then(list => {
        const result = {}
        let second
        for (let i = 0; i < list.length; i+= 2) {
          second = (Number(list[i+1]) % 10000)
          result[list[i]] = second
        }

        return Promise.resolve(result)
      })
      .catch(e => {
        console.error('getUserClips', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getUserClip(username, clipId) {
    return getRedis('redis').get(KEY.userSaveClip(username, clipId))
      .then(data => {
        return data ? JSON.parse(data) : null
      })
      .catch(e => {
        console.error('getUserClip', e.stack || e)
        return Promise.reject(e)
      })
  }

  static checkBuyClip(username, clipId) {
    return getRedis('redis')
      .zscore(KEY.userBuyClip(username), clipId)
      .catch(e => {
        console.error('checkBuyClip', e.stack || e)
        return Promise.reject(e)
      })
  }

  static checkLossData(username) {
    const redis = getRedis('redis')
    return redis.get(KEY.userMarkBuy(username))
      .then(isNotBuy => {
        if (!isNotBuy) {
          return Promise.all([
            redis.exists(KEY.userBuyMovie(username)),
            redis.exists(KEY.userBuyClip(username))
          ])
            .spread((existsBuyMovie, existsBuyClip) => {
              if (existsBuyMovie || existsBuyClip) {
                PersonalMemory.markNotBuy(username)
              }

              if (!existsBuyMovie || !existsBuyClip) {
                return Promise.resolve(true)
              } else {
                return Promise.resolve(false)
              }
            })
        } else {
          return Promise.resolve(false)
        }
      })
  }
}
