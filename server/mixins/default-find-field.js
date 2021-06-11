'use strict'

const _ = require('lodash')

module.exports = (Model, options) => {
  Model.beforeRemote('find', (ctx, modelInstance, next) => {
    const role = _.get(ctx, 'args.options.accessToken.role')
    if ((!role) && options.fields && options.fields.length) {
      // const filterFields = _.get(ctx, 'args.filter.fields', [])
      // const newFields = _.concat(filterFields, options.fields)
      _.set(ctx, 'args.filter.fields', options.fields)
    }

    next()
  })

  Model.observe('access', (ctx, next) => {
    const filterFields = _.get(ctx, 'query.fields')

    if (options.fields && (filterFields == 'default' || _.isArray(filterFields) && !filterFields.length)) {
      _.set(ctx, 'query.fields', options.fields)
    }

    next()
  })
}
