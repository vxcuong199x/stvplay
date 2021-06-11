'use strict'

const _ = require('lodash')
const consts = require('../config/consts')
const config = require('../config/config')

module.exports = function(Transaction) {
  Transaction.beforeRemote('find', before)
  Transaction.beforeRemote('count', before)

  function before(ctx, config, next) {
    const role = _.get(ctx, 'args.options.accessToken.role')

    if (role != 'admin' && role != 'vh' && role != 'cskh' && role != 'ketoan') {
      const whereString = ctx.method.name == 'find' ? 'args.filter.where' : 'args.where'
      if (role.indexOf('npp_') == 0) {
        const dtId = Number(role.replace('npp_', ''))
        _.set(ctx, `${whereString}.dtId`, dtId)
      } else if (role.indexOf('daily_') == 0) {
        const [unused, dtId, spId] = role.split('_')
        _.set(ctx, `${whereString}.dtId`, dtId)
        _.set(ctx, `${whereString}.spId`, spId)
      }
    }

    next()
  }

  Transaction.observe('after save', (ctx, next) => {
    if (ctx.isNewInstance && process.env.NODE_ENV == 'production') {
      Transaction.app.get('rabbit').publish({
        channel: consts.RABBIT_CHANNEL.TRANSACTION,
        data: ctx.instance
      })
    }

    next()
  })
}
