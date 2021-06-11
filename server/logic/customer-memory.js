'use strict'

const _ = require('lodash')
const moment = require('moment')
const Promise = require('bluebird')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const getRedis = require('../utils/get-redis')

const KEY = {
  userLastRead: (username) => `ott:userLastRead:${username}`,
  userMarkRead: (username) => `ott:userMarkRead:${username}`,
  userHasNotUnRead: (username) => `ott:userHasUnRead:${username}`
}

module.exports = class CustomerReadMemory {
  static setLastRead(username, time) {
    return getRedis('redis')
      .set(KEY.userLastRead(username), time)
      .catch(e => {
        console.error('setLastRead', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getLastRead(username) {
    return getRedis('redis')
      .get(KEY.userLastRead(username))
      .catch(e => {
        console.error('getLastRead', e.stack || e)
        return Promise.reject(e)
      })
  }
  
  static markReadNotification(username, notificationId, expireTime) {
    return getRedis('redis')
      .zadd(KEY.userMarkRead(username), expireTime, notificationId)
      .catch(e => {
        console.error('markReadNotification', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getReadNotifications(username) {
    return getRedis('redis')
      .zrangebyscore(KEY.userMarkRead(username), moment().unix(), '+inf')
      .catch(e => {
        console.error('getReadNotifications', ee.stack || e)
        return Promise.reject(e)
      })
  }

  static removeExpiredReadNotifications(username) {
    return getRedis('redis')
      .zremrangebyscore(KEY.userMarkRead(username), 0, moment().unix())
      .catch(e => {
        console.error('removeExpiredReadNotifications', e.stack || e)
        return Promise.reject(e)
      })
  }

  static countUnReadNotifications(username, notificationIds) {
    return getRedis('redis')
      .zrangebyscore(KEY.userMarkRead(username), moment().unix(), '+inf')
      .then(idList => {
        return Promise.resolve(_.difference(notificationIds || [], idList || []).length)
      })
      .catch(e => {
        console.error('countUnReadNotifications err', e.stack || e)
        return Promise.resolve(0)
      })
  }

  static markHasUnRead(username) {
    return getRedis('redis')
      .del(KEY.userHasNotUnRead(username))
      .catch(e => {
        console.error('markHasUnRead', e.stack || e)
        return Promise.reject(e)
      })
  }

  static markHasNotUnRead(username) {
    return getRedis('redis')
      .setex(KEY.userHasNotUnRead(username), 86400*7, 1)
      .catch(e => {
        console.error('markHasNotUnRead', e.stack || e)
        return Promise.reject(e)
      })
  }

  static getHasNotUnRead(username) {
    return getRedis('redis')
      .get(KEY.userHasNotUnRead(username))
      .catch(e => {
        console.error('getHasNotUnRead', e.stack || e)
        return Promise.reject(e)
      })
  }
}
