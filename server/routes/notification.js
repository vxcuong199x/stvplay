'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const PushManager = require('../services/push-manager')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')
const getRedis = require('../utils/get-redis')
const CustomerReadMemory = require('../logic/customer-memory')
const SCTV_OTT_PUSH = 'ott:pushOnline'

module.exports = function(Notification) {

  PushManager.init(getRedis('redisPushInApp'), false)
  const redisPushOnline = getRedis('redisPushOnline')

  Notification.beforeRemote('find', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if (!role) {
      const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'ceil').toDate()

      _.set(ctx, 'args.filter.where', {
        activated: true,
        type: consts.NOTIFY_TYPE.ONLINE,
        showTime: { lte: now },
        expireAt: { gte: now }
      })

      _.set(ctx, 'args.filter.limit', 10)
      _.set(ctx, 'args.filter.order', 'showTime DESC')
      _.set(ctx, 'args.filter.cacheTime', config.CACHE_TIME)
    }
    next()
  })

  Notification.remoteMethod('getList', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get notification list'
  })

  Notification.getList = (req, cb) => {

    Promise.all([
      Notification.getLatestNews(),
      CustomerReadMemory.getReadNotifications(req.username)
    ])
      .spread((notificationList, readNotifications) => {
        const readNotificationMap = {}
        _.each(readNotifications, item => readNotificationMap[item] = true)

        notificationList = _.filter(notificationList, item => {
          if (item.platform && item.platform != req.platform)
            return false

          if (item.deviceType && item.deviceType != req.deviceType)
            return false

          return !(item.dtId && item.dtId != req.dtId)
        })

        notificationList = _.map(notificationList, item => {
          item.isNew = readNotificationMap[item.id.toString()] ? 0 : 1
          return _.pick(item, ['id', 'name', 'updatedAt'])
        })

        cb(null, { data: notificationList })
      })
      .catch(e => {
        console.error('get notification list error', e.stack || e)
        cb(null, { data: [] })
      })
  }

  Notification.remoteMethod('getDetail', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'id', type: 'string'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get notification detail'
  })

  Notification.getDetail = (req, notificationId, cb) => {

    Notification.findById(notificationId, {
      field: ['id','name','button','target','updatedAt','description','expireAt'],
      cacheTime: config.CACHE_TIME
    })
      .then(item => {
        item.isNew = 0
        cb(null, item)

        markRead(req, item)
      })
      .catch(e => {
        console.error('get notification list error', e.stack || e)
        cb(e)
      })
  }

  function markRead(req, item) {
    const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'ceil').toDate()

    CustomerReadMemory.markReadNotification(req.username, item.id.toString(), moment(item.expireAt).unix())
      .then(() => Notification.find({
        where: {
          activated: true,
          type: consts.NOTIFY_TYPE.ONLINE,
          showTime: { lte: now },
          expireAt: { gte: now }
        },
        fields: ['id'],
        limit: 10,
        order: 'showTime DESC',
        cacheTime: config.CACHE_TIME
      }))
      .then(notifications => CustomerReadMemory.countUnReadNotifications(
        req.username,
        _.map(notifications, item => item.id.toString())
      ))
      .then((count) => {
        CustomerReadMemory.removeExpiredReadNotifications(req.username)
        if (!count) {
          return CustomerReadMemory.markHasNotUnRead(req.username)
        }
      })
  }

  // todo remove
  // Notification.remoteMethod('testPushOffline', {
  //   accepts: [
  //     {arg: 'username', type: 'string'},
  //     {arg: 'data', type: 'object', description: '{title, body}'}
  //   ],
  //   returns: {type: 'array', root: true},
  //   http: {verb: 'get'},
  //   description: 'Test push offline'
  // })

  Notification.testPushOffline = (username, data, cb) => {
    Notification.app.models.Customer.findOne({
      where: {username}
    })
      .then(user => {
        if (!user) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING
          })
        }

        data.devices = _(user.devices)
          .map(device => device.deviceToken)
          .filter(token => token.len)
          .value()

        return Notification.app.get('firebase')
          .pushNotification(data)
      })
      .then(pushResult => {
        console.log('Push offline result', pushResult)
        cb(null, pushResult)
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('verify OTP error', e.stack || e)
        cb({ error: { statusCode: consts.CODE.SERVER_ERROR } })
      })
  }

  // todo remove
  // Notification.remoteMethod('testPushInApp', {
  //   accepts: [
  //     {arg: 'username', type: 'string'},
  //     {arg: 'deviceId', type: 'string'},
  //     {arg: 'data', type: 'object', description: '{...}'}
  //   ],
  //   returns: {type: 'array', root: true},
  //   http: {verb: 'get'},
  //   description: 'Test push in app'
  // })

  Notification.testPushInApp = (username, deviceId, data, cb) => {
    if (!deviceId)
      PushManager.pushChannel(username, data)
    else if (username)
      PushManager.pushDevice(username, deviceId, data)
    else
      PushManager.pushDeviceOnly(deviceId, data)

    cb({})
  }

  // todo remove
  // Notification.remoteMethod('testPushOnline', {
  //   accepts: [
  //     {arg: 'username', type: 'string'},
  //     {arg: 'deviceId', type: 'string'},
  //     {arg: 'data', type: 'object', description: '{...}'}
  //   ],
  //   returns: {type: 'array', root: true},
  //   http: {verb: 'get'},
  //   description: 'Test push online'
  // })

  Notification.testPushOnline = (username, deviceId, data, cb) => {
    if (!deviceId && !username) {
      redisPushOnline.publish(SCTV_OTT_PUSH, JSON.stringify({
        users: 'all',
        notification: data
      }))
    }
    else if (!deviceId) {
      redisPushOnline.publish(SCTV_OTT_PUSH, JSON.stringify({
        users: [username],
        notification: data
      }))
    }
    else if (username) {
      redisPushOnline.publish(SCTV_OTT_PUSH, JSON.stringify({
        username,
        deviceId,
        notification: data
      }))
    }
    else {
      redisPushOnline.publish(SCTV_OTT_PUSH, JSON.stringify({
        username: deviceId,
        deviceId,
        notification: data
      }))
    }

    cb({})
  }

  Notification.remoteMethod('clickNotify', {
    accepts: [
      {arg: 'username', type: 'string'},
      {arg: 'id', type: 'string'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Mark click notify'
  })

  Notification.clickNotify = (username, id, cb) => {
    getRedis('redis').hincrby('ott:notifyClick', id, 1)

    cb({})
  }
}
