'use strict'

const _ = require('lodash')

module.exports = function(AddCoinLog) {

  AddCoinLog.beforeRemote('find', before)
  AddCoinLog.beforeRemote('count', before)

  function before(ctx, config, next) {
    const token = _.get(ctx, 'args.options.accessToken')
    const isAdmin = _.get(ctx, 'args.options.authorizedRoles.admin')

    if (!isAdmin && token.role) {
      const whereString = ctx.method.name == 'find' ? 'args.filter.where' : 'args.where'
      if (token.role.indexOf('npp_') == 0) {
        const dtId = Number(token.role.replace('npp_', ''))
        _.set(ctx, `${whereString}.dtId`, dtId)
      } else if (token.role.indexOf('daily_') == 0) {
        const [unused, dtId, spId] = token.role.split('_')
        _.set(ctx, `${whereString}.dtId`, dtId)
        _.set(ctx, `${whereString}.spId`, spId)
      }
    }

    next()
  }
}
