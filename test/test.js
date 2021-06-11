const axios = require('axios')
const _ = require('lodash')
const mongo = require('mongodb')

const mongoUrl = 'mongodb://mongodb01:3337,mongodb02:3337,mongodb03:3337/ott?replicaSet=prodRepl&readPreference=nearest&maxPoolSize=100&connectTimeoutMS=20000'

const cateMap = {
  '["LYS005558536","LYS004070342","LYS004070466","LYS000005374","LYS004070480","LYS004070465","LYS000023301","LYS000024080"]': mongo.ObjectId('5955acda14d65eaadfc62560')
}

const limit = 1000
const skip = 0

const SPOTLIGHT_BASE_IMAGE = 'http://staticassetweb.5b1df984.cdnviet.com/spotlights/'
const POSTER_BASE_IMAGE = 'http://staticassetweb.5b1df984.cdnviet.com/posters/'
const POSTER_HD_BASE_IMAGE = 'http://staticassetweb.5b1df984.cdnviet.com/hq/posters/'
const VOD_BASE_URL = 'http://vodrestreamobj.5b1df984.cdnviet.com/hls/vod/'
const VOD_DRM_BASE_URL = 'http://vodsctvobj.5b1df984.cdnviet.com/hls/vod/sctv/'
const TIMESHIFT_BASE_URL = 'http://liverestreamobj.e66534d0.viettel-cdn.vn/hls/dvr/'

;(async () => {
  const MongoClient = require('mongodb').MongoClient
  console.log('Connect to MongoDB: ', mongoUrl)
  const client = await MongoClient.connect(mongoUrl) //, { useNewUrlParser: true }
  const ott = client.db('sctv-ott-test')

  _.forEach(cateMap, async (stvCateId, vtvcabId) => {
    const url = `http://mds.vtvcab.vn/metadata/delivery/GLOBAL/vod/editorials?filter={"voditem.nodeRefs":{"$in":${vtvcabId}},"isVisible":true,"$or":[{"technical.episodeNumber":{"$lt":2}},{"technical.episodeNumber":{"$exists":false}}],"editorial.Rating.precedence":{"$lte":122},"locale":"vi_VN"}&limit=${limit}&skip=${skip}&fields=["editorial.duration","technical.Title","technical.ViewingCounter","technical.Actors","technical.duration","technical.PromoImages","technical.PromoImages","technical.Episode","technical.media.AV_PlaylistName.fileName","technical.media.AV_PlaylistName.drmInstanceName","technical.Year","technical.Definition","technical.Description","technical.Categories","technical.seriesRef"]&sort=[["voditem.period.start",-1],["editorial.ProgrammeStartDate",-1]]`
    console.log(url)
    const result = await axios.get(url)
    _(result.data)
      .get('editorials', [])
      .filter(item => {
        // const protections = _.get(item, 'technicals[0].CopyProtections', [])
        // if (!protections.length) {
          const drm = _.get(item, 'technicals[0].media.AV_PlaylistName.drmInstanceName', '')
          if (!drm) return true
          const source = _.get(item, 'technicals[0].media.AV_PlaylistName.fileName', '')
          const tmp = source.split('/')
          if (tmp.length < 2) return true
          const tmp2 = tmp[tmp.length-2].split('_')
          if (tmp2.length < 2) return true
          const date = Number(tmp2[tmp2.length-2]) || 0

          return date > 20190417
        // } else {
        //   return protections.indexOf(protectionMap[params.deviceType]) === -1
        // }
      })
      .forEach(async vodResult => {
        const item = _.get(vodResult, 'technicals[0]', {})
        const duration = _.get(vodResult, 'duration', 0)
        // const age = _.get(item, 'Rating.precedence', 0)
        let source = _.get(item, 'media.AV_PlaylistName.fileName', '')
        const drm = _.get(item, 'media.AV_PlaylistName.drmInstanceName', '')
        const vodBaseSource = drm ? VOD_DRM_BASE_URL : VOD_BASE_URL
        source = getUrl(source, source.indexOf('timeshifting') >= 0 ? TIMESHIFT_BASE_URL : vodBaseSource)

        const imageUrl = getUrl(_.get(item, 'PromoImages[0]', ''), POSTER_HD_BASE_IMAGE)
        const uploadUrl = `https://upstv.gviet.vn:3743/upload?crop=1&url=${imageUrl}`
        const uploadResult = await axios.post(uploadUrl, {})

        const smallUploadUrl = `https://upstv.gviet.vn:3743/upload?crop=1&url=${imageUrl}&width=324&=height194`
        const smallUploadResult = await axios.post(smallUploadUrl, {})

        const data = {
          oldId: _.get(vodResult, 'id'),
          name: item.Title || '',
          description: item.Description || '',
          resolution: item.Definition || '',

          releaseYear: item.Year || '',
          duration: duration > 200 ? Math.round(duration/60) : 0,
          // age: age >= 12 ? (age+'+') : undefined,
          viewerCount: Number(item.ViewingCounter) || 0,
          episodeInfo: item.Episode || '',
          banner: [uploadResult.data.id],
          largeBanner: [uploadResult.data.id],
          thumbnail: {
            landscape: smallUploadResult.data.id,
            landscapeLarge: uploadResult.data.id,
            portrait: smallUploadResult.data.id
          },
          movieCatalogIds: [stvCateId],
          actors: item.Actors || '',
          // seriesRef: item.seriesRef,
          cmsUser: 'kiendt',
          source: source,
          "activated" : false,
          "activatedStore" : false
        }

        // console.log(data)
        const resultInsert = await ott.collection('Movie').insertOne(data)
        console.log(resultInsert.insertedId)

        return data
      })

    console.log('list.length', result.data.editorials.length)
    // const resultInsert = ott.collection('Movie').insert(list)
    // console.log('result', resultInsert)
  })


})()

function getUrl(url, base) {
  return url.startsWith('http') ? url : (base + url)
}
