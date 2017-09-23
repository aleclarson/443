
# 443 v1.0.0

Automated SSL certificates using [Let's Encrypt](https://letsencrypt.org/how-it-works).

```js
var ssl = require('443').create({
  cachePath: path.join(__dirname, 'ssl.json'),
});

ssl.certify({
  email: 'webmaster@example.com',
  domains: [
    'example.com',
    'www.example.com',
  ],
  subject: {
    company: 'Google',
    country: 'US',
    state: 'CA',
    city: 'Mountain View',
  },
  rsaKeySize: 2048,
  log: function(level, message) {
    console.log(message);
  },
});
```

#### Features

- Simple API
- Easy setup w/ guide
- Helpers for renewing and revoking
- Certificate file cache built-in
- Custom logging option

---

### API

#### certify(options)

Request a new certificate from the Let's Encrypt ACME server. If an ACME account has not been registered, one will be created before requesting the certificate. Later calls to `certify` will use the same account, even if the server restarts.

Returns a promise.

Defining `options.subject` is not required, because LE cannot verify any of that information.

**Options:**
- `email: string` The email address used to register an account with the ACME server
- `domains: array` The hostnames for which the new certificate will be valid
- `subject: object?` Details included in the certificate signing request (all values are optional)
  - `company: string` (eg: 'Google')
  - `country: string` (eg: 'US')
  - `state: string` (eg: 'CA')
  - `city: string` (eg: 'Mountain View')
  - `division: string` (eg: 'DevOps')
  - `email: string` If you want a different email than the ACME account, specify it here
- `accountKeyPair: string?` Supply your own private key for account registration
- `domainKeyPair: string?` Supply your own private key for certification
- `rsaKeySize: number?` Customize the RSA key size (defaults to 2048)
- `debug: boolean?` When true, `le-acme-core` spits out more detailed logs
- `log: function?` Supply your own logging function. Arguments passed are `(level, message)`

#### renew(authId, options)

Renew a cached certificate by its ID. Allows the same options as `certify`.

Returns a promise.

```js
// Renew certificates older than 60 days (what LE recommends).
var DAY_MS = 24 * 60 * 60 * 1000;
ssl.filterCredentials({
  olderThan: 60 * DAY_MS,
}).forEach(ssl.renew);
```

### renewAll(options)

Renew every cached certificate at once. Allows the same options as `certify`.

Returns a promise.

#### revoke(authId)

Revoke a cached certificate by its ID.

Returns a promise.

#### getChallenge(uri)

If the uri starts with `/.well-known/acme-challenge`, the appropriate ACME challenge is returned. You'll then want to call `res.end(challenge)` so LE knows you're the legitimate owner.

#### getDomains()

Returns an array of domains with valid certificates.

#### getCredentials(domain)

Returns the object containing the domain's certificate. Also useful for checking if a domain has been validated by the ACME server.

The object contains the following properties:
- `key: string` The private key
- `cert: string` The issued certificate
- `ca: string` The issuer certificate
- `email: string` The registered email
- `subject: object?` The subject used in the CSR
- `expiresAt: number` When the certificate expires (eg: `Date.now()`)

#### filterCredentials(filter)

Returns an array of certificate IDs that match the given filter.

The `filter` argument can be a function (which is passed the same object that `getCredentials` returns), or an object with an `olderThan: date|number` property. When `olderThan` is a number, it's interpreted as age in milliseconds. When `olderThan` is a `Date`, it's interpreted as creation time.

#### getSecureContext(domain)

Returns a cached TLS context (creating one if necessary) for a given domain. If several domains are using the same certificate, they also use the same TLS context (assuming those domains are handled by the same server).

You'll want to use this in the `SNICallback` of your HTTPS server.

This is functionally equivalent to (minus the caching):
```js
var tls = require('tls');
function getSecureContext(domain) {
  var creds = ssl.getCredentials(domain);
  return tls.createSecureContext({
    key: creds.key,
    cert: creds.cert + '\n' + creds.ca,
  });
}
```

---

### Setup guide

This guide teaches you how to setup a NodeJS server that can renew its own SSL certificates.

Before we get started, you can't run this locally without using [ngrok]() or [localtunnel]() with a custom subdomain.

```sh
# How to use ngrok:
ngrok http 80 --subdomain=ssl27

# How to use localtunnel:
lt --port 80 --subdomain ssl27
```

Otherwise, if you have your own domain, you can use that instead! And when you want to get a real certificate, just set `process.env.NODE_ENV` to `production` and this library will use LE's production server instead of the staging server.

From here on out, I will be using "LE" to refer to Let's Encrypt.

Let's do this!

#### 1. Create a HTTP server on port 80. If you already have a HTTP server, great! Just make sure it's on port 80, because that's what LE uses.

```js
var http = require('http').createServer(function(req, res) {
  // The LE server will send a request to see if you're the legitimate owner of your domain.
  var challenge = ssl.getChallenge(req.url);
  if (challenge) {
    return res.end(challenge);
  }

  // After that, you can send an unencrypted response, redirect to HTTPS, or just send nothing back (as seen below).
  res.end();
});

http.listen(80, function() {
  console.log('Listening at http://localhost:80');
});
```

Now, when you request an SSL certificate from LE, it will know you're legit.

#### 2. Create a HTTPS server on port 443. If you already have a HTTPS server, great! Just make sure it's on port 443, because that's what LE uses.

```js
var https = require('https').createServer({
  SNICallback: function(domain, done) {
    // This function attaches an SSL context for encrypting your traffic.
    done(null, ssl.getSecureContext(domain));
  }
}, function(req, res) {
  // Your server magic goes here. Enjoy encrypted communication!
});
```

Now, every request and response to your server is encrypted!

#### 3. With your server running, request an SSL certificate from LE.

This step will fetch a certificate (on server startup) for the domains that need one.

**NOTE:** Any domains you pass to `ssl.certify` must have a server that responds to challenges from LE.

```js
// Notice how subdomains must be explicitly defined.
var domains = ['example.com', 'www.example.com'];

// Find the domains that need certificates.
var insecureDomains = domains.filter(function(domain) {
  return !ssl.getCredentials(domain);
});

if (insecureDomains.length) {
  ssl.certify({
    email: 'webmaster@example.com',
    domains: insecureDomains,
  }).then(function() {
    console.log('All domains are now secure');
  }).fail(function(error) {
    console.log('Failed to get certificate: ' + error.stack);
    // NOTE: In the future, auto-retry will be baked in,
    //   but you should add your own for now.
  });
}
```

#### 4. Setup a timer for renewing your SSL certificate(s).

LE certificates last for 90 days ([why?](https://letsencrypt.org/2015/11/09/why-90-days.html)).

This step will renew any certificates older than 60 days, which is what LE recommends doing.

If you have 10,000+ certificates, LE recommends not renewing them all at once (check out the "When to Renew" section of [this page](https://letsencrypt.org/docs/integration-guide/)).

```js
// Check for renewable certificates once per day.
var DAY_MS = 24 * 60 * 60 * 1000;
setInterval(renewCerts, DAY_MS);

function renewCerts() {
  ssl.filterCredentials({
    olderThan: 60 * DAY_MS,
  }).forEach(ssl.renew);
}
```

That's it! You now have automated SSL for your server!

If you have any questions, please open an issue.
