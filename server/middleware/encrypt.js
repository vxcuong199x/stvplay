const secret = require('../config/secret')
const consts = require('../config/consts')
const utils = require('../utils/utils')

module.exports = (req, res, next) => {
  const params = req.method == 'GET' ? req.query : req.body

  if (params.p && params.d) {
    const deviceType = Number(params.dt) || consts.DEVICE_TYPE.MOBILE
    const platform = Number(params.p) || consts.PLATFORM.ANDROID
    const deviceId = params.d

    if (params.i) {
      const secretKey = secret.getSecret(deviceType, platform)
      const data = utils.JSONParse(utils.xorDecode(params.i, params.d + secretKey))
      if (req.method == 'GET') {
        req.query = data
      } else {
        req.body = data
      }
    }

    const oldWrite = res.write
    const oldEnd = res.end.bind(res)
    const chunks = []

    res.write = (chunk) => {
      chunks.push(chunk)

      oldWrite.apply(res, arguments)
    }

    res.end = (chunk) => {
      if (chunk) chunks.push(chunk)
      console.log(chunks.length)
      const response = Buffer.concat(chunks).toString('utf8')
      console.log(response)
      const secretKey = secret.getSecret(deviceType, platform)
      const xor = utils.xorEncode(response, deviceId + secretKey)
      oldEnd({o: xor})

      // oldEnd.apply(res, arguments)
    }

    // const sendResponse = res.send.bind(res)
    // res.send = (body) => {
    //   const secretKey = secret.getSecret(deviceType, platform)
    //   const xor = utils.xorEncode(body, deviceId + secretKey)
    //   sendResponse(JSON.stringify({o: xor}))
    // }
  }

  next()
}
