var string = require('./string');

if (!navigator.cookieEnabled) {
    return null;
}

var longAgo = new Date(1970, 0, 1).toUTCString();

function createCookieOptions(options) {
    var optionsString = '';

    for (var key in options) {
        var value = options[key];

        if (key === 'maxAge') {
            key = 'max-age';
        } else if (key === 'secure' && !value) {
            continue;
        }

        optionsString += '; ' + encodeURIComponent(key);

        if (key === 'secure') {
            // secure is a boolean flag, so provide no value
        } else if (key === 'expires') {
            // Expires will not work if its value is URI-encoded
            optionsString += '=' + (value.toUTCString ? value.toUTCString() : value);
        } else {
            optionsString += '=' + encodeURIComponent(value);
        }
    }

    return optionsString;
}

Object.defineProperty(exports, 'length', {
    get: function () {
        return document.cookie.length ? string.count(document.cookie, '; ') + 1 : 0;
    },
    enumerable: true,
    configurable: true
});

function key(index) {
    var keyValuePair = document.cookie.split('; ', index + 1)[index];
    return keyValuePair ? decodeURIComponent(/^([^=]+)/.exec(keyValuePair)[0]) : null;
}
exports.key = key;

function getItem(key) {
    var match = new RegExp('(?:^|; )' + string.escapeRegExpString(encodeURIComponent(key)) + '=([^;]*)').exec(document.cookie);
    return match ? decodeURIComponent(match[1]) : null;
}
exports.getItem = getItem;

function setItem(key, data, options) {
    if (typeof options === "undefined") { options = {}; }
    document.cookie = encodeURIComponent(key) + '=' + encodeURIComponent(data) + createCookieOptions(options);
}
exports.setItem = setItem;

function removeItem(key, options) {
    options = options ? Object.create(options) : {};
    options.expires = longAgo;
    document.cookie = encodeURIComponent(key) + '=' + createCookieOptions(options);
}
exports.removeItem = removeItem;
