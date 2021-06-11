'use strict'

const axios = require('axios')
const Queue = require('bull')
const Redis = require('ioredis')
const _ = require('lodash')
const proxyConfig = require('../config/proxy')

module.exports = function(Proxy) {

  const movieCrawlerRedis = null //new Redis(proxyConfig.MOVIE_CRAWLER_REDIS_STRING)

  const movieCrawlerQueue = {
    // ListParQueue: new Queue('ListParQueue', proxyConfig.MOVIE_CRAWLER_REDIS_STRING),
    // DownloadQueue: new Queue('DownloadQueue', proxyConfig.MOVIE_CRAWLER_REDIS_STRING)
  }

  Proxy.remoteMethod('statistic', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'path', type: 'string', required: true},
      {arg: 'filter', type: 'object', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'get statistic'
  })

  Proxy.statistic = (req, path, filter, cb) => {
    const role = req.accessToken.role

    if (!req.accessToken.role) {
      return cb(null, {})
    }

    console.log('role_123', role)

    if (role != 'admin' && role != 'ketoan' && role != 'vh' && role != 'qnet' && role != 'qnet2') {
      if (req.accessToken.role.indexOf('content_') == 0) {
        const pnId = Number(req.accessToken.role.replace('content_', ''))
        filter['pnId'] = pnId
      } else if (req.accessToken.role.indexOf('npp_') == 0) {
        const dtId = Number(req.accessToken.role.replace('npp_', ''))
        filter['dtId'] = dtId
      } else if (req.accessToken.role.indexOf('daily_') == 0) {
        const [unused, dtId, spId] = req.accessToken.role.split('_')
        filter['dtId'] = dtId
        filter['spId'] = spId
      } else if (role != 'vh' || path.indexOf('/transaction') === 0) {
        return cb(null, {})
      }
    }

    axios
      .get(proxyConfig.BASE_URL_STATISTIC+path, {
        params: filter,
        timeout: 60000
      })
      .then(rs => {
        cb(null, rs.data)
      })
      .catch(e => {
        e && console.error('statistic error', e.stack || e)
        cb(null, {})
      })
  }

  Proxy.remoteMethod('crm', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'path', type: 'string', required: true},
      {arg: 'filter', type: 'object', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'get statistic'
  })

  Proxy.crm = (req, path, filter, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const role = req.accessToken.role

    axios
      .get(proxyConfig.BASE_URL_CRM+path, {
        params: filter,
        timeout: 60000
      })
      .then(rs => {
        cb(null, rs.data)
      })
      .catch(e => {
        e && console.error('crm error', e.stack || e)
        cb(null, {})
      })
  }

  Proxy.remoteMethod('movieCrawler', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'queue', type: 'string', required: true},
      {arg: 'method', type: 'string', required: true},
      {arg: 'params', type: 'array'}
    ],
    returns: {type: 'array', root: true},
    description: 'movieCrawler command'
  })

  Proxy.movieCrawler = (req, queue, method, params, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const role = req.accessToken.role

    if (role != 'admin' && role != 'vh') {
      return cb(null, {})
    }

    movieCrawlerQueue[queue][method].apply(movieCrawlerQueue[queue], params)
      .then(rs => {
        cb(null, rs)
      })
      .catch(e => {
        console.error('call movieCrawler error: ', e.stack || e)
      })
  }

  Proxy.remoteMethod('getCrawlerChildJobs', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'vodId', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'getCrawlerChildJobs'
  })

  Proxy.getCrawlerChildJobs = (req, vodId, cb) => {
    if (!req.accessToken.role) {
      return cb(null, [])
    }

    const role = req.accessToken.role
    if (role != 'admin' && role != 'vh') {
      return cb(null, [])
    }

    let jobs

    movieCrawlerRedis.keys(`bull:DownloadQueue:${vodId}-*`)
      .then(list => {
        return list.map(jobId => movieCrawlerQueue.DownloadQueue.getJob(jobId.split(':')[2]))
      })
      .spread(function() {
        jobs = Array.from(arguments)
        return jobs.map(job => job.getState())
      })
      .spread(function() {
        const states = Array.from(arguments)
        const result = []

        _.each(jobs, (job, i) => {
          result.push(_.assign(JSON.parse(JSON.stringify(job)), {state: states[i]}))
        })

        cb(null, result)
      })
      .catch(e => {
        console.error('getCrawlerChildJobs error: ', e.stack || e)
        return cb(null, [])
      })
  }

  Proxy.remoteMethod('executeJob', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'queue', type: 'string', required: true},
      {arg: 'jobId', type: 'string', required: true},
      {arg: 'method', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'executeJob'
  })

  Proxy.executeJob = (req, queue, jobId, method, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const role = req.accessToken.role

    if (role != 'admin' && role != 'vh') {
      return cb(null, {})
    }

    movieCrawlerQueue[queue].getJob(jobId)
      .then(job => {
        if (job) {
          return job[method]()
        }
        else {
          console.error('jobId not found: ', jobId)
          return {}
        }
      })
      .then(rs => {
        if (method == 'remove' && queue == 'DownloadQueue'){
          movieCrawlerRedis.keys(`bull:DownloadQueue:${jobId}-*`)
            .then(list => {
              return list.map(jobId => movieCrawlerQueue.DownloadQueue.getJob(jobId.split(':')[2]))
            })
            .spread(function() {
              return Array.from(arguments).map(job => job.remove())
            })
        }

        cb(null, rs)
      })
      .catch(e => {
        console.error('executeJob error: ', e.stack || e)
        return cb(null, {})
      })
  }

  Proxy.remoteMethod('download', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'path', type: 'string', required: true},
      {arg: 'filter', type: 'object', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'download'
  })

  Proxy.download = (req, path, filter, cb) => {
    axios
      .get(proxyConfig.DOWNLOAD_URL+path, {
        params: filter,
        timeout: 60000
      })
      .then(rs => {
        cb(null, rs.data)
      })
      .catch(e => {
        e && console.error('download error', e.stack || e)
        cb(null, {})
      })
  }
}
