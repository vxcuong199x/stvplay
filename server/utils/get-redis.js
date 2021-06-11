'use strict'

const Redis = require('ioredis')
const dataSources = process.env.NODE_ENV == 'production'
  ? require('../datasources.json')
  : require('../datasources.development.json')

const connections = {}

/**
 * Get and cache redis client by its name.
 * @param name
 * @returns {*}
 */
function getRedis (name, alias) {
  alias = alias || name
  if (!connections[alias]) {
    const redisConfig = dataSources[name]
    if (!redisConfig) {
      throw new ReferenceError(`Redis config "${name}" doesn't exist`)
    }

    if (!!redisConfig.cluster) {
      connections[alias] = new Redis.Cluster(redisConfig.cluster, {scaleReads: 'all'})
    } else {
      connections[alias] = new Redis(redisConfig)
    }

    connections[alias].on('error', e => {
      console.error('redis err', e.stack || e)
    })
  }

  return connections[alias]
}

module.exports = getRedis
