'use strict'

const _ = require('lodash')
const utils = require('../utils/utils')

const sessions = {}
const handlers = {}
const SCTV_OTT_PUSH = 'ott:pushOnline'
let redis

module.exports = class PushManager {

  static init(redisInstance, isReceiver = true) {
    redis = redisInstance

    if (!isReceiver) return

    redisInstance.on('message', (channel, message) => {
      const data = utils.JSONParse(message)
      if (!data || (!data.users && !data.username) || !data.notification) return

      if (data.users && _.isArray(data.users)) {
        _.forEach(data.users, (user) => PushManager.pushChannel(user, data.notification))
      }
      else if (data.users && data.users == 'all') {
        PushManager.pushAll(data.notification)
      }
      else if (data.username) {
        PushManager.pushOne(data.username, data.deviceId, data.notification)
      }
    })

    redisInstance.on('connect', () => {
      redisInstance.subscribe(SCTV_OTT_PUSH, (e) => e && console.error(e.stack || e))
    })
  }

  static pushDevice(username, deviceId, notification) {
    redis.publish(SCTV_OTT_PUSH, JSON.stringify({
      username,
      deviceId,
      notification
    }))
  }

  static pushDeviceOnly(deviceId, notification) {
    redis.publish(SCTV_OTT_PUSH, JSON.stringify({
      username: deviceId,
      deviceId,
      notification
    }))
  }

  static pushUsers(users, notification) {
    redis.publish(SCTV_OTT_PUSH, JSON.stringify({
      users,
      notification
    }))
  }

  static pushAll(notification) {
    redis.publish(SCTV_OTT_PUSH, JSON.stringify({
      users: 'all',
      notification
    }))
  }

  static addHandler(channel, id, func) {
    if (!handlers[channel])
      handlers[channel] = {}
    handlers[channel][id] = func
    sessions[id] = true
  }

  static removeHandler(channel, id) {
    if (handlers[channel]) delete handlers[channel][id]
    if (sessions[id]) delete sessions[id]
  }

  static pushChannel(channel, data) {
    if (!handlers[channel]) return
    _.forIn(handlers[channel], (id, itemHandler) => {
      itemHandler.call(undefined, `${JSON.stringify(data)} \n\n`)
    })
  }

  static pushOne(channel, deviceId, data) {
    console.log('pushOne', data)
    if (!handlers[channel] || !handlers[channel][deviceId]) return
    handlers[channel][deviceId].call(undefined, `data: ${JSON.stringify(data)} \n\n`)
  }

  static isSessionExists(id) {
    return !!sessions[id]
  }

  static pushAllChannel(data) {
    _.forIn(handlers, (handler) => {
      _.forIn(handler, (itemHandler) => {
        itemHandler.call(undefined, `data: ${JSON.stringify(data)} \n\n`)
      })
    })
  }

  static runHeartbeat() {
    utils.interval(() => {
      _.forIn(handlers, (handler) => {
        _.forIn(handler, (itemHandler) => {
          itemHandler.call(undefined, `\n\n`)
        })
      })
    }, 10000)
  }
}
