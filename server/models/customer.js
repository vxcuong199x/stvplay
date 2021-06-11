'use strict'

const route = require('../routes/customer')
const routeBank = require('../routes/customer-bank')
const routeVas = require('../routes/customer-vassub')

module.exports = function(Customer) {
  route(Customer)
  routeBank(Customer)
  routeVas(Customer)

  Customer.observe('before save', function(ctx, next) {
    if (ctx.data) {
      if (
        (ctx.data.hasOwnProperty('coin') && !ctx.data.coin && ctx.data.coin !== 0)
      ) {
        return next(new Error('Player obj invalid'))
      }
    }

    next()
  })
}
