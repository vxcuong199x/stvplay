'use strict'

const crypto = require('crypto')
const moment = require('moment')
const parseUrl = require('url').parse
const formatUrl = require('url').format
const Promise = require('bluebird')

function hash(payload) {
  try {
    return crypto.createHash('md5').update(payload).digest('hex')
  } catch (e) {
    console.error(e.stack || e)
    return ''
  }
}

function viettelSecureToken (url, opts) {
  opts = opts || {}
  opts.clientIp = opts.clientIp && opts.clientIp.replace('::ffff:', '')

  return Promise.resolve()
    .then(() => {
      const formatted = typeof url === 'string'
      url = formatted ? parseUrl(url) : url
      const filepath = url.pathname
      const dirpath = filepath.substring(1, filepath.lastIndexOf('/'))
      const expiredAt = (Date.now() / 1000 | 0) + opts.ttl
      const payload = `${opts.clientIp || ''}:${opts.secret}:${expiredAt}:/${dirpath}`
      const hashString = hash(payload)

      url.pathname = `/${hashString}${expiredAt}${url.pathname}`

      return Promise.resolve(formatted ? formatUrl(url) : url)
  })
}

module.exports = viettelSecureToken
