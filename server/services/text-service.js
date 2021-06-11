'use strict'

const Promise = require('bluebird')
const axios = require('axios')
const _ = require('lodash')
const baseUrl = 'https://api.wit.ai/message' // /message?v=20181016&q=Xem+vtv1
const accessToken = 'XDHOIPFDJFQWXYO2ZEV547VX3B63KRSH'

module.exports = class TextService {
  static getMainContent(text) {
    const params = {
      v: 20181016,
      q: text
    }

    console.log(baseUrl + '?' + require('querystring').stringify(params))

    return axios
      .get(baseUrl, {
        params,
        headers: {Authorization: 'Bearer '+accessToken },
        timeout: 5000,
        validateStatus: status => status === 200
      })
      .then(result => {
        console.log(result.data)
        return Promise.resolve(_.get(result, 'data.entities.Search_Content[0].value', text))
      })
      .catch(e => {
        e && console.error('getMainContent err: ', e.stack || e)
        return Promise.resolve(text)
      })
  }
}
