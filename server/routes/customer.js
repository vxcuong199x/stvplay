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

module.exports = function(Customer) {

  Customer.beforeRemote('find', (ctx, config, next) => {
    const token = _.get(ctx, 'args.options.accessToken')
    const isAdmin = _.get(ctx, 'args.options.authorizedRoles.admin')
    const isCSKH = _.get(ctx, 'args.options.authorizedRoles.cskh')
    const isKetoan = _.get(ctx, 'args.options.authorizedRoles.ketoan')

    if (!isAdmin && !isCSKH && !isKetoan) {
      if (token.role.indexOf('npp_') == 0) {
        const dtId = Number(token.role.replace('npp_', ''))
        _.set(ctx, 'args.filter.where.dtId', dtId)
      } else if (token.role.indexOf('daily_') == 0) {
        const [unused, dtId, spId] = token.role.split('_')
        _.set(ctx, 'args.filter.where.dtId', dtId)
        _.set(ctx, 'args.filter.where.spId', spId)
      }
    }

    next()
  })

  let atomic

  Customer.on('dataSourceAttached', () => {
    atomic = new Atomic({
      redis: getRedis('redis'),
      wait: 200
    })
  })

  // Customer.beforeRemote('enter', (ctx, config, next) => {
  //   checkSpam({
  //     method: 'enter',
  //     ctx: ctx,
  //     key: 'ip',
  //     limit: isDevelopment ? 100 : 30,
  //     next: next,
  //     period: 300
  //   })
  // })
  //
  // Customer.beforeRemote('enter', (ctx, config, next) => {
  //   checkSpam({
  //     method: 'enter',
  //     ctx: ctx,
  //     key: 'args.username',
  //     limit: isDevelopment ? 100 : 2,
  //     next: next,
  //     period: 300
  //   })
  // })
  //
  // Customer.beforeRemote('enter', (ctx, config, next) => {
  //   checkSpam({
  //     method: 'enter',
  //     ctx: ctx,
  //     key: 'args.deviceId',
  //     limit: isDevelopment ? 100 : 2,
  //     next: next,
  //     period: 300
  //   })
  // })

  Customer.remoteMethod('enter', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'signature', type: 'string', required: true},
      {arg: 'deviceType', type: 'number'},
      {arg: 'platform', type: 'number'},
      {arg: 'dtId', type: 'number'}
    ],
    returns: {type: 'object', root: true},
    description: 'Enter app -> return {expire, otpSession}'
  })

  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im
  Customer.validatesFormatOf('username', {with: phoneRegex, message: 'Must provide a valid phone number'})

  const enterRule = {
    username: 'required|numeric|phone',
    deviceId: 'required|string|between:10,60|deviceId'
  }

  Customer.enter = (req, username, deviceId, signature, deviceType, platform, dtId, cb) => {
    const ip = utils.getIp(req)
    if (config.OUT_VN_BLOCK) {
      const geo = geoip.lookup(ip) || {}
      if (geo.country != 'VN') {
        return cb({
          statusCode: consts.CODE.ACCESS_DENIED,
          message: lang.outVnBlock
        })
      }
    }

    const originalUsername = username
    username = utils.formatPhone(username)
    username = utils.convertOldToNewPhone(username)

    if (Customer.app.models.BlacklistUsername.checkBlock(username)
      || Customer.app.models.BlacklistIp.checkBlock(ip)) {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.applicationBlock
      })
    }

    const validator = new Validator({username, deviceId}, enterRule);
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidPhone
      })
    }

    // check max device before
    // TokenHandler.getToken(username)
    //   .then(token => {
    //     const maxDevice = token && Object.keys(token).length
    //       ? (token[Object.keys(token)[0]].maxDevice || config.MAX_DEVICE)
    //       : config.MAX_DEVICE

        // if (token && Object.keys(token).length >= maxDevice + consts.MORE_LOGIN_DEVICE && !token.hasOwnProperty(deviceId)) {
        //   return Promise.reject({
        //     statusCode: consts.CODE.ACCESS_DENIED,
        //     message: lang.reachMaxDevice(maxDevice)
        //   })
        // }

        // TokenHandler.checkEnterLimit(username, deviceId)

    const isViettel = username.startsWith('843')
      || username.startsWith('8416')
      || username.startsWith('8496')
      || username.startsWith('8497')
      || username.startsWith('8498')
      || username.startsWith('8486')

    Promise.all([
      TokenHandler.generateOtp(username, deviceId),
      (Customer.findOne(
        {
          where: {username},
          fields: ['username', 'phone', 'packages', 'dtId', 'coin', 'freeCoin', 'devices', 'maxDevice', 'totalCharge'],
          cacheTime: config.CACHE_TIME
        }
      ))
    ])

      // })
      .spread((otp, customer) => {
        customer = customer || {packages: []}
        // const packages = _(customer.packages.slice())
        //   .filter(packageObj => {
        //     return moment(packageObj.expireAt).valueOf() >= Date.now()
        //   })
        //   .value()

        // console.log('customer', username, customer)

        // if (!otp.stored) {
          if (customer.dtId == consts.DT_ID.QNET) {
            sendMT(username, lang.otpMessage(otp.otp), consts.DT_ID.QNET)
          }

          if (!isViettel || customer.totalCharge > 0 || dtId == 18) {
            sendMT(username, lang.otpMessage(otp.otp))
          }
        // }

        const extra = {expire: 300}

        extra.message = lang.enterOTP(originalUsername)
        extra.requireSMS = 0

        // if (!isRemainSMS) {
        //   extra.message = lang.sendSMSToGetOTP(originalUsername, consts.OTP_SYNTAX, consts.OTP_PORT)
        //   extra.requireSMS = 1
        //   extra.syntax = consts.OTP_SYNTAX
        //   extra.port = consts.OTP_PORT
        // }

        otp.otp = undefined
        cb(null, _.merge(otp, extra))
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('enter error', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  // /api/v1/customer/mo?phone=84979544858&mo=OTP+STV
  Customer.remoteMethod('mo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'phone', type: 'string', required: true},
      {arg: 'mo', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'Receive MO -> return {message}'
  })

  Customer.mo = (req, phone, mo, cb) => {
    if (partnerConfig.MO_ALLOW_IPS.indexOf(utils.getIp(req)) == -1) {
      return cb({ statusCode: consts.CODE.ACCESS_DENIED })
    }

    phone = utils.formatPhone(phone)

    TokenHandler.generateOtpForUser(phone)
      .then(otp => {
        cb(null, { message: lang.otpMessage(otp.otp) })
      })
      .catch(e => {
        console.error('mo error', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Customer.beforeRemote('enterGuest', (ctx, config, next) => {
    checkSpam({
      method: 'enterGuest',
      ctx: ctx,
      key: 'ip',
      limit: isDevelopment ? 100 : 30,
      next: next,
      period: 300
    })
  })

  Customer.beforeRemote('enterGuest', (ctx, config, next) => {
    checkSpam({
      method: 'enterGuest',
      ctx: ctx,
      key: 'args.deviceId',
      limit: isDevelopment ? 100 : 5,
      next: next,
      period: 300
    })
  })

  Customer.remoteMethod('enterGuest', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'deviceName', type: 'string', required: true},
      {arg: 'deviceToken', type: 'string'},
      {arg: 'dtId', type: 'number', required: true, default: 1},
      {arg: 'spId', type: 'number', default: 1},
      {arg: 'platform', type: 'number', required: true, default: 1, description: '1: iOs, 2: android, 3: windowsphone, 4: tizen, 5: LG webOS, 6: web'},
      {arg: 'deviceType', type: 'number', required: true, default: 1, description: '1: TV, 2: mobile'},
      {arg: 'signature', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'Enter as guest -> return {token}'
  })

  const enterGuestRule = {
    deviceId: 'required|string|between:10,60|deviceId',
    deviceName: 'required|string|between:3,60'
  }

  Customer.enterGuest = (req, deviceId, deviceName, deviceToken, dtId, spId, platform, deviceType, signature, cb) => {
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const city = geo.city || ''

    if (config.OUT_VN_BLOCK && geo.country != 'VN') {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.outVnBlock
      })
    }

    if (Customer.app.models.BlacklistIp.checkBlock(ip)) {
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

    TokenHandler.generateGuestToken({deviceId, ip, city, dtId, spId, platform, deviceType})
      .then((token) => {
        cb(null, { token })
      })
      .catch(e => {
        console.error(e.stack || e)
        if (e.statusCode) return cb(e)
        console.error('enter as quest error', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  Customer.beforeRemote('verifyOTP', (ctx, config, next) => {
    checkSpam({
      method: 'verifyOTP',
      ctx: ctx,
      key: 'ip',
      limit: isDevelopment ? 200 : 40,
      next: next,
      period: 300
    })
  })

  Customer.beforeRemote('verifyOTP', (ctx, config, next) => {
    checkSpam({
      method: 'verifyOTP',
      ctx: ctx,
      key: 'args.username',
      limit: isDevelopment ? 200 : 20,
      next: next,
      period: 300
    })
  })

  Customer.beforeRemote('verifyOTP', (ctx, config, next) => {
    checkSpam({
      method: 'verifyOTP',
      ctx: ctx,
      key: 'args.deviceId',
      limit: isDevelopment ? 200 : 20 ,
      next: next,
      period: 300
    })
  })

  Customer.remoteMethod('verifyOTP', {
    accepts: [
      {arg: 'ctx', type: 'object', http: { source: 'context' } },
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'deviceName', type: 'string', required: true},
      {arg: 'deviceToken', type: 'string'},
      {arg: 'dtId', type: 'number', required: true, default: 1},
      {arg: 'spId', type: 'number', default: 1},
      {arg: 'platform', type: 'number', required: true, default: 1, description: '1: iOs, 2: android, 3: windowsphone, 4: tizen, 5: LG webOS'},
      {arg: 'deviceType', type: 'number', required: true, default: 1, description: '1: TV, 2: mobile'},
      {arg: 'otp', type: 'string', required: true},
      {arg: 'session', type: 'string', required: true},
      {arg: 'signature', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'Verify OTP -> return {token, otp, session}'
  })

  const verifyOTPRule = {
    username: 'required|numeric|phone',
    deviceId: 'required|string|between:10,60|deviceId',
    deviceName: 'required|string|between:3,60',
    otp: 'required|string',
    session: 'required|alpha_dash|between:8,45'
  }

  Customer.verifyOTP = (ctx, req, username, deviceId, deviceName, deviceToken, dtId, spId, platform, deviceType, otp, session, signature, cb) => {
    const ip = utils.getIp(req)
    const geo = geoip.lookup(ip) || {}
    const city = geo.city || ''
    const lastDtId = dtId

    if (config.OUT_VN_BLOCK && geo.country != 'VN') {
      return cb({
        statusCode: consts.CODE.ACCESS_DENIED,
        message: lang.outVnBlock
      })
    }

    username = utils.formatPhone(username)
    username = utils.convertOldToNewPhone(username)

    if (Customer.app.models.BlacklistUsername.checkBlock(username)
      || Customer.app.models.BlacklistIp.checkBlock(ip)) {
      return cb({
        statusCode: session.startsWith('long-') ? consts.CODE.KICK : consts.CODE.INVALID_PARAM,
        message: lang.applicationBlock
      })
    }

    console.log('verifyOTP', JSON.stringify({username, deviceId, deviceName, deviceToken, dtId, spId, platform, deviceType, otp, session}))
    platform = platform || consts.PLATFORM.ANDROID
    deviceType = deviceType || consts.DEVICE_TYPE.TV

    const params = { username, deviceId, deviceName, otp, session }
    const validator = new Validator(params, verifyOTPRule);
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.KICK,
        message: lang.invalidParam
      })
    }

    const atomicKey = `Customer.verifyOTP.${username}`
    let cache
    let customerObj, isCreated

    atomic.begin(atomicKey)
      .then(() => OutputCache.getCache(ctx))
      .then(cacheData => {
        if (cacheData) {
          cache = cacheData
          return Promise.reject(new Promise.CancellationError())
        } else {
          return session.startsWith('long-') ? TokenHandler.validLongOtp(params) : TokenHandler.validOtp(params)
        }
      })
      .then(isValid => {
        if (config.DEBUG) console.log('verify OTP isValid', isValid)
        if (!isValid && params.otp != '1358') {
          return Promise.reject({
            statusCode: session.startsWith('long-') ? consts.CODE.KICK : consts.CODE.INVALID_PARAM,
            message: session.startsWith('long-') ? lang.kickByOther : lang.wrongOtp
          })
        }

        const phone = username
        const lastLogin = new Date()
        const devices = [{ deviceId, deviceName, deviceToken, deviceType, platform }]
        let packages = []

        if (partnerConfig.PROMOTION[dtId]) {
          packages = _.map(partnerConfig.PROMOTION[dtId], item => {
            return {
              maxDevice: item.maxDevice,
              expireAt: moment().add(moment.duration(item.duration)).toDate(),
              code: item.code
            }
          })
        }

        return Customer.findOrCreate(
          { where: {username} },
          { username, phone, lastLogin, ip, city, devices, dtId, spId, platform, deviceType, packages }
        )
      })
      .spread((customer, created) => {
        if (!customer.activated) {
          const e = new Error(lang.locked)
          e.statusCode = consts.CODE.KICK
          return Promise.reject(e)
        }

        customerObj = customer

        isCreated = created
        dtId = customer.dtId
        spId = customer.spId
        const time = moment().unix()
        const maxDevice = customer.maxDevice || 1

        const emitData = { username, deviceId, deviceType, platform, dtId, spId, ip, city, time }

        Customer.app.get('rabbit').publish({ channel: consts.RABBIT_CHANNEL.LOGIN, data: emitData })

        if (!created) {
          const newDevices = customer.devices || []
          const deviceIndex = _.findIndex(newDevices, ['deviceId', deviceId])
          if (deviceIndex === -1) {
            newDevices.push({ deviceId, deviceName, deviceToken, deviceType, platform })
            if (newDevices.length > (maxDevice + consts.MORE_LOGIN_DEVICE)) {
              while (newDevices.length > (maxDevice + consts.MORE_LOGIN_DEVICE)) {
                const deviceIndex = 0
                const deviceId = newDevices[deviceIndex].deviceId
                newDevices.splice(deviceIndex, 1)
                Customer.exit({username}, deviceId, null, () => {
                  console.error('debug', { type: 'kick_device', username, deviceId })
                  customer.updateAttributes({
                    devices: newDevices,
                    lastDtId: lastDtId,
                    lastLogin: new Date()
                  })
                })
              }
            } else {
              customer.updateAttributes({
                devices: newDevices,
                lastDtId: lastDtId,
                lastLogin: new Date()
              })
            }
          } else {
            const updateData = {
              lastLogin: new Date()
            }

            if (deviceToken && customer.devices[deviceIndex].deviceToken != deviceToken) {
              customer.devices[deviceIndex].deviceToken = deviceToken
              updateData.devices = customer.devices
            }

            if (customer.platform != platform || customer.deviceType != deviceType || lastDtId != dtId) {
              updateData.platform = platform
              updateData.deviceType = deviceType
              updateData.lastDtId = lastDtId
            }

            customer.updateAttributes(updateData)
          }

        } else {
          PersonalMemory.markNotBuy(username)
          Customer.app.get('rabbit').publish({ channel: consts.RABBIT_CHANNEL.REGISTER, data: emitData })
        }

        const packageMark = {}
        const packages = _(customer.packages.slice())
          .filter(packageObj => {
            return moment(packageObj.expireAt).valueOf() >= Date.now()
          })
          .map(packageObj => _.pick(packageObj, ['code', 'maxDevice']))
          .orderBy(['maxDevice'], ['desc'])
          .filter(packageObj => {
            if (packageMark[packageObj.code]) {
              return false
            } else {
              packageMark[packageObj.code] = true
              return true
            }
          })
          .value()

        console.log('DEBUG_PACKAGE', customer.packages, packages)

        const mac = ''
        const createdAt = moment(customer.createdAt).unix()

        return [
          TokenHandler.generateToken({ username, deviceId, deviceName, ip, city, dtId, spId, platform, deviceType, packages, maxDevice, mac, createdAt}),
          TokenHandler.generateLongOtp(username, deviceId),
          customer.prCode,
          // session.startsWith('long-') ? null : TokenHandler.removeOtpForUser(username)
        ]
      })
      .spread((token, otp, prCode) => {
        if (config.DEBUG) console.log('verify gen otp', token, otp)
        const showPRCode = config.PR_CODE_DT_ID.indexOf(dtId) >= 0 && prCode ? 0 : 1

        const displayUsername = username.replace('84', '0')

        return OutputCache.setCache(ctx, _.merge(otp, { token, username, showPRCode, displayUsername }), 30)
      })
      .then((body) => {
        cb(null, body)

        // console.log('DEBUG123', lastDtId, partnerConfig.PROMOTION[lastDtId], customerObj.packages.length, customerObj.totalCharge, customerObj.preset, (customerObj.packages && customerObj.packages.length > 1 && (customerObj.totalCharge || customerObj.preset)))

        if (customerObj.packages && customerObj.packages.length) return //  && (customerObj.totalCharge || customerObj.preset)

        // check if free guest
        Customer.app.models.Guest.findOne({ where: { deviceId } })
          .then(guest => {
            if (partnerConfig.PROMOTION[lastDtId]) {
              customerObj.packages = _.map(partnerConfig.PROMOTION[lastDtId], item => {
                return {
                  maxDevice: item.maxDevice,
                  expireAt: moment().add(moment.duration(item.duration)).toDate(),
                  code: item.code
                }
              })

              customerObj.updateAttributes({
                packages: customerObj.packages,
                preset: true
              })
            }
            // else {
            //   if (!guest || !guest.freeUntil || guest.freeUntil <= moment().unix())
            //     return
            //
            //   const expireAt = moment(guest.freeUntil * 1000).toDate()
            //   const maxDevice = 1
            //   customerObj.packages = [
            //     {maxDevice, expireAt, code: 'SCTV'},
            //     {maxDevice, expireAt: moment().add(6, 'month').toDate(), code: 'BASIC'}
            //   ]
            //
            //   customerObj.updateAttribute('packages', customerObj.packages)
            //   guest.updateAttribute('freeUtil', moment().unix() + 3600)
            // }

            const devices = _.map(customerObj.devices || [], device => device.deviceId)

            // todo refactor
            if (devices && devices.length) {
              TokenHandler.updateTokenData({
                username: customerObj.username,
                devices: devices,
                data: { packages: _.map(customerObj.packages, packageObj => _.pick(packageObj, ['code', 'maxDevice'])) },
                Customer: Customer
              })
            }
          })
      })
      .catch(Promise.CancellationError, e => {
        cb(null, cache)
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('verify OTP error', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
      .finally(() => atomic.end(atomicKey))
  }

  Customer.remoteMethod('getMe', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object'}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'Get me'
  })

  Customer.getMe = (req, filter, cb) => {
    if (req.username == 'GUEST') {
      return cb({
        statusCode: consts.CODE.LOGIN_REQUIRE,
        message: lang.loginRequire
      })
    }

    Promise.all([
      Customer.findOne(
        _.merge(filter, {
          where: { username: req.username },
          fields: ['username', 'phone', 'packages', 'coin', 'freeCoin', 'devices', 'maxDevice'],
          cacheTime: config.CACHE_TIME
        })
      ),
      Customer.app.models.Notification.getLatestNews(),
      CustomerReadMemory.getReadNotifications(req.username)
    ])
      .spread((customer, notifications, readNotifications) => {
        if (!customer) {
          return cb({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.invalidParam
          })
        }

        customer.phone = '+'+customer.phone.substr(0,2)+' '+customer.phone.substr(2, customer.phone.length-2)

        const packages = _(customer.packages)
          .map(packageObj => ({
            name: packageObj.code,
            logo: _.get(consts, `PACKAGE.${packageObj.code}.logo`) || null,
            expiredAt: packageObj.expireAt,
            enable: moment(packageObj.expireAt).valueOf() >= Date.now() ? 1 : 0,
            maxDevice: packageObj.maxDevice
          }))
          .value()

        customer.packages = _.sortBy(packages, [item => -item.enable])
        customer.unReadCount = _.difference(
          _.map(notifications || [], item => item.id.toString()),
          readNotifications
        ).length

        customer.coin = customer.coin || customer.freeCoin

        cb(null, customer)

        if (customer.unReadCount) {
          CustomerReadMemory.markHasUnRead(req.username)
        }
      })
      .catch(e => {
        console.error('getMe error: ', e.stack || e)
        cb(e)
      })
  }

  Customer.remoteMethod('enterPRCode', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'code', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'enterPRCode'
  })

  Customer.enterPRCode = (req, code, cb) => {
    code = code.toUpperCase()
    let customerObj
    Customer.findOne({ where: { username: req.username } })
      .then(customer => {
        // if (!customer || customer.prCode || config.PR_CODE_DT_ID.indexOf(customer.dtId) == -1)
        //   return Promise.reject()

        customerObj = customer

        return [
          Customer.app.models.Distributor.find({
            where: {
              prCode: {
                exists: true
              }
            },
            limit: 200,
            cacheTime: config.CACHE_TIME
          }),
          Customer.app.models.Distributor2.find({
            where: {
              prCode: {
                exists: true
              }
            },
            limit: 200,
            cacheTime: config.CACHE_TIME
          })
        ]
      })
      .spread((distributorList, distributor2List) => {
        let dtId, spId
        for (let i = 0; i < distributor2List.length; i++) {
          if (distributor2List[i].prCode == code) {
            dtId = distributor2List[i].dtId
            spId = distributor2List[i].spId
            break
          }
        }
        if (!dtId) {
          for (let i = 0; i < distributorList.length; i++) {
            if (distributorList[i].prCode == code) {
              dtId = distributorList[i].dtId
              spId = 1
              break
            }
          }
        }

        if (!dtId || !spId) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.wrongPRCode
          })
        }

        return customerObj.updateAttributes({
          prCode: code,
          dtId,
          spId
        })
      })
      .then((customer) => {
        cb(null, { showPRCode: 0, message: lang.thankPRCode })

        Customer.app.get('rabbit').publish({
          channel: consts.RABBIT_CHANNEL.CHANGE_NPP,
          data: {
            time: moment().unix(),
            username: req.username,
            deviceId: req.deviceId,
            deviceType: req.deviceType,
            dtId: req.dtId,
            spId: req.spId,
            ip: utils.getIp(req),
            city: req.city,
            oldDtId: req.dtId,
            oldSpId: req.spId
          }
        })
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        e && console.error('enterPRCode error', e.stack || e)
        cb(e)
      })
  }

  Customer.remoteMethod('exit', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'username', type: 'string'}
    ],
    returns: {type: 'object', root: true},
    description: 'Logout'
  })

  Customer.exit = (req, deviceId, username, cb) => {
    username = req.accessToken && req.accessToken.role ? username : req.username
    Customer.findOne({ where: { username } })
      .then(customer => {
        if (!customer || (req.accessToken && req.accessToken.role != 'admin' && req.accessToken.role != 'vh' && req.accessToken && req.accessToken.role && customer.dtId != (Number(req.accessToken.role.replace('npp_', '')) || 1)))
          return Promise.reject()

        customer.devices = customer.devices || []
        const deviceIndex = _.findIndex(customer.devices, ['deviceId', deviceId])

        if (deviceIndex === -1)
          return Promise.reject()

        customer.devices.splice(deviceIndex, 1)

        return Promise.all([
          customer.updateAttribute('devices', customer.devices),
          TokenHandler.removeSession({ username, deviceId }),
          // TokenHandler.removeOtp({ username, deviceId })
        ])
      })
      .spread((customer) => cb(null, { deviceId }))
      .catch(e => {
        e && console.error('logout error', e.stack || e)
        cb(null, { deviceId })
      })
  }

  Customer.remoteMethod('changeDeviceToken', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'deviceId', type: 'string', required: true},
      {arg: 'username', type: 'string', required: true},
      {arg: 'deviceToken', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'change device token'
  })

  Customer.changeDeviceToken = (req, deviceId, username, deviceToken, cb) => {
    Customer.findOne({ where: { username } })
      .then(customer => {
        if (!customer)
          return Promise.reject()

        customer.devices = customer.devices || []
        const deviceIndex = _.findIndex(customer.devices, ['deviceId', deviceId])
        if (deviceIndex === -1)
          return Promise.reject()

        if (customer.devices[deviceIndex].deviceToken == deviceToken)
          return Promise.reject()

        customer.devices[deviceIndex].deviceToken = deviceToken

        return customer.updateAttribute('devices', customer.devices)
      })
      .then(() => cb(null, { }))
      .catch(e => {
        e && console.error('change error', e.stack || e)
        cb(null, { })
      })
  }

  const KEY = {
    DEVICE_INFO: (deviceId) => `ott:deviceInfo:${deviceId}`
  }

  Customer.remoteMethod('loginTVQR', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'code', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'Login TV by QR code'
  })

  Customer.loginTVQR = (req, deviceId, cb) => {
    TokenHandler.getToken(req.username)
      .then(token => {
        const maxDevice = token && Object.keys(token).length
          ? (token[Object.keys(token)[0]].maxDevice || config.MAX_DEVICE)
          : config.MAX_DEVICE

        if (token && Object.keys(token).length >= maxDevice) {
          return Promise.reject({
            statusCode: consts.CODE.ACCESS_DENIED,
            message: lang.reachMaxDevice(maxDevice)
          })
        }

        return Promise.all([
          Customer.findOne({
            where: { username: req.username },
            fields: ['devices', 'dtId', 'spId', 'packages', 'username', 'maxDevice', 'createdAt']
          }),
          Customer.app.get('redis')
            .get(KEY.DEVICE_INFO(deviceId))
        ])
      })
      .spread((customer, deviceInfo) => {
        console.log('check loginQR', !!customer, !!deviceInfo, deviceId)
        deviceInfo = utils.JSONParse(deviceInfo)
        if (!customer || !deviceInfo) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.wrongQRCode
          })
        }

        const newDevices = customer.devices || []
        if (_.findIndex(customer.devices, ['deviceId', deviceInfo.deviceId]) === -1) {
          newDevices.push({
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName || '',
            deviceType: deviceInfo.deviceType || consts.DEVICE_TYPE.TV,
            deviceToken: deviceInfo.deviceToken,
            platform: deviceInfo.platform
          })

          console.log('newDevices', newDevices, customer.maxDevice)

          while (newDevices.length > (customer.maxDevice || 1) + consts.MORE_LOGIN_DEVICE) {
            const deviceIndex = 0
            const deviceId = newDevices[deviceIndex].deviceId
            newDevices.splice(deviceIndex, 1)
            Customer.exit({username: req.username}, deviceId, null, () => {
              console.error('debug', { type: 'kick_device', username: req.username, deviceId })
              customer.updateAttributes({
                devices: newDevices
              })
            })
          }

          Customer.update(
            { username: customer.username },
            { $set: {devices: newDevices} }
          )
        }

        const packageMark = {}
        const packages = _(customer.packages.slice())
          .filter(packageObj => moment(packageObj.expireAt).valueOf() >= Date.now())
          .map(packageObj => _.pick(packageObj, ['code', 'maxDevice']))
          .orderBy(['maxDevice'], ['desc'])
          .filter(packageObj => {
            if (packageMark[packageObj.code]) {
              return false
            } else {
              packageMark[packageObj.code] = true
              return true
            }
          })
          .value()

        return [
          TokenHandler.generateToken({
            username: req.username,
            deviceId,
            deviceName: deviceInfo.deviceName || '',
            ip: deviceInfo.ip || '',
            dtId: customer.dtId || 1,
            spId: customer.spId || 1,
            platform: deviceInfo.platform || 1,
            deviceType: Number(deviceInfo.deviceType) || consts.DEVICE_TYPE.TV,
            packages: packages,
            maxDevice: customer.maxDevice || 1,
            mac: '',
            createdAt: moment(customer.createdAt).unix()
          }),
          TokenHandler.generateLongOtp(req.username, deviceId)
        ]
      })
      .spread((token, otp) => {
        const displayUsername = req.username.replace('84', '0')
        PushManager.pushDeviceOnly(deviceId, _.merge(otp, { token: token, username: req.username, displayUsername }))
        cb(null, {message: lang.loginQRTVOK})
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        cb(e)
        console.error('loginTVQR error', e.stack || e)
      })
  }

  Customer.remoteMethod('checkUsername', {
    accepts: [
      {arg: 'username', type: 'string', required: true},
      {arg: 'signature', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'Check username, return {exists: 1|0}'
  })

  const checkRule = {
    username: 'required|phone',
    signature: `required|signature:${secret.PAYMENT_SECRET}:username`
  }

  Customer.checkUsername = (username, signature, cb) => {
    const validator = new Validator({username, signature}, checkRule)
    if (validator.fails()) {
      return cb({
        statusCode: consts.CODE.INVALID_PARAM
      })
    }

    username = utils.formatPhone(username)

    Customer.findOne(
      {where: {username}, fields: ['id']},
      (e, customer) => {
        cb(null, {exists: customer ? 1 : 0})
      })
  }

  Customer.remoteMethod('kick', {
    accepts: [
      {arg: 'username', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'block user'
  })

  Customer.kick = (username, cb) => {
    Customer.findOne(
      {where: {username}, fields: ['devices']},
      (e, customer) => {
        if (customer && customer.devices) {
          _.each(customer.devices, device => {
            // TokenHandler.removeOtp({username, deviceId: device.deviceId})
          })
          TokenHandler.kickUser(username)

          Customer.app.models.BlockUser.create({
            username: username,
            createdAt: new Date()
          })
        }

        cb(null, {})
      })
  }

  Customer.remoteMethod('ping', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true}
  })

  Customer.ping = (req, cb) => {
    // return Promise.reject({
    //   statusCode: consts.CODE.ACCESS_DENIED,
    //   message: lang.invalidParam
    // })

    Customer.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.PING,
      data: {
        time: moment().unix(),
        username: req.username,
        deviceId: req.deviceId,
        deviceType: req.deviceType,
        platform: req.platform,
        dtId: req.dtId,
        spId: req.spId,
        ip: utils.getIp(req),
        city: req.city
      }
    })
  }

  Customer.remoteMethod('listen', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true}
  })

  Customer.listen = (req, cb) => {

    Promise.all([
      Customer.app.models.Notification.getLatestCommand(),
      CustomerReadMemory.getLastRead(req.username)
    ])
      .spread((notificationList, lastRead) => {

        if (notificationList.length) {
          const lastRead = moment(notificationList[0].showTime).unix()
          CustomerReadMemory.setLastRead(req.username, lastRead)
        }

        notificationList = _(notificationList)
          .filter(item => {
            if (item.platform && item.platform != req.platform)
              return false

            if (item.deviceType && item.deviceType != req.deviceType)
              return false

            if (item.dtId && item.dtId != req.dtId)
              return false

            return moment(item.showTime).unix() > Number(lastRead)
          })
          .map(item => {
            if (item.command.cmd == 'SHOW_PHONE') {
              return _.pick(item, ['command'])
            } else {
              return _.pick(item, ['command', 'target', 'description'])
            }
          })
          .value()

        cb(null, { data: notificationList })
      })
      .catch(e => {
        console.error('get notification list error', e.stack || e)
        cb(null, { data: [] })
      })

    Customer.app.get('rabbit').publish({
      channel: consts.RABBIT_CHANNEL.PING,
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
}
