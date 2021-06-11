'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const moment = require('moment')
const TokenHandler = require('../logic/token-handler')
const consts = require('../config/consts')
const config = require('../config/config')
const secret = require('../config/secret')
const lang = require('../config/lang.vi.js')
const utils = require('../utils/utils')

const disableCheckToken = {
  '/': true,
  '/api/v1/customer/verifyOTP': true,
  '/api/v2/customer/verifyOTP': true,
  '/api/v1/customer/enter': true,
  '/api/v2/customer/enter': true,
  '/api/v1/guest/enter': true,
  '/api/v2/guest/enter': true,
  '/api/v1/config/getConfig': true,
  '/api/v2/config/getConfig': true
}

module.exports = function(CustomerToken) {
  CustomerToken.findForRequest = (req, options, cb) => {
    if (cb === undefined && typeof options === 'function') {
      cb = options
      options = {}
    }

    let tokenId = tokenIdForRequest(req, options)
    if (!tokenId) return cb()

    if (tokenId.length <= 80)
      return CustomerToken.app.models.AccessToken.findForRequest(req, options, cb)

    tokenId = tokenId.replace(/ /g,'+')
    const params = req.method == 'GET' ? req.query : (_.isEmpty(req.body) ? req.query : req.body)
    const deviceId = params.d

    TokenHandler.decrypt(tokenId, deviceId)
      .then(tokenData => {
        if (!tokenData) // tokenData.ip != utils.getIp(req)
          return Promise.reject(new Error('Token invalid'))

        if (CustomerToken.app.models.BlacklistUsername.checkBlock(tokenData.username)
          || CustomerToken.app.models.BlacklistIp.checkBlock(utils.getIp(req))) {
          return Promise.reject(new Error('Ứng dụng đã bị khóa'))
        }

        tokenData.username = utils.convertOldToNewPhone(tokenData.username)

        tokenData.userId = tokenData.username
        tokenData.id = tokenData.username
        tokenData.ttl = Number(tokenData.expireAt) - moment().unix()

        // req.token = tokenId
        req.session = tokenData.session
        req.username = tokenData.username
        req.deviceId = tokenData.deviceId
        req.platform = Number(tokenData.platform)
        req.deviceType = Number(tokenData.deviceType)
        req.dtId = Number(tokenData.dtId) || 1
        req.spId = Number(tokenData.spId) || 1
        req.city = tokenData.city
        req.maxDevice = tokenData.maxDevice
        req.createdAt = tokenData.createdAt
        req.freeUntil = tokenData.freeUntil
        req.isPreset = tokenData.isPreset
        req.guestId = tokenData.guestId

        cb(null, tokenData)

        // console.log('tokenId', tokenId)
      })
      .catch(e => {
        // try {
        //   const [tokenString] = tokenId.split('.')
        //   const data = Buffer.from(tokenString, 'base64').toString('ascii')
        //   const [session, username] = data.split('$')
        //
        //   if (username === 'GUEST') {
        //     e.isGuest = 1
        //   }
        // } catch(e) {
        //   console.error(e.stack || e)
        // }

        e.status = e.statusCode = 401
        e.code = 'INVALID_TOKEN'
        cb(e)
      })
  }

  function tokenIdForRequest(req, options) {
    if (disableCheckToken[req.originalUrl.split('?')[0]])
      return null

    let params = options.params || []
    let headers = options.headers || []
    let cookies = options.cookies || []
    let i = 0
    let length, id

    // https://github.com/strongloop/loopback/issues/1326
    if (options.searchDefaultTokenKeys !== false) {
      params = params.concat(['access_token'])
      headers = headers.concat(['X-Access-Token', 'authorization'])
      cookies = cookies.concat(['access_token', 'authorization'])
    }

    for (length = params.length; i < length; i++) {
      const param = params[i]
      // replacement for deprecated req.param()
      id = req.params && req.params[param] !== undefined ? req.params[param] :
        req.body && req.body[param] !== undefined ? req.body[param] :
          req.query && req.query[param] !== undefined ? req.query[param] :
            undefined

      if (typeof id === 'string') {
        return id
      }
    }

    for (i = 0, length = headers.length; i < length; i++) {
      id = req.header(headers[i])

      if (typeof id === 'string') {
        // Add support for oAuth 2.0 bearer token
        // http://tools.ietf.org/html/rfc6750
        if (id.indexOf('Bearer ') === 0) {
          id = id.substring(7)
          // Decode from base64
          const buf = new Buffer(id, 'base64')
          id = buf.toString('utf8')
        } else if (/^Basic /i.test(id)) {
          id = id.substring(6)
          id = (new Buffer(id, 'base64')).toString('utf8')
          // The spec says the string is user:pass, so if we see both parts
          // we will assume the longer of the two is the token, so we will
          // extract "a2b2c3" from:
          //   "a2b2c3"
          //   "a2b2c3:"   (curl http://a2b2c3@localhost:3000/)
          //   "token:a2b2c3" (curl http://token:a2b2c3@localhost:3000/)
          //   ":a2b2c3"
          const parts = /^([^:]*):(.*)$/.exec(id)
          if (parts) {
            id = parts[2].length > parts[1].length ? parts[2] : parts[1]
          }
        }
        return id
      }
    }

    if (req.signedCookies) {
      for (i = 0, length = cookies.length; i < length; i++) {
        id = req.signedCookies[cookies[i]]

        if (typeof id === 'string') {
          return id
        }
      }
    }
    return null
  }
}
