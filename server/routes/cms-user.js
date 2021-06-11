'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const moment = require('moment')
const numeral = require('numeral')
const consts = require('../config/consts')
const config = require('../config/config')
const ObjectId = require('mongodb').ObjectId
const getAtomic = require('../utils/get-atomic')
const utils = require('../utils/utils')
const sendMT = require('../services/send-mt')
const checkSpam = require('../utils/check-spam')
const uuidv4 = require('uuid/v4')

const atomicKey = (userId) => `cms-user:${userId}`

module.exports = function(CmsUser) {
  CmsUser.beforeRemote('login', (ctx, config, next) => {
    checkSpam({
      method: 'login',
      ctx: ctx,
      key: 'ip',
      limit: 5,
      next: next,
      period: 300
    })
  })

  CmsUser.afterRemote('login', function (context, administrator, next) {
    let AccessToken = CmsUser.app.models.AccessToken;
    if (context.res.statusCode == 200) {
      const role = context.args.credentials.username.split('_')[0]
      if (!consts.ROLES[role])
        return next()

      _.set(context, `args.options.authorizedRoles.${role}`, true)

      CmsUser.findOne({
        where: { username: context.args.credentials.username, activated: true }
      }, function(err, user) {
        if (err) return next(err)
        else if (!user) {
          return next({
            statusCode: 402,
            message: `Tài khoản của bạn đã bị khóa`
          })
        }

        if (role == 'content') {
          _.set(context, 'args.options.pnId', user.pnId)
          administrator.role = 'content_' + user.pnId
          context.result.pnId = user.pnId
        } else if (role == 'npp') {
          _.set(context, 'args.options.dtId', user.dtId)
          administrator.role = 'npp_' + user.dtId
          context.result.dtId = user.dtId
        } else if (role == 'daily') {
          _.set(context, 'args.options.dtId', user.dtId)
          _.set(context, 'args.options.spId', user.spId)
          administrator.role = 'daily_' + user.dtId + '_' + user.spId
          context.result.dtId = user.dtId
          context.result.spId = user.spId
        } else {
          administrator.role = role
        }

        AccessToken.replaceById(administrator.id, administrator, function(e) {
          const ip = utils.getIp(context.req)

          // if (['113.190.233.178', '27.72.102.117', '123.30.235.49', '172.16.20.64'].indexOf(ip) != -1 || ['vh', 'cskh', 'ketoan'].indexOf(role) == -1) {
            next()
            CmsUser.findOneAndUpdate(
              { username: context.args.credentials.username },
              { $set: { lastLogin: new Date(), lastIp: ip } }
            )
          // } else {
          //   const otp = _.random(1000, 9999).toString()
          //   const session = uuidv4()
          //   const token = administrator.id
          //   CmsUser.findOneAndUpdate(
          //     { username: context.args.credentials.username },
          //     { $set: { lastLogin: new Date(), lastIp: utils.getIp(context.req), otp, session, token } },
          //     {}
          //   )
          //     .then(admin => {
          //       if (admin.value.phone) {
          //         next({
          //           statusCode: 402,
          //           message: `Mã OTP đã được gửi đến SĐT: ${admin.value.phone}. Mời bạn nhập mã OTP để đăng nhập`,
          //           name: session
          //         })
          //         sendMT(utils.formatPhone(admin.value.phone), `Moi ban dung ma ${otp} de dang nhap CMS STV Play`)
          //       } else {
          //         next({
          //           statusCode: 402,
          //           message: `Bạn chưa được lưu SĐT trong CMS, mời liên hệ với Admin để xử lý`
          //         })
          //       }
          //     })
          //     .catch(e => e && console.error(e.stack || e))
          // }
        })
      })
    } else {
      next()
    }

  })

  CmsUser.beforeRemote('verifyOTP', (ctx, config, next) => {
    checkSpam({
      method: 'verifyOTP',
      ctx: ctx,
      key: 'args.username',
      limit: 5,
      next: next,
      period: 300
    })
  })

  CmsUser.remoteMethod('verifyOTP', {
    accepts: [
      {arg: 'username', type: 'string', required: true},
      {arg: 'otp', type: 'string', required: true},
      {arg: 'session', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  CmsUser.verifyOTP = (username, otp, session, cb) => {
    CmsUser.findOne({
      where: { username, otp, session }
    })
      .then(admin => {
        if (admin) {
          cb(null, { id: admin.token, userId: admin.id })
        } else {
          cb({
            statusCode: 402,
            message: `Mã OTP không đúng, mời bạn nhập lại`
          })
        }
      })
      .catch(e => cb(e))
  }

  CmsUser.beforeRemote('find', before)
  CmsUser.beforeRemote('count', before)

  function before(ctx, config, next) {
    const token = _.get(ctx, 'args.options.accessToken')
    const isAdmin = _.get(ctx, 'args.options.authorizedRoles.admin')

    if (!isAdmin && token.role) {
      const whereString = ctx.method.name == 'find' ? 'args.filter.where' : 'args.where'
      if (token.role.indexOf('npp_') == 0) {
        const dtId = Number(token.role.replace('npp_', ''))
        _.set(ctx, `${whereString}.dtId`, dtId)
        _.set(ctx, `${whereString}.type`, consts.CMS_USER_TYPE.DAILY)
      }
    }

    next()
  }

  CmsUser.remoteMethod('changePassword', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'oldPassword', type: 'string', required: true},
      {arg: 'newPassword', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  CmsUser.changePassword = (req, oldPassword, newPassword, cb) => {
    if (oldPassword.length < 6 || newPassword.length < 6) {
      return cb({
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Tham số không đúng'
      })
    }

    if (_.keys(consts.ROLES).indexOf(req.accessToken.role) == -1) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Sai luồng'
      })
    }

    let user

    CmsUser.findOne({
      where: {
        id: req.accessToken.userId
      }
    })
      .then((userData) => {
        user = userData
        if (!user) {
          return Promise.reject({
            statusCode: consts.CODE.WRONG_FLOW,
            message: 'Mật khẩu cũ không đúng'
          })
        }

        return user.hasPassword(oldPassword)
      })
      .then(hasPassword => {
        if (!hasPassword) {
          return Promise.reject({
            statusCode: consts.CODE.WRONG_FLOW,
            message: 'Mật khẩu cũ không đúng'
          })
        }

        return user.updateAttribute('password', CmsUser.hashPassword(newPassword))
      })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('changePassword err', e.stack || e)
        cb(e)
      })
  }

  CmsUser.remoteMethod('addCoinNpp', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'userId', type: 'string', required: true},
      {arg: 'coin', type: 'number', required: true},
      {arg: 'reason', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  CmsUser.addCoinNpp = (req, userId, coin, reason, cb) => {
    if (req.accessToken.role != 'admin') {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Sai luồng'
      })
    }

    if (coin > config.MAX_ADD_COIN_ADMIN) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: `Bạn chỉ được cộng tối đa ${numeral(config.MAX_ADD_COIN_ADMIN).format('0,0')} VNĐ`
      })
    }

    let user, target

    Promise.all([
      CmsUser.app.models.Admin.findById(req.accessToken.userId),
      CmsUser.findById(userId)
    ])
      .spread((userInfo, targetInfo) => {
        user = userInfo
        target = targetInfo

        return CmsUser.update(
          { _id: ObjectId(userId) },
          { $inc: { coin: Number(coin) } }
        )
      })
      .then(() => {
        cb(null, {})

        CmsUser.app.models.AddCoinLog.create({
          userId: req.accessToken.userId,
          username: user.username,
          targetId: userId,
          targetName: target.username,
          coin: Number(coin),
          type: consts.ADD_COIN_TYPE.TO_NPP,
          reason: reason,
          dtId: target.dtId,
          spId: 0,
          day: Number(moment().format('YYYYMMDD'))
        })
      })
      .catch(e => {
        console.error('addCoinNpp err', e.stack || e)
        cb(e)
      })
  }

  CmsUser.remoteMethod('addCoinDaily', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'userId', type: 'string', required: true},
      {arg: 'coin', type: 'number', required: true},
      {arg: 'reason', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  CmsUser.addCoinDaily = (req, userId, coin, reason, cb) => {
    if (req.accessToken.role.indexOf('npp_') !== 0) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Sai luồng'
      })
    }

    if (coin > config.MAX_ADD_COIN_ADMIN) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: `Bạn chỉ được cộng tối đa ${numeral(config.MAX_ADD_COIN_ADMIN).format('0,0')} VNĐ`
      })
    }

    let user, target
    const atomic = getAtomic()

    atomic.begin(atomicKey(req.accessToken.userId))
      .then(() => {
        return Promise.all([
          CmsUser.findById(req.accessToken.userId),
          CmsUser.findById(userId)
        ])
      })
      .spread((userInfo, targetInfo) => {
        if (!targetInfo || userInfo.coin < coin) {
          return Promise.reject({
            statusCode: consts.CODE.WRONG_FLOW,
            message: 'Không đủ tiền'
          })
        }

        user = userInfo
        target = targetInfo

        return [
          CmsUser.update(
            { _id: ObjectId(userId) },
            { $inc: { coin: Number(coin) } }
          ),
          CmsUser.update(
            { _id: ObjectId(req.accessToken.userId) },
            { $inc: { coin: -Number(coin) } }
          )
        ]
      })
      .spread(() => {
        cb(null, {})

        CmsUser.app.models.AddCoinLog.create({
          userId: req.accessToken.userId,
          username: user.username,
          targetId: userId,
          targetName: target.username,
          coin: Number(coin),
          type: consts.ADD_COIN_TYPE.TO_DAILY,
          reason: reason,
          dtId: user.dtId,
          spId: target.spId,
          day: Number(moment().format('YYYYMMDD'))
        })
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('addCoinDaily err', e.stack || e)
        cb(e)
      })
      .finally(() => atomic.end(atomicKey(req.accessToken.userId)))
  }

  CmsUser.remoteMethod('addCoinUser', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'userId', type: 'string', required: true},
      {arg: 'coin', type: 'number', required: true},
      {arg: 'reason', type: 'string'}
    ],
    returns: {type: 'object', root: true}
  })

  CmsUser.addCoinUser = (req, userId, coin, reason, cb) => {
    if (req.accessToken.role.indexOf('npp_') !== 0 && req.accessToken.role.indexOf('daily_') !== 0) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Sai luồng'
      })
    }

    if (coin > config.MAX_ADD_COIN_USER) {
      return cb(null, {
        statusCode: consts.CODE.WRONG_FLOW,
        message: `Bạn chỉ được cộng tối đa ${numeral(config.MAX_ADD_COIN_USER).format('0,0')} VNĐ`
      })
    }

    let user, target
    const atomic = getAtomic()

    atomic.begin(atomicKey(req.accessToken.userId))
      .then(() => {
        return Promise.all([
          CmsUser.findById(req.accessToken.userId),
          CmsUser.app.models.Customer.findById(userId)
        ])
      })
      .spread((userInfo, targetInfo) => {
        if (!targetInfo || userInfo.coin < coin) {
          return Promise.reject({
            statusCode: consts.CODE.WRONG_FLOW,
            message: 'Không đủ tiền'
          })
        }

        user = userInfo
        target = targetInfo

        return [
          CmsUser.update(
            { _id: ObjectId(req.accessToken.userId) },
            { $inc: { coin: -Number(coin) } }
          ),
          CmsUser.app.models.Customer.update(
            { _id: ObjectId(userId) },
            { $inc: { coin: Number(coin) } }
          )
        ]
      })
      .spread(() => {
        cb(null, {})

        CmsUser.app.models.AddCoinLog.create({
          userId: req.accessToken.userId,
          username: user.username,
          targetId: userId,
          targetName: target.username,
          coin: Number(coin),
          type: consts.ADD_COIN_TYPE.TO_USER,
          reason: reason,
          dtId: user.dtId,
          spId: user.spId,
          day: Number(moment().format('YYYYMMDD'))
        })

        CmsUser.app.models.Transaction.create({
          username: target.username,
          platform: target.platform,
          deviceType: target.deviceType,
          deviceId: target.deviceId,
          dtId: target.dtId,
          spId: target.spId,
          ip: utils.getIp(req),
          time: new Date(),
          type: consts.TRANSACTION_TYPE.ADD_COIN,
          contentType: consts.BUY_CONTENT_TYPE.ADD_COIN,
          package: '',
          packageId: '',
          amount: 0,
          price: coin,
          month: 0,
          maxDevice: 0,
          after: target.coin + coin,
          status: consts.TRANSACTION_STATUS.SUCCESS
        })
      })
      .catch(e => {
        console.error('addCoinUser err', e.stack || e)
        cb(e)
      })
      .finally(() => atomic.end(atomicKey(req.accessToken.userId)))
  }

  CmsUser.remoteMethod('getCurrentCoin', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    http: {verb: 'get'},
    returns: {type: 'object', root: true}
  })

  CmsUser.getCurrentCoin = (req, cb) => {
    CmsUser.findById(req.accessToken.userId, { fields: ['coin'] })
      .then(user => {
        cb(null, user || { coin: 0 })
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('getCurrentCoin err', e.stack || e)
        cb(null, { coin: 0 })
      })
  }
}
