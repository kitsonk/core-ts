var http = require('http');
var https = require('https');
var Promise = require('../Promise');

var urlUtil = require('url');

function node(url, options) {
    var deferred = new Promise.Deferred(function (reason) {
        request && request.abort();
        throw reason;
    });
    var promise = deferred.promise;
    var parsedUrl = urlUtil.parse(url);
    var requestOptions = {
        agent: options.agent,
        auth: parsedUrl.auth || options.auth,
        ca: options.ca,
        cert: options.cert,
        ciphers: options.ciphers,
        headers: options.headers,
        host: parsedUrl.host,
        hostname: parsedUrl.hostname,
        key: options.key,
        localAddress: options.localAddress,
        method: options.method,
        passphrase: options.passphrase,
        path: parsedUrl.path,
        pfx: options.pfx,
        port: +parsedUrl.port,
        rejectUnauthorized: options.rejectUnauthorized,
        secureProtocol: options.secureProtocol,
        socketPath: options.socketPath
    };

    if (!options.auth && (options.user || options.password)) {
        requestOptions.auth = encodeURIComponent(options.user || '') + ':' + encodeURIComponent(options.password || '');
    }

    // TODO: Cast to `any` prevents TS2226 error
    var request = (parsedUrl.protocol === 'https:' ? https : http).request(requestOptions);
    var response = {
        data: null,
        getHeader: function (name) {
            return (this.nativeResponse && this.nativeResponse.headers[name.toLowerCase()]) || null;
        },
        requestOptions: options,
        statusCode: null,
        url: url
    };

    if (options.socketOptions) {
        if ('timeout' in options.socketOptions) {
            request.setTimeout(options.socketOptions.timeout);
        }

        if ('noDelay' in options.socketOptions) {
            request.setNoDelay(options.socketOptions.noDelay);
        }

        if ('keepAlive' in options.socketOptions) {
            var initialDelay = options.socketOptions.keepAlive;
            request.setSocketKeepAlive(initialDelay >= 0, initialDelay || 0);
        }
    }

    request.once('response', function (nativeResponse) {
        var data;
        var loaded = 0;
        var total = +nativeResponse.headers['content-length'];

        if (!options.streamData) {
            data = [];
        }

        options.streamEncoding && nativeResponse.setEncoding(options.streamEncoding);

        nativeResponse.on('data', function (chunk) {
            options.streamData || data.push(chunk);
            loaded += Buffer.byteLength(chunk);
            deferred.progress({ type: 'data', chunk: chunk, loaded: loaded, total: total });
        });

        nativeResponse.once('end', function () {
            timeout && timeout.remove();

            if (!options.streamData) {
                response.data = options.streamEncoding ? data.join('') : Buffer.concat(data, loaded);
            }

            deferred.resolve(response);
        });

        deferred.progress({ type: 'nativeResponse', response: nativeResponse });
        response.nativeResponse = nativeResponse;
        response.statusCode = nativeResponse.statusCode;
    });

    request.once('error', deferred.reject);

    if (options.data) {
        if (options.data.pipe) {
            options.data.pipe(request);
        } else {
            request.end(options.data, options.dataEncoding);
        }
    } else {
        request.end();
    }

    if (options.timeout > 0 && options.timeout !== Infinity) {
        var timeout = (function () {
            var timer = setTimeout(function () {
                var error = new Error('Request timed out after ' + options.timeout + 'ms');
                error.name = 'RequestTimeoutError';
                promise.abort(error);
            }, options.timeout);

            return {
                remove: function () {
                    this.remove = function () {
                    };
                    clearTimeout(timer);
                }
            };
        })();
    }

    return promise;
}

module.exports = node;
