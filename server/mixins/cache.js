'use strict'

const _ = require('lodash')
const md5 = require('md5')
const config = require('../config/config')
const DEFAULT_EXPIRE = 180

module.exports = (Model, options) => {

  const setupMethodCache = (ThisModel, method) => {
    ThisModel[`_${method}Live`] = ThisModel[method]
    ThisModel[method] = (...args) => {
      const filter = method == 'findById' ? _.nth(args, 1) : _.first(args)
      if (!_.get(filter, 'cacheTime')) return ThisModel[`_${method}Live`](...args)

      delete filter.cacheTime

      if (method == 'findById') filter.id = _.first(args)

      const cacheHandle = ThisModel.app.get(options.type)
      if (!cacheHandle) return ThisModel[`_${method}Live`](...args)

      const lastArgs = _.last(args)
      const cb = _.isFunction(lastArgs) ? lastArgs : undefined
      let filterString = JSON.stringify(_(filter).toPairs().sortBy(0).fromPairs().value())
      filterString = filterString.length >= 80
        ? md5(filterString)
        : Buffer.from(filterString).toString('base64')

      const key = [ThisModel.definition.name, method, filterString].join(':')

      const getAndCache = cacheHandle.get(key)
        .then(cache => {
          if (cache) {
            let result = (cacheHandle.isMemcache) ? cache : JSON.parse(cache)
            if (filter.returnId) result = {data: result, id: filter.returnId}
            return invokeCallback(cb, null, result)
          }
          
          config.DEBUG && console.log('CACHE MISS', ThisModel.definition.name, method)

          const newArgs = cb ? _.slice(args, 0, args.length - 1) : args

          return ThisModel[`_${method}Live`](...newArgs)
            .then(result => {
              cacheHandle.setex(
                key,
                Number(filter.cacheTime) || DEFAULT_EXPIRE,
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

  if (options.type && options.methods && options.methods.length) {
    _.each(options.methods, (method) => setupMethodCache(Model, method))

    _.each(options.methods, (method) => {
      Model.beforeRemote(method, (ctx, modelInstance, next) => {
        const role = _.get(ctx, 'args.options.accessToken.role')
        if (!role)
          _.set(ctx, 'args.filter.cacheTime', options.expire || DEFAULT_EXPIRE)

        next()
      })
    })
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
