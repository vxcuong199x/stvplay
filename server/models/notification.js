'use strict'

const moment = require('moment')
const route = require('../routes/notification')
const utils = require('../utils/utils')
const config = require('../config/config')
const consts = require('../config/consts')

module.exports = function(Notification) {
  route(Notification)
  
  Notification.getLatestNews = () => {
    const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'ceil').toDate()
    return Notification.find({
      where: {
        activated: true,
        type: consts.NOTIFY_TYPE.ONLINE,
        showTime: { lte: now },
        expireAt: { gte: now }
      },
      fields: ['id','name', 'updatedAt', 'dtId', 'platform', 'deviceType'],
      limit: 10,
      order: 'showTime DESC',
      cacheTime: config.CACHE_TIME
    })
  }
  
  Notification.getLatestCommand = () => {
    const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'ceil').toDate()
    
    return Notification.find({
      where: {
        activated: true,
        type: consts.NOTIFY_TYPE.COMMAND,
        showTime: { lte: now },
        expireAt: { gte: now }
      },
      fields: ['type','description','target','command','showTime','dtId','platform','deviceType'],
      limit: 6,
      order: 'showTime DESC',
      cacheTime: config.CACHE_TIME
    })
  }
}
