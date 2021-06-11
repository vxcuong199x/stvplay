process.env.NODE_ENV = 'production'
const getRedis = require('../server/utils/get-redis')

const run = async () => {
  const redis = getRedis('redis')
  const keys = await redis.keys('ott:token:*')
  for (let i = 0; i <= keys.length - 5000; i++) {
    await redis.expire(keys[i], 3600)
    console.log('keys[i]', i, keys[i])
  }
  console.log('keys', keys.length)
}

run()
