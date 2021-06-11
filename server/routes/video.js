'use strict'

const axios = require('axios')
const _ = require('lodash')
const fs = require('fs')
const pathLib = require('path')
const proxy = require('../config/proxy')
const consts = require('../config/consts')

const rootDirConfig = {
  VTVCab: '/vtvcab',
  NHIEP_THANG: '/nghiepthang',
  UPLOAD: '/sctv',
  RECORDING: '/record',
  RECORDING_OLD: '/data2/RECORDING',
  'SONG-VANG': '/songvang',
  OUTPUT: '/data2/VIDEO'
}

const profileMap = {
  1080: [1080,3000000,192000],
  720: [720,2000000,128000],
  480: [480,1500000,128000],
  360: [360,500000,64000]
}

module.exports = function(Video) {

  Video.remoteMethod('readDir', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'rootDir', type: 'string', required: true},
      {arg: 'path', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'Read directory'
  })

  Video.readDir = (req, rootDir, path, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    fs.readdir(pathLib.join(rootDir || '', path), (e, list) => {
      cb(e, list)
    })
  }

  Video.remoteMethod('transcode', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'files', type: 'array', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'transcode'
  })

  // [{input, output, codec, profiles, drm: 1|0, start, end}]
  Video.transcode = (req, files, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const data = []
    const logMap = {}
    _.each(files, file => {
      file.output = file.output.trim().replace(/ /g, '-').replace('video', 'VIDEO').replace(/(?!\/)(?!-)[^\w\s]/gi, '')
      let tmp = file.output.split('/')
      let profiles = [];

      if (file.profiles && file.profiles.length) {
        _.each(file.profiles, profile => {
          profiles = profiles.concat(profileMap[profile] || [])
        })
      } else {
        _.each(profileMap, profile => {
          profiles = profiles.concat(profile)
        })
      }

      const itemName = tmp.length && tmp.length >= 2 ? tmp[tmp.length-2] || '' : ''

      data.push({
        movie: itemName,
        profile: profiles,
        input: file.input,
        output: file.output,
        format: file.codec || 'h264',
        start: file.start || undefined,
        end: file.end || undefined,
        clientId: file.drm ? '5b4e9f81cac95235fe7c1058' : '',
        encrypt: file.drm ? undefined : 0,
        watermark: file.watermark,
        x: file.x,                                  //watermark x, default 0 [pixel]('-'=from right)
        y: file.y                                  //watermark y, default 0('-'=from bottom)
      })

      logMap[file.output] = {
        name: itemName,
        input: file.input,
        output: file.output,
        codec: file.codec || 'h264',
        drm: file.drm ? 1 : 0,
        profiles: file.profiles || [],
        progress: -1,
        status: 0
      }
    })

    const params = {
      type: 'start',
      data: data,
      ts:8,                                 //TS time, default 6 [second]('-'=fixed time)
      clean:0,                              //remove input file, default 0 = don't remove
      speed:3                               //conversion speed[0-8], default 3
    }

    console.log(proxy.TRANSCODE_VIDEO_URL, params)

    axios.post(proxy.TRANSCODE_VIDEO_URL, params)
      .then(result => {
        console.log('Transcode result: ', result.data)
        if (result.data && !result.data.ec && result.data.result) {
          cb(null, {})

          const logData = []
          _.each(result.data.result, (status, output) => {
            if (status === 'OK') {
              logData.push(logMap[output])
            }
          })

          // console.log(logData)

          Video.create(logData, (e) => e && console.error(e))
        } else {
          cb('transcode error')
        }
      })
      .catch(e => {
        console.error('transcode error: ', e.stack || e)
        cb(e)
      })
  }

  Video.remoteMethod('stop', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'files', type: 'array', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'stop'
  })

  Video.stop = (req, files, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const params = {
      type: 'stop',
      output: files
    }

    console.log(proxy.TRANSCODE_VIDEO_URL, params)

    axios.post(proxy.TRANSCODE_VIDEO_URL, params)
      .then(result => {
        console.log('Stop result: ', result.data)
        if (result.data && !result.data.ec) {
          deleteFolderRecursive(files[0])
          cb(null, {})
        } else {
          cb('stop error')
        }
      })
      .catch(e => {
        console.error('transcode stop: ', e.stack || e)
        cb(e)
      })
  }

  Video.afterRemote('find', (ctx, option, next) => {
    if ( ctx.result && Array.isArray(ctx.result) ) {

      const params = {
        type: 'progress',
        output: _.map(ctx.result, item => (item.output))
      }

      // console.log(proxy.TRANSCODE_VIDEO_URL, params)

      axios.post(proxy.TRANSCODE_VIDEO_URL, params)
        .then(result => {
          // console.log('Progress result: ', result.data)
          _.each(ctx.result, (item, i) => {
            ctx.result[i].progress = fs.existsSync(item.output + '/master.m3u8') ? 100 : result.data.result[item.output+'/'] || -1
            ctx.result[i].result = item.output.replace('/data2/VIDEO/', 'https://vodstvvnpt.gviet.vn/') + '/master.m3u8'
          })

          next()
        })
        .catch(e => {
          console.error(e.stack || e)

          _.each(ctx.result, (item, i) => {
            ctx.result[i].progress = fs.existsSync(item.output + '/master.m3u8') ? 100 : 0
            ctx.result[i].result = item.output.replace('/data2/VIDEO/', 'https://vodstvvnpt.gviet.vn/') + '/master.m3u8'
          })

          next()
        })
    } else {
      next()
    }
  })

  Video.remoteMethod('progress', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'rootDir', type: 'string', required: true},
      {arg: 'path', type: 'string', required: true}
    ],
    returns: {type: 'array', root: true},
    description: 'progress'
  })

  Video.progress = (req, rootDir, path, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const params = {
      type: 'progress',
      output: pathLib.join(rootDir, path)
    }

    // console.log(proxy.TRANSCODE_VIDEO_URL, params)

    axios.post(proxy.TRANSCODE_VIDEO_URL, params)
      .then(result => {
        console.log('Progress result: ', result.data)
        const data = _.map(result.data.result, (percent, path) => {
          return { path: path.replace('/data2/VIDEO/', 'https://vodstvvnpt.gviet.vn/') + 'master.m3u8', percent }
        })

        let fileList = []
        fileList = getM3u8List(pathLib.join(rootDir || '', path), fileList)
        _.each(fileList, file => {
          data.push({ path: file.replace('/data2/VIDEO/', 'https://vodstvvnpt.gviet.vn/'), percent: 100 })
        })
        // console.log('Progress result 2: ', data)

        cb(null, { data })
      })
      .catch(e => {
        console.error('Progress error: ', e.stack || e)
        cb(e)
      })
  }

  Video.remoteMethod('addToItem', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'items', type: 'array', required: true}
    ],
    returns: {type: 'object', root: true},
    description: 'addToItem'
  })

  //  [{name, output, source, type:'movie|clip', itemId, episode}]
  Video.addToItem = (req, items, cb) => {
    if (!req.accessToken.role) {
      return cb(null, {})
    }

    const addToMovie = []
    const addToClip = []

    _.each(items, item => {
      if (item.type == 'clip') {
        addToClip.push({
          clipId: item.itemId,
          episode: item.episode,
          source: item.source,
          activated: true,
          name: `Phần ${item.episode}`
        })
      } else if (item.type == 'movie') {
        addToMovie.push({
          movieId: item.itemId,
          episode: item.episode,
          source: item.source,
          activated: true,
          name: `Tập ${item.episode}`
        })
      }

      Video.update(
        { output: item.output },
        { $set: {
            status: 1,
            contentType: item.type == 'clip' ? consts.MEDIA_TYPE.CLIP : consts.MEDIA_TYPE.MOVIE,
            contentId: item.itemId,
            episode: item.episode,
            contentName: item.name
        } }
      )
    })

    if (addToClip.length) {
      Video.app.models.ClipEpisode.create(addToClip, (e, results) => {
        e && console.error('insert batch program error: ', e.stack || e)
        cb(null, { ok: results && results.length })
      })
    }

    if (addToMovie.length) {
      Video.app.models.MovieEpisode.create(addToMovie, (e, results) => {
        e && console.error('insert batch program error: ', e.stack || e)
        cb(null, { ok: results && results.length })
      })
    }

    cb(null, {})
  }
}

function getM3u8List(dir, fileList = []) {
  fs.readdirSync(dir).forEach(file => {
    const path = pathLib.join(dir, file)
    fileList = fs.statSync(path).isDirectory()
      ? getM3u8List(path, fileList)
      : path.endsWith('master.m3u8') ? fileList.concat(path) : fileList

  })

  return fileList
}

// const getM3u8List = (dir, fileList = []) => {
//   fs.readdirSync(dir).forEach(file => {
//     const filePath = pathLib.join(dir, file)
//
//     fileList.push(
//       fs.statSync(filePath).isDirectory()
//         ? {[file]: getM3u8List(filePath)}
//         : file
//     )
//   })
//   return fileList
// }

// const getM3u8List = (dir, fileList = []) => fs.readdirSync(dir)
//   .map(file => {
//     const path = pathLib.join(dir, file)
//     console.log(dir, file, path, fileList)
//     return fs.statSync(path).isDirectory()
//       ? walkSync(path, fileList)
//       : fileList.concat(path)[0]
//   })

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      const curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

