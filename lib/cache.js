
var assertValid = require('assertValid');
var fs = require('fsx');

var configTypes = {
  path: 'string',
  account: [{
    id: 'number',
    key: 'object',
    agreement: 'string',
    initialIp: 'string',
    createdAt: 'string',
  }, '?'],
  domains: 'object?', // {domain: authId}
  auth: 'object?', // {authId: {key, cert, ca, email, subject, expiresAt}}
  log: 'function',
};

exports.create = function(config) {
  assertValid(config, configTypes);

  var cachePath = config.path;
  var cache = loadCache(cachePath);

  for (var key in cache) {
    if (config.hasOwnProperty(key)) {
      cache[key] = config[key];
    }
  }

  var log = config.log;
  var saving = null;
  return {
    get: function(key) {
      return cache[key];
    },
    set: function(key, value) {
      if (!cache.hasOwnProperty(key)) {
        throw Error("Unsupported cache key: " + key);
      }
      cache[key] = value;
      this.save();
    },
    save: function() {
      if (!saving) {
        saving = setTimeout(function() {
          log('verbose', 'Saving ACME cache: ' + cachePath);
          fs.writeFile(cachePath, JSON.stringify(cache));
          saving = null;
        }, 5000);
      }
    }
  };
};

function loadCache(cachePath) {
  if (fs.isFile(cachePath)) {
    return JSON.parse(fs.readFile(cachePath));
  }
  return {
    account: null,
    domains: {},
    auth: {},
  };
}
