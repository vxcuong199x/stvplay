'use strict'

const Promise = require('bluebird')

module.exports = function(Counter) {
  Counter.getNextId = function(key) {
    return Counter.findOneAndUpdate(
      { key: key },
      { $inc: { count: 1 } },
      {}
    )
      .then(row => {
        return Promise.resolve(row && row.value ? Number(row.value.count): null)
      })
  }
}
