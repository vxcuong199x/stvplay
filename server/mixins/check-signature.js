'use strict'

const _ = require('lodash')
const md5 = require('md5')
const secret = require('../config/secret')
const consts = require('../config/consts')
const config = require('../config/config')
const error = {
  message: 'Wrong sign!',
  statusCode: 403
}

module.exports = (Model, options) => {
    if (!options.methods || !options.methods.length)
      return

    _.forEach(options.methods, item => {

      Model.beforeRemote(item.method, (ctx, modelInstance, next) => {
        const args = ctx.args || {}

        if (!args.signature || args.signature.length != 32) return next(error)

        const fieldValues = []

        for (let i = 0; i < item.fields.length; i++) {
          let field = item.fields[i]
          let value = ctx.args[field] || ''
          fieldValues.push(value)
        }

        let secretKey = secret.getSecret(args.deviceType, args.platform)

        fieldValues.push(secretKey)

        if (md5(fieldValues.join('$')) != args.signature) {
          console.error('wrong signature, server: ', fieldValues.join('$'), md5(fieldValues.join('$')), ', client: ', args.signature)
          return next(error)
        }

        next()
      })

    })
}
