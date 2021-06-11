const Promise = require('bluebird')
const _ = require('lodash')
const ObjectId = require('mongodb').ObjectId
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')

const KEY = {
  CLIP_VIEW: 'ott:clip-view',
  CLIP_BUY: 'ott:clip-buy'
}

app.on(consts.RABBIT_CHANNEL.CLIP, (data) => {
  if (!data.second)
    app.get('redis').hincrby(KEY.CLIP_VIEW, data.id, 1)
})

app.on(consts.RABBIT_CHANNEL.BUY_CLIP, (data) => {
    app.get('redis').hincrby(KEY.CLIP_BUY, data.packageId, 1)
})

utils.interval(() => {
  const redis = app.get('redis')

  return Promise.all([
    redis.hgetall(KEY.CLIP_VIEW),
    redis.hgetall(KEY.CLIP_BUY)
  ])
    .spread((clipView, clipBuy) => {
      if (!clipView && !clipBuy) {
        return
      }

      app.get('redis').del(KEY.CLIP_VIEW)
      app.get('redis').del(KEY.CLIP_BUY)

      const Clip = app.models.Clip
      const bulk = Clip.getDataSource().connector.collection(Clip.modelName).initializeUnorderedBulkOp()
      let update = false

      _.forEach(clipView, (count, id) => {
        const inc = {
          viewerCount: (Number(count) || 0)
        }

        if (clipBuy[id]) {
          inc.buyCount = Number(clipBuy[id]) || 0
          delete clipBuy[id]
        }

        bulk.find({ _id: ObjectId(id) }).updateOne({ $inc: inc })
        update = true
      })

      _.forEach(clipBuy, (count, id) => {
        bulk.find({ _id: ObjectId(id) }).updateOne({ $inc: {buyCount: (Number(count) || 0) }})
        update = true
      })

      if (update)
        return bulk.execute()
    })
    .catch(e => e && console.error('update clip view error', e.stack || e))
}, config.UPDATE_CLIP_VIEW_INTERVAL * 1000)
