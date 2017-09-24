
var assertValid = require('assertValid');
var uuid = require('uuid');
var RSA = require('rsa-utils');

var cache = require('./cache');
var ACME = require('..');

var DAY_MS = 24 * 60 * 60 * 1000;

var optionTypes = {
  urls: 'object',
  cache: 'object',
  email: 'string',
  domains: 'array',
  subject: 'object?',
  challenges: 'object',
  accountKeyPair: 'string|object?',
  domainKeyPair: 'string|object?',
  rsaKeySize: 'number?',
  debug: 'boolean?',
  log: 'function',
};

module.exports = function certify(acme, options) {
  assertValid(options, optionTypes);

  if (!options.domains.length) {
    throw Error("Must provide at least one domain");
  }

  if (!options.rsaKeySize) {
    options.rsaKeySize = ACME.rsaKeySize;
  }

  var log = options.log;
  var urls = options.urls;
  var cache = options.cache;

  return register(acme, urls.newReg, options).then(function(accountKeyPair) {
    var domainKeyPair = options.domainKeyPair;
    if (!domainKeyPair) {
      domainKeyPair = RSA.generateKeyPair(options.rsaKeySize);
      log('info', 'Generated domain keypair');
    } else if (typeof domainKeyPair === 'string') {
      domainKeyPair = RSA.import({
        privateKeyPem: domainKeyPair
      });
    }
    log('verbose', 'Fetching certificate...');
    return acme.getCertificate({
      newCertUrl: urls.newCert,
      newAuthzUrl: urls.newAuthz,
      subject: Object.assign({email: options.email}, options.subject),
      domains: options.domains,
      domainKeyPair: domainKeyPair,
      accountKeyPair: accountKeyPair,
      setChallenge: function(domain, token, auth, done) {
        options.challenges[token] = auth;
        done();
      },
      removeChallenge: function(domain, token, done) {
        delete options.challenges[token];
        done();
      }
    }).then(function(creds) {
      var authId = uuid();
      cache.get('auth')[authId] = Object.assign(creds, {
        email: options.email,
        subject: options.subject,
        expiresAt: Date.now() + 90 * DAY_MS,
      });
      log('info', 'Storing credentials: ' + authId);

      console.log('publicKey => domainKeyPair? ' +
        (creds.key === RSA.exportPublicPem(domainKeyPair)));

      var domains = cache.get('domains');
      options.domains.forEach(function(domain) {
        domains[domain] = authId;
      });
      cache.save();
    });
  });
};

function register(acme, newRegUrl, options) {
  var log = options.log;
  var cache = options.cache;

  var account = cache.get('account');
  if (account) {
    var accountKeyPair = RSA.import({
      privateKeyJwk: account.key
    });
    return Promise.resolve(accountKeyPair);
  }

  accountKeyPair = options.accountKeyPair;
  if (!accountKeyPair) {
    accountKeyPair = RSA.generateKeyPair(options.rsaKeySize);
    log('info', 'Generated account keypair');
  } else if (typeof accountKeyPair === 'string') {
    accountKeyPair = RSA.import({
      privateKeyPem: accountKeyPair
    });
  }

  log('info', 'Registering new ACME account...');
  return acme.registerNewAccount({
    email: options.email,
    newRegUrl: newRegUrl,
    accountKeyPair: accountKeyPair,
    agreeToTerms: function(tosUrl, done) {
      log('verbose', 'Agreeing to terms...');
      done(true);
    }
  }).then(function(res) {
    log('info', 'Registration success: ' + JSON.stringify(res));
    cache.set('account', {
      id: res.id,
      key: RSA.exportPrivateJwk(accountKeyPair),
      agreement: res.agreement,
      initialIp: res.initialIp,
      createdAt: res.createdAt,
    });
    return accountKeyPair;
  });
}
