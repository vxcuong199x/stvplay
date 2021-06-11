'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const utils = require('../utils/utils')
let blockMap = {}

module.exports = function(BlacklistUsername) {

  BlacklistUsername.on('dataSourceAttached', () => {
    utils.interval(refresh, 180000)
  })

  function refresh() {
    BlacklistUsername.find()
      .then(usernames => {
        blockMap = {}
        _.each(usernames || [], item => blockMap[item.username] = true)
      })
      .catch(e => console.error('load blacklist username error', e.stack || e))
  }

  BlacklistUsername.checkBlock = (ip) => {
    return !!blockMap[ip]
  }
}
