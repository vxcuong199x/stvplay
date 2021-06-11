'use strict'

const _ = require('lodash')

module.exports = (Model, options) => {
  const methods = _.get(options, 'methods', [])
  if (methods.indexOf('find') == -1) methods.push('find')

  _.each(methods, (method) => {
    Model.beforeRemote(method, (ctx, modelInstance, next) => {
      const role = _.get(ctx, 'args.options.accessToken.role')
      if (!role) {
        const filter = _.get(ctx, 'args.filter', {})
        _.set(ctx, 'args.filter', _.merge(filter, options.filter))
      }

      next()
    })
  })
}
