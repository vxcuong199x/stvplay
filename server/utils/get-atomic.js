'use strict'

const Atomic = require('../lib/atomic')
const getRedis = require('./get-redis')
let atomicObj

module.exports = () => {
  if (!atomicObj) {
    atomicObj = new Atomic({ 
      redis: getRedis('redis')
    })
  }

  return atomicObj
}
