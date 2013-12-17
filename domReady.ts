import core = require('./interfaces');
import has = require('./has');

if (!has('host-browser')) {
	return {
		load: function (id, contextRequire, loaded) {
			loaded(undefined);
		}
	};
}

var readyStates = Object.create(null);
readyStates.loaded = readyStates.complete = true;

var ready = readyStates[document.readyState],
	readyQueue = [],
	processing = false;

function processQueue() {
	if (processing) {
		return;
	}
	processing = true;

	for (var i = 0; i < readyQueue.length; i++) {
		readyQueue[i](document);
	}

	processing = false;
}

if (!ready) {
	document.addEventListener('DOMContentLoaded', () => {
		if (ready) {
			return;
		}
		ready = true;
		processQueue();
	});
}

var domReady = <core.ILoaderFunctionPlugin>function domReady(callback:Function) {
	readyQueue.push(callback);
	if (ready) {
		processQueue();
	}
};
function load(id:string, contextRequire:core.Require, loaded:Function):void {
	domReady(loaded);
}
domReady.load = load;

export = domReady;
