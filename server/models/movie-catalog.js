'use strict'

const _ = require('lodash')
const ObjectId = require('mongodb').ObjectId

module.exports = function(MovieCatalog) {
  MovieCatalog.beforeRemote('find', (ctx, config, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if ((!role)) {
      _.set(ctx, 'args.filter.where.parentId', "")
    }

    next()
  })

  MovieCatalog.observe('before save', function(ctx, next) {
    if (ctx.instance && ctx.instance.parentId) {
      ctx.instance.parentId = ObjectId(ctx.instance.parentId)
    }

    next()
  })
}
