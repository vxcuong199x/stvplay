'use strict'

const _ = require('lodash')
const moment = require('moment')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const Validator = require('../lib/validator')
const checkSpam = require('../utils/check-spam')
const PushManager = require('../services/push-manager')
const Payment = require('../logic/payment')
const PayGate = require('../services/pay-gate')
const Momo = require('../services/momo-service')

const ejs = require('ejs')
const historyEjs = require('fs').readFileSync(require('path').join(__dirname, '../html-template/transaction.ejs'))
const historyView = ejs.compile(historyEjs.toString(), { delimiter: '?' })
const numeral = require('numeral')
numeral.locale('vi')

module.exports = function(PackageGroup) {

  PackageGroup.remoteMethod('getList', {
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get all package group'
  })

  PackageGroup.getList = (cb) => {
    // return cb({
    //   statusCode: consts.CODE.INVALID_PARAM,
    //   message: 'Trân trọng thông báo: Dịch vụ đã được nâng cấp lên phiên bản mới mang tên Truyền hình ON - dịch vụ của VTVcab (Hay còn gọi là VTVcab ON). Trân trọng kính mời Quý khách chuyển sang VTVcab ON để có sự trải nghiệm giải trí tốt nhất. Hotline: 1900585868. Chúng tôi thành thật xin lỗi vì sự bất tiện này. Chân thành cảm ơn rất nhiều!'
    // })

    PackageGroup.find({ where: {activated: true}, cacheTime: config.CACHE_TIME })
      .then(list => {
        _.forEach(list, (item, i) => {
          list[i].logos = _.map(item.packages, code => consts.PACKAGE[code].logo)
          list[i].packages = undefined
        })

        cb(null, { data: _.sortBy(list, 'rank') })
      })
      .catch(e => {
        console.error('get list package group err', e.stack || e)
        cb(null, [])
      })
  }

  PackageGroup.beforeRemote('buyPackageCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyPackageCard',
      ctx: ctx,
      key: 'ip',
      limit: 25,
      next: next
    })
  })

  PackageGroup.beforeRemote('buyPackageCard', (ctx, config, next) => {
    checkSpam({
      method: 'buyPackageCard',
      ctx: ctx,
      key: 'req.username',
      limit: 10,
      next: next
    })
  })

  PackageGroup.remoteMethod('buyPackageCard', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true},
      {arg: 'telco', type: 'number', required: true, description: 'Nhà mạng (1: mobi, 2: viettel, 3: vina, 4: FPT)'},
      {arg: 'serial', type: 'string', required: true},
      {arg: 'pin', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package by use card'
  })

  const cardRule = {
    serial: 'required|alpha_dash|between:8,15',
    pin: 'required|alpha_dash|between:8,15',
    groupId: 'required|alpha_dash',
    packageTypeId: 'required|alpha_dash'
  }

  PackageGroup.buyPackageCard = (req, groupId, time, packageTypeId, telco, serial, pin, cb) => {
    serial = (serial || '').trim().replace(' ', '')
    pin = (pin || '').trim().replace(' ', '')
    const validator = new Validator({groupId, packageTypeId, serial, pin}, cardRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyPackage({ req, groupId, time, packageTypeId, telco, serial, pin, buyType: consts.TRANSACTION_TYPE.BUY_CARD })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyPackageCard err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  PackageGroup.remoteMethod('buyPackageCoin', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package by coin'
  })

  const coinRule = {
    groupId: 'required|alpha_dash',
    packageTypeId: 'required|alpha_dash'
  }

  PackageGroup.buyPackageCoin = (req, groupId, time, packageTypeId, cb) => {
    const validator = new Validator({groupId, packageTypeId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .buyPackage({ req, groupId, time, packageTypeId, buyType: consts.TRANSACTION_TYPE.BUY_COIN })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('buyPackageCoin err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  PackageGroup.remoteMethod('getNotice', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: '{notice, action(1: next, 2: buy_coin)}'},
    http: {verb: 'get'},
    description: 'Get notice when buy package'
  })

  PackageGroup.getNotice = (req, groupId, time, packageTypeId, cb) => {
    const validator = new Validator({groupId, packageTypeId}, coinRule)
    if (validator.fails()) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    Payment
      .calculatePackageAmount({ groupId, packageTypeId, time, username: req.username })
      .then(({ group, totalAmount, requireAmount }) => {

        if (requireAmount <= 0) {
          const month = moment.duration(time).asMonths()

          cb(null, {
            notice: lang.enoughCoinByPackage(group.name, month) + lang.registerConfirm,
            action: consts.PACKAGE_ACTION.BUY_COIN,
            amount: 0
          })
        } else {
          cb(null, {
            notice: '',
            action: req.deviceType === consts.DEVICE_TYPE.MOBILE ? consts.ACTION.GO_BUY_PACKAGE : consts.PACKAGE_ACTION.NEXT, // todo check when new mobile version
            amount: requireAmount
          })
        }
      })
      .catch(e => {
        console.error('getNotice err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  PackageGroup.remoteMethod('buyPackageBank', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true},
      {arg: 'bankCode', type: 'string'}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package bank'
  })

  PackageGroup.buyPackageBank = (req, groupId, time, packageTypeId, bankCode, cb) => {
    const month = moment.duration(time).asMonths()
    const validator = new Validator({groupId, packageTypeId}, coinRule)
    if (validator.fails() || !consts.PACKAGE_BONUS.hasOwnProperty(month.toString())) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    console.log('TEST_OK')

    cb(null, { link: 'https://www.vtvcab.vn/pay/qnet' })

    // const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    // const orderInfo = [groupId, packageTypeId, time, reqObj, consts.CLIENT_COMMAND.BUY_PACKAGE]

    // Payment
    //   .calculatePackageAmount({ groupId, packageTypeId, time, username: req.username })
    //   .then(({ requireAmount }) => {
    //     // todo remove
    //     // if (req.username === '841659013924')
    //     // setTimeout(function() {
    //     //   PushManager.pushDevice(req.username, req.deviceId, {
    //     //     cmd: consts.CLIENT_COMMAND.BUY_PACKAGE,
    //     //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
    //     //   })
    //     // }, 5000)
    //
    //     return PayGate.getBankLink({
    //       username: req.username,
    //       amount: requireAmount,
    //       bankCode: (req.deviceType === consts.DEVICE_TYPE.MOBILE ? 'all' : 'VNPAYQR'),
    //       ip: utils.getIp(req),
    //       orderInfo: new Buffer(JSON.stringify(orderInfo)).toString('base64')
    //     })
    //   })
    //   .then(link => cb(null, { link }))
    //   .catch(e => {
    //     console.error('buyPackageBank err', e.stack || e)
    //     cb({ statusCode: consts.CODE.SERVER_ERROR })
    //   })
  }

  PackageGroup.remoteMethod('buyPackageMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package momo'
  })

  PackageGroup.buyPackageMomo = (req, groupId, time, packageTypeId, cb) => {
    const month = moment.duration(time).asMonths()
    const validator = new Validator({groupId, packageTypeId}, coinRule)
    if (validator.fails() || !consts.PACKAGE_BONUS.hasOwnProperty(month.toString())) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    let orderInfo = [groupId, packageTypeId, time, reqObj, consts.CLIENT_COMMAND.BUY_PACKAGE]
    let amount, orderId

    Payment
      .calculatePackageAmount({ groupId, packageTypeId, time, username: req.username })
      .then(({ requireAmount }) => {
        // todo remove
        // if (req.username === '841659013924')
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_PACKAGE,
        //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
        //   })
        // }, 76000)

        orderId = consts.PAYMENT_METHOD.MOMO.partnerCode + '_' + Date.now()
        orderInfo = new Buffer(JSON.stringify(orderInfo)).toString('base64')
        amount = requireAmount
        return Payment.setOrderInfo(orderId, orderInfo)
      })
      .then(() => {
        return Momo.getQR({
          username: req.username,
          orderInfo: `Phone: ${req.username}, Price: ${amount}`,
          amount,
          orderId
        })
      })
      .then(qrCode => cb(null, { qrCode, expireIn: 300, link: config.MOMO_WEBVIEW_URL(qrCode, 300, amount) }))
      .catch(e => {
        console.error('buyPackageMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  PackageGroup.remoteMethod('buyPackageVerifyMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'orderId', type: 'string', required: true},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true},
      {arg: 'customerNumber', type: 'string', required: true},
      {arg: 'customerUsername', type: 'string', required: true},
      {arg: 'appData', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true, description: 'customer data'},
    description: 'Buy package verify momo'
  })

  PackageGroup.buyPackageVerifyMomo = (req, orderId, groupId, time, packageTypeId, customerNumber, customerUsername, appData, cb) => {
    const month = moment.duration(time).asMonths()
    const validator = new Validator({groupId, packageTypeId}, coinRule)
    if (validator.fails() || !consts.PACKAGE_BONUS.hasOwnProperty(month.toString())) {
      if (config.DEBUG) console.error(validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    const reqObj = [req.dtId, req.spId, req.deviceType, req.deviceId, utils.getIp(req)]
    // const orderInfo = [groupId, packageTypeId, time, reqObj, consts.CLIENT_COMMAND.BUY_PACKAGE]
    let amount

    Payment
      .calculatePackageAmount({ groupId, packageTypeId, time, username: req.username })
      .then(({ totalAmount, requireAmount }) => {
        // todo remove
        // setTimeout(function() {
        //   PushManager.pushDevice(req.username, req.deviceId, {
        //     cmd: consts.CLIENT_COMMAND.BUY_PACKAGE,
        //     data: { code: consts.AFTER_BUY_CODE.ENOUGH, message: 'Thành công' }
        //   })
        // }, 76000)

        amount = Number(requireAmount)

        return Momo.verify({
          username: req.username,
          orderInfo: `Phone: ${req.username}, Price: ${amount}`,
          amount,
          orderId,
          customerNumber,
          customerUsername,
          appData
        })
      })
      .then(result => {
        if (!result || result.status) {
          return Promise.reject(result)
        }

        return Payment
          .buyPackage({ req, groupId, time, packageTypeId, amount: Number(result.amount), buyType: consts.TRANSACTION_TYPE.MOMO })
      })
      .then(result => cb(null, { data: result }))
      .catch(e => {
        console.error('buyPackageMomo err', e.stack || e)
        cb({ statusCode: consts.CODE.SERVER_ERROR })
      })
  }

  PackageGroup.remoteMethod('getListChannel', {
    accepts: [
      {arg: 'packageId', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Get all package channel'
  })

  PackageGroup.getListChannel = (packageId, cb) => {
    PackageGroup.findById(packageId, { cacheTime: config.CACHE_TIME })
      .then(packageInfo => {
        return PackageGroup.app.models.Channel.find({
          where: {
            packageCode: {inq: packageInfo.packages},
            activated: true
          },
          cacheTime: config.CACHE_TIME,
          limit: 20
        })
      })
      .then(list => {
        cb(null, _.map(list, item => item.logo))
      })
      .catch(e => {
        console.error('get list package channel err', e.stack || e)
        cb(null, [])
      })
  }

  PackageGroup.remoteMethod('getTransactionData', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get transaction data'
  })

  PackageGroup.getTransactionData = (req, cb) => {
    PackageGroup.app.models.Transaction
      .find({where: {username: req.username}, limit: 50, order: 'createdAt DESC'})
      .then(transactions => {
        transactions = transactions || []
        cb(null, {
          data: transactions
        })
      })
      .catch(e => {
        console.error(e.stack || e)
        cb(null, {data: ''})
      })
  }

  PackageGroup.remoteMethod('getTransaction', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get transaction'
  })

  PackageGroup.getTransaction = (req, cb) => {
    PackageGroup.app.models.Transaction
      .find({where: {username: req.username}, limit: 50, order: 'createdAt DESC'})
      .then(transactions => {
        transactions = transactions || []
        cb(null, {
          data: historyView({
            data: transactions || [],
            numeral: numeral,
            moment: moment,
            transactionMap: consts.TRANSACTION_MAP,
            transactionStatusMap: consts.TRANSACTION_STATUS_MAP
          })
        })
      })
      .catch(e => {
        console.error(e.stack || e)
        cb(null, {data: ''})
      })
  }
}
