'use strict'

const route = require('../routes/config')
const config = require('../config/config')

module.exports = function(Config) {
  route(Config)

  Config.getConfigByRequest = (req, fields, filter) => {
    return Config.findOne({
      where: {
        dtId: req.query.dtId || (filter.dtId || req.dtId),
        deviceType: req.deviceType
      },
      fields,
      cacheTime: config.CACHE_TIME
    })
  }
}
