var CallbackQueue = require('./CallbackQueue');

var has = require('./has');

has.add('dom-mutationobserver', function (global) {
    return has('host-browser') && Boolean(global.MutationObserver || global.WebKitMutationObserver);
});

function noop() {
}

var nextTick;

if (has('host-node')) {
    nextTick = function (callback) {
        var removed = false;
        process.nextTick(function () {
            // There isn't an API to remove a pending call from `process.nextTick`
            if (removed) {
                return;
            }

            callback();
        });

        return {
            remove: function () {
                this.remove = noop;
                removed = true;
            }
        };
    };
} else {
    var queue = new CallbackQueue();

    if (has('dom-mutationobserver')) {
        nextTick = (function () {
            var MutationObserver = this.MutationObserver || this.WebKitMutationObserver;
            var element = document.createElement('div');
            var observer = new MutationObserver(function () {
                queue.drain();
            });

            observer.observe(element, { attributes: true });

            return function (callback) {
                var handle = queue.add(callback);
                element.setAttribute('drainQueue', '1');
                return handle;
            };
        })();
    } else {
        nextTick = (function () {
            var timer;
            return function (callback) {
                var handle = queue.add(callback);

                if (!timer) {
                    timer = setTimeout(function () {
                        clearTimeout(timer);
                        timer = null;
                        queue.drain();
                    }, 0);
                }

                return handle;
            };
        })();
    }
}

module.exports = nextTick;
