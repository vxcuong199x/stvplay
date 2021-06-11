'use strict';

module.exports = function(server) {
  delete server.models.CmsUser.validations.email;
  delete server.models.Admin.validations.email;
  
  // Install a `/` route that returns server status
  var router = server.loopback.Router();
  router.get('/', (req, res) => { res.send('') });
  server.use(router);

  const User = server.models.Npp
  const Role = server.loopback.Role

  // User.create([
  //   {username: 'npp_itvplus2', email: 'john2@doe.com', password: 'itvplus@73645#', dtId: 11},
  //   {username: 'npp_sonca', email: 'john3@doe.com', password: 'sonca@928451@', dtId: 12}
  // ], function(err, users) {
  //   if (err) return console.error(err);
  //   // Create the admin role
  //   Role.create({
  //     name: 'admin'
  //   }, function(err, role) {
  //     if (err) return console.log(err);
  //     console.log(role);
  //
  //     // Make Bob an admin
  //     role.principals.create({
  //       principalType: server.loopback.RoleMapping.USER,
  //       principalId: users[0].id
  //     }, function(err, principal) {
  //       if (err) return console.log(err);
  //       console.log(principal);
  //     });
  //   });
  // });

}
