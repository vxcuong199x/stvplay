'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')

const catalogFieldMap = {
  [consts.ADS_TYPE.CHANNEL]: 'channelCatalogIds',
  [consts.ADS_TYPE.MOVIE]: 'movieCatalogIds',
  [consts.ADS_TYPE.CLIP]: 'clipCatalogIds'
}

module.exports = function(Ads) {
  Ads.getAds = (type, mediaObj) => {
    const packagePrice = _.get(consts, `PACKAGE.${mediaObj.packageCode}.price`)

    if (packagePrice) {
      return Promise.resolve(undefined)
    } else {
      return Promise.resolve({adsType: "facebook", "data":[{"type":"start", "id": "1865190850222891_2313830225358949"}, {"type":"time", "data":"5:00,24:30", "id": "1865190850222891_2313830225358949"}]}) //1865190850222891_2048250761916898
    }

    return Ads.find({
      where: {
        runIn: type,
        activated: true
      },
      fields: ['type', 'data', 'catalogIds'],
      order: 'updatedAt DESC',
      cacheTime: config.CACHE_TIME
    })
      .then(adsList => {
        adsList = _(adsList)
          .sortBy((ads) => {
            return ads.catalogIds && ads.catalogIds.length ? 0 : 1
          })
          .value()

        let ads
        for (let i = 0; i < adsList.length; i++) {
          if (!adsList[i].catalogIds || !adsList[i].catalogIds.length) {
            ads = adsList[i]
            break
          } else if (_.intersection(adsList[i].catalogIds, mediaObj[catalogFieldMap[type]]).length) {
            ads = adsList[i]
            break
          }
        }

        return ads ? { adsType: ads.type, data: ads.data } : undefined
      })
  }
}
