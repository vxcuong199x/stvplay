'use strict'

const FirebaseService = require('../services/firebase-service')
const elasticsearch = require('elasticsearch')
const bunyan = require('bunyan')
const bunyantcp = require('bunyan-logstash-tcp')
const dataSources = process.env.NODE_ENV == 'production'
  ? require('../datasources.json')
  : require('../datasources.development.json')
const getRedis = require('../utils/get-redis')
const RabbitMQ = require('../lib/rabbitmq')
const Memcache = require('../lib/memcache')
const numeral = require('numeral')
numeral.register('locale', 'vi', { delimiters: { thousands: '.'} })
numeral.locale('vi')

module.exports = (server) => {
  server.set('redisSession', getRedis('redisSession'))
  server.set('redis', getRedis('redis'))
  server.set('memcache', new Memcache())
  server.set('firebase', new FirebaseService())
  server.set('rabbit', new RabbitMQ({
    connectionString: dataSources.rabbitmq.url
  }))
  server.set('elastic', new elasticsearch.Client(Object.assign({}, dataSources.elastic)))
  const logger = bunyan.createLogger({name: "stvplay"})
  // const logger = bunyan.createLogger({
  //   name: dataSources.logstash.name,
  //   streams: [{
  //     level: 'debug',
  //     type: "raw",
  //     stream: bunyantcp
  //       .createStream(Object.assign({
  //         max_connect_retries: 1000,
  //         retry_interval: 1000
  //       }, dataSources.logstash))
  //       .on('error', (e) => {
  //         console.error('logstash tcp error: ', e.stack || e)
  //       })
  //   }],
  //   level: 'info',
  //   meta_app: dataSources.logstash.name
  // })

  logger.on('error', (e, stream) => {
    console.error('logstash error: ', e.stack || e)
  })

  server.set('logstash', logger)
}
