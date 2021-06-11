'use strict'

const moment = require('moment')
const _ = require('lodash')
const secret = require('../config/secret')
const consts = require('../config/consts')
const utils = require('../utils/utils')
const CONFIG = require('../config/config')

module.exports = (config) => {

  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    // res.setHeader('Access-Control-Allow-Headers', 'Content-Type,access-token')

    const ip = utils.getIp(req)

    if (req.originalUrl == '/') return next()

    const start = Date.now()
    const params = req.method == 'GET' ? req.query : (_.isEmpty(req.body) ? req.query : req.body)
    let inputData = params
    let deviceType, platform, deviceId

    if (params.d || req.method == 'GET') {
      deviceType = Number(params.dt) || consts.DEVICE_TYPE.MOBILE
      platform = Number(params.p) || consts.PLATFORM.ANDROID
      deviceId = params.d

      if (params.i) {
        const secretKey = secret.getSecret(deviceType, platform)
        inputData = utils.JSONParse(utils.xorDecode(params.i, deviceId + secretKey), {})
        if (req.method == 'GET') {
          req.query = inputData
        } else {
          req.body = inputData
        }

        req.meta = { d: deviceId, dt: deviceType, p: platform }
      }
    }

    const path = req.originalUrl.split("?").shift()
    let log = `${moment().format('DD-MM HH:mm:ss')} | ${req.method} ${path} ${JSON.stringify(inputData)}`

    console.log('HTTP_LOGGER', log)

    let sent
    const sendResponse = res.send.bind(res)
    res.send = (body) => {
      sent = true
      let output = body

      const params = req.meta || {}
      if (params.d) {
        deviceType = Number(params.dt) || consts.DEVICE_TYPE.MOBILE
        platform = Number(params.p) || consts.PLATFORM.ANDROID
        deviceId = params.d
      
        const secretKey = secret.getSecret(deviceType, platform)
        const xor = utils.xorEncode(body, deviceId + secretKey)
        output = JSON.stringify({o: xor, d: deviceId})
      }

      sendResponse(output)

      console.log('SEND_@@', params, output)

      logToES(req, body, log, start, ip, path, inputData)
    }

    const endResponse = res.end.bind(res)
    res.end = (body, encoding, cb) => {
      console.log('sendResponseAAA', encoding, body ? body.toString('utf-8'): body, log)
      if (encoding === 'utf-8') {
        logToES(req, body, log, start, ip, path, inputData, true)
      }
      endResponse(body, encoding, cb)
    }

    next()
  }

}

function logToES(req, body, log, start, ip, path, inputData, logResponse = false) {
  const ms = Date.now() - start
  log += ` wait: ${ms}ms`
  if (CONFIG.DEBUG) {
    log += "\n -> " + body
  }
  console.log(log)

  if (process.env.NODE_ENV == 'production') {
    req.app.get('logstash').info({
      meta_logType: 'http',
      username: req.username,
      deviceType: req.deviceType,
      platform: req.platform,
      dtId: req.dtId,
      ip: ip,
      method: req.method,
      path: path,
      params: inputData,
      responseTime: ms,
      name: undefined,
      source: undefined,
      tags: undefined,
      message: undefined,
      response: logResponse ? body : undefined
    })
  }
}
