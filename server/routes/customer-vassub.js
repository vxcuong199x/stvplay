'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const queryString = require('querystring')
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
const sendMT = require('../services/send-mt')
const checkSpam = require('../utils/check-spam')
const PushManager = require('../services/push-manager')
const Payment = require('../logic/payment')
const Atomic = require('../lib/atomic')
const getRedis = require('../utils/get-redis')
const CustomerReadMemory = require('../logic/customer-memory')
const PersonalMemory = require('../logic/personal-memory')
const ScreenHandler = require('../logic/screen-handler')
const OutputCache = require('../utils/output-cache')
const isDevelopment = (process.env.NODE_ENV === 'development')
const Momo = require('../services/momo-service')

const EC = {
  SUCCESS: 0,
  EXISTED: 1
}

module.exports = function(Customer) {

  const registerRule = {
    username: 'required|phone',
    amount: 'required|numeric',
    packageCode: 'required',
    day: 'required|numeric',
    signature: `required|signature:${secret.VAS_SECRET}:username,amount,packageCode,day`
  }

  Customer.remoteMethod('register', {
    accepts: [
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'username', type: 'string', required: true},
      {arg: 'amount', type: 'number', required: true},
      {arg: 'packageCode', type: 'string', required: true},
      {arg: 'day', type: 'number', required: true},
      {arg: 'signature', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'register, return {}'
  })

  Customer.register = (reqVasServer, username, amount, packageCode, day, signature, cb) => {
    checkAndRenew(reqVasServer, username, amount, packageCode, day, signature, cb)
  }

  Customer.remoteMethod('renew', {
    accepts: [
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'username', type: 'string', required: true},
      {arg: 'amount', type: 'number', required: true},
      {arg: 'packageCode', type: 'string', required: true},
      {arg: 'day', type: 'number', required: true},
      {arg: 'signature', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'register, return {}'
  })

  Customer.renew = (reqVasServer, username, amount, packageCode, day, signature, cb) => {
    checkAndRenew(reqVasServer, username, amount, packageCode, day, signature, (e, result) => {
      if (e) cb(e)
      else cb({ ec: EC.SUCCESS })
    })
  }

  function checkAndRenew(reqVasServer, username, amount, packageCode, day, signature, cb) {
    const validator = new Validator({username, amount, packageCode, day, signature}, registerRule)
    if (validator.fails()) {
      console.error(validator.errors.all())
      return cb({statusCode: consts.CODE.INVALID_PARAM})
    }

    if (partnerConfig.VAS_ALLOW_IPS.indexOf(utils.getIp(reqVasServer)) == -1) {
      console.error(utils.getIp(reqVasServer))
      return cb({statusCode: consts.CODE.ACCESS_DENIED})
    }

    const packageObj = consts.PACKAGE.SCTV

    username = utils.formatPhone(username)
    const expireAt = moment().endOf('day').add(day, 'day').toDate()
    const maxDevice = 1
    const packages = [
      { maxDevice, expireAt, code: packageObj.code }
    ]

    Customer.findOrCreate(
      { where: {username} },
      {
        username,
        phone: username,
        lastLogin: new Date(),
        ip: '',
        city: '',
        devices: [],
        packages,
        dtId: 1,
        spId: 1,
        platform: consts.PLATFORM.ANDROID,
        deviceType: consts.DEVICE_TYPE.MOBILE
      }
    )
      .spread((customer, created) => {
        if (!created) {
          cb(null, { ec: EC.EXISTED })
        } else {
          cb(null, { ec: EC.SUCCESS })

          // Customer.app.models.Transaction.create({
          //   username: username,
          //   platform: customer.platform,
          //   deviceType: customer.deviceType,
          //   deviceId: '',
          //   dtId: customer.dtId,
          //   spId: customer.spId,
          //   ip: utils.getIp(reqVasServer),
          //   time: new Date(),
          //   type: consts.TRANSACTION_TYPE.VNM_VAS,
          //   contentType: consts.BUY_CONTENT_TYPE.PACKAGE,
          //   package: packageObj.code,
          //   packageId: consts.BUY_GROUP.SCTV.groupId,
          //   amount: amount,
          //   price: amount,
          //   month: 0,
          //   day: Number(day),
          //   bonusMonths: 0,
          //   maxDevice: 1,
          //   after: 0,
          //   isPay: 1,
          //   status: consts.TRANSACTION_STATUS.SUCCESS,
          //   telco: consts.TELCO_CODE.VIETNAM_MOBILE,
          //   serial: packageCode
          // })
        }
      })
      .catch(e => {
        console.error('register error: ', e.stack || e)
        return cb({statusCode: consts.CODE.SERVER_ERROR})
      })
  }
}
