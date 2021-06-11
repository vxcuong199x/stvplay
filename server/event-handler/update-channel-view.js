const Promise = require('bluebird')
const _ = require('lodash')
const ObjectId = require('mongodb').ObjectId
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')

const KEY = {
  CHANNEL_VIEW: 'ott:channel-view'
}

app.on(consts.RABBIT_CHANNEL.CHANNEL, (data) => {
  app.get('redis').hincrby(KEY.CHANNEL_VIEW, data.id, 1)
})

utils.interval(() => {
  app.get('redis')
    .hgetall(KEY.CHANNEL_VIEW)
    .then(channelView => {
      app.get('redis').del(KEY.CHANNEL_VIEW)
      const Channel = app.models.Channel
      const bulk = Channel.getDataSource().connector.collection(Channel.modelName).initializeUnorderedBulkOp()
      let update = false
      _.forEach(channelView, (count, id) => {
        bulk.find({ _id: ObjectId(id) }).updateOne({ $inc: { viewerCount: (Number(count) || 0) } })
        update = true
      })

      if (update)
        bulk.execute()
    })
    .catch(e => e && console.error('update channel view error', e.stack || e))
}, config.UPDATE_CHANNEL_VIEW_INTERVAL * 1000)
