'use strict'

const moment = require('moment')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')

module.exports = function(Config) {

  Config.remoteMethod('getConfig', {
    accepts: [
      {arg: 'data', type: 'string', required: true, default: 'about', description: "Chọn 1 trong 3 giá trị: splash|about|term|version"},
      {arg: 'dtId', type: 'number', required: true, default: 1},
      {arg: 'spId', type: 'number', default: 1},
      {arg: 'platform', type: 'number', required: true, default: 1, description: '1: iOs, 2: android, 3: windowsphone'},
      {arg: 'deviceType', type: 'number', required: true, default: 1, description: '1: TV, 2: mobile'},
      {arg: 'signature', type: 'string', required: true},
      {arg: 'deviceId', type: 'string'},
      {arg: 'versionCode', type: 'number'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Get config'
  })

  Config.getConfig = (data, dtId, spId, platform, deviceType, signature, deviceId, versionCode, cb) => {
    if (data == 'server') {
      if (platform == consts.PLATFORM.LG && versionCode == 20181212) {
        return cb(null, { server: 'https://y71nblht6h.execute-api.ap-southeast-1.amazonaws.com/production/8006/api/v1/' })
      } else if (platform == consts.PLATFORM.TIZEN && versionCode == 20181212) {
        return cb(null, { server: 'https://y71nblht6h.execute-api.ap-southeast-1.amazonaws.com/production/8006/api/v1/' })
      }

      return cb(null, { server: 'https://gatesctvott.gviet.vn:8000/api/v1/' })
    }

    if (['splash', 'about', 'term', 'version'].indexOf(data) == -1) {
      return cb(null, {})
    }

    Config
      .findOne({
        where: {
          dtId: dtId,
          deviceType: deviceType
        },
        fields: [data],
        cacheTime: config.CACHE_TIME
      })
      .then(configData => {
        if (!configData || !configData[data]) {
          return Config
            .findOne({
              where: {
                dtId: 1,
                deviceType: deviceType
              },
              fields: [data],
              cacheTime: config.CACHE_TIME
            })
        }

        return Promise.resolve(configData)
      })
      .then(configData => {
        if (!configData || !configData[data]) {
          return cb('invalid data')
        }

        if (data === 'splash') {
          Config.app.get('rabbit').publish({
            channel: consts.RABBIT_CHANNEL.OPEN_APP,
            data: {
              deviceId,
              deviceType,
              platform,
              dtId,
              spId,
              time: moment().unix()
            }
          })
        }

        cb(null, {data: configData[data]})
      })
      .catch(e => {
        console.error('get config err', e.stack || e)
        cb(e)
      })
  }

  Config.remoteMethod('getConfigV2', {
    accepts: [
      {arg: 'data', type: 'string', required: true, default: 'about', description: "Chọn 1 trong 3 giá trị: splash|about|term|version"},
      {arg: 'dtId', type: 'number', required: true, default: 1},
      {arg: 'spId', type: 'number', default: 1},
      {arg: 'platform', type: 'number', required: true, default: 1, description: '1: iOs, 2: android, 3: windowsphone'},
      {arg: 'deviceType', type: 'number', required: true, default: 1, description: '1: TV, 2: mobile'},
      {arg: 'signature', type: 'string', required: true},
      {arg: 'deviceId', type: 'string'},
      {arg: 'versionCode', type: 'number'}
    ],
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Get config'
  })

  Config.getConfigV2 = (data, dtId, spId, platform, deviceType, signature, deviceId, versionCode, cb) => {
    if (data == 'server') {
      if (platform == consts.PLATFORM.LG && versionCode == 20190131) {
        return cb(null, { server: 'https://y71nblht6h.execute-api.ap-southeast-1.amazonaws.com/production/8000/api/v2/' })
      } else if (platform == consts.PLATFORM.TIZEN && versionCode == 20190131) {
        return cb(null, { server: 'https://y71nblht6h.execute-api.ap-southeast-1.amazonaws.com/production/8000/api/v2/' })
      }

      return cb(null, { server: 'https://gatesctvott.gviet.vn:8000/api/v2/' })
    }

    if (['splash', 'about', 'term', 'version'].indexOf(data) == -1) {
      return cb(null, {})
    }

    Config
      .findOne({
        where: {
          dtId: dtId,
          deviceType: deviceType
        },
        fields: [data],
        cacheTime: config.CACHE_TIME
      })
      .then(configData => {
        if (!configData || !configData[data]) {
          return Config
            .findOne({
              where: {
                dtId: 1,
                deviceType: deviceType
              },
              fields: [data],
              cacheTime: config.CACHE_TIME
            })
        }

        return Promise.resolve(configData)
      })
      .then(configData => {
        if (!configData || !configData[data]) {
          return cb('invalid data')
        }

        if (data === 'splash') {
          Config.app.get('rabbit').publish({
            channel: consts.RABBIT_CHANNEL.OPEN_APP,
            data: {
              deviceId,
              deviceType,
              platform,
              dtId,
              spId,
              time: moment().unix()
            }
          })
        }

        cb(null, {data: configData[data]})
      })
      .catch(e => {
        console.error('get config err', e.stack || e)
        cb(e)
      })
  }

  Config.remoteMethod('getTsSample', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'version', type: 'number', default: 1}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'getTsSample'
  })

  Config.getTsSample = (req, version, cb) => {
    if (version !== config.tsSample.version) {
      cb(null, config.tsSample)
    } else {
      cb(null, {})
    }
  }

  Config.remoteMethod('getTsSampleV2', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'version', type: 'number', default: 1}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'getTsSample'
  })

  Config.getTsSampleV2 = (req, version, cb) => {
    if (version !== config.tsSample.version) {
      cb(null, config.tsSample)
    } else {
      cb(null, {})
    }
  }
}
