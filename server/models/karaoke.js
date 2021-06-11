'use strict'

const config = require('../config/config')
const utils = require('../utils/utils')
const route = require('../routes/karaoke')

module.exports = function(Karaoke) {
  route(Karaoke)

  Karaoke.observe('after delete', (ctx, next) => {
    if (ctx.where && ctx.where.id) {
      console.log('delete karaoke', ctx)
      const elastic = Karaoke.app.get('elastic')
      elastic.delete({
        index: 'karaoke',
        type: 'name',
        id: ctx.where.id.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })

  Karaoke.observe('after save', (ctx, next) => {
    if (ctx.instance.name && ctx.instance.activated) {
      const elastic = Karaoke.app.get('elastic')
      const nameKoDau = utils.locDauTV(ctx.instance.name.trim())
      const nameCompress = utils.compressName(nameKoDau)
      const body = {
        index: ctx.instance.index.toString(),
        name: ctx.instance.name.trim(),
        nameKoDau: nameKoDau,
        nameCompress: []
      }

      for (let i = 2; i <= 5 && i <= nameCompress.length; i++) {
        body.nameCompress.push(nameCompress.substr(0, i))
      }

      if (nameCompress.length > 5) body.nameCompress.push(nameCompress)

      if (ctx.instance.singer && ctx.instance.singer) {
        body.singer = ctx.instance.singer
        body.singerKoDau = utils.locDauTV(body.singer)
        body.singerCompress = utils.compressName(body.singerKoDau)
      }

      elastic.index({
        index: 'karaoke',
        type: 'name',
        id: ctx.instance.index.toString(),
        body: body
      }, e => e && console.error('elastic save karaoke err: ', e.stack || e))
    } else if (!ctx.instance.activated) {
      const elastic = Karaoke.app.get('elastic')
      elastic.delete({
        index: 'karaoke',
        type: 'name',
        id: ctx.instance.index.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })

  Karaoke.remoteMethod('upsertBatch', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'items', type: 'array', default: []}
    ],
    returns: {type: 'object', root: true},
    description: 'Upsert batch karaoke'
  })

  Karaoke.upsertBatch = (req, items, cb) => {
    if (!items || !items.length)
      return cb(null, {})

    const elastic = Karaoke.app.get('elastic')

    Promise.mapSeries(items, item => {
      if (!item.index || !item.name) return Promise.resolve(0)

      const nameKoDau = utils.locDauTV(item.name.trim())
      const nameCompress = utils.compressName(nameKoDau)
      const body = {
        index: item.index.toString(),
        name: item.name.trim(),
        nameKoDau: nameKoDau,
        nameCompress: []
      }

      for (let i = 2; i <= 5 && i <= nameCompress.length; i++) {
        body.nameCompress.push(nameCompress.substr(0, i))
      }

      if (nameCompress.length > 5) body.nameCompress.push(nameCompress)

      if (item.singer && item.singer) {
        body.singer = item.singer
        body.singerKoDau = utils.locDauTV(body.singer)
        body.singerCompress = utils.compressName(body.singerKoDau)
      }

      elastic.index({
        index: 'karaoke',
        type: 'name',
        id: item.index.toString(),
        body: body
      }, e => e && console.error('elastic save karaoke err: ', e.stack || e))

      return Karaoke.update(
        { index: Number(item.index) },
        item,
        { upsert: true }
      )
    })
      .then(result => {
        cb(null, result)
      })
      .catch(e => {
        e && console.error('Karaoke upsert', e.stack || e)
        cb(e)
      })
  }
}
