/**
 * Created by bi on 6/6/15.
 */

var querystring = require('querystring')
var http = require('http')
var Promise = require('bluebird')

var ipGeoLocation = "http://123.30.235.49:5688/query"

var fetch = function (ip, cb) {
  var req = http
  .get(ipGeoLocation + '?' + querystring.stringify({ip: ip}) , function(res) {
    if (res.statusCode === 200) {
      var response = ''
      res.on('data', function (trunk) {
        response += trunk
      })
      res.on('end', function () {
        var json
        try {
          json = JSON.parse(response)
        } catch (e) {
          json = null
        }
        cb(null, json)
      })
    } else {
      cb(res.statusCode)
    }
  })
  req.setTimeout(3 * 1000, function(res){
    cb(null, {ec: 0, data: {COUNTRY_ALPHA2_CODE: 'XX'}})
  })
  req.on('error', function(e) {
    cb(e)
  })
}


var IpGeoLocation = {
  isVnLocation: Promise.promisify(function (ip, cb) {
    fetch(ip, function (err, res) {
      if (err || !res || res.ec != 0) {
        console.error(err)
        return cb(null, false)
      }
      cb(null, res.data.COUNTRY_ALPHA2_CODE == 'VN')
    })
  }),

  getCountryCode: Promise.promisify(function (ip, cb) {
    fetch(ip, function (err, res) {
      if (!!res && res.ec == 0) {
       return cb(null, res.data.COUNTRY_ALPHA2_CODE || 'XX')
      }
      if (err) console.error(err)
      cb(null, 'XX')
    })
  })
}

module.exports = IpGeoLocation
