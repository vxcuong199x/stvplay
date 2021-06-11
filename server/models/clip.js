'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const route = require('../routes/clip')
const utils = require('../utils/utils')

module.exports = function(Clip) {
  route(Clip)

  Clip.searchRelate = (clip) => {
    const operators = []
    let keywords = []
    const elastic = Clip.app.get('elastic')

    if (clip.keywords && clip.keywords.length) {
      keywords = clip.keywords.join(' ')
    } else if (clip.title) {
      keywords = utils.locDauTV(clip.title.trim())
    }

    operators.push(elastic.search({
      index: 'clip',
      body: {
        _source: false,
        query: {
          match: {
            keywords: keywords
          }
        },
        size: 12
      }
    }))

    if (clip.actors && clip.actors.length) {
      operators.push(elastic.search({
        index: 'clip',
        body: {
          _source: false,
          query: {
            bool: {
              must: _.map(clip.actors, actor => {
                return { match_phrase: { actors: actor } }
              })
            }
          },
          size: 12
        }
      }))
    } else {
      operators.push({ hits: { hits: [] } })
    }

    return Promise.all(operators)
  }

  Clip.observe('after delete', (ctx, next) => {
    if (ctx.where && ctx.where.id) {
      const elastic = Clip.app.get('elastic')
      elastic.delete({
        index: 'clip',
        type: 'name',
        id: ctx.where.id.toString()
      }, e => e && console.error(e.stack || e))

      Clip.app.models.ClipEpisode.destroyAll({ clipId: ctx.where.id }, next)
    }

    next()
  })

  Clip.observe('after save', (ctx, next) => {
    if (ctx.instance.name && ctx.instance.activated) {
      const elastic = Clip.app.get('elastic')
      const nameKoDau = utils.locDauTV(ctx.instance.name.trim())
      const nameCompress = utils.compressName(nameKoDau)
      const body = {
        name: ctx.instance.name.trim(),
        nameKoDau: nameKoDau,
        nameCompress: []
      }

      for (let i = 2; i <= 5 && i <= nameCompress.length; i++) {
        body.nameCompress.push(nameCompress.substr(0, i))
      }

      if (nameCompress.length > 5) body.nameCompress.push(nameCompress)

      if (ctx.instance.actors && ctx.instance.actors.length)
        body.actors = ctx.instance.actors

      if (ctx.instance.keywords && ctx.instance.keywords.length)
        body.keywords = ctx.instance.keywords
      else
        body.keywords = nameKoDau

      elastic.index({
        index: 'clip',
        type: 'name',
        id: ctx.instance.id.toString(),
        body: body
      }, e => e && console.error('elastic save clip err: ', e.stack || e))
    } else if (!ctx.instance.activated) {
      const elastic = Clip.app.get('elastic')
      elastic.delete({
        index: 'clip',
        type: 'name',
        id: ctx.instance.id.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })
}
