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

  Customer.remoteMethod('onBank', {
    accepts: [
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'username', type: 'string', required: true},
      {arg: 'amount', type: 'number', required: true},
      {arg: 'orderId', type: 'string', required: true},
      {arg: 'orderInfo', type: 'string', required: true},
      {arg: 'signature', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'Send bank result, return {}'
  })

  const onBankRule = {
    username: 'required|phone',
    amount: 'required|numeric',
    orderId: 'required',
    signature: `required|signature:${secret.PAYMENT_SECRET}:username,amount,orderId`
  }

  Customer.onBank = (reqFromBankServer, username, amount, orderId, orderInfo, signature, cb) => {
    const validator = new Validator({username, amount, orderId, signature}, onBankRule)
    if (validator.fails()) {
      return cb({statusCode: consts.CODE.INVALID_PARAM})
    }

    if (partnerConfig.BANK_ALLOW_IPS.indexOf(utils.getIp(reqFromBankServer)) == -1) {
      return cb({statusCode: consts.CODE.ACCESS_DENIED})
    }

    const buffer = new Buffer(orderInfo, 'base64').toString('ascii')

    orderInfo = utils.JSONParse(buffer, [])

    let buyOperator
    let reqObj, cmd
    let dtId, spId, deviceType, deviceId, clientIp, req, buyParams
    const buyType = consts.TRANSACTION_TYPE.BANK

    console.log('orderInfo', orderInfo)

    switch (orderInfo[orderInfo.length - 1]) {
      case consts.CLIENT_COMMAND.BUY_PACKAGE:
        let groupId, packageTypeId, time
        [groupId, packageTypeId, time, reqObj, cmd] = orderInfo;

        if (!groupId) {
          return cb(null, {result: consts.CODE.INVALID_PARAM})
        }

        [dtId, spId, deviceType, deviceId, clientIp] = reqObj
        req = {username, dtId, spId, deviceType, deviceId, clientIp}
        buyParams = {req, groupId, time, packageTypeId, amount, buyType}

        buyOperator = Payment.buyPackage.bind(Payment, buyParams)
        break

      case consts.CLIENT_COMMAND.BUY_MOVIE:
        let movieId
        [movieId, reqObj, cmd] = orderInfo;

        if (!movieId) {
          return cb(null, {result: consts.CODE.INVALID_PARAM})
        }

        [dtId, spId, deviceType, deviceId, clientIp] = reqObj
        req = {username, dtId, spId, deviceType, deviceId, clientIp}
        buyParams = {req, movieId, amount, buyType}

        buyOperator = Payment.buyMovie.bind(Payment, buyParams)
        break

      case consts.CLIENT_COMMAND.BUY_CLIP:
        let clipId
        [clipId, reqObj, cmd] = orderInfo;

        if (!clipId) {
          return cb(null, {result: consts.CODE.INVALID_PARAM})
        }

        [dtId, spId, deviceType, deviceId, clientIp] = reqObj;
        req = {username, dtId, spId, deviceType, deviceId, clientIp}
        buyParams = {req, clipId, amount, buyType}

        buyOperator = Payment.buyClip.bind(Payment, buyParams)
        break
    }

    buyOperator()
      .then(result => {
        PushManager.pushDevice(req.username, req.deviceId, {
          cmd: cmd,
          data: result
        })

        cb(null, {ec: 0})
      })
      .catch(e => {
        console.error('onBank err', e.stack || e)
        cb(null, {ec: 500})
      })
  }

  Customer.remoteMethod('onMomo', {
    accepts: [
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'partnerCode', type: 'string', required: true},
      {arg: 'accessKey', type: 'string', required: true},
      {arg: 'requestId', type: 'string', required: true},
      {arg: 'amount', type: 'string', required: true},
      {arg: 'orderId', type: 'string', required: true},
      {arg: 'orderInfo', type: 'string', required: true},
      {arg: 'orderType', type: 'string', required: true},
      {arg: 'transId', type: 'string', required: true},
      {arg: 'errorCode', type: 'string', required: true},
      {arg: 'message', type: 'string', required: true},
      {arg: 'localMessage', type: 'string', required: true},
      {arg: 'payType', type: 'string', required: true},
      {arg: 'responseTime', type: 'string', required: true},
      {arg: 'extraData', type: 'string'},
      {arg: 'signature', type: 'string', required: true},
    ],
    returns: {type: 'object', root: true},
    description: 'Send momo result, return {}'
  })

  Customer.onMomo = (reqFromMomoServer, partnerCode, accessKey, requestId, amount, orderId, orderInfo, orderType, transId, errorCode, message, localMessage, payType, responseTime, extraData, signature, cb) => {

    if (partnerConfig.MOMO_ALLOW_IPS.indexOf(utils.getIp(reqFromMomoServer)) == -1) {
      return cb({statusCode: consts.CODE.ACCESS_DENIED})
    }

    const output = {
      partnerCode,
      accessKey,
      requestId,
      orderId,
      errorCode: Momo.getErrorCode().TRAN_NOT_EXISTS_OR_WRONG_PARAM,
      message,
      responseTime
    }
    output.signature = utils.hmacSha256(utils.objectToString(output), Momo.getSecret())

    // check signature
    const inputParams = {
      partnerCode,
      accessKey,
      requestId,
      amount,
      orderId,
      orderInfo,
      orderType,
      transId,
      message,
      localMessage,
      responseTime,
      errorCode,
      payType,
      extraData
    }
    if (errorCode != 0 || signature !== utils.hmacSha256(utils.objectToString(inputParams), Momo.getSecret())) {
      console.error('onMomo wrong token: ', signature, utils.hmacSha256(utils.objectToString(inputParams), Momo.getSecret()))
      return cb(null, output)
    }

    const username = extraData
    let dtId, spId, deviceType, deviceId, clientIp, req, buyParams, reqObj, cmd

    Payment.getOrderInfo(orderId)
      .then(orderInfo => {
        if (!orderInfo) {
          return cb(null, output)
        }

        const buffer = new Buffer(orderInfo, 'base64').toString('ascii')

        orderInfo = utils.JSONParse(buffer, [])

        let buyOperator
        const buyType = consts.TRANSACTION_TYPE.MOMO

        console.log('orderInfo', orderInfo)

        switch (orderInfo[orderInfo.length - 1]) {
          case consts.CLIENT_COMMAND.BUY_PACKAGE:
            let groupId, packageTypeId, time
            [groupId, packageTypeId, time, reqObj, cmd] = orderInfo;

            if (!groupId) {
              return cb(null, {result: consts.CODE.INVALID_PARAM})
            }

            [dtId, spId, deviceType, deviceId, clientIp] = reqObj
            req = {username, dtId, spId, deviceType, deviceId, clientIp}
            buyParams = {req, groupId, time, packageTypeId, amount, buyType}

            buyOperator = Payment.buyPackage.bind(Payment, buyParams)
            break

          case consts.CLIENT_COMMAND.BUY_MOVIE:
            let movieId
            [movieId, reqObj, cmd] = orderInfo;

            if (!movieId) {
              return cb(null, {result: consts.CODE.INVALID_PARAM})
            }

            [dtId, spId, deviceType, deviceId, clientIp] = reqObj
            req = {username, dtId, spId, deviceType, deviceId, clientIp}
            buyParams = {req, movieId, amount, buyType}

            buyOperator = Payment.buyMovie.bind(Payment, buyParams)
            break

          case consts.CLIENT_COMMAND.BUY_CLIP:
            let clipId
            [clipId, reqObj, cmd] = orderInfo;

            if (!clipId) {
              return cb(null, {result: consts.CODE.INVALID_PARAM})
            }

            [dtId, spId, deviceType, deviceId, clientIp] = reqObj;
            req = {username, dtId, spId, deviceType, deviceId, clientIp}
            buyParams = {req, clipId, amount, buyType}

            buyOperator = Payment.buyClip.bind(Payment, buyParams)
            break
        }

        return buyOperator()
      })
      .then(result => {
        PushManager.pushDevice(username, deviceId, {
          cmd: cmd,
          data: result
        })

        Payment.removeOrderInfo(orderId)

        output.errorCode = Momo.getErrorCode().SUCCESS
        output.signature = utils.hmacSha256(queryString.stringify(output), Momo.getSecret())

        cb(null, output)
      })
      .catch(e => {
        console.error('onMomo err', e.stack || e)
        cb(null, {errorCode: 500})
      })
  }
}
