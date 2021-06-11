'use strict'

const express = require('express')
const fileUpload = require('express-fileupload')
const Jimp = require('jimp')
const shortid = require('shortid')
const md5 = require('md5')
const app = express()

let SECRET, base, httpBase, HI_QUALITY_RATE

SECRET = 'rPJwdQ2jTSbP'
base = '/data/nginx/html/rsnj.vgame.us/sctv/'
httpBase = 'http://rsnj.vgame.us/sctv/'
HI_QUALITY_RATE = 1800

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,access-token')
  next()
})

// default options
app.use(fileUpload({
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  safeFileNames: true
}))

app.post('/upload', function(req, res) {
  if (req.query.test) {
    SECRET = 'Hr13G9E5qgizsaVd'
    base = '/data/nginx/html/rsnj.vgame.us/hai/'
    httpBase = 'http://rsnj.vgame.us/hai/'
    HI_QUALITY_RATE = 2000
  }

  if (!req.query.signature || ((!req.files || !req.files.imageFile) && !req.query.url))
    return res.status(400).json({ec: 400})

  let data

  if (!req.query.url) {
    const uploadFile = req.files.imageFile
    if (md5(uploadFile.data.length + '$' + SECRET) != req.query.signature) {
      return res.status(400).json({
        ec: 400,
        msg: 'wrong signature ' + uploadFile.data.length // + ' ' + (uploadFile.data.length + '$' + SECRET) + ' ' + md5(uploadFile.data.length + '$' + SECRET)
      })
    }

    data = uploadFile.data
  } else {
    if (md5(req.query.url + '$' + SECRET) != req.query.signature) {
      return res.status(400).json({
        ec: 400,
        msg: 'wrong signature'
      })
    }

    data = req.query.url
  }

  const id = Date.now()

  Jimp.read(data)
    .then(image => {
      if (req.query.width && image.bitmap.width > req.query.width) {
        image = image.resize(Number(req.query.width), Jimp.AUTO)
      }

      const qualityRate = image.bitmap.data.length / image.bitmap.width
      console.log(image.getExtension(), image.bitmap.data.length, image.bitmap.width, qualityRate, Math.round(HI_QUALITY_RATE * 100 / qualityRate))
      if (qualityRate >= HI_QUALITY_RATE) {
        image.quality(Math.round(HI_QUALITY_RATE * 100 / qualityRate))
      }

      const tmp = Math.floor(id / 10000)
      const path1 = Math.floor(tmp / 1000000) + 1
      const path2 = Math.floor((tmp % 1000000) / 1000) + 1

      console.log(`${httpBase}${path1}/${path2}/${id}.png`)
      const imageType = req.query.png ? Jimp.MIME_PNG : Jimp.MIME_JPEG

      return image.write(`${base}${path1}/${path2}/${id}.png`, imageType, e => e && console.error(e))
    })
    .then(() => {
      res.json({id: id})
    })
    .catch(e => {
      console.error('upload error', e.stack || e)
      return res.status(500).json({ec: 500, msg: e.stack || e})
    })
})

app.listen(8000, () => {
  console.log('Upload listening on port 8000!')
})

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e.stack || e)
  process.exit(0)
})
