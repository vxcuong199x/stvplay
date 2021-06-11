'use strict'

const md5 = require('md5')
let Validator = require('validatorjs')

Validator = (function (original) {
  const Validator = function (input, rules) {
    if (input.signature && rules.signature) {
      const secret = rules.signature.split('|').pop().split(':')[1]
      const signArr = rules.signature.split('|').pop().split(':').pop().split(',').map(
        (field) => input[field]
      )
      signArr.push(secret)
      input.signature = input.signature == md5(signArr.join('$'))
    }

    original.apply(this, arguments)   // apply constructor
  }

  Validator.prototype = original.prototype // reset prototype
  Validator.prototype.constructor = Validator // fix constructor property
  Object.keys(original).forEach((fn) => {
    Validator[fn] = original[fn]
  })
  return Validator
})(Validator)

const phoneRegex = /^(0|84)(1[2689]|5|9|8|3|7)[0-9]{8}$/

Validator.register('phone', (value, requirement, attribute) => {
  return phoneRegex.test(value)
}, ':attribute is invalid phone format')

Validator.register('deviceId', (value, requirement, attribute) => {
  return true
}, ':attribute is invalid device ID format')

Validator.register('signature', (value, requirement, attribute) => {
  return value ? true : false;
}, 'signature invalid');

module.exports = Validator
