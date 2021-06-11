const rp = require('request-promise')
const Promise = require('bluebird')

module.exports = class FirebaseService {

  /**
   *
   * @param config
   *  uploadUrl
   *  secret
   */
  constructor(config = {  
    baseUrl: 'https://fcm.googleapis.com',
    serverKey: 'AAAA4g_8G3k:APA91bFjMBs2UQSl9JN12MSzd2VeU-xmWp95VzXvN4mEfnxvPXTcu1WbgZKB27awJBZUCwXO-8eOmMOZji8YSfeIxqVgQ9zrm5k1A4EFDUOpSsrd6hR-UGpYhX3SHW_PHtWt1LYVTIZP'
  }) {
    this.config = config
  }

  /**
   * Push notification offline
   * @param params
   *  title (not show in iOS)
   *  body
   *  icon (not show in iOS)
   *  devices (deviceToken array)
   */
  pushNotification(params) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `key=${this.config.serverKey}`
    }

    const options = {
      method: 'POST',
      uri: this.config.baseUrl + '/fcm/send',
      body: {
        registration_ids: params.devices,
        notification: {
          title: params.title,
          body: params.body
        },
        data: {},
        content_available: true
      },
      headers: headers,
      timeout: 60000,
      json: true
    }

    return rp(options)
      .then((rs) => {
        // console.log(rs)
        return Promise.resolve(rs)
      })
      .catch((e) => {
        console.error(e.stack || e)
        return Promise.resolve({})
      })
  }
}
