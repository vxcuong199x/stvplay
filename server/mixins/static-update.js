'use strict'

const _ = require('lodash')
const Promise = require('bluebird')

module.exports = (Model, options) => {
  Model.update = Promise.promisify((where, data, options, cb) => {
    const collection = Model.getDataSource().connector.collection(Model.modelName)
    collection.updateOne(where, data, options, cb)
  })

  Model.findOneAndUpdate = Promise.promisify((where, data, options, cb) => {
    const collection = Model.getDataSource().connector.collection(Model.modelName)
    collection.findOneAndUpdate(where, data, _.merge({upsert: false, returnOriginal: false}, options), cb)
  })

  Model.findOneRaw = Promise.promisify((where, projection, cb) => {
    const collection = Model.getDataSource().connector.collection(Model.modelName)
    collection.findOne(where, projection, cb)
  })
}
