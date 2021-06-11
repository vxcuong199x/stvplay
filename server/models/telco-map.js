'use strict'

const _ = require('lodash')
const Promise = require('bluebird')
const utils = require('../utils/utils')
let telcoMap = {}

module.exports = function(TelcoMap) {

  TelcoMap.on('dataSourceAttached', () => {
    utils.interval(refresh, 300000)
  })

  function refresh() {
    TelcoMap.find()
      .then(ips => {
        return mapData(ips)
      })
      .then(data => {
        telcoMap = data
      })
      .catch(e => console.error('load telco map error', e.stack || e))
  }

  TelcoMap.getTelco = (ip) => {
    const a = ip.split('.')
    if (a.length !== 4)
      return null
    if (typeof telcoMap[a[0]] !== 'undefined') {
      let type = typeof telcoMap[a[0]][a[1]]
      if (type === 'string') {
        return telcoMap[a[0]][a[1]]
      }
      if (type === 'object') {
        if (typeof telcoMap[a[0]][a[1]][a[2]] === 'string') {
          return telcoMap[a[0]][a[1]][a[2]]
        }
      }
    }
    return null
  }
}

function mapData(rows) {
  let ip = {}
  return Promise
    .each(rows, function (row) {
      let a = row.ip.split('.')
      if (typeof ip[a[0]] === 'undefined') {
        ip[a[0]] = {}
        if (row.depth === 2) {
          ip[a[0]][a[1]] = row.telco
        } else {
          ip[a[0]][a[1]] = {}
          ip[a[0]][a[1]][a[2]] = row.telco
        }
      } else {
        if (typeof ip[a[0]][a[1]] === 'undefined') {
          ip[a[0]][a[1]] = {}
        }
        if (row.depth === 2) {
          ip[a[0]][a[1]] = row.telco
        } else {
          ip[a[0]][a[1]][a[2]] = row.telco
        }
      }
    })
    .then(() => {
      return ip
    })
}
