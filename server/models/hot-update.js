'use strict'

const config = require('../config/config')

module.exports = function(HotUpdate) {
  HotUpdate.remoteMethod('get', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'platform', type: 'number', required: true},
      {arg: 'nativeVersion', type: 'number', required: true},
      {arg: 'jsVersion', type: 'number', required: true}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'get hot update'
  })

  HotUpdate.get = (req, platform, nativeVersion, jsVersion, cb) => {
    HotUpdate.findOne({
      where: { platform, nativeVersion },
      fields: [ 'jsVersion', 'url' ],
      cacheTime: config.CACHE_TIME
    })
      .then(data => {
        if (data && data.jsVersion && data.jsVersion > (jsVersion || 0)) {
          cb(null, { jsVersion: data.jsVersion, url: data.url || '' })
        } else {
          cb(null, {})
        }
      })
      .catch(e => {
        console.error('get hotUpdate err', e.stack || e)
        cb(null, {})
      })
  }
}
