'use strict'

const crypto = require('crypto')
const parseUrl = require('url').parse
const formatUrl = require('url').format
const Promise = require('bluebird')

/**
 * Make a string to be url friendly.
 * @param str
 */
function urlSafetify (str) {
  return str.replace('+', '-')
    .replace('/', '_')
}

/**
 * Return true if the value is not undefined.
 * @param val
 * @returns {boolean}
 */
function notUndefined (val) {
  return val !== undefined
}

function hash(payload) {
  try {
    return urlSafetify(crypto.createHash('sha256').update(payload).digest('base64'))
  } catch (e) {
    console.error(e.stack || e)
    return ''
  }
}

/**
 * Wowza secure token.
 * Ref: https://www.wowza.com/forums/content.php?
 * 620-How-to-protect-streaming-using-SecureToken-in-Wowza-Streaming-Engine
 */
function wowzaSecureToken (url, opts) {
  opts = opts || {}
  opts.clientIp = opts.clientIp && opts.clientIp.replace('::ffff:', '')

  return Promise.resolve()
    .then(() => {
      const formatted = typeof url === 'string'
      url = formatted ? parseUrl(url) : url
      const filepath = url.pathname
      const basepath = filepath.substring(1, filepath.lastIndexOf('/'))
      const endtime = (Date.now() / 1000 | 0) + opts.ttl
      const endtimeQuery = `${opts.prefix}endtime=${endtime}`
      const payloadQuery = [opts.secret, opts.clientIp, endtimeQuery].filter(notUndefined).sort().join('&')
      const payload = `${basepath}?${payloadQuery}`
      const hashString = hash(payload)

      url.query = url.query || {}
      url.query[`${opts.prefix}hash`] = hashString
      url.query[`${opts.prefix}endtime`] = endtime
      // url.query.ttl = opts.ttl
      // url.query.free = false
      // url.query.trial = true

      return Promise.resolve(formatted ? formatUrl(url) : url)
  })
}

module.exports = wowzaSecureToken
