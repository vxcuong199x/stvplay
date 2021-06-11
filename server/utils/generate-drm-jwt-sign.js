const Promise = require('bluebird')
const _ = require('lodash')
const md5 = require('md5')
const jwt = require('jsonwebtoken')

module.exports = (config, req, id, exp, iat, clientSecret, drmSecret) => {
  return Promise.resolve()
    .then(() => {
      const dataMap = {
        username: req.username,
        deviceId: req.deviceId,
        dtId: req.dtId,
        spId: req.spId,
        accessToken: req.token,
        contentId: id,
        exp: exp,
        secret: clientSecret
      }

      const payload = {
        iss: config.iss,
        aud: config.aud,
        exp: exp,
        sign: md5(_.map(config.drmFields, field => dataMap[field]).join('$'))
      }

      const sign = jwt.sign(
        payload,
        Buffer.from(drmSecret, 'base64'),
        {noTimestamp: true}
      ).split('.').pop()

      console.log('FIELDS', _.map(config.drmFields, field => dataMap[field]).join('$'), payload, jwt.sign(
        payload,
        Buffer.from(drmSecret, 'base64'),
        {noTimestamp: true}
      ))

      return Promise.resolve(sign)
  })
}
