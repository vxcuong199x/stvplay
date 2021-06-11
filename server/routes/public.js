'use strict'

const utils = require('../utils/utils')
const _ = require('lodash')
const consts = require('../config/consts')
const config = require('../config/config')
const partnerConfig = require('../config/partner')
const Payment = require('../logic/payment')
const TokenHandler = require('../logic/token-handler')
const DRMToday = require('../services/drm-today')
const moment = require('moment')

module.exports = function(Public) {

  Public.remoteMethod('getHotList', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'get hot list'
  })

  Public.getHotList = (req, type, cb) => {
    const ip = utils.getIp(req)
    // if (partnerConfig.ALLOW_IPS.indexOf(ip) == -1) {
    //   return cb(null, {data: []})
    // }

    const query = {
      where: {
        activated: true,
        homeOrder: {
          gt: 0
        }
      },
      fields: 'default',
      order: 'homeOrder ASC',
      limit: consts.DEFAULT_MOBILE_LIMIT,
      cacheTime: consts.CACHE_TIME
    }

    let operator
    switch (type) {
      case consts.MEDIA_TYPE.CHANNEL:
        operator = Public.app.models.Channel.findAll(req, query)
        break
      case consts.MEDIA_TYPE.MOVIE:
        operator = Public.app.models.Movie.find(query)
        break
      case consts.MEDIA_TYPE.CLIP:
        operator = Public.app.models.Clip.find(query)
        break
    }

    if (!operator) {
      return cb(null, {data: []})
    }

    operator.then(list => {
      list = _.map(list, item => {
        const imageId = item.logo || (item.thumbnail.landscape || null)
        return {
          id: item.id,
          name: item.program || item.name,
          image: utils.getImageUrl(config.BASE_IMAGE_URL, imageId)
        }
      })

      cb(null, {data: list})
    })
      .catch(e => {
        e && console.error('getHotList error', e.stack || e)
        cb(null, {data: []})
      })
  }

  Public.remoteMethod('getCatalogList', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'get hot list'
  })

  Public.getCatalogList = (req, type, cb) => {
    const ip = utils.getIp(req)
    // if (partnerConfig.ALLOW_IPS.indexOf(ip) == -1) {
    //   return cb(null, {data: []})
    // }

    const query = {
      where: { activated: true },
      fields: ['id', 'name', 'logo', 'rank'],
      cacheTime: config.CACHE_TIME
    }

    let operator
    switch (type) {
      case consts.MEDIA_TYPE.CHANNEL:
        operator = Public.app.models.ChannelCatalog.find(query)
        break
      case consts.MEDIA_TYPE.MOVIE:
        operator = Public.app.models.MovieCatalog.find(query)
        break
      case consts.MEDIA_TYPE.CLIP:
        operator = Public.app.models.ClipCatalog.find(query)
        break
    }

    if (!operator) {
      return cb(null, {data: []})
    }

    operator.then(list => {
      list = _(list)
        .sortBy(['rank'])
        .map(item => {
          return {
            id: item.id,
            name: item.name
          }
        })
        .value()

      if (type == consts.MEDIA_TYPE.CHANNEL) {
        list.sort((a, b) => {
          if (a.name.startsWith('SCTV') && !b.name.startsWith('SCTV')) return -1
          else if (!a.name.startsWith('SCTV') && b.name.startsWith('SCTV')) return 1
          else if (a.name.startsWith('SCTV') && b.name.startsWith('SCTV')) {
            return a.name.slice(-2) > b.name.slice(-2) ? 1 : -1
          }
          else if (a.name < b.name) return -1
          else if (a.name > b.name) return 1
          return 0
        })
      }

      cb(null, {
        data: list
      })
    })
      .catch(e => {
        e && console.error('getCatalogList error', e.stack || e)
        cb(null, {data: []})
      })
  }

  Public.remoteMethod('getContentList', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', required: true},
      {arg: 'catalogId', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'get content list'
  })

  Public.getContentList = (req, type, catalogId, cb) => {
    const ip = utils.getIp(req)
    // if (partnerConfig.ALLOW_IPS.indexOf(ip) == -1) {
    //   return cb(null, {data: []})
    // }

    const query = {
      where: {
        activated: true
      },
      order: 'updatedAt DESC',
      fields: 'default',
      limit: consts.DEFAULT_MOBILE_LIMIT,
      cacheTime: consts.CACHE_TIME
    }

    let operator
    switch (type) {
      case consts.MEDIA_TYPE.CHANNEL:
        query.limit = 20
        query.where.channelCatalogIds = catalogId
        operator = Public.app.models.Channel.findAll(req, query)
        break
      case consts.MEDIA_TYPE.MOVIE:
        query.where.movieCatalogIds = catalogId
        operator = Public.app.models.Movie.find(query)
        break
      case consts.MEDIA_TYPE.CLIP:
        query.where.clipCatalogIds = catalogId
        operator = Public.app.models.Clip.find(query)
        break
    }

    if (!operator) {
      return cb(null, {data: []})
    }

    operator.then(list => {
      list = _.map(list, item => {
        const imageId = item.logo || (item.thumbnail.landscape || null)
        return {
          id: item.id,
          name: item.program || item.name,
          channelName: item.name,
          image: utils.getImageUrl(config.BASE_IMAGE_URL, imageId)
        }
      })

      cb(null, {data: list})
    })
      .catch(e => {
        e && console.error('getHotList error', e.stack || e)
        cb(null, {data: []})
      })
  }

  Public.remoteMethod('checkUserExists', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true},
    description: 'checkUserExist'
  })

  Public.checkUserExists = (req, username, cb) => {
    const ip = utils.getIp(req)
    // if (partnerConfig.ALLOW_IPS.indexOf(ip) == -1) {
    //   return cb(null, {})
    // }

    username = utils.formatPhone(username)

    Public.app.models.Customer.findOne({
      where: { username: username }
    })
      .then(customer => {
        cb(null, {exists: customer ? 1 : 0})

        if (customer && customer.dtId != consts.DT_ID.QNET) {
          customer.updateAttribute('dtId', consts.DT_ID.QNET, (e) => e && console.error(e))
          // return Public.app.models.Customer.updateOne(
          //   { username: username },
          //   { dtId: consts.DT_ID.QNET }
          // )
        }
      })
      .catch(e => {
        e && console.error('checkUserExists error', e.stack || e)
        cb(null, {exists: 0, message: 'Lỗi: ' + (e && e.stack)})
      })
  }

  Public.remoteMethod('registerUser', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true}
    ],
    http: {verb: 'post'},
    returns: {type: 'object', root: true},
    description: 'registerUser'
  })

  Public.registerUser = (req, username, cb) => {
    const ip = utils.getIp(req)
    // if (partnerConfig.ALLOW_IPS.indexOf(ip) == -1) {
    //   return cb(null, {})
    // }

    username = utils.formatPhone(username)

    Public.app.models.Customer.findOne({
      where: { username: username },
      fields: ['username']
    })
      .then(customer => {
        if (customer) {
          return Promise.reject()
        }

        return Public.app.models.Customer.create(
          {
            username,
            phone: username,
            devices: [],
            dtId: consts.DT_ID.QNET,
            spId: 1,
            platform: consts.PLATFORM.ANDROID,
            deviceType: consts.DEVICE_TYPE.MOBILE,
            packages: []
          }
        )
      })
      .then(customer => {
        cb(null, { ec: 0 })
      })
      .catch(e => {
        e && console.error('registerUser error', e.stack || e)
        cb(null, {ec: 1, message: 'Tài khoản đã tồn tại. ' + (e && e.stack)})
      })
  }

  Public.remoteMethod('addPackage', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true},
      {arg: 'amount', type: 'number', required: true}
    ],
    http: {verb: 'post'},
    returns: {type: 'object', root: true},
    description: 'addPackage'
  })

  Public.addPackage = (req, username, time, amount, cb) => {
    req.username = utils.formatPhone(username)
    req.deviceType = consts.DEVICE_TYPE.MOBILE
    req.platform = consts.PLATFORM.ANDROID
    req.dtId = consts.DT_ID.QNET
    req.spId = 1

    const groupId = '59ae818de32a0e011ce94460'

    Payment.buyPackage({
      req,
      groupId: groupId, // todo
      time: time,
      packageTypeId: '59af5007e32a0e011ce94462',
      amount: amount,
      buyType: consts.TRANSACTION_TYPE.MOBIFONE
    })
      .then(result => {
        console.log('addPackage result', result)
        cb(null, {ec: 0})

        DRMToday.syncInfo({
          userId: req.username,
          phoneNumber: req.username,
          planId: parseInt(groupId),
          planAmount: amount,
          isPromotion: false,
          createdAt: moment().format('YYYY-MM-DD HH:mm:ss'),
          expiredAt: moment(result.expireAt).format('YYYY-MM-DD HH:mm:ss')
        })
          .then((rs) => {
            return DRMToday.syncInvoice({
              userId: req.username,
              transactionId: result.transactionId,
              // phoneNumber: req.username,
              planId: parseInt(groupId),
              planAmount: amount,
              planValue: Math.floor(moment.duration(time).asDays()),
              isPromotion: false,
              createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
              // expiredAt: moment(result.expireAt).format('YYYY-MM-DD HH:mm:ss')
            })
          })

        const where = { username: req.username }
        const data = { dtId: consts.DT_ID.QNET }
        Public.app.models.Customer.update(
          where,
          { $set: data },
          (e) => {}
        )
      })
      .catch(e => {
        e && console.error('addPackage error', e.stack || e)
        cb(null, {ec: 1, message: 'Không thể cộng gói cước. ' + (e && e.stack)})
      })
  }

  Public.remoteMethod('addFailLog', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true},
      {arg: 'amount', type: 'number', required: true}
    ],
    http: {verb: 'post'},
    returns: {type: 'object', root: true},
    description: 'addFailLog'
  })

  Public.addFailLog = (req, username, time, amount, cb) => {
    req.username = utils.formatPhone(username)
    req.deviceType = consts.DEVICE_TYPE.MOBILE
    req.platform = consts.PLATFORM.ANDROID
    req.dtId = consts.DT_ID.QNET
    req.spId = 1

    Public.app.models.Transaction.create({
      username: req.username,
      platform: req.platform,
      deviceType: req.deviceType,
      deviceId: req.username,
      dtId: req.dtId,
      spId: req.spId,
      ip: req.clientIp || utils.getIp(req),
      time: new Date(),
      contentType: consts.BUY_CONTENT_TYPE.PACKAGE,
      package: 'MAX',
      packageId: '59ae818de32a0e011ce94460',
      amount: amount,
      price: amount,
      month: 0,
      bonusMonths: 0,
      maxDevice: 1,
      isPay: 0,
      status: 1
    })

    cb(null, {ec: 0})

    // return Payment.buyPackage({
    //   req,
    //   groupId: '59ae818de32a0e011ce94460', // todo
    //   time: time,
    //   packageTypeId: '59af5007e32a0e011ce94462',
    //   amount: amount,
    //   buyType: consts.TRANSACTION_TYPE.MOBIFONE
    // })
    //   .then(result => {
    //     console.log('addPackage result', result)
    //     cb(null, {ec: 0})
    //
    //     const where = { username: req.username }
    //     const data = { dtId: consts.DT_ID.QNET }
    //     Public.app.models.Customer.update(
    //       where,
    //       { $set: data }
    //     )
    //   })
    //   .catch(e => {
    //     e && console.error('addPackage error', e.stack || e)
    //     cb(null, {ec: 1, message: 'Không thể cộng gói cước. ' + (e && e.stack)})
    //   })
  }

  Public.remoteMethod('removePackage', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'username', type: 'string', required: true}
    ],
    http: {verb: 'post'},
    returns: {type: 'object', root: true},
    description: 'removePackage'
  })

  Public.removePackage = (req, username, cb) => {
    req.username = utils.formatPhone(username)

    const where = { username: req.username }
    const data = { packages: [], dtId: 1 }
    Public.app.models.Customer.update(
      where,
      { $set: data }
    )

    // const collection = Public.app.models.RoleMapping.getDataSource().connector.collection('Customer')
    // collection.updateOne(where, data, { upsert: true }, (e, r) => e && console.error(e.stack || e))

    TokenHandler.kickUser(req.username)

    cb(null, {ec: 0})
  }
}
