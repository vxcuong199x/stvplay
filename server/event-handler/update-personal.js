const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const PersonalMemory = require('../logic/personal-memory')

app.on(consts.RABBIT_CHANNEL.CHANNEL, (data) => {
  PersonalMemory.markViewChannel(data.username, data.id)
})

app.on(consts.RABBIT_CHANNEL.MOVIE, (data) => {
  app.models.Movie.findById(data.id, {
    fields: ['id', 'movieCatalogIds'],
    include: 'catalogs',
    cacheTime: config.CACHE_TIME
  })
    .then(movie => {
      if (!movie || !movie.catalogs || !movie.catalogs.length) return

      const catalogs = []
      const markSetCatalog = {}
      _.forEach(movie.catalogs, catalog => {
        const parentId = catalog.parentId || catalog.id
        if (parentId && !markSetCatalog[parentId]) {
          markSetCatalog[parentId] = true
          catalogs.push(parentId)
        }
      })

      if (catalogs.length) {
        PersonalMemory.markViewMovie(data.username, catalogs, data.id, data.second || 0, data.episode || 0)
      }
    })
    .catch(e => {
      console.error('getMovieCatalogs', e.stack || e)
    })
})

app.on(consts.RABBIT_CHANNEL.CLIP, (data) => {
  app.models.Clip.findById(data.id, {
    fields: ['clipCatalogIds'],
    include: 'catalogs',
    cacheTime: config.CACHE_TIME
  })
    .then(clip => {
      if (!clip || !clip.catalogs || !clip.catalogs.length) return

      const catalogs = []
      const markSetCatalog = {}
      _.forEach(clip.catalogs, catalog => {
        const parentId = catalog.parentId || catalog.id
        if (!markSetCatalog[parentId]) {
          markSetCatalog[parentId] = true
          catalogs.push(parentId)
        }
      })

      if (catalogs.length) {
        PersonalMemory.markViewClip(data.username, catalogs, data.id, data.second || 0, data.episode || 0)
      }
    })
    .catch(e => {
      console.error('getClipCatalogs', e.stack || e)
    })
})

// app.on(consts.RABBIT_CHANNEL.HOME, (data) => {
//   PersonalMemory.checkLossData(data.username)
//     .then(isLoss => {
//       if (isLoss) {
//         app.models.Personal.findOne({
//           where: {username: data.username}
//         })
//           .then(data => {
//             if (!data) return
//
//             if (data.buyMovie && Object.keys(data.buyMovie).length > 0) {
//               PersonalMemory.markBuyMovies(data.username, data.buyMovie)
//             }
//
//             if (data.buyClip && Object.keys(data.buyClip).length > 0) {
//               PersonalMemory.markBuyClips(data.username, data.buyClip)
//             }
//           })
//           .catch(e => console.error('restore personal loss data error: ', e.stack || e))
//       }
//     })
// })

console.log('Event listening ...')
