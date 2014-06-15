var nextTick = require('./nextTick');

function isPromise(value) {
    return value && typeof value.then === 'function';
}

function runCallbacks(callbacks) {
    var args = [];
    for (var _i = 0; _i < (arguments.length - 1); _i++) {
        args[_i] = arguments[_i + 1];
    }
    for (var i = 0, callback; callback = callbacks[i]; ++i) {
        callback.apply(null, args);
    }
}

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
* intentionally deviates from the ES6 2014-05-22 draft in the following ways:
*
* 1. `Promise.race` is a worthless API with one use case, so is not implemented.
* 2. `Promise.all` accepts an object in addition to an array.
* 3. Asynchronous operations can transmit partial progress information through a third `progress` method passed to the
*    initializer. Progress listeners can be added by passing a third `onProgress` callback to `then`, or through the
*    extra `progress` method exposed on promises.
* 4. Promises can be canceled by calling the `cancel` method of a promise.
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
        Object.defineProperty(this, 'state', {
            get: function () {
                return state;
            }
        });

        /**
        * Whether or not this promise is in a resolved state.
        */
        function isResolved() {
            return state !== 0 /* PENDING */ || isChained;
        }

        /**
        * If true, the resolution of this promise is chained to another promise.
        */
        var isChained = false;

        /**
        * The resolved value for this promise.
        *
        * @type {T|Error}
        */
        var resolvedValue;

        /**
        * Callbacks that should be invoked once the asynchronous operation has completed.
        */
        var callbacks = [];
        var whenFinished = function (callback) {
            callbacks.push(callback);
        };

        /**
        * Callbacks that should be invoked when the asynchronous operation has progressed.
        */
        var progressCallbacks = [];
        var whenProgress = function (callback) {
            progressCallbacks.push(callback);
        };

        /**
        * A canceler function that will be used to cancel resolution of this promise.
        */
        var canceler;

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
                queue.push(callback);
                schedule();
            };
        })();

        /**
        * Resolves this promise.
        *
        * @param newState The resolved state for this promise.
        * @param {T|Error} value The resolved value for this promise.
        */
        var resolve = function (newState, value) {
            if (isResolved()) {
                return;
            }

            if (isPromise(value)) {
                if (value === this) {
                    throw new TypeError('Cannot chain a promise to itself');
                }

                isChained = true;
                value.then(settle.bind(null, 1 /* FULFILLED */), settle.bind(null, 2 /* REJECTED */));

                this.cancel = value.cancel;
            } else {
                settle(newState, value);
            }
        }.bind(this);

        /**
        * Settles this promise.
        *
        * @param newState The resolved state for this promise.
        * @param {T|Error} value The resolved value for this promise.
        */
        function settle(newState, value) {
            state = newState;
            resolvedValue = value;
            whenFinished = enqueue;
            whenProgress = function () {
            };
            enqueue(function () {
                runCallbacks(callbacks);
                callbacks = progressCallbacks = null;
            });
        }

        this.cancel = function (reason) {
            if (isResolved() || !canceler) {
                return;
            }

            if (!reason) {
                reason = new Error();
                reason.name = 'CancelError';
            }

            try  {
                resolve(1 /* FULFILLED */, canceler(reason));
            } catch (error) {
                settle(2 /* REJECTED */, error);
            }
        };

        this.then = function (onFulfilled, onRejected, onProgress) {
            return new Promise(function (resolve, reject, progress, setCanceler) {
                setCanceler(function (reason) {
                    if (canceler) {
                        resolve(canceler(reason));
                        return;
                    }

                    throw reason;
                });

                whenProgress(function (data) {
                    try  {
                        if (typeof onProgress === 'function') {
                            progress(onProgress(data));
                        } else {
                            progress(data);
                        }
                    } catch (error) {
                        if (error.name !== 'StopProgressPropagation') {
                            throw error;
                        }
                    }
                });

                whenFinished(function () {
                    var callback = state === 2 /* REJECTED */ ? onRejected : onFulfilled;

                    if (typeof callback === 'function') {
                        try  {
                            resolve(callback(resolvedValue));
                        } catch (error) {
                            reject(error);
                        }
                    } else if (state === 2 /* REJECTED */) {
                        reject(resolvedValue);
                    } else {
                        resolve(resolvedValue);
                    }
                });
            });
        };

        try  {
            initializer(resolve.bind(null, 1 /* FULFILLED */), resolve.bind(null, 2 /* REJECTED */), function (data) {
                enqueue(runCallbacks.bind(null, progressCallbacks, data));
            }, function (value) {
                canceler = value;
            });
        } catch (error) {
            settle(2 /* REJECTED */, error);
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
                if (isPromise(value)) {
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

    Promise.prototype.finally = function (onFulfilledOrRejected) {
        return this.then(onFulfilledOrRejected, onFulfilledOrRejected);
    };

    /**
    * Adds a callback to the promise to be invoked when progress occurs within the asynchronous operation.
    */
    Promise.prototype.progress = function (onProgress) {
        return this.then(null, null, onProgress);
    };

    Promise.Deferred = Deferred;
    return Promise;
})();

var Promise;
(function (Promise) {
    

    /**
    * The State enum represents the possible states of a promise.
    */
    (function (State) {
        State[State["PENDING"] = 0] = "PENDING";
        State[State["FULFILLED"] = 1] = "FULFILLED";
        State[State["REJECTED"] = 2] = "REJECTED";
    })(Promise.State || (Promise.State = {}));
    var State = Promise.State;
})(Promise || (Promise = {}));

module.exports = Promise;
