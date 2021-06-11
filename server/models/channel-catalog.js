'use strict'

const _ = require('lodash')
const consts = require('../config/consts')

module.exports = function(ChannelCatalog) {
  // todo hide kênh địa phương on Web (because crawler and prevent cross domain by content source)
  ChannelCatalog.afterRemote('find', (ctx, config, next) => {
    if (
      ctx.result && Array.isArray(ctx.result)
      && ctx.result.length && ctx.req.deviceType == consts.DEVICE_TYPE.WEB
    ) {
      ctx.result = _.filter(
        ctx.result,
        channelCatalog => {
          return [
            '5a8f8ecd4d6ca32966ad4fdf',
            '5b8a67b66afba86eafc73f10',
            '5b8a67c6a1e221397c8bb28d',
            '5b8a67d26afba86eafc73f12'
          ].indexOf(channelCatalog.id.toString()) == -1
        }
      )
    }

    // todo hide for upload LG, Tizen
    if (
      ctx.result && Array.isArray(ctx.result)
      && ctx.result.length && (ctx.req.platform == consts.PLATFORM.LG || ctx.req.platform == consts.PLATFORM.TIZEN)
    ) {
      ctx.result = _.filter(
        ctx.result,
        channelCatalog => [
          '5a8f8ecd4d6ca32966ad4fdf',
          '5b8a67b66afba86eafc73f10',
          '5b8a67c6a1e221397c8bb28d',
          '5b8a67d26afba86eafc73f12'
        ].indexOf(channelCatalog.id.toString()) == -1
      )
    }

    next()
  })
}
