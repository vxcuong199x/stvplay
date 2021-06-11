'use strict'

const route = require('../routes/channel-program')
const config = require('../config/config')
const consts = require('../config/consts')
const utils = require('../utils/utils')
const moment = require('moment')

module.exports = function(ChannelProgram) {
  route(ChannelProgram)

  ChannelProgram.getLivePrograms = (channelIds) => {
    const startTime = utils.momentRound(moment().add(-120, 'minutes'), moment.duration(config.CACHE_TIME, 'seconds'), 'floor')
    const endTime = startTime.clone().add(120, 'minutes').add(Math.round(config.CACHE_TIME/3), 'seconds')

    return ChannelProgram.find({
      where: {
        channelId: { inq: channelIds },
        livedAt: { between: [startTime.toDate(), endTime.toDate()] }
      },
      limit: channelIds.length * 3,
      fields: ['channelId', 'name', 'livedAt'],
      cacheTime: config.CACHE_TIME
    })
  }

  ChannelProgram.observe('after save', (ctx, next) => {
    if (ctx.instance && ctx.instance.homeOrder) {
      ChannelProgram.app.models.Home.update(
        { type: consts.MEDIA_TYPE.PROGRAM },
        { $set: { activated: true } },
        { upsert: false }
      )
    }

    next()
  })
}
