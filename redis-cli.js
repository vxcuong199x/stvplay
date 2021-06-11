process.env.NODE_ENV = 'production'
const getRedis = require('./server/utils/get-redis')

getRedis('redis').pipeline([process.argv.slice(2)]).exec((e, result) => {
  console.log(result[0])
})

getRedis('redisSession').pipeline([process.argv.slice(2)]).exec((e, result) => {
  console.log(result[0])
})


getRedis('redisPushOnline').pipeline([process.argv.slice(2)]).exec((e, result) => {
  console.log(result[0])
})
