'use strict'

const express = require('express')
const _ = require('lodash')
const md5 = require('md5')
const config = require('./config')
const consts = require('./config/consts')
const secret = require('./config/secret')
const utils = require('./utils/utils')
const PushManager = require('./services/push-manager')
const TokenHandler = require('./logic/token-handler')
const bunyan = require('bunyan')
const bunyantcp = require('bunyan-logstash-tcp')
const dataSources = process.env.NODE_ENV == 'production'
  ? require('./datasources.json')
  : require('./datasources.development.json')
const redis = require('./utils/get-redis')('redisPushInApp')
const redisWrite = require('./utils/get-redis')('redis', 'redis-write')
PushManager.init(redis)
PushManager.runHeartbeat()

const logger = bunyan.createLogger({
  name: dataSources.logstash.name,
  streams: [{
    level: 'debug',
    type: "raw",
    stream: bunyantcp
      .createStream(Object.assign({
        max_connect_retries: 1000,
        retry_interval: 1000
      }, dataSources.logstash))
      .on('error', (e) => {
        console.error('logstash tcp error: ', e.stack || e)
      })
  }],
  level: 'info',
  meta_app: dataSources.logstash.name
})

logger.on('error', (e, stream) => {
  console.error('logstash error: ', e.stack || e)
})

const app = express()
app.disable('x-powered-by')
app.all('/', (req, res) => { res.send('OK').end() })

const KEY = {
  DEVICE_INFO: (deviceId) => `ott:deviceInfo:${deviceId}`
}

const DEVICE_INFO_EXPIRE = 7200

app.get('/loginQR', (req, res) => {
  let secretKey = 'nSK%o63+BhNlpaev'

  if (req.query.deviceType == consts.DEVICE_TYPE.TV) {
    if (req.query.platform == consts.PLATFORM.ANDROID) {
      secretKey = secret.CLIENT_SECRET.ANDROID_TV
    } else if (req.query.platform == consts.PLATFORM.TIZEN) {
      secretKey = secret.CLIENT_SECRET.TIZEN
    } else if (req.query.platform == consts.PLATFORM.LG) {
      secretKey = secret.CLIENT_SECRET.WEBOS
    }
  } else if (req.query.deviceType == consts.DEVICE_TYPE.MOBILE) {
    if (req.query.platform == consts.PLATFORM.ANDROID) {
      secretKey = secret.CLIENT_SECRET.ANDROID_MOBILE
    } else if (req.query.platform == consts.PLATFORM.IOS) {
      secretKey = secret.CLIENT_SECRET.IOS_MOBILE
    }
  } else if (req.query.deviceType == consts.DEVICE_TYPE.WEB) {
    secretKey = secret.CLIENT_SECRET.WEB
  }

  const deviceId = req.query.deviceId
  const signature = req.query.signature
  if (!deviceId || !signature || signature != md5(deviceId+'$'+secretKey)) {
    return res.status(401).json({error: 'Missing params'})
  }

  req.socket.setKeepAlive(true)
  req.socket.setTimeout(0)

  res.status(200)
    .set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })

  res.write(`\n\n`)

  if (PushManager.isSessionExists(deviceId)) {
    PushManager.removeHandler(deviceId, deviceId)
  }

  PushManager.addHandler(deviceId, deviceId, res.write.bind(res))

  req.query.ip = utils.getIp(req)
  redisWrite.setex(KEY.DEVICE_INFO(deviceId), DEVICE_INFO_EXPIRE, JSON.stringify(req.query), e => {
    e && console.error(e.stack || e)
  })
  console.log(`${deviceId} enter notification channel`)

  res.socket.on('close', function () {
    redisWrite.del(KEY.DEVICE_INFO(deviceId), e => e && console.error(e.stack || e))
    res.end()
    PushManager.removeHandler(deviceId, deviceId)
    console.log(`${deviceId} leave notification channel`)
  })

  if (process.env.NODE_ENV == 'production') {
    logger.info({
      meta_logType: 'http',
      deviceType: req.query.deviceType,
      platform: req.query.platform,
      method: req.method,
      path: '/loginQR',
      params: req.query,
      responseTime: 5,
      name: undefined,
      source: undefined,
      tags: undefined,
      message: undefined
    })
  }
})

app.get('/events', (req, res) => {
  if (!req.query.access_token) {
    return res.status(401).json({error: 'Missing access token'})
  }

  console.log('enter in app events', req.query.access_token)

  const tokenId = req.query.access_token.replace(/ /g,'+')
  let token

  TokenHandler.decrypt(tokenId)
    .then(tokenData => {
      // if (!tokenData || tokenData.ip != utils.getIp(req))
      //   return Promise.reject(new Error('Token ip invalid'))

      tokenData.id = tokenData.session
      token = tokenData

      if (!tokenData) return Promise.reject(new Error('Invalid token'))

      req.socket.setKeepAlive(true)
      req.socket.setTimeout(0)

      res.status(200)
        .set({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        })

      res.write(`\n\n`)

      if (PushManager.isSessionExists(token.deviceId)) {
        PushManager.removeHandler(token.username, token.deviceId)
      }

      PushManager.addHandler(token.username, token.deviceId, res.write.bind(res))
      console.log(`${token.deviceId} enter notification in app events channel`)

      res.socket.on('close', function () {
        res.end()
        PushManager.removeHandler(token.username, token.deviceId)
        console.log(`${token.deviceId} leave notification in app events channel`)
      })

      if (process.env.NODE_ENV == 'production') {
        logger.info({
          meta_logType: 'http',
          deviceType: token.deviceType,
          platform: token.platform,
          method: req.method,
          path: '/events',
          params: token,
          responseTime: 5,
          name: undefined,
          source: undefined,
          tags: undefined,
          message: undefined
        })
      }
    })
    .catch(e => {
      console.error('push in app', e.stack || e)
      e.status = e.statusCode = 401
      e.code = 'INVALID_TOKEN'
      res.status(e.status).json({ error: e })
    })
})

app.listen(config.pushInAppPort, (e) => {
  console.log('PUSH IN APP starting in port ', config.pushInAppPort)
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e.stack || e)
  setTimeout(() => { process.exit(0) }, 1000)
})
