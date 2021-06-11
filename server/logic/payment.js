'use strict'

const _ = require('lodash')
const moment = require('moment')
const Promise = require('bluebird')
const useCard = require('../services/use-card')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const app = require('../server')
const TokenHandler = require('../logic/token-handler')
const PersonalMemory = require('../logic/personal-memory')
const utils = require('../utils/utils')
const getRedis = require('../utils/get-redis')
const getAtomic = require('../utils/get-atomic')
const numeral = require('numeral')
numeral.locale('vi')

const atomicKey = (username) => `ott:customer:${username}`
const orderKey = (orderId) => `ott:orderInfo:${orderId}`

module.exports = class Payment {
  static setOrderInfo(orderId, orderInfo) {
    return getRedis('redis')
      .setex(orderKey(orderId), 30*60000, orderInfo)
  }

  static getOrderInfo(orderId) {
    return getRedis('redis')
      .get(orderKey(orderId))
  }

  static removeOrderInfo(orderId) {
    return getRedis('redis')
      .del(orderKey(orderId))
  }

  static calculatePackageAmount({ username, groupId, time, packageTypeId }) {
    const month = moment.duration(time).asMonths()
    if (!consts.PACKAGE_BONUS.hasOwnProperty(month.toString())) {
      return Promise.reject(consts.CODE.DATA_MISSING)
    }

    return Promise.all([
      app.models.PackageGroup.findById(groupId, { cacheTime: config.CACHE_TIME }),
      app.models.PackageType.findById(packageTypeId, { cacheTime: config.CACHE_TIME }),
      app.models.Customer.findOne({
        where: { username }
      })
    ])
      .spread((group, packageType, customer) => {
        if (!group || !packageType || !customer) {
          return Promise.reject(consts.CODE.DATA_MISSING)
        }

        const coinField = customer.coin ? 'coin' : 'freeCoin'

        customer[coinField] = customer[coinField] || 0
        const totalAmount = group.price * month * packageType.maxDevice
        let afterDiscount = totalAmount * (1-(packageType.discount/100))
        afterDiscount = Math.floor(afterDiscount/1000) * 1000

        // todo fix for MAX+
        customer[coinField] = 0

        return {
          group,
          totalAmount: afterDiscount,
          requireAmount: (afterDiscount - customer[coinField])
        }
      })
  }

  static calculateMovieAmount({ username, movieId }) {
    return Promise.all([
      app.models.Movie.findById(movieId, {
        fields: ['price', 'name'],
        cacheTime: config.CACHE_TIME
      }),
      app.models.Customer.findOne({
        where: { username }
      })
    ])
      .spread((movie, customer) => {
        if (!movie || !customer) {
          return Promise.reject(consts.CODE.DATA_MISSING)
        }

        const coinField = customer.coin ? 'coin' : 'freeCoin'

        return {
          movie,
          totalAmount: movie.price,
          currentCoin: customer[coinField],
          requireAmount: movie.price - customer[coinField]
        }
      })
  }

  static calculateClipAmount({ username, clipId }) {
    return Promise.all([
      app.models.Clip.findById(clipId, {
        fields: ['price', 'name'],
        cacheTime: config.CACHE_TIME
      }),
      app.models.Customer.findOne({
        where: { username }
      })
    ])
      .spread((clip, customer) => {
        if (!clip || !customer) {
          return Promise.reject(consts.CODE.DATA_MISSING)
        }

        const coinField = customer.coin ? 'coin' : 'freeCoin'

        return {
          clip,
          totalAmount: clip.price,
          requireAmount: clip.price - customer[coinField]
        }
      })
  }

  static atomicUpdatePackage({ username, group, time, packageType, amount, buyType, giftCode }) {
    amount = Number(amount)
    const atomic = getAtomic()
    return atomic.begin(atomicKey(username))
      .then(() => app.models.Customer.findOne({ where: { username } }))
      .then(customer => {
        if (!customer) {
          return Promise.reject('Customer not exists')
        }

        customer.packages = customer.packages || []

        const maxDevice = Number(packageType.maxDevice) || 1
        const month = moment.duration(time).asMonths()
        let totalPrice = 0
        let coinField = 'coin'
        let isPay = true
        if (!customer.coin && customer.freeCoin) {
          coinField = 'freeCoin'
          isPay = false
        }

        if (buyType != consts.TRANSACTION_TYPE.GIFT_CODE && buyType != consts.TRANSACTION_TYPE.MOBIFONE) {
          totalPrice = group.price * month * maxDevice
        }
        // else if (customer.hasGiftCode) {
        //   return Promise.reject({
        //     statusCode: consts.CODE.WRONG_FLOW,
        //     message: lang.enterGiftCodeOneTime
        //   })
        // }
        else if (giftCode && !giftCode.price) {
          isPay = false
        }

        customer[coinField] = Number(customer[coinField]) || 0
        let afterDiscount = totalPrice * (1-((packageType.discount||0)/100))
        afterDiscount = Math.floor(afterDiscount/1000) * 1000

        if (customer[coinField] + amount < afterDiscount) {
          return Promise.props({
            customer: customer.updateAttributes({
              [coinField]: customer[coinField] + amount,
              totalCharge: customer.totalCharge + amount
            }),
            status: consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH,
            coin: amount,
            amount: amount,
            price: afterDiscount
          })
        }

        const coin = customer[coinField] + amount - afterDiscount
        const packages = customer.packages.slice()
        if (group.danet && group.packages.indexOf(consts.PACKAGE.DANET.code) == -1) {
          group.packages.push(consts.PACKAGE.DANET.code)
        }

        group.packages.forEach(code => {
          const isBonusDanet = code == consts.PACKAGE.DANET.code && group.danet
          const addDuration = isBonusDanet ? moment.duration(Number(group.danet) * month, 'days') : moment.duration(time)
          const bonusMonths = isBonusDanet || buyType == consts.TRANSACTION_TYPE.GIFT_CODE ? 0 : (consts.PACKAGE_BONUS[month] || 0)

          let isSame = false
          for (let i = 0; i < packages.length; i++) {
            if (packages[i].code === code && packages[i].maxDevice == maxDevice) {
              const currentExpire = moment(packages[i].expireAt).isAfter(moment())
                ? moment(packages[i].expireAt)
                : moment().endOf('day')
              packages[i].expireAt = currentExpire.add(addDuration).add(bonusMonths, 'months').toDate()
              isSame = true
              break
            }
          }

          if (!isSame) {
            packages.push({
              code,
              maxDevice,
              expireAt: moment().endOf('day').add(addDuration).add(bonusMonths, 'months').toDate()
            })
          }
        })

        const expireAt = _(packages)
          .map(packageObj => packageObj.expireAt)
          .max()

        const packageMark = {}
        const maxDeviceLogin = _(packages)
          .filter(packageObj => moment(packageObj.expireAt).valueOf() >= Date.now())
          .orderBy(['maxDevice'], ['desc'])
          .filter(packageObj => {
            if (packageMark[packageObj.code]) {
              return false
            } else {
              packageMark[packageObj.code] = true
              return true
            }
          })
          .sumBy('maxDevice')

        const customerUpdate = {
          packages,
          maxDevice: maxDeviceLogin,
          [coinField]: coin,
          totalCharge: customer.totalCharge + amount,
          expireAt: Number(moment(expireAt).format('YYYYMMDD'))
        }

        if (buyType == consts.TRANSACTION_TYPE.GIFT_CODE)
          customerUpdate.hasGiftCode = 1

        return Promise.props({
          customer: customer.updateAttributes(customerUpdate),
          status: consts.TRANSACTION_STATUS.SUCCESS,
          coin: coin,
          price: afterDiscount,
          bonusMonths: consts.PACKAGE_BONUS[month] || 0,
          isPay,
          expireAt
        })
      })
      .finally(() => { atomic.end(atomicKey(username)) })
  }

  static atomicUpdateMovie({ username, movie, amount }) {
    amount = Number(amount)
    const atomic = getAtomic()
    return atomic.begin(atomicKey(username))
      .then(() => app.models.Customer.findOne({ where: { username } }))
      .then(customer => {
        if (!customer) {
          return Promise.reject('Customer not exists')
        }

        let totalPrice = movie.price
        let coinField = 'coin'
        let isPay = true
        if (!customer.coin && customer.freeCoin) {
          coinField = 'freeCoin'
          isPay = false
        }

        customer[coinField] = Number(customer[coinField]) || 0

        if (customer[coinField] + amount < totalPrice) {
          console.log('not ENOUGH')
          return Promise.props({
            customer: customer.updateAttributes({
              [coinField]: customer[coinField] + amount,
              totalCharge: customer.totalCharge + amount
            }),
            status: consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH,
            coin: amount,
            amount: amount,
            price: totalPrice
          })
        }

        const coin = customer[coinField] + amount - totalPrice

        return Promise.props({
          customer: customer.updateAttributes({
            [coinField]: coin,
            totalCharge: customer.totalCharge + amount
          }),
          status: consts.TRANSACTION_STATUS.SUCCESS,
          coin: coin,
          price: totalPrice,
          isPay
        })
      })
      .finally(() => { atomic.end(atomicKey(username)) })
  }

  static atomicUpdateClip({ username, clip, amount }) {
    const atomic = getAtomic()
    return atomic.begin(atomicKey(username))
      .then(() => app.models.Customer.findOne({ where: { username } }))
      .then(customer => {
        if (!customer) {
          return Promise.reject('Customer not exists')
        }

        let totalPrice = clip.price
        let coinField = 'coin'
        let isPay = true
        if (!customer.coin && customer.freeCoin) {
          coinField = 'freeCoin'
          isPay = false
        }

        customer[coinField] = Number(customer[coinField]) || 0

        if (customer[coinField] + amount < totalPrice) {
          console.log('not ENOUGH')
          return Promise.props({
            customer: customer.updateAttributes({
              [coinField]: customer.coin + amount,
              totalCharge: customer.totalCharge + amount
            }),
            status: consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH,
            coin: amount,
            amount: amount,
            price: totalPrice
          })
        }

        const coin = customer[coinField] + amount - totalPrice

        return Promise.props({
          customer: customer.updateAttributes({
            [coinField]: coin,
            totalCharge: customer.totalCharge + amount
          }),
          status: consts.TRANSACTION_STATUS.SUCCESS,
          coin: coin,
          price: totalPrice,
          isPay
        })
      })
      .finally(() => { atomic.end(atomicKey(username)) })
  }

  static buyPackage({ req, groupId, time, packageTypeId, telco, serial, pin, amount, buyType, giftCode }) {
    amount = Number(amount)
    let group
    let packageType
    const month = Math.round(moment.duration(time).asMonths())

    if (!consts.PACKAGE_BONUS.hasOwnProperty(month.toString())) {
      return Promise.reject({
        statusCode: consts.CODE.DATA_MISSING,
        message: lang.invalidParam
      })
    }

    return Promise.all([
      app.models.PackageGroup.findById(groupId, { cacheTime: config.CACHE_TIME }),
      app.models.PackageType.findById(packageTypeId, { cacheTime: config.CACHE_TIME })
    ])
      .spread((groupData, packageTypeData) => {
        group = groupData
        packageType = packageTypeData

        if (!group || !packageType) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.invalidParam
          })
        }

        return (buyType == consts.TRANSACTION_TYPE.BUY_CARD)
          ? useCard(
            {telco, serial, pin, dtId: req.dtId, spId: req.spId, username: req.username, ip: utils.getIp(req)},
            app.models.CardTransaction
          )
          : Promise.resolve(amount || 0)
      })
      .then(realAmount => {
        amount = realAmount
        return Payment.atomicUpdatePackage({ group, time, packageType, amount, buyType, username: req.username, giftCode })
      })
      .then(({customer, status, coin, price, bonusMonths, isPay, expireAt}) => {
        let message
        let code
        if (status == consts.TRANSACTION_STATUS.SUCCESS) {

          const packageMark = {}
          const packages = _(customer.packages.slice())
            .filter(packageObj => moment(packageObj.expireAt).valueOf() >= Date.now())
            .map(packageObj => _.pick(packageObj, ['code', 'maxDevice']))
            .orderBy(['maxDevice'], ['desc'])
            .filter(packageObj => {
              if (packageMark[packageObj.code]) {
                return false
              } else {
                packageMark[packageObj.code] = true
                return true
              }
            })
            .value()

          const customerDevices = _(customer.devices)
            .map(device => device.deviceId)
            .filter(deviceId => deviceId != req.deviceId)
            .value()

          if (req.deviceId) {
            customerDevices.unshift(req.deviceId)
          }

          console.log('customerDevices', customerDevices, packages)

          if (customerDevices && customerDevices.length && customerDevices[0]) {
            TokenHandler.updateTokenData({
              username: req.username,
              devices: customerDevices,
              data: {packages},
              Customer: app.models.Customer
            })
          }

          code = consts.AFTER_BUY_CODE.ENOUGH
          message = (coin === 0)
            ? lang.buyPackageSuccess
            : lang.buyPackageExcess(numeral(coin).format('0,0'))
        } else {
          code = consts.AFTER_BUY_CODE.NOT_ENOUGH
          message = lang.notEnoughBuyPackage(numeral(coin).format('0,0'))
        }

        const transactionId = Date.now().toString()

        app.models.Transaction.create({
          transactionId,
          username: req.username,
          platform: req.platform,
          deviceType: req.deviceType,
          deviceId: req.deviceId,
          dtId: req.dtId,
          spId: req.spId,
          ip: req.clientIp || utils.getIp(req),
          time: new Date(),
          type: buyType,
          contentType: consts.BUY_CONTENT_TYPE.PACKAGE,
          package: group.name,
          packageId: group.id,
          amount: amount,
          price: status == consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH ? 0: price,
          month: month,
          bonusMonths: bonusMonths,
          maxDevice: packageType.maxDevice,
          after: coin,
          giftCode: giftCode ? giftCode.code : undefined,
          isPay: isPay ? 1 : 0,
          status,
          telco,
          serial,
          pin
        })

        return { transactionId, code, message, expireAt }
      })
  }

  static buyMovie({ req, movieId, telco, serial, pin, amount, buyType }) {
    amount = Number(amount)
    let movie

    return Promise.all([
      app.models.Movie.findById(movieId, { cacheTime: config.CACHE_TIME }),
      PersonalMemory.checkBuyMovie(req.username, movieId)
    ])
      .spread((movieData, bought) => {
        movie = movieData

        if (!movie || bought) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.invalidParam
          })
        }

        return (buyType == consts.TRANSACTION_TYPE.BUY_CARD)
          ? useCard(
            {telco, serial, pin, dtId: req.dtId, spId: req.spId, username: req.username, ip: utils.getIp(req)},
            app.models.CardTransaction
          )
          : Promise.resolve(amount || 0)
      })
      .then(realAmount => {
        amount = realAmount
        return Payment.atomicUpdateMovie({ movie, amount, username: req.username })
      })
      .then(({customer, status, coin, price, isPay}) => {
        let message
        let code
        if (status == consts.TRANSACTION_STATUS.SUCCESS) {
          const update = { $set: {[`buyMovie.${movieId}`]: moment().unix()} }

          app.models.Personal.update(
            { username: req.username },
            update,
            { upsert: true }
          )

          PersonalMemory.markBuyMovie(req.username, movieId)

          code = consts.AFTER_BUY_CODE.ENOUGH
          message = (coin === 0)
            ? lang.buyMovieSuccess
            : lang.buyMovieExcess(numeral(coin).format('0,0'))
        } else {
          code = consts.AFTER_BUY_CODE.NOT_ENOUGH
          message = lang.notEnoughBuyMovie(numeral(coin).format('0,0'))
        }

        const log = {
          username: req.username,
          platform: req.platform,
          deviceType: req.deviceType,
          deviceId: req.deviceId,
          dtId: req.dtId,
          spId: req.spId,
          ip: req.clientIp || utils.getIp(req),
          time: new Date(),
          type: buyType,
          contentType: consts.BUY_CONTENT_TYPE.MOVIE,
          package: movie.packageCode,
          name: movie.name,
          packageId: movie.id,
          amount: amount,
          price: status == consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH ? 0: price,
          month: 0,
          maxDevice: customer.maxDevice,
          after: coin,
          isPay: isPay ? 1 : 0,
          status,
          telco,
          serial,
          pin
        }

        app.models.Transaction.create(log)

        app.get('rabbit').publish({
          channel: consts.RABBIT_CHANNEL.BUY_MOVIE,
          data: log
        })

        return { code, message }
      })
  }

  static buyClip({ req, clipId, telco, serial, pin, amount, buyType }) {
    amount = Number(amount)
    let clip

    return Promise.all([
      app.models.Clip.findById(clipId, { cacheTime: config.CACHE_TIME }),
      PersonalMemory.checkBuyClip(req.username, clipId)
    ])
      .spread((clipData, bought) => {
        clip = clipData

        if (!clip || bought) {
          return Promise.reject({
            statusCode: consts.CODE.DATA_MISSING,
            message: lang.invalidParam
          })
        }

        return (buyType == consts.TRANSACTION_TYPE.BUY_CARD)
          ? useCard(
            {telco, serial, pin, dtId: req.dtId, spId: req.spId, username: req.username, ip: utils.getIp(req)},
            app.models.CardTransaction
          )
          : Promise.resolve(amount || 0)
      })
      .then(realAmount => {
        amount = realAmount
        return Payment.atomicUpdateClip({ clip, amount, username: req.username })
      })
      .then(({customer, status, coin, amount, price, isPay}) => {
        let message
        let code
        if (status == consts.TRANSACTION_STATUS.SUCCESS) {
          const update = { $set: {[`buyClip.${clipId}`]: moment().unix()} }

          app.models.Personal.update(
            { username: req.username },
            update,
            { upsert: true }
          )

          PersonalMemory.markBuyClip(req.username, clipId)

          code = consts.AFTER_BUY_CODE.ENOUGH
          message = (coin === 0)
            ? lang.buyClipSuccess
            : lang.buyClipExcess(numeral(coin).format('0,0'))
        } else {
          code = consts.AFTER_BUY_CODE.NOT_ENOUGH
          message = lang.notEnoughBuyClip(numeral(coin).format('0,0'))
        }

        const log = {
          username: req.username,
          platform: req.platform,
          deviceType: req.deviceType,
          deviceId: req.deviceId,
          dtId: req.dtId,
          spId: req.spId,
          ip: req.clientIp || utils.getIp(req),
          time: new Date(),
          type: buyType,
          contentType: consts.BUY_CONTENT_TYPE.CLIP,
          package: clip.packageCode,
          name: clip.name,
          packageId: clip.id,
          amount: amount,
          price: status == consts.TRANSACTION_STATUS.SUCCESS_NOT_ENOUGH ? 0: price,
          month: 0,
          maxDevice: customer.maxDevice,
          after: coin,
          isPay: isPay ? 1 : 0,
          status,
          telco,
          serial,
          pin
        }

        app.models.Transaction.create(log)

        app.get('rabbit').publish({
          channel: consts.RABBIT_CHANNEL.BUY_CLIP,
          data: log
        })

        return { code, message }
      })
  }
}
