const Promise = require('bluebird')
const _ = require('lodash')
const ObjectId = require('mongodb').ObjectId
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')

const KEY = {
  MOVIE_VIEW: 'ott:movie-view',
  MOVIE_BUY: 'ott:movie-buy'
}

app.on(consts.RABBIT_CHANNEL.MOVIE, (data) => {
  if (!data.second)
    app.get('redis').hincrby(KEY.MOVIE_VIEW, data.id, 1)
})

app.on(consts.RABBIT_CHANNEL.BUY_MOVIE, (data) => {
  app.get('redis').hincrby(KEY.MOVIE_BUY, data.packageId, 1)
})

utils.interval(() => {
  const redis = app.get('redis')

  return Promise.all([
    redis.hgetall(KEY.MOVIE_VIEW),
    redis.hgetall(KEY.MOVIE_BUY)
  ])
    .spread((movieView, movieBuy) => {
      if (!movieView && !movieBuy) {
        return
      }

      app.get('redis').del(KEY.MOVIE_VIEW)
      app.get('redis').del(KEY.MOVIE_BUY)

      const Movie = app.models.Movie
      const bulk = Movie.getDataSource().connector.collection(Movie.modelName).initializeUnorderedBulkOp()
      let update = false

      _.forEach(movieView, (count, id) => {
        const inc = {
          viewerCount: (Number(count) || 0)
        }

        if (movieBuy[id]) {
          inc.buyCount = Number(movieBuy[id]) || 0
          delete movieBuy[id]
        }

        bulk.find({ _id: ObjectId(id) }).updateOne({ $inc: inc })
        update = true
      })

      _.forEach(movieBuy, (count, id) => {
        bulk.find({ _id: ObjectId(id) }).updateOne({ $inc: {buyCount: (Number(count) || 0) }})
        update = true
      })

      if (update)
        return bulk.execute()
    })
    .catch(e => e && console.error('update movie view error', e.stack || e))
}, config.UPDATE_MOVIE_VIEW_INTERVAL * 1000)
