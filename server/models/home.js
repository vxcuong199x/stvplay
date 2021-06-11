'use strict'

const route = require('../routes/home')
const routeV2 = require('../routes/home-v2')

module.exports = function(Home) {
  route(Home)
  routeV2(Home)
}
