'use strict'

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

const Promise = require('bluebird')
const moment = require('moment')
const axios = require('axios')
const md5 = require('md5')
const lang = require('../config/lang.vi')
const consts = require('../config/consts')
const config = require('../config/config')
const querystring = require('querystring')

const OPERATOR_ID = 11
const BASE_URL = 'https://sandbox.qnet.com.vn' //https://api.qnet.com.vn
const SIGNATURE_SECRET = 'QnetTDM05062020'
const JWT_SECRET = 'QNet@0506202016836'
const planExtra = 'standalone'
const planType = 'qnettest'

const DRMToday = class {
  static syncInfo(params) {
    params.operatorId = OPERATOR_ID
    params.userId = OPERATOR_ID + '-' + params.userId
    params.planExtra = planExtra
    params.planType = planType

    const signatureString = [params.operatorId, params.userId, params.planId, params.planAmount, params.isPromotion, params.createdAt, params.expiredAt, SIGNATURE_SECRET].join('')

    params.signature = md5(signatureString)

    // console.log('syncInfo', BASE_URL + '/customer/sync-info', params)

    return axios
      .post(BASE_URL + '/customer/sync-info', params, {
        timeout: 10000,
        rejectUnauthorized: false,
        validateStatus: status => status === 200
      })
      .then(result => {
        console.log('syncInfo result: ', params.userId, result.data)
        return Promise.resolve(result.data)
      })
      .catch(e => {
        e && console.error('syncInfo err: ', e.stack || e)
        return Promise.reject(e)
      })
  }

  static syncInvoice(params) {
    params.operatorId = OPERATOR_ID
    // params.userId = OPERATOR_ID + '-' + params.userId
    params.planExtra = planExtra
    params.planType = planType

    const signatureString = [params.operatorId, params.userId, params.transactionId, params.planId, params.planAmount, params.planType, params.planValue, params.planExtra, params.isPromotion, params.createdAt, SIGNATURE_SECRET].join('')

    params.signature = md5(signatureString)

    // console.log('syncInvoice', params)

    return axios
      .post(BASE_URL + '/customer/sync-invoice', params, {
        timeout: 10000,
        rejectUnauthorized: false,
        validateStatus: status => status === 200
      })
      .then(result => {
        console.log('syncInvoice result: ', params.userId, result.data)
        return Promise.resolve(result.data)
      })
      .catch(e => {
        e && console.error('syncInvoice err: ', e.stack || e)
        return Promise.reject(e)
      })
  }
}

DRMToday.OPERATOR_ID = OPERATOR_ID
DRMToday.JWT_SECRET = JWT_SECRET

module.exports = DRMToday
