'use strict'

const _ = require('lodash')

module.exports = function(FreeMac) {
  FreeMac.remoteMethod('insertBatch', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'items', type: 'array', default: []}
    ],
    returns: {type: 'object', root: true},
    description: 'Insert batch mac'
  })

  FreeMac.insertBatch = (req, items, cb) => {
    FreeMac.create(items, (e, results) => {
      e && console.error('insert batch mac error: ', e.stack || e)
      cb(null, { ok: results && results.length })
    })
  }
}
