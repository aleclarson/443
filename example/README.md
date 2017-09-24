
# 443/example

1. Run `sudo node` so you can start the servers (ports below 1024 require root privileges).

2. Start the servers on ports 80 and 443:
```js
var server = require('./example/start')
```

To request a certificate, you'll need an actual domain, because Let's Encrypt doesn't support certificates for IP addresses.

3. In another terminal window, start [`localtunnel`](https://www.npmjs.com/package/localtunnel) or [`ngrok`](https://www.npmjs.com/package/ngrok):
```sh
lt --port 80 --subdomain example
```

4. Request a certificate:
```js
server.certify({ email: 'webmaster@example.com', domains: ['example.localtunnel.me'] })
```

5. Goto `https://example.localtunnel.me/creds`, notice the "Secure" indicator in browser

6. Renew a certificate:
```js
server.renew('example.localtunnel.me')
```

7. Revoke a certificate:
```js
server.revoke('example.localtunnel.me')
```

8. Goto `https://example.localtunnel.me/creds`, notice missing "Secure" indicator in browser
