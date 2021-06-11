'use strict'

const hmacSha256 = require('crypto-js/hmac-sha256')
const queryString = require('querystring')
const NodeRSA = require('node-rsa')
const Promise = require('bluebird')
const axios = require('axios')
const _ = require('lodash')
const moment = require('moment')
const config = require('../config/config')
const consts = require('../config/consts')
const getRedis = require('../utils/get-redis')
const utils = require('../utils/utils')

const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----' +
  'MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAou4ncq+hLOazTSaY9zWi' +
  'VLpAVzq8cUMbF1CqnovCBWeSPX38+9DvhAWl+AwvR4ELsaW7hQxI9uCUyl/73qMD' +
  '+DZ8q1OEhG8XHz42Nj4PwbDKJaZY9XGrKIJshfhdFVTCajtCCI7romTyWOVIA3HX' +
  'vK8+bXXDiz1vmfCPAlER8Jta4AUf3BvC8LzGOHVjwrvuYbYjW338GAozWHuauKuS' +
  'OF0/vPhdGwUW4+W/HEEZVW5zkYv/4vgcXmsdnU4p2/rihiXNcWaAqRL4kuVkpQMg' +
  'wwWkVj21/qnpW5TMvw7cTCwZGedJ6zQTFu1gKE+svG+m5Q/NxsEhfGzVZqQ1irN+' +
  '0o72Aix56mw1sbE+1elTNiMIxVYDGCUqUt3wPplGg19DTOpLn3HFdMBdNvxb6gR0' +
  'TJPlhnYC+JJxcztbvK/rw0vs7pIosNzlotqu9eCvOOZnHhdjuvJLRjVYY4pYoUk3' +
  'SgyunI34yIYWxK+IUQt3VRyDlCFp/PvIPSf3gOE/i3fLf4kIZOtUgbMZ60klb9c+' +
  'HppVcnsgewwB/f7rLwGnU64gnL4fkT5MfVI1WU7q9CZ15BKZX78DElC+VuROFaKJ' +
  'mOkVfT0zZV80AzkCxsXCtOZdisZ0xSv7g2ngkr6T59vnUX8gec1HM33fH6PuHnSX' +
  'F/5FUcpao9/uNrVEG82fYw8CAwEAAQ==' +
  '-----END PUBLIC KEY-----'
// const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----' +
//   'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkpa+qMXS6O11x7jBGo9W' +
//   '3yxeHEsAdyDE40UoXhoQf9K6attSIclTZMEGfq6gmJm2BogVJtPkjvri5/j9mBnt' +
//   'A8qKMzzanSQaBEbr8FyByHnf226dsLt1RbJSMLjCd3UC1n0Yq8KKvfHhvmvVbGcW' +
//   'fpgfo7iQTVmL0r1eQxzgnSq31EL1yYNMuaZjpHmQuT24Hmxl9W9enRtJyVTUhwKh' +
//   'tjOSOsR03sMnsckpFT9pn1/V9BE2Kf3rFGqc6JukXkqK6ZW9mtmGLSq3K+JRRq2w' +
//   '8PVmcbcvTr/adW4EL2yc1qk9Ec4HtiDhtSYd6/ov8xLVkKAQjLVt7Ex3/agRPfPr' +
//   'NwIDAQAB' +
//   '-----END PUBLIC KEY-----'
//fs.readFileSync(require('path').join(__dirname, '../certificate/momo.txt'), 'utf-8')
const PARTNER_CODE = 'MOMO48AS20181010' // consts.PAYMENT_METHOD.MOMO.partnerCode
const ACCESS_KEY = 'zdvWxrQOTY9b1pab' //'SvDmj2cOTYZmQQ3H'
const SECRET_KEY = 'VJPwCfyxXZDW8wrF9nql05RzFe1VjXu0' //'PPuDXq1KowPT1ftR8DvlQTHhC03aul17'
const BASE_URL = 'https://payment.momo.vn' //https://test-payment.momo.vn
const ERROR_CODE = {
  SUCCESS: 0,
  TRAN_NOT_EXISTS_OR_WRONG_PARAM: -1
}

const KEYS = {
  CHECK_TRANSACTION: 'ott:momo-transaction'
}

module.exports = class MomoService {
  static getSecret() { return SECRET_KEY }

  static getErrorCode() { return ERROR_CODE }

  static getQR({ username, orderId, orderInfo, amount }) {
    const url = BASE_URL + '/gw_payment/transactionProcessor'
    const params = {
      partnerCode: PARTNER_CODE,
      accessKey: ACCESS_KEY,
      requestId: (Date.now() + _.random(0, 1000)).toString(),
      amount: amount.toString(),
      orderId: orderId.toString(),
      orderInfo,
      returnUrl: config.API_BASE_URL + '/customer/onMomo',
      notifyUrl: config.API_BASE_URL + '/customer/onMomo',
      extraData: username
    }

    params.signature = utils.hmacSha256(utils.objectToString(params), SECRET_KEY)
    params.requestType = 'captureMoMoWallet'

    console.log(url, JSON.stringify(params))

    return axios
      .post(url, params, {
        timeout: 10000,
        validateStatus: status => status === 200
      })
      .then(result => {
        console.log('getQR momo result: ', result.data)
        return Promise.resolve(_.get(result, 'data.qrCodeUrl'))
      })
      .catch(e => {
        e && console.error('getQR momo err: ', e.stack || e)
        return Promise.reject(e)
      })
  }

  static verify({ username, orderId, orderInfo, amount, customerNumber, customerUsername, appData }) {
    const url = BASE_URL + '/pay/app'
    const params = {
      partnerCode: PARTNER_CODE,
      partnerRefId: Date.now().toString() + _.random(0, 1000),
      customerNumber,
      amount: Number(amount),
      appData,
      userName: customerUsername,
      partnerTransId: orderId.toString(),
      description: orderInfo,
      version: 2.0
    }
    params.hash = MomoService.rsa(JSON.stringify(_.pick(params, ['partnerCode', 'partnerRefId', 'amount', 'partnerTransId', 'userName'])))

    console.log(url, params)
    let result

    return axios
      .post(url, params, {
        timeout: 30000,
        validateStatus: status => status === 200
      })
      .then(res => {
        console.log('verify momo result: ', res.data)
        if (!res || !res.data || !res.data.amount || res.data.status || !res.data.transid || !res.data.signature) {
          return Promise.reject('transaction wrong')
        }

        result = res.data

        console.log(utils.objectToString(_.pick(result, ['status', 'message', 'amount', 'transid'])))
        const validSignature = utils.hmacSha256(utils.objectToString(_.pick(result, ['status', 'message', 'amount', 'transid'])), SECRET_KEY)
        if (result.signature !== validSignature) {
          console.error(result.signature, validSignature)
          return Promise.reject('transaction signature wrong')
        }

        // check transaction existed
        return getRedis('redis').hset(KEYS.CHECK_TRANSACTION, result.transid, '1')
      }).then(isNotExisted => {
        if (!isNotExisted) {
          return Promise.reject('transaction existed')
        }

        return Promise.resolve(result)
      })
      .catch(e => {
        e && console.error('verify momo err: ', e.stack || e)
        return Promise.reject(e)
      })
  }

  static rsa(text) {
    const key = new NodeRSA(PUBLIC_KEY, {encryptionScheme: 'pkcs1'})
    return key.encrypt(text, 'base64')
  }
}
