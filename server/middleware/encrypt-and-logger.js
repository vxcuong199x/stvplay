'use strict'

const moment = require('moment')
const _ = require('lodash')
const secret = require('../config/secret')
const consts = require('../config/consts')
const utils = require('../utils/utils')
const CONFIG = require('../config/config')
const app = require('../server')

const logResponsePath = {
  '/api/v1/customer/verifyOTP': true,
  '/api/v1/customer/enter': true,
  '/api/v1/guest/enter': true,
  '/api/v1/channel/getSource': true,
  '/api/v1/customer/onBank': true,
  '/api/v1/customer/onMomo': true,
  '/api/v1/package-group/buyPackageCard': true,
  '/api/v1/package-group/buyPackageVerifyMomo': true,
  '/api/v1/movie/buyMovieVerifyMomo': true,
  '/api/v1/clip/buyClipVerifyMomo': true,
}

module.exports = (config) => {

  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,access-token,authorization')
    // res.setHeader('Access-Control-Allow-Headers', 'Content-Type,access-token')

    const originalPath = req.originalUrl.split("?").shift()
    let path = originalPath
    if (path === '/') return next()

    const ip = utils.getIp(req)

    // console.log(req.url, req.originalUrl)

    // switch API version 2
    if (path.startsWith('/api/v2')) {
      path = path.replace('/api/v2', '/api/v1')
      req.apiVersion = 2

      if (app.v2Api[path]) {
        path += 'V2'
      }

      req.url = req.url.replace(originalPath, path)
    }

    const start = Date.now()
    const params = req.method == 'GET' ? req.query : (_.isEmpty(req.body) ? req.query : req.body)
    // console.log(params)
    let inputData = params
    let deviceType, platform, deviceId

    // if (!params.d || !params.i) {
    //   next({})
    // }

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

    let log = `${moment().format('DD-MM HH:mm:ss')} | ${req.method} ${path} ${JSON.stringify(inputData)}`

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

      logToES({req, body, log, start, ip, path, inputData, logResponse: logResponsePath[path]})
    }

    const endResponse = res.end.bind(res)
    res.end = (body, encoding, cb) => {
      if (!sent && (encoding === 'utf-8')) {
        logToES({req, body, log, start, ip, path, inputData, logResponse: true, isError: true})
      }
      endResponse(body, encoding, cb)
    }

    next()
  }

}

function logToES({req, body, log, start, ip, path, inputData, logResponse, isError}) {
  const ms = Date.now() - start
  log += ` wait: ${ms}ms`
  if (CONFIG.DEBUG) {
    log += "\n -> " + body
  }

  if (path.endsWith('updateState')) return

  console.log(log)

  if (process.env.NODE_ENV == 'production' && !process.env.NOT_LOGGING) {
    req.app.get('logstash').info({
      meta_logType: 'http',
      username: req.username,
      guestId: req.guestId,
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
      response: logResponse ? body : undefined,
      isError
    })
  }
}
