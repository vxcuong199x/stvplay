'use strict'

const requireDirectory = require('require-directory')
const loopback = require('loopback')
const boot = require('loopback-boot')
const Promise = require('bluebird')
const moment = require('moment')
const consts = require('./config/consts')

const app = module.exports = loopback()

app.start = function() {

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.CHANNEL,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.CHANNEL, data)
    }
  })

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.MOVIE,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.MOVIE, data)
    }
  })

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.CLIP,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.CLIP, data)
    }
  })

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.BUY_MOVIE,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.BUY_MOVIE, data)
    }
  })

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.BUY_CLIP,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.BUY_CLIP, data)
    }
  })

  app.get('rabbit').subscribe({
    channel: consts.RABBIT_CHANNEL.HOME,
    processor: (data) => {
      app.emit(consts.RABBIT_CHANNEL.HOME, data)
    }
  })

  requireDirectory(module,  './event-handler')
}

boot(app, __dirname, function(err) {
  if (err) throw err

  if (require.main === module)
    setTimeout(app.start, 1000)
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e.stack || e)
  setTimeout(() => { process.exit(0) }, 1000)
})
