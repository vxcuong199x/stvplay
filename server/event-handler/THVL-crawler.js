const Promise = require('bluebird')
const _ = require('lodash')
const axios = require('axios')
const ObjectId = require('mongodb').ObjectId
const app = require('../worker')
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')

const thvlChannels = [
  {
    dbId: '5baeefbfe20b74bee78261c5',
    crawlerId: 'aab94d1f-44e1-4992-8633-6d46da08db42'
  },
  {
    dbId: '5b64075a2752920177627048',
    crawlerId: 'bc60bddb-99ac-416e-be26-eb4d0852f5cc'
  }
]

// utils.interval(() => {
//   thvlChannels.forEach(channel => {
//     getThvlStream(channel.crawlerId)
//       .then(source => {
//         if (!source) {
//           console.error('Cannot get source', channel.crawlerId)
//           return
//         }
//
//         app.models.Channel.update(
//           { _id: ObjectId(channel.dbId) },
//           { $set: { isSecure: false, source: source } },
//           { upsert: false }
//         )
//       })
//       .catch(e => e && console.error('THVL channel crawler error', e.stack || e))
//   })
//
// }, 3600000)

function getThvlStream(channelId) {
  const Url = `http://api.thvli.vn/backend/cm/content/${channelId}/?app_version=3.3&os_name=12.1.1&os_version=12.1.1&platform=ios`
  return axios({
    url: Url,
  })
    .then(response => {
      if (response.status !== 200) {
        return Promise.resolve('')
      }
      const data = response.data

      if (!data.link_play) {
        return Promise.resolve('')
      }

      return Promise.resolve(data.link_play)
    })

}
