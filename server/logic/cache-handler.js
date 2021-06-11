'use strict'

const _ = require('lodash')
const moment = require('moment')
const ObjectId = require('mongodb').ObjectId
const Promise = require('bluebird')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const getRedis = require('../utils/get-redis')
const app = require('../server')

module.exports = class CacheHandler {
  static getListCache(model, listCondition, options) {
    options.cacheTime = config.CACHE_TIME

    let operators
    _.map(listCondition, (idList, field) => {
      if (field == 'id') {
        operators = _.map(idList, id => {
          return app.models[model].findOne(_.merge({where: { [field]: ObjectId(id) }}, options))
        })
      } else {
        operators = _.map(idList, id => {
          return app.models[model].findOne(_.merge({where: { [field]: id }}, options))
        })
      }
    })

    if (!operators) return Promise.resolve([])

    return Promise.all(operators)
      .spread(function() {
        return _.filter(Array.from(arguments), item => !!item && !_.isEmpty(item))
      })
  }
}
