'use strict'

const Promise = require('bluebird')
const moment = require('moment')
const crypto = require('crypto')
const _ = require('lodash')
const possibleString = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const convert = {
  '84169': '8439', // vt
  '84168': '8438',
  '84167': '8437',
  '84166': '8436',
  '84165': '8435',
  '84164': '8434',
  '84163': '8433',
  '84162': '8432',

  '84124': '8484', // vina
  '84127': '8481',
  '84129': '8482',
  '84123': '8483',
  '84125': '8485',

  '84120': '8470', // mobile
  '84121': '8479',
  '84122': '8479',
  '84126': '8476',
  '84128': '8478',

  '8418': '845', // vnm
}

const heads = Object.keys(convert)

module.exports = class utils {
  static invokeCallback(cb) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (!!cb && typeof cb === 'function') {
      return cb.apply(null, args);
    } else {
      if (!!args[0]) {
        return Promise.reject(args[0]);
      } else {
        return Promise.resolve(args[1]);
      }
    }
  }

  static JSONParse(opts, defaults) {
    if (opts !== null && typeof opts === 'object')
      return opts;

    defaults = defaults || null;
    try {
      defaults = JSON.parse(opts);
    } catch (e) {
      //console.error(e.stack || e);
    }

    return defaults;
  }

  static logIfError(e) {
    if (e) console.error(e.stack || e);
  }

  static interval(func, wait, times) {
    const myInterval = function (w, t) {
      return function () {
        if (typeof t === 'undefined' || t-- > 0) {
          setTimeout(myInterval, w);
          try {
            func.call(null);
          }
          catch (e) {
            t = 0;
            throw e;
          }
        }
      };
    }(wait, times);

    setTimeout(func, 2000);
    setTimeout(myInterval, wait);
  }

  static fillToken(msg, token) {
    const keys = Object.keys(token);
    for (let i = 0; i < keys.length; i++) {
      msg = msg.replace(new RegExp(('['+keys[i]+']').replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), token[keys[i]]);
    }
    return msg;
  }

  static randomPassword(len) {
    let str = '';
    for (let i = 0, l = len || 4; i < l; i++) {
      const random = parseInt(Math.random() * 10);
      str = str.concat(random.toString());
    }
    return str;
  }

  static generateTransactionId(len) {
    let dateString = moment().format('YYYYMMDDHHmmss');
    for (let i = 0, l = len || 4; i < l; i++) {
      let random = parseInt(Math.random() * 10);
      dateString = dateString.concat(random.toString());
    }
    return dateString;
  }

  static getIp (req) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    const tmp = ip.split(',')
    ip = tmp[0]
    if (ip.substr(0, 7) == '::ffff:') {
      ip = ip.substr(7)
    }
    return ip
  }

  static formatPhone(phone) {
    if (/0\d{9,11}/.test(phone))
      return '84' + phone.substr(1)
    else
      return phone
  }

  static locDauTV(str) {
    let result = str.toLowerCase()
    result = result.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,'a')
    result = result.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,'e')
    result = result.replace(/ì|í|ị|ỉ|ĩ/g,'i')
    result = result.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,'o')
    result = result.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,'u')
    result = result.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,'y')
    result = result.replace(/đ/g,'d')
    result = result.replace(/[^a-zA-Z0-9 ]/g, '')
    return result
  }

  static removeSpecialChars(str) {
    return str.replace(/[^a-zA-Z0-9]/g, ' ')
  }

  static compressName(str) {
    return utils.removeSpecialChars(str).trim().split(' ').map(item => {
      return item.charAt(0)
    }).join('').toLowerCase()
  }

  static momentRound(date, duration, method = 'ceil') {
    return moment(Math[method]((+date) / (+duration)) * (+duration));
  }

  static randomString(length) {
    let text = ''

    for (let i = 0; i < length; i++)
      text += possibleString.charAt(Math.floor(Math.random() * possibleString.length))

    return text
  }

  static xorEncode(input, key) {
    const base64 = Buffer.from(input).toString('base64')
    const xor = []
    let charCode
    const n = base64.length

    for (let i = 0; i < n; i++) {
      charCode = base64.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      xor.push(charCode)
    }

    return Buffer.from(xor).toString('base64')
  }

  static xorDecode(input, key) {
    const xor = Buffer.from(input.replace(/ /g,'+'), 'base64')

    const output = []
    let charCode
    const n = xor.length

    for (let i = 0; i < n; i++) {
      charCode = xor[i] ^ key.charCodeAt(i % key.length)
      output.push(String.fromCharCode(charCode))
    }

    return Buffer.from(output.join(''), 'base64').toString('utf8')
  }

  static getImageUrl(base, id) {
    if (!id) return ''

    id = Number(id)

    const tmp = Math.floor(id / 10000)
    const path1 = Math.floor(tmp / 1000000) + 1
    const path2 = Math.floor((tmp % 1000000) / 1000) + 1

    return `${base}${path1}/${path2}/${id}.png`
  }

  static toLowerCase(string) {
    let result = string.toLowerCase().trim()
    result = result
      .replace(/\//g, '/ ')
      .replace(/\(/g, '( ')
      .replace(/ +(?= )/g,'')
      .replace(/ iii/g, ' III')
      .replace(/ ii/g, ' II')
      .replace(/ iv/g, ' IV')
      .replace(/ viii/g, ' VIII')
      .replace(/ vii/g, ' VII')
      .replace(/ vi/g, ' VI')
      .replace(/ ix/g, ' IX')
      .replace(/epl/g, 'EPL')
      .replace(/epl/g, 'MLS')
      .replace(/wwe/g, 'WWE')

    const words = result.split(' ')
    for (let i = 0, n = words.length; i < n; i++) {
      if (words[i].length) {
        words[i] = words[i][0].toUpperCase() + words[i].slice(1)
      }
    }

    result = words.join(' ')
    result = result
      .replace(/\/ /g, '/')
      .replace(/\( /g, '(')

    return result
  }

  // viettel
  static convert03xTo016x(phone) {
    return phone.startsWith('843') ? phone.replace('843', '8416') : phone
  }

  // vina
  static convert08xTo012x(phone) {
    if (phone.startsWith('848') && !phone.startsWith('8488') && !phone.startsWith('8486') && !phone.startsWith('8489')) {
      return phone
        .replace('8481', '84127')
        .replace('8482', '84129')
        .replace('848', '8412')
    }

    return phone
  }

  // mobi
  static convert07xTo012x(phone) {
    if (phone.startsWith('847')) {
      return phone
        .replace('8479', '84121')
        .replace('8477', '84122')
        .replace('847', '8412')
    }

    return phone
  }

  // vnm
  static convert05xTo018x(phone) {
    if (phone.startsWith('845')) {
      return phone
        .replace('845', '8418')
    }

    return phone
  }

  static duplicatePhone(phone) {
    if (phone.startsWith('8416')) {
      return phone.replace('8416', '843')
    }
    else if (phone.startsWith('8412')) {
      return phone
        .replace('84127', '8481')
        .replace('84129', '8482')
        .replace('8412', '848')
    }
    else if (phone.startsWith('8412')) {
      return phone
        .replace('84121', '8479')
        .replace('84122', '8477')
        .replace('8412', '847')
    }

  }

  static hmacSha256(text, secret) {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(text)
    return hmac.digest('hex')
  }

  static objectToString(obj) {
    const result = []
    _.each(obj, (value, key) => {
      let str = `${key}=`
      if (value !== undefined) str += value
      result.push(str)
    })

    return result.join('&')
  }

  static convertOldToNewPhone(phone) {
    if (phone.length === 12 && phone.startsWith('841')) {
      for (let i = 0; i < heads.length; i++) {
        if (phone.startsWith(heads[i])) {
          return phone.replace(heads[i], convert[heads[i]])
        }
      }
    }

    return phone
  }

  static isFromStore(req) {
    return req.dtId == 6 || req.dtId == 1
  }

  static inReview(req, params) {
    // iOS = 1, android = 2
    return 0
    // return (req.dtId == 6 && req.platform == 1) ? 1 : 0
  }
}
