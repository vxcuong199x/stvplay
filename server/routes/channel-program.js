'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const ObjectId = require('mongodb').ObjectId
const moment = require('moment')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')

module.exports = function(ChannelProgram) {

  ChannelProgram.beforeRemote('find', (ctx, option, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    let startTime

    if (!role) {
      if (_.get(ctx, 'args.filter.getCurrent')) {
        startTime = utils.momentRound(moment().add(-100, 'minutes'), moment.duration(config.CACHE_TIME, 'seconds'), 'floor')
        const limit = _.get(ctx, 'args.filter.limit', 4)
        _.set(ctx, 'args.filter.limit', limit + 6)
        _.set(ctx, 'args.filter.oldLimit', limit)
      } else {
        startTime = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'floor')
      }

      _.set(ctx, 'args.filter.where.livedAt', {gte: startTime.toDate()})
      _.set(ctx, 'args.filter.order', 'livedAt ASC')
    }

    next()
  })

  ChannelProgram.afterRemote('find', (ctx, option, next) => {
    const result = _.get(ctx, 'args.filter.returnId') ? ctx.result.data : ctx.result
    if (
      result && Array.isArray(result)
      && result.length > _.get(ctx, 'args.filter.oldLimit')
      && _.get(ctx, 'args.filter.getCurrent')
    ) {
      const now = moment()
      let exceed = result.length - _.get(ctx, 'args.filter.oldLimit')
      let oldCount = 0

      for (let i = 0; i < result.length; i++) {
        if (moment(result[i].livedAt).isAfter(now)) {
          for (let j = 2; j <= oldCount; j++) {
            result.splice(i-j, 1)
          }
          break
        } else {
          oldCount++
        }
      }

      if (exceed > oldCount + 1) {
        for (let i = 0; i < exceed - (oldCount + 1); i++) {
          result.splice(result.length-i-1, 1)
        }
      }

      if (moment(result[0].livedAt).isBefore(now)) {
        result[0].isCurrent = 1
      }
    }

    next()
  })

  ChannelProgram.getHot = (req, filter) => {
    const limit = filter.limit || consts.DEFAULT_TV_LIMIT
    if (filter.skip >= limit*2) {
      return Promise.resolve([])
    }

    const startTime = utils.momentRound(moment().add(-115, 'minutes'), moment.duration(config.CACHE_TIME, 'seconds'), 'floor')
    const channelIconMap = {}
    const where = {
      activated: true,
      homeOrder: { gt: 0 },
      livedAt: {
        lte: moment().startOf('day').add(2, 'days').toDate(),
        gte: startTime.toDate()
      }
    }

    // hide unlicensed content
    if (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) {
      where.activatedStore = true
    }

    return Promise.all([
      ChannelProgram.find({
        where: where,
        fields: 'default',
        limit: limit * 2,
        skip: filter.skip || 0,
        order: 'livedAt ASC',
        cacheTime: config.CACHE_TIME
      }),
      ChannelProgram.app.models.Channel.find({
        where: {},
        fields: ['id', 'icon', 'resolution'],
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((list, channels) => {
        _.each(channels, channel => {
          channelIconMap[channel.id.toString()] = channel
        })

        list = _.filter(list, item => moment(item.livedAt).add(item.duration || 0, 'minutes').isAfter(moment()))

        // if (!filter.skip && (!list || !list.length)) {
        //   ChannelProgram.app.models.Home.update(
        //     { type: consts.MEDIA_TYPE.PROGRAM },
        //     { $set: { activated: false } },
        //     { upsert: false }
        //   )

          // const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'floor').toDate()
          // return ChannelProgram.find({
          //   fields: { description: false },
          //   where: {
          //     activated: true,
          //     livedAt: { gt: now }
          //   },
          //   limit: 4,
          //   cacheTime: config.CACHE_TIME
          // })
        // }

      //   return list
      // })
      // .then(list => {

        return _(list)
          .map(item => {
            item.live = moment(item.livedAt).isBefore(moment()) ? 1 : 0
            item.icon = channelIconMap[item.channelId.toString()].icon || null
            item.resolution = channelIconMap[item.channelId.toString()].resolution || ''

            if (!item.live)
              item.wait = moment(item.livedAt).unix() - moment().unix()

            return item
          })
          .sortBy('livedAt')
          .value()
          .slice(0, limit)
      })
      .catch(e => {
        console.error('get hot program error: ', e.stack || e)
        return Promise.resolve([])
      })
  }

  ChannelProgram.remoteMethod('insertBatch', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'items', type: 'array', default: []}
    ],
    returns: {type: 'object', root: true},
    description: 'Insert batch program'
  })

  ChannelProgram.insertBatch = (req, items, cb) => {
    ChannelProgram.create(items, (e, results) => {
      e && console.error('insert batch program error: ', e.stack || e)
      cb(null, { ok: results && results.length })
    })
  }

  ChannelProgram.remoteMethod('removeFrom', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'channelId', type: 'string', required: true},
      {arg: 'from', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'Insert batch program'
  })

  ChannelProgram.removeFrom = (req, channelId, from, cb) => {
    ChannelProgram.destroyAll({
      channelId: ObjectId(channelId),
      livedAt: {gte: new Date(from)}
    })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        console.error('removeFrom err', e.stack || e)
        cb(null, {})
      })
  }
}
