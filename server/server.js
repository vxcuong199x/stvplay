'use strict'

// if (process.env.NODE_ENV == 'production') {
//   require('elastic-apm-node').start({
//     serviceName: 'ott',
//     secretToken: '',
//     serverUrl: 'http://172.16.20.63:8200'
//   })
// }

console.warn = () => {}

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const _ = require('lodash')
const loopback = require('loopback')
const boot = require('loopback-boot')
const Promise = require('bluebird')
const moment = require('moment')
const logError = require('./utils/log-error')

const app = module.exports = loopback()
app.v2Api = {}

app.start = function() {
  if (process.env.PORT) {
    app.listen(Number(process.env.PORT))
    return
  }

  // start the web server
  app.listen(function() {
    // app.emit('started')
    const baseUrl = app.get('url').replace(/\/$/, '')
    console.log('Web server listening at: %s', baseUrl)
    if (app.get('loopback-component-explorer')) {
      const explorerPath = app.get('loopback-component-explorer').mountPath
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath)
    }
  })

  app.listen(8002)
}

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err

  logError(app)

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start()

  // switch API version 2
  let originalMethod
  _.each(app.models, model => {
    const members = Object.keys(model)
    _.each(members, member => {
      if (member && typeof model[member] === 'function') {
        if (member.endsWith('V2')) {
          originalMethod = member.slice(0, -2)
          _.set(app.v2Api, `/api/v1/${model.definition.settings.plural}/${originalMethod}`, true)
        }
      }
    })
  })
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e.stack || e)
  setTimeout(() => { process.exit(0) }, 1000)
})
