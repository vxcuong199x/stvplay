'use strict'

const _ = require('lodash')
const route = require('../routes/channel')
const routeV2 = require('../routes/channel-v2')
const utils = require('../utils/utils')
const config = require('../config/config')

module.exports = function(Channel) {
  route(Channel)
  routeV2(Channel)

  Channel.observe('after save', (ctx, next) => {
    if (!ctx.instance) return next()

    const instance = _.clone(ctx.instance)

    if (instance.name && instance.activated) {
      const elastic = Channel.app.get('elastic')
      const nameKoDau = utils.locDauTV(instance.name.toLowerCase().trim())

      elastic.index({
        index: 'channel',
        type: 'name',
        id: instance.id.toString(),
        body: {
          name: instance.name.toLowerCase().trim(),
          nameKoDau: nameKoDau,
          nameCompress: [nameKoDau.replace(/ /g, '')]
        }
      }, e => e && console.error(e.stack || e))

      let tmp = instance.source_secue.split('.smil')[0].split('/')
      tmp = (tmp[tmp.length-1] || '').split('-')
      const channelId = tmp[0]

      if (instance.showPhone) {
        Channel.app.models.ShowPhoneChannel.create({
          channelId: channelId
        })
      } else {
        Channel.app.models.ShowPhoneChannel.destroyAll({
          channelId: channelId
        })
      }

      if (instance.maintenance) {
        Channel.app.models.MaintenanceChannel.create({
          channelId: channelId,
          link: config.MAINTENANCE_URL
        })
      } else {
        Channel.app.models.MaintenanceChannel.destroyAll({
          channelId: channelId
        })
      }
    } else if (!instance.activated) {
      const elastic = Channel.app.get('elastic')
      elastic.delete({
        index: 'channel',
        type: 'name',
        id: instance.id.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })

  Channel.observe('after delete', (ctx, next) => {
    if (ctx.where && ctx.where.id) {
      const elastic = Channel.app.get('elastic')
      elastic.delete({
        index: 'movie',
        type: 'channel',
        id: ctx.where.id.toString()
      }, e => e && console.error(e.stack || e))
    }

    next()
  })
}
