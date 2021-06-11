'use strict'

const Promise = require('bluebird')
const amqplib = require('amqplib')
const shortid = require('shortid')
const lodash = require('lodash')


const ERROR_CODE = {
  NORMAL: 500,
  TIMEOUT: 510
}

module.exports = class RabbitMQ {

  constructor({connectionString, rpcTimeout}) {
    this.connectionString = connectionString || 'amqp://localhost'
    this.channel = null
    this._initChannel()
    this.rpcCallbackQueue = null
    this.callbacks = {}
    this.rpcTimeout = rpcTimeout || 10000
    this.timeCallbacks = {}
    this.intervalLog = {}
  }

  publish({channel, topic, data}) {
    if (process.env.NODE_ENV != 'production') return
    
    // console.log('PUBLISH rabbit: ', channel, topic, JSON.stringify(data))
    (this.channel ? Promise.resolve.bind(this) : this._initChannel.bind(this))()
      .then(() => {
        this.channel.assertExchange(channel, 'topic', {durable: true})
        return this.channel.publish(channel, topic, new Buffer(JSON.stringify(data)))
      })
      .catch(e => {
        e && console.error('rabbit publish error')
        this._onError(e)
        return Promise.reject(e)
      })
  }

  sendToQueue(queue, data) {
    (this.channel ? Promise.resolve.bind(this) : this._initChannel.bind(this))()
      .then(() => {
        this.channel.assertQueue(queue, {durable: false})
        return this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)))
      })
      .catch(e => {
        e && console.error('rabbit sendToQueue error')
        this._onError(e)
        return Promise.reject(e)
      })
  }

  listenQueue(queue, processor) {
    (this.channel ? Promise.resolve.bind(this) : this._initChannel.bind(this))()
      .then(() => {
        this.channel.assertQueue(queue, {durable: false})
        console.log('listen queue OK')
        return this.channel.consume(
          queue,
          msg => processor(parseJSON(msg.content.toString())),
          {noAck: true}
        )
      })
      .catch(e => {
        e && console.error('rabbit listenQueue error')
        this._onError(e)
        return Promise.reject(e)
      })
  }

  rpcCall(rpcQueue, data, timeout) {
    return new Promise((resolve, reject) => {
      if (typeof rpcQueue !== 'string' || rpcQueue.split('.').length <= 1) {
        throw new Error('Tên rpc phải là string và có định dạng <rpcService>.<rpcMethod>')
      }

      console.log('rpcCall', rpcQueue, data)
      let i = 0

      const corr = shortid()
      this.intervalLog[corr] = setInterval(() => {
        console.log('rpcCall', ++i, rpcQueue, data)
      }, 1000)
      this.timeCallbacks[corr] = setTimeout(() => {
        lodash.partial(rpcTimeout, resolve)
        clearInterval(this.intervalLog[corr])
      }, timeout || this.rpcTimeout)

      ;(this.channel ? Promise.resolve.bind(this) : this._initChannel.bind(this))()
        .then(() => {
          console.log('channel OK')
          return (this.rpcCallbackQueue ? Promise.resolve.bind() : this._initRpcCallBackQueue.bind(this))()
        })
        .then(() => {
          console.log('init Callback OK')
          this.channel.sendToQueue(rpcQueue,
            new Buffer(JSON.stringify(data)),
            { correlationId: corr, replyTo: this.rpcCallbackQueue });
          console.log('send to queue OK')
          this.callbacks[corr] = resolve
        })
        .catch((e) => {
          e && console.error('rabbit rpcCall error')
          this._onError(e)
          reject(e)
        })
    })
  }

  subscribe({channel, topic, queue, ack, processor}) {
    (this.channel ? Promise.resolve.bind(this) : this._initChannel.bind(this))()
      .then(() => {
        this.channel.assertExchange(channel, 'topic', {durable: true})
        return this.channel.assertQueue(queue || '', {exclusive: !queue, durable: true})
      })
      .then(q => {
        this.channel.prefetch(10)
        this.channel.bindQueue(q.queue, channel, topic)

        const onDone = (msg) => ack
          ? (e) => e ? this.channel.reject(msg, true) : this.channel.ack(msg)
          : undefined

        return this.channel.consume(
          q.queue,
          msg => processor(parseJSON(msg.content.toString()), onDone(msg)),
          {noAck: !ack}
        )
      })
      .catch(e => {
        e && console.error('rabbit subscribe error')
        this._onError(e)
        return Promise.reject(e)
      })
  }

  _initChannel() {
    return amqplib.connect(this.connectionString || 'amqp://localhost')
      .then(connection => {
        this.connection = connection
        this.connection.on('error', this._onError)

        // process.once('SIGINT', () => {
        //   console.log('close connection')
        //   this.connection.close.bind(this.connection)
        // })

        return this.connection.createChannel()
      })
      .then(channel => {
        console.log('rabbit init channel OK')
        this.channel = channel
        this.channel.on('error', this._onError)

        return Promise.resolve()
      })
  }

  _onError(e) {
    this.rpcCallbackQueue = null
    console.error('rabbit error', e.stack || e)
    if (!this.channel) return
    this.channel.close(e => {
      e && console.error(e)
      this.channel = null
      this.connection.close(e => e && console.error(e))
    })
    this.channel = null
  }
}


const parseJSON = function parseJSON(params, defaults) {
  defaults = {}
  try {
    return JSON.parse(params)
  } catch (error) {
    return defaults
  }
}

const rpcTimeout = function rpcTimeout(resolve, reject) {
  // call when rpc is timeout
  console.log('PRC call is timeout')
  resolve({
    ec: ERROR_CODE.TIMEOUT,
    msg: 'rpc call is timeout'
  })
}
