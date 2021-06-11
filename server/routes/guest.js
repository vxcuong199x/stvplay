'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const geoip = require('geoip-lite')
const hmacSha256 = require('crypto-js/hmac-sha256')
const TokenHandler = require('../logic/token-handler')
const consts = require('../config/consts')
const partnerConfig = require('../config/partner')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi.js')
const utils = require('../utils/utils')
const Validator = require('../lib/validator')

module.exports = function(Guest) {
  Guest.remoteMethod('enter', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'deviceName', type: 'string', required: true},
      {arg: 'deviceToken', type: 'string'},
      {arg: 'dtId', type: 'number', required: true, default: 1},
      {arg: 'spId', type: 'number', default: 1},
      {arg: 'platform', type: 'number', required: true, default: 1, description: '1: iOs, 2: android, 3: windowsphone, 4: tizen, 5: LG webOS, 6: web'},
      {arg: 'deviceType', type: 'number', required: true, default: 1, description: '1: TV, 2: mobile'},
      {arg: 'mac', type: 'string'},
      {arg: 'signature', type: 'string', required: true},
    ],
    returns: {type: 'object', root: true},
    description: 'Enter as guest -> return {token}'
  })

  const enterGuestRule = {
    deviceId: 'required|string|between:10,60|deviceId',
    deviceName: 'required|string|between:3,60',
    mac: 'string'
  }

  Guest.enter = (req, deviceId, deviceName, deviceToken, dtId, spId, platform, deviceType, mac, signature, cb) => {

    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const city = geo.city || ''

    if (config.OUT_VN_BLOCK && geo.country != 'VN') {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.outVnBlock
      })
    }

    if (Guest.app.models.BlacklistIp.checkBlock(ip)) {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.applicationBlock
      })
    }

    const validator = new Validator({deviceId, deviceName}, enterGuestRule);
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const lastLogin = new Date()
    const now = moment().unix()
    let freeUntil = now + config.FREE_PER_DEVICE
    let guestObj

    Guest.findOrCreate(
      { where: {deviceId} },
      { deviceId, deviceName, platform, deviceType, deviceToken, freeUntil, mac, lastLogin, ip, city, dtId, spId }
    )
      .spread((guest, created) => {
        if (!guest.activated) {
          const e = new Error(lang.locked)
          e.statusCode = consts.CODE.DISABLE_GUEST
          return Promise.reject(e)
        }

        guestObj = guest
        dtId = guest.dtId
        spId = guest.spId
        freeUntil = Number(guest.freeUntil)

        if (created) {
          return Promise.all([
            Guest.app.models.FreeMac.findOne({ where: { mac, activated: true } }),
            Guest.app.models.Counter.getNextId('guestId')
          ])
        }

        return Promise.all([])
      })
      .spread((promotion, nextId) => {
        let isPreset = guestObj.isPreset
        if (promotion && promotion.freeMonth) {
          isPreset = 1
          promotion.free = Math.ceil(promotion.freeMonth * 30.5) * 86400
          freeUntil = now + promotion.free
          guestObj.updateAttributes({
            freeUntil,
            isPreset
          }, (e) => e && console.error(e.stack || e))

          promotion.updateAttributes({
            deviceId,
            status: 1
          }, (e) => e && console.error(e.stack || e))
        }

        const time = moment().unix()
        const emitData = { username: guestObj.guestId, deviceId, deviceType, platform, dtId, spId, ip, city, time }

        if (nextId) {
          guestObj.updateAttribute('guestId', Number(nextId))
          guestObj.guestId = Number(nextId)
          emitData.username = guestObj.guestId
          // Guest.app.get('rabbit').publish({ channel: consts.RABBIT_CHANNEL.REGISTER, data: emitData })
        }

        Guest.app.get('rabbit').publish({ channel: consts.RABBIT_CHANNEL.LOGIN, data: emitData })
        const createdAt = moment(guestObj.createAt).unix()

        return TokenHandler.generateGuestToken({deviceId, ip, city, dtId, spId, platform, deviceType, mac, freeUntil, createdAt, isPreset, guestId: guestObj.guestId})
      })
      .then((token) => {
        cb(null, {
          token,
          guestId: guestObj.guestId,
          config: Guest.app.models.Home.config
        })
      })
      .catch(e => {
        console.error(e.stack || e)
        if (e.statusCode) return cb(e)
        console.error('enter as quest error', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Guest.remoteMethod('changeDeviceToken', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'deviceToken', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'change device token'
  })

  Guest.changeDeviceToken = (req, deviceId, deviceToken, cb) => {
    Guest.findOne({ where: { deviceId } })
      .then(guest => {
        if (!guest)
          return Promise.reject()

        return guest.updateAttribute('deviceToken', deviceToken)
      })
      .then(() => cb(null, { }))
      .catch(e => {
        e && console.error('change error', e.stack || e)
        cb(null, { })
      })
  }

  Guest.remoteMethod('kick', {
    accepts: [
      {arg: 'deviceId', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'block guest'
  })

  Guest.kick = (deviceId, cb) => {
    Guest.findOne(
      {where: {deviceId}},
      (e, guest) => {
        if (guest) {
          Guest.app.models.BlockUser.create({
            username: guest.guestId,
            createdAt: new Date()
          })
        }

        cb(null, {})
      })
  }

}
