'use strict'

const Promise = require('bluebird')
const moment = require('moment')
const hmacSha1 = require('crypto-js/hmac-sha1')
const shortid = require('shortid')
const _ = require('lodash')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const getRedis = require('../utils/get-redis')
const app = require('../server')
const TokenHandler = require('./token-handler')

const KEY = {
  SCREEN_COUNT: (username) => `ott:screen-count:${username}`
}

module.exports = class ScreenHandler {
  static watching(username, deviceId, loginSession, screenSession) {
    let screens
    const currentTime = moment().unix()

    return ScreenHandler.getCurrentScreens(username)
      .then(screenData => {
        screens = screenData || {}

        // old device case
        if (screens[deviceId] && screenSession) {
          const [oldScreenSession, createdAt] = screens[deviceId].split(':')
          if (oldScreenSession === screenSession && (Number(createdAt) + config.SCREEN_PING_INTERVAL*2.2) >= currentTime) {
            return Promise.reject(new Promise.CancellationError())
          } else if (oldScreenSession !== screenSession && (Number(createdAt) + config.SCREEN_PING_INTERVAL*2) >= currentTime) {
            return Promise.reject({
              ec: consts.CODE.KICK,
              max: 1
            })
          }
        }

        _.each(screens, (data, deviceId) => {
          const [oldScreenSession, createdAt] = data.split(':')
          if (createdAt + config.SCREEN_PING_INTERVAL*1.1 <= currentTime) {
            delete screens[deviceId]
          }
        } )

        // new device case
        return ScreenHandler.getMaxDeviceCount(username, deviceId, loginSession)
      })
      .then(max => {
        if (Object.keys(screens).length >= max) {
          return Promise.reject({
            ec: consts.CODE.KICK,
            max
          })
        } else {
          return Promise.reject(new Promise.CancellationError())
        }
      })
      .catch(Promise.CancellationError, e => {
        const newScreenSession = shortid.generate()
        ScreenHandler.setScreenSession(username, deviceId, newScreenSession)
        return Promise.resolve({ screenSession: newScreenSession })
      })
  }

  static getCurrentScreens(username) {
    return getRedis('redis')
      .hgetall(KEY.SCREEN_COUNT(username))
  }

  static setScreenSession(username, deviceId, screenSession) {
    return getRedis('redis')
      .hset(KEY.SCREEN_COUNT(username), deviceId, `${screenSession}:${moment().unix()}`)
  }

  static getMaxDeviceCount(username, deviceId, session) {
    return TokenHandler.getTokenByDevice(username, deviceId, session)
      .then(token => {
        return Promise.resolve(token.maxDevice || 1)
      })
      .catch(e => {
        e && console.error('getMaxDeviceCount err: ', e.stack || e)
        return Promise.resolve(1)
      })
  }
}
