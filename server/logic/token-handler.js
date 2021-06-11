'use strict'

const Promise = require('bluebird')
const moment = require('moment')
const hmacSha1 = require('crypto-js/hmac-sha1')
const shortid = require('shortid')
const uuidv4 = require('uuid/v4')
const _ = require('lodash')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const getRedis = require('../utils/get-redis')
const app = require('../server')

const KEY = {
  USER_TOKEN: (username) => `ott:token:${username}`,
  OTP: (username, deviceId) => `ott:otp:${username}:${deviceId}`,
  OTP_FOR_USER: (username) => `ott:user-otp:${username}`,
  USER_ENTER_COUNT: (username) => `ott:user-enter:${username}`,
  DEVICE_ENTER_COUNT: (deviceId) => `ott:user-enter:${deviceId}`
}

module.exports = class TokenHandler {
  static getToken(username) {
    return getRedis('redisSession')
      .hgetall(KEY.USER_TOKEN(username))
      .then(hash => {
        const token = {}
        _.each(hash, (device, deviceId) => {
          device = utils.JSONParse(device, undefined)
          if (device && device.expireAt >= moment().unix()) {
            token[deviceId] = device
          }
        })

        return token
      })
  }

  static getTokenByDevice(username, deviceId, session) {
    return getRedis('redisSession')
      .hget(KEY.USER_TOKEN(username), deviceId)
      .then(token => {
        if (!token) {
          TokenHandler.removeSession({username, deviceId})
          const e = new Error('token expired !!!')
          e.status = e.statusCode = 401
          e.code = 'INVALID_TOKEN'
          return Promise.reject(e)
        } else {
          token = utils.JSONParse(token)
          if (!token || token.session != session) {
            const e = new Error('token invalid !!!')
            e.status = e.statusCode = 401
            e.code = 'INVALID_TOKEN'
            return Promise.reject(e)
          }

          return Promise.resolve(token)
        }
      })
      .catch(e => {
        console.error('getTokenByDevice error: ', e.stack || e)
        return Promise.reject(e)
      })
  }

  static decrypt(token, clientDeviceId = null) {
    // config.DEBUG && console.log('TOKEN: ', token)

    return Promise.resolve()
      .then(() => {
        try {
          const [tokenString, tokenSHA1] = token.split('.')
          const data = Buffer.from(tokenString, 'base64').toString('ascii')
          const [session, username, ip, deviceId, dtId, spId, platform, deviceType, city, expireAt, mac, createdAt, freeUntil, isPreset, guestId] = data.split('$')
          // config.DEBUG && console.log(KEY.USER_TOKEN(username), JSON.stringify({session, username, ip, deviceId, dtId, spId, platform, deviceType, city, expireAt, mac, createdAt, freeUntil, isPreset, guestId}))
          if (expireAt <= moment().unix()) {
            TokenHandler.removeSession({username, deviceId})
            return Promise.reject(new Error('token expired !!!'))
          }

          const checkSHA1 = hmacSha1(tokenString, secret.TOKEN_SECRET)
          if (checkSHA1 != tokenSHA1 || (clientDeviceId && clientDeviceId != deviceId)) {
            return Promise.reject(new Error('token invalid !!!'))
          }

          return {session, username, ip, deviceId, dtId, spId, platform, deviceType, city, expireAt, mac, createdAt, freeUntil, isPreset, guestId}
        } catch(e) {
          return Promise.reject(e)
        }
      })
      .catch(e => {
        return Promise.reject(e)
      })
  }

  static generateOtp(username, deviceId) {
    const redis = getRedis('redisSession')
    let otp, session, stored = false
    return redis.get(KEY.OTP_FOR_USER(username))
      .then(data => {
        console.log('data_otp', data)
        if (data) {
          [session, otp] = data.split(':')
          stored = true

          return Promise.all([redis.setex(KEY.OTP(username, deviceId), config.OTP_EXPIRE, `${session}:${otp}`)])
        } else {
          session = uuidv4()
          otp = (process.env.NODE_ENV === 'development') ? '1234' : _.random(0, 9999).toString()
          while (otp.length < 4) { otp = '0' + otp }

          // todo account for store review
          if (username == '84979544856' || username == '84979544857' || username == '84999666666' || username == '84999777777' || username == '84999123456') otp = '2345'

          if (username == '84979544444') otp = '3456'

          if (username == '84918888888') otp = '4567'
        }

        return Promise.all([
          redis.setex(KEY.OTP(username, deviceId), config.OTP_EXPIRE, `${session}:${otp}`),
          redis.setex(KEY.OTP_FOR_USER(username), config.OTP_EXPIRE, `${session}:${otp}`)
        ])
      })
      .spread(() => { return {otp, session, stored} })
  }

  static generateOtpForUser(username) {
    const redis = getRedis('redisSession')
    let otp, session
    return redis.get(KEY.OTP_FOR_USER(username))
      .then(data => {
        if (data) {
          [session, otp] = data.split(':')
        } else {
          session = uuidv4()
          otp = (process.env.NODE_ENV === 'development') ? '1234' : _.random(0, 9999).toString()
          while (otp.length < 4) { otp = '0' + otp }
        }

        return redis.setex(KEY.OTP_FOR_USER(username), config.OTP_EXPIRE, `${session}:${otp}`)
      })
      .spread(() => { return {otp, session} })
  }

  static removeOtpForUser(username) {
    return getRedis('redisSession')
      .del(KEY.OTP_FOR_USER(username))
  }

  static generateLongOtp(username, deviceId) {
    let otp = _.random(0, 9999999).toString()
    while (otp.length < 7) { otp = '0' + otp }

    const session = 'long-' + uuidv4()

    return app.models.RefreshToken.update(
      { username, deviceId },
      { $set: { token: `${session}:${otp}`, createdAt: new Date() } },
      { upsert: true }
    )
      .then(() => Promise.resolve({ otp, session }))
  }

  static validOtp({ username, deviceId, otp, session }) {
    const redis = getRedis('redisSession')

    return redis.get(KEY.OTP(username, deviceId))
      .then(storeOtp => {
        console.log('validOtp: ', { storeOtp, session, otp })
        return storeOtp === `${session}:${otp}`;
      })
  }

  static validLongOtp({ username, deviceId, otp, session }) {
    const redis = getRedis('redisSession')

    return app.models.RefreshToken.findOne({ where: { username, deviceId } })
      .then(token => {
        const storeOtp = token ? token.token : ''
        config.DEBUG && console.log('validOtp: ', { storeOtp, session, otp })

        return storeOtp === `${session}:${otp}`;
      })

  }

  static removeOtp({ username, deviceId }) {
    console.log('remove OTP', { username, deviceId })
    return app.models.RefreshToken.destroyAll({ username, deviceId })
      .then(() => {
        return getRedis('redisSession').del(KEY.OTP(username, deviceId))
      })
  }

  static generateToken({ username, deviceId, deviceName, ip, city, dtId, spId, platform, deviceType, packages, maxDevice, mac, createdAt}) {
    const session = shortid.generate()
    const expireAt = moment().unix() + config.TOKEN_EXPIRE
    const tokenString = [session, username, ip, deviceId, dtId, spId, platform, deviceType, city, expireAt, mac, createdAt].join('$')
    const tokenBase64 = Buffer.from(tokenString).toString('base64')
    const tokenSHA1 = hmacSha1(tokenBase64, secret.TOKEN_SECRET)
    const token = `${tokenBase64}.${tokenSHA1}`

    const tokenData = {
      username,
      deviceId,
      session,
      dtId,
      spId,
      platform,
      deviceType,
      packages,
      maxDevice,
      city,
      expireAt,
      mac,
      createdAt
    }
    return getRedis('redisSession')
      .hset(KEY.USER_TOKEN(username), deviceId, JSON.stringify(tokenData))
      .then(() => getRedis('redisSession').expire(KEY.USER_TOKEN(username), config.TOKEN_EXPIRE * 3))
      .then(() => token)
  }

  static generateGuestToken({ deviceId, ip, city, dtId, spId, platform, deviceType, mac, createdAt, freeUntil, isPreset, guestId}) {
    const session = shortid.generate()
    const expireAt = moment().unix() + config.TOKEN_EXPIRE
    const tokenString = [session, 'GUEST', ip, deviceId, dtId, spId, platform, deviceType, city, expireAt, mac, createdAt, freeUntil, isPreset, guestId].join('$')
    const tokenBase64 = Buffer.from(tokenString).toString('base64')
    const tokenSHA1 = hmacSha1(tokenBase64, secret.TOKEN_SECRET)
    const token = `${tokenBase64}.${tokenSHA1}`

    return Promise.resolve(token)
  }

  static updateToken({ username, deviceId, key, value }) {
    return getRedis('redisSession')
      .hget(KEY.USER_TOKEN(username), deviceId)
      .then(token => {
        const tokenData = utils.JSONParse(token)
        if (!tokenData) return Promise.reject('token not found')

        tokenData[key] = value
        return getRedis('redisSession')
          .hset(KEY.USER_TOKEN(username), deviceId, JSON.stringify(tokenData))
      })
  }

  static updateTokenData({ username, devices, data, Customer }) {
    const token = {}
    return getRedis('redisSession')
      .hgetall(KEY.USER_TOKEN(username))
      .then(hash => {
        Customer
          .findOne({ where: { username } })
          .then(customer => {
            if (!customer) return

            customer.devices = customer.devices || []
            let update = false

            _.each(customer.devices, (device, index) => {
              if (!device) return
              if (devices.indexOf(device.deviceId) === -1) {
                customer.devices.splice(index, 1)
                TokenHandler.removeSession({ username, deviceId: device.deviceId })
                // TokenHandler.removeOtp({ username, deviceId: device.deviceId })
                update = true
              }
            })

            if (update) {
              return customer.updateAttribute('devices', customer.devices)
            }
          })
          .catch(e => {
            e && console.error('logout error', e.stack || e)
          })

        _.each(hash, (device, deviceId) => {
          if (devices.indexOf(deviceId) === -1) {
            return
          }

          device = utils.JSONParse(device, undefined)
          if (device) {
            token[deviceId] = JSON.stringify(_.assign(device, data))
          }
        })

        console.log('debug_update_token', hash, token)

        return getRedis('redisSession')
          .del(KEY.USER_TOKEN(username))
      })
      .then(() => {
        getRedis('redisSession').hmset(KEY.USER_TOKEN(username), token, e => e && console.error('error update token', e.stack || e, token))
      })
  }

  static removeSession({ username, deviceId }) {
    return getRedis('redisSession')
      .hdel(KEY.USER_TOKEN(username), deviceId)
  }

  static kickUser(username) {
    return getRedis('redisSession')
      .del(KEY.USER_TOKEN(username))
  }

  static checkEnterLimit(username, deviceId) {
    // max 2 time / week for 1 device and max 4 time / week for username
    const MAX_USERNAME_ENTER = 4
    const MAX_DEVICE_ENTER = 2
    const redis = getRedis('redisSession')
    return redis.incr(KEY.USER_ENTER_COUNT(username))
      .then(usernameEnterCount => {
        if (usernameEnterCount > MAX_USERNAME_ENTER) {
          return Promise.reject(new Promise.CancellationError())
        }

        redis.expireat(KEY.USER_ENTER_COUNT(username), moment().endOf('week').unix())
        return redis.incr(KEY.DEVICE_ENTER_COUNT(deviceId))
      })
      .then(deviceEnterCount => {
        if (deviceEnterCount > MAX_DEVICE_ENTER) {
          return Promise.reject(new Promise.CancellationError())
        }

        redis.expireat(KEY.USER_ENTER_COUNT(username), moment().endOf('week').unix())

        return Promise.resolve(true)
      })
      .catch(Promise.CancellationError, e => {
        return Promise.resolve(false)
      })
  }
}
