module.exports = process.env.NODE_ENV != 'production'
  ? require('./proxy.development')
  :
{
  BASE_URL_STATISTIC: 'http://172.16.20.64:1235',
  BASE_URL_CRM: 'http://172.16.20.64:1236',
  MOVIE_CRAWLER_REDIS_STRING: 'redis://172.16.10.43:6379', // todo check
  DOWNLOAD_URL: 'http://gviet.vn/',
  TRANSCODE_VIDEO_URL: 'http://10.10.60.65:9999'
}
