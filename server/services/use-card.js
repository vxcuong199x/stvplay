'use strict'

const Promise = require('bluebird')
const moment = require('moment')
const axios = require('axios')
const md5 = require('md5')
const lang = require('../config/lang.vi')
const consts = require('../config/consts')
const config = require('../config/config')
const querystring = require('querystring')

const issuerMap = {
  3: 'VINA',
  2: 'VTT',
  1: 'MOBI',
  4: 'FPT',
  5: 'GATE',
  6: 'VCOIN'
}

const useCardUrl = 'http://10.2.10.16/pay.gviet.vn/card/index.php'
const secret = 'secret'
const productId = 6

module.exports = ({telco, serial, pin, dtId, spId, username, ip}, CardTransaction) => {
  if (process.env.NODE_ENV === 'development')
    return Promise.resolve(Math.round(Number(pin) || 10000000)/10000)

  console.log({telco, serial, pin, dtId, spId, username, ip})
  const transactionId = `OTT_${username}_${Date.now()}`

  const data = {
    pn_id: 1,
    pr_id: productId,
    dt_id: dtId || 1,
    issuer: issuerMap[telco] || 'VTT',
    card_code: pin,
    trans_no: transactionId,
    uname: username,
    spid: spId || 1,
    serial: serial
  }
  data.signal = md5(data.pn_id+'|'+data.issuer+'|'+data.card_code+'|'+data.trans_no+'|'+secret)

  // ghi log mongo data gửi lên cào thẻ
  const time = new Date()
  const day = Number(moment().format('YYYYMMDD'))

  return Promise.all([
    CardTransaction.create({
      telco, serial, pin, dtId, spId, username, ip, time, day
    }),
    axios.get(useCardUrl, {params: data, responseType: 'text', timeout: 30000})
  ])
    .spread((transactionObj, rs) => {
      const result = parseResponse(rs)
      console.log('userCard', data, result)
      if (!result.money) {
        return Promise.reject({
          statusCode: consts.CODE.INVALID_PARAM,
          message: lang.wrongCardCode
        })
      }

      transactionObj.updateAttributes({
        ec: result.ec,
        status: result.status
      })

      return Promise.resolve(result.money)
    })
    .catch(e => {
      if (e.statusCode)
        return Promise.reject(e)

      console.error('use card error', e.stack || e)
      return Promise.reject({
        statusCode: consts.CODE.DATA_MISSING,
        message: lang.wrongCardCode
      })
    })
}

// const codeMap = {
//   '00': CONSTANT.TRANSACTION_CODE.CARD_NOT_EXIST_OR_USED,
//   '10': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '11': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '14': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '15': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '16': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '40': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '20': CONSTANT.TRANSACTION_CODE.CARD_INVALID,
//   '25': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '26': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '30': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '90': CONSTANT.TRANSACTION_CODE.SYSTEM_ERROR,
//   '51': CONSTANT.TRANSACTION_CODE.CARD_INVALID,
//   '52': CONSTANT.TRANSACTION_CODE.CARD_INVALID,
//   '53': CONSTANT.TRANSACTION_CODE.CARD_INVALID
// };

function parseResponse(res) {
  const parseResult = {
    ec: '00',
    status: consts.CODE.INVALID_PARAM,
    money: 0,
    response: res.data
  }

  const result = res.data.split('.')
  if (result.length < 2)
    parseResult.ec = '500'
  else {
    parseResult.ec = result[0]
    if (result[0] == '01') {
      parseResult.status = 0
      parseResult.money = Number(result[1])
    }
  }

  return parseResult
}
