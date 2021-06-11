'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi.js')
const utils = require('../utils/utils')
const CacheHandler = require('../logic/cache-handler')
const geoip = require('geoip-lite')

module.exports = function(Channel) {

  Channel.remoteMethod('getDefaultSource', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'resolution', type: 'number', default: 1000},
      {arg: 'codec', type: 'string', default: ''}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get channel default source'
  })

  Channel.getDefaultSource = (req, resolution, codec, cb) => {
    Channel.getSource(req, '5cd6be4624267142d97bfb25', resolution, 0, codec, 1, cb) // 5a7133af04c1c308a78b44f3
  }

  Channel.remoteMethod('findAllV2', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Find all instances of the model matched by filter from the data'
  })

  Channel.findAllV2 = (req, cb) => {
    const inReview = utils.inReview(req)
    let channels

    const filter = {
      where: { activated: true },
      cacheTime: config.CACHE_TIME,
      fields: 'default'
    }

    // hide unlicensed content
    if (config.DISABLE_UNLICENSED_CONTENT && utils.isFromStore(req)) {
      _.set(filter, 'where.activatedStore', true)
    }

    const promise = Channel.find(filter)
      .then(result => {
        channels = result || []
        let channelIds = _.map(channels, channel => channel.id)

        if (!channelIds.length)
          return Promise.resolve([])

        return Channel.app.models.ChannelProgram.getLivePrograms(channelIds)
      })
      .then(programs => {
        const programMap = {}
        _.forEach(_.sortBy(programs, ['livedAt']), program => {
          programMap[program.channelId] = program
        })

        // todo hide kênh địa phương on Web (because crawler and prevent cross domain by content source)
        if (req.deviceType == consts.DEVICE_TYPE.WEB) {
          channels = _.filter(channels, channel => {
            const channelCatalogIds = []
            _.each(channel.channelCatalogIds, id => channelCatalogIds.push(id.toString()))
            return (
              channelCatalogIds.indexOf('5a8f8ecd4d6ca32966ad4fdf') == -1
              && channelCatalogIds.indexOf('5b8a67b66afba86eafc73f10') == -1
              && channelCatalogIds.indexOf('5b8a67c6a1e221397c8bb28d') == -1
              && channelCatalogIds.indexOf('5b8a67d26afba86eafc73f12') == -1
            )
          })
        }

        // todo hide for upload LG and Tizen
        if (inReview) {
          channels = _.filter(channels, channel => {
            const channelCatalogIds = []
            _.each(channel.channelCatalogIds, id => channelCatalogIds.push(id.toString()))
            return (
              channelCatalogIds.indexOf('5a8f8ecd4d6ca32966ad4fdf') == -1
              && channelCatalogIds.indexOf('5b8a67b66afba86eafc73f10') == -1
              && channelCatalogIds.indexOf('5b8a67c6a1e221397c8bb28d') == -1
              && channelCatalogIds.indexOf('5b8a67d26afba86eafc73f12') == -1
            )
          })
        }

        _.forEach(channels, (channel, i) => {
          const programTitle = _.get(programMap, `${channel.id}.name`)
          channels[i].program = programTitle ? utils.toLowerCase(programTitle) : channels[i].name
        })

        channels = _(channels)
          .map(channel => ({
            id: channel.id,
            icon: channel.icon,
            index: channel.index,
            title: channel.name,
            channelCatalogIds: channel.channelCatalogIds,
            // source: channel.source_secue
          }))
          .sortBy(['index'])
          .value()

        return utils.invokeCallback(cb, null, channels)
      })
      .catch(e => {
        console.error('find channel err', e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }
}
