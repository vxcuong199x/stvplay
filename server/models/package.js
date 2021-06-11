'use strict'

const moment = require('moment')
const Promise = require('bluebird')
const _ = require('lodash')
const useCard = require('../services/use-card')
const TokenHandler = require('../logic/token-handler')
const Validator = require('../lib/validator')
const utils = require('../utils/utils')
const consts = require('../config/consts')
const lang = require('../config/lang.vi')
const checkSpam = require('../utils/check-spam')

const ejs = require('ejs')
const historyEjs = require('fs').readFileSync(require('path').join(__dirname, '../html-template/transaction.ejs'))
const historyView = ejs.compile(historyEjs.toString(), { delimiter: '?' })
const numeral = require('numeral')
numeral.locale('vi')

module.exports = function(Package) {
  Package.remoteMethod('getTransactionData', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get transaction data'
  })

  Package.getTransactionData = (req, cb) => {
    Package.app.models.Transaction
      .find({where: {username: req.username}, limit: 50, order: 'createdAt DESC'})
      .then(transactions => {
        transactions = transactions || []
        cb(null, {
          data: transactions
        })
      })
      .catch(e => {
        console.error(e.stack || e)
        cb(null, {data: ''})
      })
  }

  Package.remoteMethod('getTransaction', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'get'},
    description: 'Get transaction'
  })

  Package.getTransaction = (req, cb) => {
    Package.app.models.Transaction
      .find({where: {username: req.username}, limit: 50, order: 'createdAt DESC'})
      .then(transactions => {
        transactions = transactions || []
        cb(null, {
          data: historyView({
            data: transactions || [],
            numeral: numeral,
            moment: moment,
            transactionMap: consts.TRANSACTION_MAP,
            transactionStatusMap: consts.TRANSACTION_STATUS_MAP
          })
        })
      })
      .catch(e => {
        console.error(e.stack || e)
        cb(null, {data: ''})
      })
  }
}
