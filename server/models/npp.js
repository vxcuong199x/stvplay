'use strict'

const _ = require('lodash')

module.exports = function(Npp) {
  Npp.afterRemote('login', function (context, administrator, next) {
    let AccessToken = Npp.app.models.AccessToken;
    if (context.res.statusCode == 200) {
      _.set(context, 'args.options.authorizedRoles.npp', true)

      console.log('options', context.args)

      Npp.findOne({ where: { username: context.args.credentials.username } }, function(err, user) {
        if (err) return next(err);
        _.set(context, 'args.options.dtId', user.dtId)
        administrator.role = 'npp_'+user.dtId;
        context.result.dtId = user.dtId
        AccessToken.replaceById(administrator.id, administrator, function(e) {
          e && console.error(e);
          next();
        })
      });
    } else {
      next();
    }

  });
};

