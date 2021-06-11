'use strict'

const _ = require('lodash')
const moment = require('moment')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const utils = require('../utils/utils')

const ejs = require('ejs')
const dailyPayEjs = require('fs').readFileSync(require('path').join(__dirname, '../html-template/daily-pay.ejs'))
const dailyPayView = ejs.compile(dailyPayEjs.toString(), { delimiter: '?' })

module.exports = function(PackageType) {

  PackageType.remoteMethod('getList', {
    accepts: [
      {arg: 'groupId', type: 'string', require: true, description: 'ID của gói đã chọn'},
      {arg: 'time', type: 'string', require: true, description: 'Thời gian. VD: P1M'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get package type list'
  })

  PackageType.getList = (groupId, time, cb) => {
    Promise.all([
      PackageType.app.models.PackageGroup.findById(groupId, { cacheTime: config.CACHE_TIME }),
      PackageType.find({ cacheTime: config.CACHE_TIME })
    ])
      .spread((group, list) => {
        if (!group) return cb(null, _.sortBy(list, 'rank'))

        cb(null, _.map(_.sortBy(list, 'rank'), item => {
          item.amount = group.price * moment.duration(time).asMonths() * item.maxDevice * (1-(item.discount/100))
          if (item.discount) {
            item.description += '. ' + lang.discountDescription(item.discount)
          }
          return item
        }))
      })
      .catch(e => {
        console.error('get package list err', e.stack || e)
        cb(null, [])
      })
  }

  PackageType.remoteMethod('getTelcoList', {
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get telco list'
  })

  PackageType.getTelcoList = (cb) => {
    cb(null, { data: _.values(consts.TELCO) })
  }

  PackageType.remoteMethod('getPaymentMethodList', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get payment method list'
  })

  PackageType.getPaymentMethodList = (req, cb) => {
    const paymentMethods = _.clone(consts.PAYMENT_METHOD)

    // todo remove when done momo
    // if (req.platform == consts.PLATFORM.LG || req.platform == consts.PLATFORM.TIZEN) {
    //   delete paymentMethods.MOMO
    // }

    Promise.all([
      PackageType.app.models.Distributor.findOne({
        where: { dtId: req.dtId || 1 },
        field: ['phone'],
        cacheTime: config.CACHE_TIME
      }),
      PackageType.app.models.Distributor2.findOne({
        where: { dtId: req.dtId || 1, spId: req.spId || 1 },
        field: ['phone'],
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((npp, daily) => {
        npp = npp || {}
        daily = daily || {}
        // paymentMethods.DAILY.phone = daily.phone || (npp.phone || consts.PHONE)
      })
      .catch(e => {
        console.error('getPaymentMethodList error: ', e.stack || e)
      })
      .finally(() => {
        cb(null, { data: _.values(paymentMethods) })
      })
  }

  PackageType.remoteMethod('getDailyPayContent', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'getDailyPayContent'
  })

  PackageType.getDailyPayContent = (req, cb) => {
    Promise.all([
      PackageType.app.models.Distributor.findOne({
        where: { dtId: req.dtId || 1 },
        field: ['phone'],
        cacheTime: config.CACHE_TIME
      }),
      PackageType.app.models.Distributor2.findOne({
        where: { dtId: req.dtId || 1, spId: req.spId || 1 },
        field: ['phone'],
        cacheTime: config.CACHE_TIME
      })
    ])
      .spread((npp, daily) => {
        npp = npp || {}
        daily = daily || {}
        cb(null, {
          data: dailyPayView({
            content: lang.dailyPay,
            phone: daily.phone || (npp.phone || consts.PHONE)
          })
        })
      })
      .catch(e => {
        console.error('getPaymentMethodList error: ', e.stack || e)
        cb(null, {data: ''})
      })
  }

  PackageType.remoteMethod('getBankList', {
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get bank list'
  })

  PackageType.getBankList = (cb) => {
    cb(null, { data: _.values(consts.BANK_CODE) })
  }

  PackageType.remoteMethod('getTimeList', {
    accepts: [
      {arg: 'groupId', type: 'string', description: 'ID của gói đã chọn'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get time list'
  })

  PackageType.getTimeList = (groupId, cb) => {
    PackageType.app.models.PackageGroup
      .findById(groupId, { cacheTime: config.CACHE_TIME })
      .then(group => {
        if (!group) return cb(null, [])

        const timeList = _.sortBy(_.map(consts.PACKAGE_BONUS, (bonus, month) => ({
          month: month,
          time: `P${month}M`,
          name: lang.timeDuration(month),
          description: bonus ? lang.bonusDescription(bonus, group.danet*month) : '',
          bonus: bonus,
          amount: group.price * month
        })), [item => -item.month])
          .filter(item => !!Number(item.month))

        cb(null, { data: timeList })
      })
      .catch(e => {
        console.error('getTimeList err', e.stack || e)
        cb(null, [])
      })
  }
}
