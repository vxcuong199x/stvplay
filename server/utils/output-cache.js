const Promise = require('bluebird')
const md5 = require('md5')
const utils = require('./utils')
const _ = require('lodash')
const getRedis = require('../utils/get-redis')

module.exports = class OutputCache {
  static getCache(context) {
    const redis = getRedis('redis')
    const params = (context.args.req.method == 'GET' ? JSON.stringify(context.args.req.query) : JSON.stringify(context.args.req.body))
    const key = 'cache:' + md5(context.args.req.originalUrl + JSON.stringify(params))

    return redis.get(key)
      .then(data => {
        if (data) {
          return Promise.resolve(utils.JSONParse(data))
        } else {
          return Promise.resolve(null)
        }
      })
      .catch(e => {
        console.error('cache man error', e.stack || e)
        return Promise.resolve(null)
      })

  }

  static setCache(context, body, expire) {
    const redis = getRedis('redis')
    const params = (context.args.req.method == 'GET' ? JSON.stringify(context.args.req.query) : JSON.stringify(context.args.req.body))
    const key = 'cache:' + md5(context.args.req.originalUrl + JSON.stringify(params))

    return redis.setex(key, expire, JSON.stringify(body))
      .then(() => {
        return Promise.resolve(body)
      })
  }
}

