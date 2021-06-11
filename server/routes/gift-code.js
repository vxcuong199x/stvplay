'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const config = require('../config/config')
const lang = require('../config/lang.vi')
const TokenHandler = require('../logic/token-handler')
const Validator = require('../lib/validator')
const checkSpam = require('../utils/check-spam')
const getAtomic = require('../utils/get-atomic')
const Payment = require('../logic/payment')

const atomicKey = (code) => `gift:${code}`

const CODE_POLICY = {
  TONGHOP_BASIC: [
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P1M', code: 'SCTV' },
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P6M', code: 'KARAOKE' },
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P12M', code: 'BASIC' }
  ],
  TONGHOP_ADVANCE: [
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P2M', code: 'SCTV' },
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P1M', code: 'KARAOKE' },
    { maxDevice: '59af5007e32a0e011ce94462', duration: 'P12M', code: 'BASIC' }
  ]
}

module.exports = function(GiftCode) {

  GiftCode.beforeRemote('find', before)
  GiftCode.beforeRemote('count', before)

  function before(ctx, config, next) {
    const token = _.get(ctx, 'args.options.accessToken')
    if (token.role != 'admin') {
      if (token.role.indexOf('npp_') != 0) {
        next({
          statusCode: consts.CODE.ACCESS_DENIED,
          message: lang.spam(60)
        })
      } else {
        const whereString = ctx.method.name == 'find' ? 'args.filter.where' : 'args.where'
        const dtId = Number(token.role.replace('npp_', ''))
        _.set(ctx, `${whereString}.dtId`, dtId || 0)
        next()
      }
    } else {
      next()
    }
  }

  GiftCode.beforeRemote('enterGiftCode', (ctx, config, next) => {
    checkSpam({
      method: 'enterGiftCode',
      ctx: ctx,
      key: 'ip',
      limit: 20,
      next: next
    })
  })

  GiftCode.beforeRemote('enterGiftCode', (ctx, config, next) => {
    checkSpam({
      method: 'enterGiftCode',
      ctx: ctx,
      key: 'req.username',
      limit: 10,
      next: next
    })
  })

    GiftCode.remoteMethod('enterGiftCode', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'code', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'enter gift code'
  })

  const codeRule = {
    code: 'required|alpha_dash|size:10'
  }

  GiftCode.enterGiftCode = (req, code, cb) => {
    const validator = new Validator({code}, codeRule)
    if (validator.fails()) {
      console.error('enterGiftCode invalidParam', validator.errors.all())
      return cb({
        statusCode: consts.CODE.INVALID_PARAM,
        message: lang.invalidParam
      })
    }

    code = code.toUpperCase()

    let giftCode
    const atomic = getAtomic()

    atomic.begin(atomicKey(code))
      .then(() => GiftCode.findOne({ where: { code, status: consts.GIFT_CODE_STATUS.ACTIVE } }))
      .then(giftCodeData => {
        giftCode = giftCodeData

        if (!giftCode
          || !giftCode.groupId
          || !giftCode.time
          || !giftCode.packageTypeId
          || moment(giftCode.expiredAt).isBefore(moment())
          || (giftCode.dtId != req.dtId && giftCode.dtId != 1)
        ) {
          return Promise.rejected({
            statusCode: consts.CODE.INVALID_PARAM,
            message: lang.wrongGiftCode
          })
        }

        if (CODE_POLICY[giftCode.groupId]) {
          return GiftCode.addByPolicy(req, giftCode, CODE_POLICY[giftCode.groupId])
        }

        return Payment.buyPackage({
          req,
          groupId: giftCode.groupId,
          time: giftCode.time,
          packageTypeId: giftCode.packageTypeId,
          amount: 0,
          buyType: consts.TRANSACTION_TYPE.GIFT_CODE,
          giftCode: giftCode
        })
      })
      .then(result => {
        cb(null, {
          message: lang.giftCodeSuccess(result.code, giftCode.time ? moment.duration(giftCode.time).months() : 0)
        })

        return giftCode.updateAttributes({
          status: consts.GIFT_CODE_STATUS.RECEIVED,
          username: req.username,
          applyAt: new Date()
        })
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('enter gift code err', e.stack || e)
        cb(e)
      })
      .finally(() => { atomic.end(atomicKey(code)) })
  }

  GiftCode.addByPolicy = (req, giftCode, policy) => {
    return Promise.mapSeries(policy, item => {
      console.log('items', item)
      return Payment.buyPackage({
        req,
        groupId: consts.BUY_GROUP[item.code].groupId,
        time: item.duration,
        packageTypeId: item.maxDevice,
        amount: 0,
        buyType: consts.TRANSACTION_TYPE.GIFT_CODE,
        giftCode: giftCode
      })
    })
      .spread(() => {
        console.log('done')
        return Promise.resolve({})
      })
  }

  GiftCode.remoteMethod('generateGiftCodes', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'groupId', type: 'string', required: true},
      {arg: 'time', type: 'string', required: true, description: 'Time lấy từ time list'},
      {arg: 'packageTypeId', type: 'string', required: true},
      {arg: 'quantity', type: 'number', required: true, description: 'Số code'},
      {arg: 'dtId', type: 'number', required: false, description: 'Nhà phân phối'},
      {arg: 'price', type: 'number', required: false, default: 0},
      {arg: 'expiredAt', type: 'date', required: true, description: 'Thời gian hết hạn'}
    ],
    returns: {type: 'object', root: true},
    description: 'generate gift codes'
  })

  GiftCode.generateGiftCodes = (req, groupId, time, packageTypeId, quantity, dtId, price, expiredAt, cb) => {
    console.log('req.accessToken', req.accessToken)
    if (req.accessToken.role !== 'admin' || (['5a98c6a0885983357867892b','5912c4a0b2d5ac58345ed361','5b88f6274af9a17d6af3fc08','5b88f60a1d3cf57dd0190181'].indexOf(req.accessToken.userId.toString()) === -1)) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Chỉ admin mới được tạo gift code'
      })
    }

    if (quantity > 2000) {
      return cb({statusCode: consts.CODE.INVALID_PARAM})
    }

    dtId = Number(dtId) || 1

    GiftCode.app.models.PackageGroup.findById(groupId)
      .then(packageData => {
        if (!packageData && !CODE_POLICY[groupId]) {
          return Promise.rejected({
            statusCode: consts.CODE.INVALID_PARAM
          })
        }

        return generateCodeRecruisive(quantity)
      })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        console.error('generate gift code err', e.stack || e)
        cb({statusCode: consts.CODE.SERVER_ERROR})
      })

    function generateCodeRecruisive(count) {
      // const data = require('fs').readFileSync('/home/dev/stvplay/server/config/code.txt', 'utf8');
      // const lines = data.split("\n");
      // const startAt = 0

      const codes = []

      for (let i = 0; i < count; i++) {
        codes.push({
          groupId,
          time,
          packageTypeId,
          dtId,
          price,
          code: utils.randomString(10),
          expiredAt: moment(expiredAt).toDate()
        })
      }

      return GiftCode.create(codes)
        .then(result => {
          const remain = count - result.length
          if (remain > 0) {
            return generateCodeRecruisive(remain)
          } else {
            return null
          }
        })
        .catch(errors => {
          if (errors.length) {
            return generateCodeRecruisive(errors.length)
          }
        })
    }
  }
}
