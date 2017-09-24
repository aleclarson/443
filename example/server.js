
var qs = require('querystring');

function app(req, res) {
  var ssl = this;
  var url = req.url;

  var challenge = ssl.getChallenge(url);
  if (challenge) {
    return res.end(challenge);
  }

  var index = url.indexOf('?');
  if (index !== -1) {
    var query = qs.parse(url.slice(index + 1));
    url = url.slice(0, index);
  }

  var send = function(json) {
    res.statusCode = json.status || 200;
    res.end(JSON.stringify(json));
  };

  if (url === '/creds') {
    send(ssl.getCredentials(req.headers.host) || {status: 400, error: 'No credentials exist for: ' + req.headers.host});
  }

  else if (url === '/certify') {
    if (!query.email) {
      send({status: 400, error: 'Must provide query.email'});
    }
    else if (!query.domains) {
      send({status: 400, error: 'Must provide query.domains'});
    }
    else {
      var domains = query.domains.split(',');
      ssl.certify({
        email: query.email,
        domains: domains,
      }).then(function() {
        send({status: 200});
        console.log(
          'CA certification success!\n\n' +
          'Send a GET request to `/creds` to see them,\n' +
          'or visit "https://' + domains[0] + ':443/" in your browser!\n'
        );
      }).catch(function(error) {
        console.log(error.stack);
        res.statusCode = 500;
        res.end(error.message);
      });
    }
  }

  else {
    send({status: 404});
  }
}

function http(ssl) {
  return require('http')
    .createServer(app.bind(ssl))
    .listen(80, function() {
      console.log('Listening @ http://localhost:80/');
    });
}

function https(ssl) {
  var options = {
    SNICallback: function(domain, done) {
      done(null, ssl.getSecureContext(domain));
    }
  };
  return require('https')
    .createServer(options, app.bind(ssl))
    .listen(443, function() {
      console.log('Listening @ https://localhost:443/');
    });
}

exports.create = function(options) {
  var ssl = require('..').create(options);

  var servers = [];
  servers.push(http(ssl));
  servers.push(https(ssl));

  // Close the servers.
  ssl.close = function() {
    servers.forEach(function(server) {
      server.close();
    });
  };

  return ssl;
};
