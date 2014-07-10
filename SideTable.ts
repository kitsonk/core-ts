import has = require('./has');

has.add('es6-weak-map', typeof (<any> WeakMap) !== 'undefined');

var uid = Date.now() % 1e9;

var SideTable:any;

if (has('es6-weak-map')) {
	SideTable = WeakMap;
}
else {
	SideTable = <any> function () {
		this.name = '__st' + (1e9 * Math.random() >>> 0) + (uid++ + '__');
	};

	SideTable.prototype = {
		constructor: SideTable,

		name: <string>undefined,
		set: function(key:any, value:any):any {
			var entry:any = key[this.name];
			if (entry && entry[0] === key) {
				entry[1] = value;
			}
			else {
				Object.defineProperty(key, this.name, {
					value: [key, value],
					writable: true
				});
			}
			return value;
		},
		get: function(key:any):any {
			var entry:any;
			return (entry = key[this.name]) && entry[0] === key ? entry[1] : undefined;
		},
		has: function(key:any):boolean {
			var entry:any;
			return !!((entry = key[this.name]) && entry[0] === key);
		},
		delete: function(key:any):void {
			this.set(key, undefined);
		}
	};
}

export = SideTable;
