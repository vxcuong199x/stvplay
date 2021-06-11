const _ = require('lodash')

module.exports = (app) => {
  const oldConsoleError = console.error
  console.error = function newConsoleError() {
    const args = Array.from(arguments)
    oldConsoleError.apply(console, args)

    if (args[0] == 'Uncaught exception' || args[0] == 'debug') {
      app.get('logstash').error({
        meta_logType: 'error',
        message: _.map(args, item => typeof item == 'string' ? item : JSON.stringify(item)).join(' :: '),
        name: undefined,
        source: undefined,
        tags: undefined
      })
    }
  }
}
