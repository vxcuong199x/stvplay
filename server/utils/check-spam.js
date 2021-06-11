const Promise = require('bluebird')
const moment = require('moment')
const _ = require('lodash')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const getRedis = require('./get-redis')

module.exports = ({method, ctx, key, limit, next, period = 3600}) => {
  const checkData = key == 'ip' ? getIp(ctx.req) : _.get(ctx, key)
  const redis = getRedis('redis')
  const spamKey = `check-spam-request:${method}:${checkData}`
  redis.incr(spamKey)
    .then(count => {
      config.DEBUG && console.log(spamKey, count)
      if (count <= limit) {
        next()
        if (count == 1)
          redis.expire(spamKey, period)
      } else {
        // todo remove
        const ip = getIp(ctx.req)
        if (ip == '113.190.233.178' || ip == '27.72.102.117' || ip == '123.30.235.49') return next()
        redis.ttl(spamKey)
          .then(ttl => {
            next({
              statusCode: consts.CODE.ACCESS_DENIED,
              message: lang.spam(Math.ceil(ttl/60))
            })
            if (config.DEBUG) {
              console.log('SPAM info:', checkData, ctx.req.query, ctx.req.body)
            }
          })
      }
    })
    .catch(e => {
      console.error('check spam error', e.stack || e)
      next()
    })
}

function getIp (req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  if (ip.substr(0, 7) == '::ffff:') {
    ip = ip.substr(7)
  }
  return ip
}
