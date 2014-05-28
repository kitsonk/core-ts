var has = require('./has');
var nextTick = require('./nextTick');

var Deferred = (function () {
    function Deferred(aborter) {
        var _this = this;
        this.promise = new Promise(function (resolve, reject, progress) {
            _this.progress = progress;
            _this.reject = reject;
            _this.resolve = resolve;
        }, aborter);
    }
    return Deferred;
})();

var Promise = (function () {
    function Promise(initializer, aborter) {
        var _state = 0 /* PENDING */;
        var fulfilledValue;
        var resolveCallbacks = [];
        var rejectCallbacks = [];
        var progressCallbacks = [];

        function execute(deferred, callback, fulfilledValue) {
            nextTick(function () {
                try  {
                    var returnValue = callback(fulfilledValue);
                    if (returnValue && returnValue.then) {
                        returnValue.then(deferred.resolve, deferred.reject, deferred.progress);
                    } else {
                        deferred.resolve(returnValue);
                    }
                } catch (error) {
                    deferred.reject(error);
                }
            });
        }

        function propagate(deferred, newState, fulfilledValue) {
            if (newState === 1 /* RESOLVED */) {
                deferred.resolve(fulfilledValue);
            } else {
                deferred.reject(fulfilledValue);
            }
        }

        function fulfill(newState, callbacks, value) {
            if (_state !== 0 /* PENDING */) {
                if (has('debug')) {
                    console.warn('Attempted to fulfill and already fulfilled promise');
                    throw new Error('Attempted to fulfill already fulfilled promise');
                }

                return;
            }

            _state = newState;
            fulfilledValue = value;

            for (var i = 0, callback; (callback = callbacks[i]); ++i) {
                if (callback.callback) {
                    execute(callback.deferred, callback.callback, fulfilledValue);
                } else {
                    propagate(callback.deferred, _state, fulfilledValue);
                }
            }
        }

        // implement the read-only state property
        Object.defineProperty(this, 'state', {
            get: function () {
                return _state;
            }
        });

        this.abort = function (reason) {
            if (_state !== 0 /* PENDING */) {
                return;
            }

            if (!aborter) {
                throw new Error('Promise is not abortable');
            }

            if (!reason) {
                reason = new Error('Aborted');
                reason.name = 'AbortError';
            }

            try  {
                fulfill(1 /* RESOLVED */, resolveCallbacks, aborter(reason));
            } catch (error) {
                fulfill(2 /* REJECTED */, rejectCallbacks, error);
            }
        };

        this.then = function (onResolved, onRejected, onProgress) {
            var deferred = new Deferred();

            if (_state === 0 /* PENDING */) {
                resolveCallbacks.push({
                    deferred: deferred,
                    callback: onResolved
                });

                rejectCallbacks.push({
                    deferred: deferred,
                    callback: onRejected
                });

                progressCallbacks.push({
                    deferred: deferred,
                    callback: onProgress
                });
            } else if (_state === 1 /* RESOLVED */ && onResolved) {
                execute(deferred, onResolved, fulfilledValue);
            } else if (_state === 2 /* REJECTED */ && onRejected) {
                execute(deferred, onRejected, fulfilledValue);
            } else {
                propagate(deferred, _state, fulfilledValue);
            }

            return deferred.promise;
        };

        try  {
            initializer(fulfill.bind(null, 1 /* RESOLVED */, resolveCallbacks), fulfill.bind(null, 2 /* REJECTED */, rejectCallbacks), function (data) {
                progressCallbacks.forEach(function (callback) {
                    if (callback.callback) {
                        nextTick(function () {
                            callback.callback(data);
                        });
                    } else {
                        nextTick(function () {
                            callback.deferred.progress(data);
                        });
                    }
                });
            });
        } catch (error) {
            fulfill(2 /* REJECTED */, rejectCallbacks, error);
        }
    }
    Promise.all = function (iterable) {
        function fulfill(key, value) {
            values[key] = value;
            finish();
        }

        function finish() {
            if (populating || complete < total) {
                return;
            }

            deferred.resolve(values);
        }

        var values = {};
        var deferred = new Deferred();
        var complete = 0;
        var total = 0;
        var populating = true;

        for (var key in iterable) {
            ++total;
            var value = iterable[key];
            if (value.then) {
                value.then(fulfill.bind(null, key), fulfill.bind(null, key));
            } else {
                fulfill(key, value);
            }
        }

        populating = false;
        finish();

        return deferred.promise;
    };

    Promise.reject = function (reason) {
        var deferred = new Deferred();
        deferred.reject(reason);
        return deferred.promise;
    };

    Promise.resolve = function (value) {
        if (value instanceof Promise) {
            return value;
        }

        var deferred = new Deferred();
        deferred.resolve(value);
        return deferred.promise;
    };

    Promise.prototype.catch = function (onRejected) {
        return this.then(null, onRejected);
    };
    Promise.Deferred = Deferred;
    return Promise;
})();

var Promise;
(function (Promise) {
    (function (State) {
        State[State["PENDING"] = 0] = "PENDING";
        State[State["RESOLVED"] = 1] = "RESOLVED";
        State[State["REJECTED"] = 2] = "REJECTED";
    })(Promise.State || (Promise.State = {}));
    var State = Promise.State;
})(Promise || (Promise = {}));

module.exports = Promise;
