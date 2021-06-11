'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const route = require('../routes/movie')
const utils = require('../utils/utils')

module.exports = function(Movie) {
  route(Movie)

  Movie.searchRelate = (movie) => {
    const operators = []
    let keywords
    const elastic = Movie.app.get('elastic')

    if (movie.keywords && movie.keywords.length) {
      keywords = movie.keywords.join(' ').trim()
    }

    if (!keywords) {
      keywords = utils.locDauTV(movie.name.trim())
    }

    operators.push(elastic.search({
      index: 'movie',
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

    if (movie.actors && movie.actors.length) {
      const body = {
        _source: false,
        query: {
          bool: {
            must: _.map(movie.actors, actor => {
              return { match_phrase: { actors: actor } }
            })
          }
        },
        size: 12
      }

      operators.push(elastic.search({
        index: 'movie',
        body: body
      }))
    } else {
      operators.push({ hits: { hits: [] } })
    }

    return Promise.all(operators)
  }

  Movie.observe('after delete', (ctx, next) => {
    if (ctx.where && ctx.where.id) {
      const elastic = Movie.app.get('elastic')
      elastic.delete({
        index: 'movie',
        type: 'name',
        id: ctx.where.id.toString()
      }, e => e && console.error(e.stack || e))

      Movie.app.models.MovieEpisode.destroyAll({ movieId: ctx.where.id }, next)
    }

    next()
  })

  Movie.observe('after save', (ctx, next) => {
    if (ctx.instance.name && ctx.instance.activated) {
      const elastic = Movie.app.get('elastic')
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
        index: 'movie',
        type: 'name',
        id: ctx.instance.id.toString(),
        body: body
      }, e => e && console.error('elastic save movie err: ', e.stack || e))
    } else if (!ctx.instance.activated) {
      const elastic = Movie.app.get('elastic')
      elastic.delete({
        index: 'movie',
        type: 'name',
        id: ctx.instance.id.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })
}
