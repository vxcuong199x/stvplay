'use strict'

const _ = require('lodash')
const moment = require('moment')
const numeral = require('numeral')
const Promise = require('bluebird')
const ObjectId = require('mongodb').ObjectId
const consts = require('../config/consts')
const config = require('../config/config')
const utils = require('../utils/utils')
const sendMT = require('../services/send-mt')
const checkSpam = require('../utils/check-spam')
const uuidv4 = require('uuid/v4')

module.exports = function(Admin) {
  Admin.beforeRemote('login', (ctx, config, next) => {
    checkSpam({
      method: 'login',
      ctx: ctx,
      key: 'ip',
      limit: 2,
      next: next,
      period: 300
    })
  })

  Admin.afterRemote('login', function (context, administrator, next) {
    let AccessToken = Admin.app.models.AccessToken
    let session, otp
    if (context.res.statusCode == 200) {
      administrator.role = 'admin'
      administrator.ttl = 86400*3
      _.set(context, 'args.options.authorizedRoles.admin', true)

      AccessToken.replaceById(administrator.id, administrator)
        .then(() => {
          const ip = utils.getIp(context.req)

          // if (ip == '113.190.233.178' || ip == '27.72.102.117') {
            return Admin.findOneAndUpdate(
              { username: context.args.credentials.username, activated: true },
              { $set: { lastLogin: new Date(), lastIp: ip } },
              {}
            )
          // } else {
          //   otp = _.random(1000, 9999).toString()
          //   session = uuidv4()
          //   const token = administrator.id
          //   return Admin.findOneAndUpdate(
          //     { username: context.args.credentials.username, activated: true },
          //     { $set: { lastLogin: new Date(), lastIp: utils.getIp(context.req), otp, session, token } },
          //     {}
          //   )
          // }
        })
        .then(admin => {
          if (!admin || !admin.value) {
            next({
              statusCode: 402,
              message: `Tài khoản của bạn đã bị khóa`
            })
          }
          else if (admin.value.phone && otp) {
            next({
              statusCode: 402,
              message: `Mã OTP đã được gửi đến SĐT: ${admin.value.phone}. Mời bạn nhập mã OTP để đăng nhập`,
              name: session
            })
            sendMT(utils.formatPhone(admin.value.phone), `Moi ban dung ma ${otp} de dang nhap CMS STV Play`)
          } else if (!admin.value.phone) {
            next({
              statusCode: 402,
              message: `Bạn chưa được lưu SĐT trong CMS. Mời liên hệ với Admin để xử lý`
            })
          } else {
            next()
          }
        })
        .catch(err => {
          console.error(err)
          next(err)
        })
    } else {
      next()
    }
  })

  Admin.beforeRemote('verifyOTP', (ctx, config, next) => {
    checkSpam({
      method: 'verifyOTP',
      ctx: ctx,
      key: 'args.username',
      limit: 3,
      next: next,
      period: 300
    })
  })

  Admin.remoteMethod('verifyOTP', {
    accepts: [
      {arg: 'username', type: 'string', required: true},
      {arg: 'otp', type: 'string', required: true},
      {arg: 'session', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  Admin.verifyOTP = (username, otp, session, cb) => {
    Admin.findOne({
      where: { username, session }
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

  Admin.remoteMethod('addRoleMapping', {
    accepts: [
      {arg: 'uid', type: 'string', required: true},
      {arg: 'role', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  Admin.addRoleMapping = (uid, role, cb) => {
    const update = Promise.promisify((where, data, cb) => {
      const collection = Admin.app.models.RoleMapping.getDataSource().connector.collection('RoleMapping')
      collection.updateOne(where, data, { upsert: true }, cb)
    })

    Promise.all([
      Admin.app.models.Role.findOne({
        where: {name: role}
      }),
      Admin.app.models[consts.ROLES[role]].findById(uid)
    ])
      .spread((roleObj, user) => {
        // console.log('addRoleMapping123', {principalId: user.id, roleId: roleObj.id})
        return update(
          { principalId: user.id, roleId: roleObj.id },
          { principalId: user.id, roleId: roleObj.id, principalType: Admin.app.loopback.RoleMapping.USER }
        )
      })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        console.error('add role mapping err', e.stack || e)
        cb(null, {})
      })
  }

  Admin.remoteMethod('removeRoleMapping', {
    accepts: [
      {arg: 'uid', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  Admin.removeRoleMapping = (uid, cb) => {
      Admin.app.models.RoleMapping.destroyAll({
        principalId: ObjectId(uid)
      })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        console.error('remove role mapping err', e.stack || e)
        cb(null, {})
      })
  }

  Admin.remoteMethod('changePassword', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'oldPassword', type: 'string', required: true},
      {arg: 'newPassword', type: 'string', required: true}
    ],
    returns: {type: 'object', root: true}
  })

  Admin.changePassword = (req, oldPassword, newPassword, cb) => {
    if (oldPassword.length < 6 || newPassword.length < 6) {
      return cb({
        statusCode: consts.CODE.WRONG_FLOW,
        message: 'Tham số không đúng'
      })
    }

    if (req.accessToken.role != 'admin') {
      return cb(null, {})
    }

    let user

    Admin.findOne({
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

        return user.updateAttribute('password', Admin.hashPassword(newPassword))
      })
      .then(() => {
        cb(null, {})
      })
      .catch(e => {
        if (e.statusCode) return cb(e)
        console.error('changePassword err', e.stack || e)
        cb(null, {})
      })
  }

  Admin.remoteMethod('addCoinUser', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'userId', type: 'string', required: true},
      {arg: 'coin', type: 'number', required: true},
      {arg: 'reason', type: 'string'}
    ],
    returns: {type: 'object', root: true}
  })

  Admin.addCoinUser = (req, userId, coin, reason, cb) => {
    if (req.accessToken.role !== 'admin' || (['5a98c6a0885983357867892b','5912c4a0b2d5ac58345ed361','5b88f6274af9a17d6af3fc08','5b88f6274af9a17d6af3fc08'].indexOf(req.accessToken.userId) === -1)) {
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

    Promise.all([
      Admin.findById(req.accessToken.userId),
      Admin.app.models.Customer.findById(userId)
    ])
      .spread((userInfo, targetInfo) => {
        if (!targetInfo || !userInfo) {
          return Promise.reject({
            statusCode: consts.CODE.WRONG_FLOW,
            message: 'Không đủ tiền'
          })
        }

        user = userInfo
        target = targetInfo

        return Admin.app.models.Customer.update(
          { _id: ObjectId(userId) },
          { $inc: { freeCoin: Number(coin) } }
        )
      })
      .then((rs) => {
        cb(null, {})

        Admin.app.models.AddCoinLog.create({
          userId: req.accessToken.userId,
          username: user.username,
          targetId: userId,
          targetName: target.username,
          coin: Number(coin),
          type: consts.ADD_COIN_TYPE.TO_USER,
          reason: reason,
          dtId: 0,
          spId: 0,
          day: Number(moment().format('YYYYMMDD'))
        })

        Admin.app.models.Transaction.create({
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
        if (e.statusCode) return cb(e)
        console.error('addCoinUser err', e.stack || e)
        cb(null, {})
      })
  }
}
