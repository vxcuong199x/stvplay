'use strict'

const _ = require('lodash')

module.exports = (Model, options) => {
  Model.afterRemote('**', (ctx, unused, next) => {
    next()

    if (_.get(ctx, 'req.method') != 'GET' && _.get(ctx, 'req.accessToken.role')) {
      const userId = _.get(ctx, 'req.accessToken.userId')
      if (userId == '5b238ba062ce973d4ea7b8e6') { // user vận hành
        return
      }

      const log = {
        userId: userId,
        method: _.get(ctx, 'req.method'),
        path: _.get(ctx, 'req.baseUrl').replace(/\//g, '_').replace('_api_v1_', ''),
        data: _.get(ctx, 'req.body')
      }

      console.log('CMS change data')

      Model.app.models.CmsLog.create(log)
    }
  })
}
