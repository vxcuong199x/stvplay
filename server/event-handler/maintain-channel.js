const Promise = require('bluebird')
const _ = require('lodash')
const axios = require('axios')
const moment = require('moment')
const ObjectId = require('mongodb').ObjectId
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')

utils.interval(() => {
  app.models.MaintenanceChannel.find({})
    .then(list => {
      list.forEach(item => {
        if (item.channelId && item.end && moment(item.end).valueOf() <= Date.now()) {
          app.models.MaintenanceChannel.destroyById(item.id, (e, r) => console.error(e, r))
        } else if (!item.channelId && item.start && moment(item.start).valueOf() <= Date.now()) {
          app.models.MaintenanceChannel.update(
            { prepareChannelId: item.prepareChannelId },
            { $set: { channelId: item.prepareChannelId, link: config.MAINTENANCE_URL } },
            { upsert: false }
          )
        }
      })
    })
    .catch(e => {
      console.error('get maintenance channel error', e.stack || e)
    })

}, 60000)
