const moment = require('moment')

module.exports = (config) => {
  return (e, req, res, next) => {
    console.error('unhandled error', e)
    next(e)
  }
}
