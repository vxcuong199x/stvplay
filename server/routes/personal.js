'use strict'

const _ = require('lodash')
const moment = require('moment')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const PersonalMemory = require('../logic/personal-memory')
const CacheHandler = require('../logic/cache-handler')

module.exports = function(Personal) {

  Personal.remoteMethod('getChannels', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'get personal channel'
  })

  Personal.getChannels = (req, filter, cb) => {
    let channelIds, channels

    const promise = PersonalMemory.getUserChannels(req.username, filter.limit || 12)
      .then(list => {
        if (!list)
          return Promise.rejected(new Promise.CancellationError())

        channelIds = list

        return CacheHandler.getListCache('Channel', { id: channelIds }, {
          where: {
            activated: true
          },
          fields: 'default'
        })
      })
      .then(list => {
        if ((!list || !list.length) && !filter.skip)
          return Promise.rejected(new Promise.CancellationError())

        channels = list
        const now = utils.momentRound(moment(), moment.duration(config.CACHE_TIME, 'seconds'), 'ceil')

        return CacheHandler.getListCache(
          'ChannelProgram',
          { channelId: channelIds },
          {
            where: {
              activated: true,
              livedAt: { between: [now.add(-100, 'minutes').toDate(), now.toDate()] }
            },
            limit: channelIds.length * 2,
            fields: ['channelId', 'name']
          }
        )
      })
      .then(programs => {
        const programMap = {}
        _.forEach(_.sortBy(programs, ['livedAt']), program => {
          programMap[program.channelId] = program
        })

        _.forEach(channels, (channel, i) => {
          channels[i].program = _.get(programMap, `${channel.id}.name`, channels[i].name)
        })

        return utils.invokeCallback(cb, null, channels)
      })
      .catch(Promise.CancellationError, e => {
        return Personal.app.models.Channel.find({
          limit: 6,
          cacheTime: config.CACHE_TIME,
          fields: 'default'
        })
      })
      .then(list => {
        return utils.invokeCallback(cb, null, _.shuffle(list))
      })
      .catch(e => {
        e && console.error(e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Personal.remoteMethod('getMovies', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'get personal movie'
  })

  Personal.getMovies = (req, filter, cb) => {
    let movieIds

    const promise = PersonalMemory.getUserMovies(req.username, '5bf4cd1c168a371d3897272d', filter.limit || 12) // todo fix for old version
      .then(movies => {
        if (!movies)
          return Promise.rejected(new Promise.CancellationError())

        movieIds = Object.keys(movies)

        return CacheHandler.getListCache('Movie', { id: movieIds }, {
          where: {
            activated: true
          },
          fields: 'default'
        })
      })
      .then(list => {
        if ((!list || !list.length) && !filter.skip)
          return Promise.rejected(new Promise.CancellationError())

        list = _.sortBy(list, [item => movieIds.indexOf(item.id.toString())])

        return utils.invokeCallback(cb, null, list)
      })
      .catch(Promise.CancellationError, e => {
        return Personal.app.models.Movie.find({
          limit: 6,
          cacheTime: config.CACHE_TIME,
          fields: 'default'
        })
      })
      .then(list => {
        return utils.invokeCallback(cb, null, list)
      })
      .catch(e => {
        e && console.error(e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }

  Personal.remoteMethod('getClips', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'filter', type: 'object'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'get personal clip'
  })

  Personal.getClips = (req, filter, cb) => {
    let clipIds

    const promise = PersonalMemory.getUserClips(req.username, '5bf4cd1c168a371d3897272d', filter.limit || 12) // todo fix for old version
      .then(clips => {
        if (!clips)
          return Promise.rejected(new Promise.CancellationError())

        clipIds = Object.keys(clips)

        return CacheHandler.getListCache('Clip', { id: clipIds }, {
          where: {
            activated: true
          },
          fields: 'default'
        })
      })
      .then(list => {
        if ((!list || !list.length) && !filter.skip)
          return Promise.rejected(new Promise.CancellationError())

        list = _.sortBy(list, [item => clipIds.indexOf(item.id.toString())])

        return utils.invokeCallback(cb, null, list)
      })
      .catch(Promise.CancellationError, e => {
        return Personal.app.models.Clip.find({
          limit: 6,
          cacheTime: true,
          fields: 'default'
        })
      })
      .then(list => {
        return utils.invokeCallback(cb, null, list)
      })
      .catch(e => {
        e && console.error(e.stack || e)
        return utils.invokeCallback(cb, null, [])
      })

    if (!cb) return promise
  }
}
