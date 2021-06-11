'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const sizeof = require('object-sizeof')

module.exports = class Memcache {
  constructor(clearInterval = 1800000) {
    this.data = {}
    this.expire = {}
    this.isMemcache = true
    this._initClearCache(clearInterval)
  }

  get(key) {
    if (this.expire[key] && this.expire[key] <= (Date.now()/1000|0))
      return Promise.resolve(undefined)

    let value
    if (_.isString(this.data[key])) {
      value = JSONParse(this.data[key], this.data[key])
    } else {
      value = this.data[key]
    }

    // console.log('Memcache get', key, sizeof(value))

    return Promise.resolve(value)
  }

  set(key, value) {
    this.data[key] = !isPrimitive(value) ? JSON.stringify(value) : value

    return Promise.resolve()
  }

  setex(key, expire, value) {
    this.data[key] = !isPrimitive(value) ? JSON.stringify(value) : value
    this.expire[key] = (Date.now()/1000|0) + expire

    // console.log('Memcache set', key, sizeof(value))
    // console.log('Memcache size: ', sizeof(this.data), sizeof(this.expire))

    return Promise.resolve()
  }

  _initClearCache(clearInterval) {
    interval(() => {
      console.log('Clear memcache')
      delete this.data
      delete this.expire
      this.data = {}
      this.expire = {}
    }, clearInterval)
  }
}

function interval(func, wait, times) {
  var myInterval = function (w, t) {
    return function () {
      if (typeof t === "undefined" || t-- > 0) {
        setTimeout(myInterval, w);
        try {
          func.call(null);
        }
        catch (e) {
          t = 0;
          throw e;
        }
      }
    };
  }(wait, times);

  setTimeout(myInterval, wait);
}

function isPrimitive(test) {
  return (test !== Object(test));
}

function JSONParse(opts, defaults) {
  if (opts !== null && typeof opts === 'object')
    return opts;

  defaults = defaults || null;
  try {
    defaults = JSON.parse(opts);
  } catch (e) {
    //console.error(e.stack || e);
  }

  return defaults;
}
