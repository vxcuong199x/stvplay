'use strict'

const _ = require('lodash')
const md5 = require('md5')
const config = require('../config/config')
const DEFAULT_EXPIRE = config.CACHE_TIME
const CACHE_SYSTEM = 'memcache'

module.exports = function(server) {
  server.models.ACL.find = (...args) => {
    const lastArgs = _.last(args)
    const cb = _.isFunction(lastArgs) ? lastArgs : undefined
    return invokeCallback(cb, null, [])
  }

  setupMethodCache(server.models.Role, 'find')
  setupMethodCache(server.models.RoleMapping, 'find')
  setupMethodCache(server.models.AccessToken, 'find')
};

const setupMethodCache = (ThisModel, method) => {
  ThisModel[`_${method}Live`] = ThisModel[method]
  ThisModel[method] = (...args) => {
    const cacheSystem = ThisModel.definition.name == 'Role'
      ? 'memcache'
      : 'redis'

    const filter = method == 'findById' ? _.nth(args, 1) : _.first(args)

    if (method == 'findById') filter.id = _.first(args)

    const cacheHandle = ThisModel.app.get(cacheSystem)
    if (!cacheHandle) return ThisModel[`_${method}Live`](...args)

    const lastArgs = _.last(args)
    const cb = _.isFunction(lastArgs) ? lastArgs : undefined

    // console.log(ThisModel.definition.name, method, filter)

    if (filter.where.principalId && filter.where.principalId.length <= 15) {
      return invokeCallback(cb, null, [])
    }

    let filterString = JSON.stringify(_(filter).toPairs().sortBy(0).fromPairs().value())
    filterString = filterString.length >= 80
      ? md5(filterString)
      : Buffer.from(filterString).toString('base64')

    const key = [ThisModel.definition.name, method, filterString].join(':')

    const getAndCache = cacheHandle.get(key)
      .then(cache => {
        // console.log('CACHE', !!cache)
        if ((cacheHandle.isMemcache && cache !== undefined) || cache) {
          let result = (cacheHandle.isMemcache) ? cache : JSON.parse(cache)
          if (!_.isArray(result)) result = new ThisModel(result)
          else if (result) result = _.map(result, item => new ThisModel(item))
          if (filter.returnId) result = {data: result, id: filter.returnId}
          return invokeCallback(cb, null, result)
        }

        const newArgs = cb ? _.slice(args, 0, args.length - 1) : args

        return ThisModel[`_${method}Live`](...newArgs)
          .then(result => {
            cacheHandle.setex(
              key,
              DEFAULT_EXPIRE,
              (cacheHandle.isMemcache) ? result : JSON.stringify(result),
              (e) => e ? console.error('set cache err', e.stack || e) : null
            )

            if (filter.returnId) result = {data: result, id: filter.returnId}
            return invokeCallback(cb, null, result)
          })
      })
      .catch(e => {
        console.error('cache mixin err', e.stack || e)
        return ThisModel[`_${method}Live`](...args)
      })

    if (!cb) return getAndCache
  }
}

function invokeCallback(cb) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (!!cb && typeof cb === 'function') {
    return cb.apply(null, args);
  } else {
    if (!!args[0]) {
      return Promise.reject(args[0]);
    } else {
      return Promise.resolve(args[1]);
    }
  }
}
