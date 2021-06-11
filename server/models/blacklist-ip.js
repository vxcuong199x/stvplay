'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const utils = require('../utils/utils')
let blockMap = {}

module.exports = function(BlacklistIp) {

  BlacklistIp.on('dataSourceAttached', () => {
    utils.interval(refresh, 180000)
  })

  function refresh() {
    BlacklistIp.find()
      .then(ips => {
        blockMap = {}
        _.each(ips || [], item => blockMap[item.ip] = true)
      })
      .catch(e => console.error('load blacklist ip error', e.stack || e))
  }

  BlacklistIp.checkBlock = (ip) => {
    return !!blockMap[ip]
  }
}
