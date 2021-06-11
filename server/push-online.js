'use strict'

const express = require('express')
const _ = require('lodash')
const config = require('./config')
const consts = require('./config/consts')
const utils = require('./utils/utils')
const PushManager = require('./services/push-manager')
const TokenHandler = require('./logic/token-handler')
const redis = require('./utils/get-redis')('redisPushOnline')
PushManager.init(redis)
PushManager.runHeartbeat()

const app = express()
app.disable('x-powered-by')
app.all('/', (req, res) => { res.send('OK').end() })

app.get('/push', (req, res) => {
  if (!req.query.access_token) {
    return res.status(401).json({error: 'Missing access token'})
  }

  console.log('enter events', req.query.access_token)

  const tokenId = req.query.access_token.replace(/ /g,'+')
  let token

  TokenHandler.decrypt(tokenId)
    .then(tokenData => {
      // if (!tokenData || tokenData.ip != utils.getIp(req))
      //   return Promise.reject(new Error('Token ip invalid'))
      
      if (!tokenData) return Promise.reject(new Error('Invalid token'))

      req.socket.setKeepAlive(true)
      req.socket.setTimeout(0)

      res.status(200)
        .set({
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
      console.log(`${token.deviceId} enter push online channel`)

      res.socket.on('close', function () {
        res.end()
        PushManager.removeHandler(token.username, token.deviceId)
        console.log(`${token.deviceId} leave push online channel`)
      })
    })
    .catch(e => {
      console.error('push online', e.stack || e)
      e.status = e.statusCode = 401
      e.code = 'INVALID_TOKEN'
      res.status(e.status).json({ error: e })
    })
})

app.listen(config.pushOnlinePort, (e) => {
  console.log('PUSH ONLINE starting in port ', config.pushOnlinePort)
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e.stack || e)
  setTimeout(() => { process.exit(0) }, 1000)
})
