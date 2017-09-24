
var assertValid = require('assertValid');
var ACME = require('le-acme-core');
var RSA = require('rsa-utils');
var tls = require('tls');

var certify = require('./lib/certify');
var Cache = require('./lib/cache');

var __DEV__ = process.env.NODE_ENV !== 'production';
var DAY_MS = 24 * 60 * 60 * 1000;

var optionTypes = {
  cachePath: 'string',
  debug: 'boolean?',
  log: 'function?',
};

var defaultLog = __DEV__ ? function(level, message) {
  console.log('[' + level + '] ' + message);
} : Function.prototype;

exports.create = function(options) {
  assertValid(options, optionTypes);

  var log = options.log || defaultLog;
  var acme = ACME.create({
    debug: options.debug,
    log: log,
  });
  var acmeUrls = null;
  var acmeChallenges = {};

  function getAcmeUrls() {
    if (acmeUrls) return acmeUrls;

    var discoveryUrl = __DEV__ ? ACME.stagingServerUrl : ACME.productionServerUrl;
    log('verbose', 'Fetching ACME urls: ' + discoveryUrl);
    return acmeUrls = acme.getAcmeUrls(discoveryUrl).then(function(acmeUrls) {
      log('verbose', 'Fetched ACME urls: ' + JSON.stringify(acmeUrls, null, 2));
      return acmeUrls;
    });
  }

  var contexts = {};
  var cache = Cache.create({
    path: options.cachePath,
    log: log,
  });

  function renew(renewId, options) {
    assertValid(renewId, 'string');
    assertValid(options, 'object?');

    var domains = filterKeys(cache.get('domains'), function(authId) {
      return authId === renewId;
    });
    if (!domains.length) {
      var error = Error("No domains match the given ID: " + renewId);
      error.code = 'E_NO_DOMAINS';
      return Promise.reject(error);
    }

    var creds = cache.get('auth')[renewId];
    options = Object.assign({
      email: creds.email,
      subject: creds.subject,
    }, options);

    return getAcmeUrls().then(function(acmeUrls) {
      options.log = log;
      options.urls = acmeUrls;
      options.cache = cache;
      options.domains = domains;
      options.challenges = acmeChallenges;
      return certify(acme, options).then(function() {
        delete cache.get('auth')[renewId];
        log('verbose', 'Renewed SSL certificate for: ' + domains.join(', '));
      });
    });
  }

  return {
    certify: function(options) {
      assertValid(options, 'object');
      return getAcmeUrls().then(function(acmeUrls) {
        options.log = log;
        options.urls = acmeUrls;
        options.cache = cache;
        options.challenges = acmeChallenges;
        return certify(acme, options);
      });
    },
    renew: renew,
    renewAll: function(options) {
      var auth = cache.get('auth');
      for (var authId in auth) {
        // TODO: Check if the certificate has expired.
        renew(authId, options);
      }
    },
    revoke: function(revokeId) {
      assertValid(revokeId, 'string');
      var creds = cache.get('auth')[revokeId];
      if (!creds) {
        throw Error("No credentials exist for the given ID: " + revokeId);
      }
      return getAcmeUrls().then(function(acmeUrls) {
        return acme.revokeCertificate({
          cert: creds.cert,
          publicKeyPem: creds.key,
          revokeCertUrl: acmeUrls.revokeCert,
        }).then(function(res) {
          delete cache.get('auth')[revokeId];
          var domains = cache.get('domains');
          domains = filterKeys(domains, function(authId, domain) {
            if (authId === revokeId) {
              delete domains[domain];
              return true;
            }
          });
          log('verbose', 'Revoked SSL certificate for: ' + domains.join(', '));
          return res;
        });
      });
    },
    getChallenge: function(url) {
      assertValid(url, 'string');
      if (url.startsWith(ACME.challengePrefix)) {
        var token = url.slice(ACME.challengePrefix.length);
        return acmeChallenges[token];
      }
    },
    getDomains: function() {
      return Object.keys(cache.get('domains'));
    },
    getCredentials: function(domain) {
      assertValid(domain, 'string');
      var domains = cache.get('domains');
      if (domains.hasOwnProperty(domain)) {
        return cache.get('auth')[domains[domain]];
      }
      return null;
    },
    filterCredentials: function(filter) {
      assertValid(filter, 'object|function');
      if (typeof filter === 'function') {
        return filterKeys(cache.get('auth'), filter);
      }
      if (filter.olderThan != null) {
        var olderThan = filter.olderThan;
        assertValid(olderThan, 'number|date');
        var now = Date.now();
        if (typeof olderThan !== 'number') {
          olderThan = now - olderThan;
        }
        console.log('Finding credentials older than ' + (olderThan / DAY_MS) + ' days...');
        olderThan = now + (90 * DAY_MS) - olderThan;
        return filterKeys(cache.get('auth'), function(creds) {
          return new Date(creds.expiresAt) < olderThan;
        });
      }
      throw Error(
        "`olderThan` is currently the only supported filter," +
        " but you can also pass a filter function"
      );
    },
    getSecureContext: function(domain) {
      assertValid(domain, 'string');
      var domains = cache.get('domains');
      if (domains.hasOwnProperty(domain)) {
        var authId = domains[domain];
        var creds = cache.get('auth')[authId];
        if (!contexts.hasOwnProperty(authId)) {
          contexts[authId] = tls.createSecureContext({
            key: creds.key,
            cert: creds.cert + '\n' + creds.ca,
          });
        }
        return contexts[authId];
      }
      return null;
    }
  };
};

function filterKeys(obj, filter) {
  var keys = [];
  for (var key in obj) {
    if (filter(obj[key], key)) {
      keys.push(key);
    }
  }
  return keys;
}
