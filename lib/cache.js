
var assertValid = require('assertValid');
var fs = require('fsx');

var cache = null;
var cachePath = null;
var challenges = Object.create(null);
var savingCache = null;

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
};

exports.configure = function(config) {
  assertValid(config, configTypes);
  cachePath = config.path;
  if (fs.isFile(cachePath)) {
    cache = JSON.parse(fs.readFile(cachePath));
  } else {
    cache = {
      account: null,
      domains: {},
      auth: {},
    };
  }
  for (var key in cache) {
    if (config.hasOwnProperty(key)) {
      cache[key] = config[key];
    }
  }
  return this;
};

exports.get = function(key) {
  return cache[key];
};

exports.set = function(key, value) {
  if (!cache.hasOwnProperty(key)) {
    throw Error("Unsupported cache key: " + key);
  }
  cache[key] = value;
  this.save();
};

exports.save = function() {
  if (!savingCache) {
    savingCache = setTimeout(function() {
      fs.writeFile(cachePath, JSON.stringify(cache));
      savingCache = null;
    }, 5000);
  }
};
