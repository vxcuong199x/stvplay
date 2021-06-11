'use strict'

const Promise = require('bluebird')
const axios = require('axios')
const baseUrl = 'https://shop.vgame.us/api/pay' // ?cmdType=1&username=0979544858&provider=vnpay&orderInfo=12300&amount=12000&bankCode=NCB&appId=599f83cafe7401279c88ace1&orderType=other
const appId = '599f83cafe7401279c88ace1' // SCTV OTT
const cmdType = 1
const provider = 'vnpay'
const orderType = 'other'
const minAmount = 20000

module.exports = class PayGate {
  static getBankLink({ username, orderInfo, amount, bankCode, ip }) {
    amount = Math.max(minAmount, amount)
    const params = {
      username,
      orderInfo,
      amount,
      bankCode,
      ip,
      appId,
      cmdType,
      provider,
      orderType
    }

    console.log(baseUrl + '?' + require('querystring').stringify(params))

    return axios
      .get(baseUrl, {
        params,
        timeout: 30000,
        validateStatus: status => status === 200
      })
      .then(result => {
        console.log(result.data)
        return Promise.resolve(result.data ? result.data.result.LINK || '' : '')
      })
  }
}
