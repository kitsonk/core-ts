var has = require('./has');
var nextTick = require('./nextTick');

/**
* A Promise represents the result of an asynchronous operation. When writing a function that performs an asynchronous
* operation, instead of writing the function to accept a callback function, you should instead write it to return a
* Promise that is fulfilled once the asynchronous operation is completed. Returning a promise instead of accepting
* a callback provides a standard mechanism for handling asynchronous operations that offers the following benefits
* over a normal callback function:
*
* 1. Multiple callbacks can be added for a single function invocation;
* 2. Other asynchronous operations can be easily chained to the response, avoiding callback pyramids;
* 3. Asynchronous operations can be canceled in flight in a standard way if their results are no longer needed by the
*    rest of the application.
*
* The Promise class is a modified, extended version of standard EcmaScript 6 promises. This implementation
* intentionally from the 2014-05-22 draft in the following ways:
*
* 1. The internal mechanics use the term “fulfilled” to mean that the asynchronous operation is no longer in progress.
*    The term “resolved” means that the operation completed successfully.
* 2. `Promise.race` is a worthless API with one use case, so is not implemented.
* 3. `Promise.all` accepts an object in addition to an array.
* 4. Asynchronous operations can transmit partial progress information through a third `progress` method passed to the
*    initializer. Progress listeners can be added by passing a third `onProgress` callback to `then`, or through the
*    extra `progress` method exposed on promises.
* 5. Promises can be canceled
*/
var Promise = (function () {
    /**
    * Creates a new Promise.
    *
    * @constructor
    *
    * @param initializer
    * The initializer function is called immediately when the Promise is instantiated. It is responsible for starting
    * the asynchronous operation when it is invoked.
    *
    * The initializer must call either the passed `resolve` function when the asynchronous operation has completed
    * successfully, or the `reject` function when the operation fails, unless the the `canceler` is called first.
    *
    * The `progress` function can also be called zero or more times to provide information about the process of the
    * operation to any interested consumers.
    *
    * Finally, the initializer can register an canceler function that cancels the asynchronous operation by passing
    * the canceler function to the `setCanceler` function.
    */
    function Promise(initializer) {
        /**
        * The current state of this promise.
        */
        var state = 0 /* PENDING */;

        /**
        * The fulfilled value for this promise.
        *
        * @type {T|Error}
        */
        var fulfilledValue;

        /**
        * A list of registered callbacks that should be executed once this promise has been resolved.
        */
        var resolveCallbacks = [];

        /**
        * A list of registered callbacks that should be executed once this promise has been rejected.
        */
        var rejectCallbacks = [];

        /**
        * A list of registered callbacks that should be executed when the underlying asynchronous operation has
        * experienced progress.
        */
        var progressCallbacks = [];

        /**
        * Queues a callback for execution during the next round through the event loop, in a way such that if a
        * new execution is queued for this promise during queue processing, it will execute immediately instead of
        * being forced to wait through another turn through the event loop.
        * TODO: Ensure this is actually necessary for optimal execution and does not break next-turn spec compliance.
        *
        * @method
        * @param callback The callback to execute on the next turn through the event loop.
        */
        var enqueue = (function () {
            function originalSchedule() {
                schedule = function () {
                };

                nextTick(function run() {
                    try  {
                        var callback;
                        while ((callback = queue.shift())) {
                            callback();
                        }
                    } finally {
                        // If someone threw an error, allow it to bubble, then continue queue execution for the
                        // remaining items
                        if (queue.length) {
                            run();
                        } else {
                            schedule = originalSchedule;
                        }
                    }
                });
            }

            var queue = [];
            var schedule = originalSchedule;

            return function (callback) {
                nextTick(callback);
                return;
                queue.push(callback);
                schedule();
            };
        })();

        /**
        * Immediately resolves a deferred using the value from a callback.
        *
        * @param deferred
        * The deferred that should be resolved using the value from `callback` as its resolved value.
        *
        * @param callback
        * The callback that should be executed to get the new value. If the new value is a promise, resolution of the
        * deferred is deferred until the promise is fulfilled.
        *
        * @param fulfilledValue
        * The value to pass to the callback.
        */
        function execute(deferred, callback, fulfilledValue) {
            if (callback) {
                try  {
                    var returnValue = callback(fulfilledValue);
                    if (returnValue && returnValue.then) {
                        returnValue.then(deferred.resolve, deferred.reject, deferred.progress);
                        deferred.promise.cancel = returnValue.cancel;
                    } else {
                        deferred.resolve(returnValue);
                    }
                } catch (error) {
                    deferred.reject(error);
                }
            } else if (state === 2 /* REJECTED */) {
                deferred.reject(fulfilledValue);
            } else {
                deferred.resolve(fulfilledValue);
            }

            var recanceler;
            while ((recanceler = recancelers.shift())) {
                recanceler.source.cancel(recanceler.reason);
            }
        }

        /**
        * Immediately resolves a deferred using the value from a callback.
        *
        * @param deferred
        * The deferred that should be resolved using the value from `callback` as its resolved value.
        *
        * @param callback
        * The callback that should be executed to get the new value. If the new value is a promise, resolution of the
        * deferred is deferred until the promise is fulfilled.
        *
        * @param fulfilledValue
        * The value to pass to the callback.
        */
        function scheduleExecute(deferred, callback, fulfilledValue) {
            var args = arguments;
            enqueue(function () {
                execute.apply(null, args);
            });
        }

        /**
        * Fulfills this promise.
        *
        * @param newState The fulfilled state for this promise.
        * @param callbacks The callbacks that should be executed for the new state.
        * @param {T|Error} value The fulfilled value for this promise.
        */
        function fulfill(newState, callbacks, value) {
            if (state !== 0 /* PENDING */) {
                if (has('debug')) {
                    throw new Error('Attempted to fulfill an already fulfilled promise');
                }

                return;
            }

            state = newState;
            fulfilledValue = value;
            resolveCallbacks = rejectCallbacks = progressCallbacks = null;

            for (var i = 0, callback; (callback = callbacks[i]); ++i) {
                callback.deferred.promise.cancel = callback.originalCancel;
                scheduleExecute(callback.deferred, callback.callback, fulfilledValue);
            }
        }

        /**
        * The canceler for this promise. The default canceler simply causes the promise to reject with the
        * cancelation reason; promises representing asynchronous operations that can be cancelled should provide their
        * own cancellers.
        */
        var canceler;

        /**
        * Sends progress data from the asynchronous operation to any progress listeners.
        *
        * @param data Additional information about the asynchronous operation’s progress.
        */
        function sendProgress(data) {
            if (state !== 0 /* PENDING */) {
                if (has('debug')) {
                    throw new Error('Attempted to send progress data for an already fulfilled promise');
                }

                return;
            }

            progressCallbacks.forEach(function (callback) {
                enqueue(function () {
                    callback.callback && callback.callback(data);
                    callback.deferred.progress(data);
                });
            });
        }

        Object.defineProperty(this, 'state', {
            get: function () {
                return state;
            }
        });

        var recancelers = [];
        var self = this;
        this.cancel = function (reason, source) {
            if (state !== 0 /* PENDING */ || (!canceler && source !== self)) {
                // A consumer attempted to cancel the promise but it has already been fulfilled, so just ignore any
                // attempts to cancel it
                if (source === self) {
                    // This is not an important error that should cause things to fail, but end-users should be informed
                    // in case their code is misbehaving
                    if (has('debug')) {
                        console.debug('Attempted to cancel an already fulfilled promise');
                    }
                } else {
                    recancelers.push({ source: source, reason: reason });
                }

                return;
            }

            if (!reason) {
                reason = new Error('Canceled');
                reason.name = 'CancelError';
            }

            if (!canceler) {
                throw new Error('Attempted to cancel an uncancelable promise');
            }

            try  {
                fulfill(1 /* RESOLVED */, resolveCallbacks, canceler(reason));
            } catch (error) {
                fulfill(2 /* REJECTED */, rejectCallbacks, error);
            }
        };

        this.then = function (onResolved, onRejected, onProgress) {
            var deferred = new Promise.Deferred();
            var originalCancel = deferred.promise.cancel;
            deferred.promise.cancel = function (reason, source) {
                self.cancel(reason, source || this);
            };

            if (state === 0 /* PENDING */) {
                resolveCallbacks.push({
                    deferred: deferred,
                    callback: onResolved,
                    originalCancel: originalCancel
                });

                rejectCallbacks.push({
                    deferred: deferred,
                    callback: onRejected,
                    originalCancel: originalCancel
                });

                progressCallbacks.push({
                    deferred: deferred,
                    callback: onProgress
                });
            } else if (state === 1 /* RESOLVED */) {
                scheduleExecute(deferred, onResolved, fulfilledValue);
            } else if (state === 2 /* REJECTED */) {
                scheduleExecute(deferred, onRejected, fulfilledValue);
            } else {
                throw new Error('Unknown state ' + Promise.State[state]);
            }

            return deferred.promise;
        };

        try  {
            initializer(fulfill.bind(null, 1 /* RESOLVED */, resolveCallbacks), fulfill.bind(null, 2 /* REJECTED */, rejectCallbacks), sendProgress, function (value) {
                canceler = value;
            });
        } catch (error) {
            fulfill(2 /* REJECTED */, rejectCallbacks, error);
        }
    }
    Promise.all = function (iterable) {
        // explicit typing fixes tsc 1.0.1 crash on `new this`
        return new this(function (resolve, reject, progress, setCanceler) {
            setCanceler(function (reason) {
                walkIterable(function (key, value) {
                    if (value && value.cancel) {
                        value.cancel(reason);
                    }
                });

                return values;
            });

            function fulfill(key, value) {
                values[key] = value;
                progress(values);
                ++complete;
                finish();
            }

            function finish() {
                if (populating || complete < total) {
                    return;
                }

                resolve(values);
            }

            function processItem(key, value) {
                ++total;
                if (value && value.then) {
                    value.then(fulfill.bind(null, key), fulfill.bind(null, key));
                } else {
                    fulfill(key, value);
                }
            }

            function walkIterable(callback) {
                if (Array.isArray(iterable)) {
                    for (var i = 0, j = iterable.length; i < j; ++i) {
                        if (i in iterable) {
                            callback(String(i), iterable[i]);
                        }
                    }
                } else {
                    for (var key in iterable) {
                        callback(key, iterable[key]);
                    }
                }
            }

            var values = Array.isArray(iterable) ? [] : {};
            var complete = 0;
            var total = 0;

            var populating = true;
            walkIterable(processItem);
            populating = false;
            finish();
        });
    };

    /**
    * Creates a new promise that is pre-rejected with the given error.
    */
    Promise.reject = function (error) {
        return new this(function (resolve, reject) {
            reject(error);
        });
    };

    Promise.resolve = function (value) {
        if (value instanceof Promise) {
            return value;
        }

        return new this(function (resolve) {
            resolve(value);
        });
    };

    Promise.prototype.catch = function (onRejected) {
        return this.then(null, onRejected);
    };

    Promise.prototype.finally = function (onResolvedOrRejected) {
        return this.then(onResolvedOrRejected, onResolvedOrRejected);
    };

    /**
    * Adds a callback to the promise to be invoked when progress occurs within the asynchronous operation.
    */
    Promise.prototype.progress = function (onProgress) {
        return this.then(null, null, onProgress);
    };
    return Promise;
})();

var Promise;
(function (Promise) {
    /**
    * The Deferred class unwraps a promise in order to expose its internal state management functions.
    */
    var Deferred = (function () {
        function Deferred(canceler) {
            var _this = this;
            this.promise = new Promise(function (resolve, reject, progress, setCanceler) {
                _this.progress = progress;
                _this.reject = reject;
                _this.resolve = resolve;
                canceler && setCanceler(canceler);
            });
        }
        return Deferred;
    })();
    Promise.Deferred = Deferred;

    /**
    * The State enum represents the possible states of a promise.
    */
    (function (State) {
        State[State["PENDING"] = 0] = "PENDING";
        State[State["RESOLVED"] = 1] = "RESOLVED";
        State[State["REJECTED"] = 2] = "REJECTED";
    })(Promise.State || (Promise.State = {}));
    var State = Promise.State;
})(Promise || (Promise = {}));

module.exports = Promise;
