'use strict'

const Promise = require('bluebird')
const lockAttr = (id) => `lock:${id}`

const promiseDoWhile = (action, condition, wait) => {
  return action().then(result => {
    if (condition(result)) {
      return Promise.delay(wait)
        .then(promiseDoWhile.bind(null, action, condition, wait))
    }
  })
}

module.exports = class Atomic {
  constructor({ redis, wait, maxRetry, lockKey }) {
    this.redis = redis
    this.wait = wait || 330
    this.maxRetry = maxRetry || 10
    this.lockKey = lockKey || 'atomic:lock'
  }

  begin(id) {
    let count = 0
    return promiseDoWhile(
      this.redis.hset.bind(this.redis, this.lockKey, lockAttr(id), 1),
      notLock => !notLock && ++count <= this.maxRetry,
      this.wait
    )
  }

  end(id) {
    return this.redis.hdel(this.lockKey, lockAttr(id))
  }
}
