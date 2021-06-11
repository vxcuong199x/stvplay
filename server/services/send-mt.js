'use strict'

const axios = require('axios')
let mtUrl = 'http://113.190.233.178:8089/sendSms' //
const consts = require('../config/consts')
const app = require('../server')

module.exports = (to, msg, partner) => {
  if (process.env.NODE_ENV === 'development') return

  const isViettel = to.startsWith('843')
      || to.startsWith('8416')
      || to.startsWith('8496')
      || to.startsWith('8497')
      || to.startsWith('8498')
      || to.startsWith('8486')

  // if (isViettel) {
  //   mtUrl = 'http://10.2.10.10/gate.gviet.vn/public/sendMT.php'
  // } else {
    mtUrl = 'http://113.190.233.178:8089/sendSms'
  // }

  const realPhone = to

  console.log('sendMT', to, partner, realPhone, msg)

  app.get('logstash').info({
    meta_logType: 'sendMT',
    to: realPhone,
    mt: msg,
    isViettel,
    name: undefined,
    source: undefined,
    tags: undefined,
    message: undefined
  })

  if (partner && partner === consts.DT_ID.QNET) {
    return axios({
      method: 'post',
      url: 'http://10.2.10.4:8003/sendMt',
      data: {
        isdn: realPhone,
        content: msg
      },
      timeout: 30000
    })
      .then(rs => console.log(rs.data))
      .catch(e => console.error('send qnet mt error', e.stack || e))
  }

  return axios
    .get(mtUrl, {
      params: {to: realPhone, msg, prId: consts.PRODUCT_ID},
      timeout: 30000
    })
    .catch(e => console.error('send mt error', e.stack || e))
}

// function convertOldToNewPhone(phone) {
//   if (phone.length === 12) {
//     for (let i = 0; i < heads.length; i++) {
//       if (phone.startsWith(heads[i])) {
//         return phone.replace(heads[i], convert[heads[i]])
//       }
//     }
//   }
//
//   return phone
// }


