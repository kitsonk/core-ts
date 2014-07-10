/// <reference path="../intern.d.ts" />

import assert = require('intern/chai!assert');
import core = require('../../interfaces');
import SideTable = require('../../SideTable');
import has = require('../../has');
import registerSuite = require('intern!object');

var st, fn, obj, value;

var suite = {
	name: 'SideTable',

	'feature detection': function () {
		if ('undefined' !== typeof WeakMap) {
			assert.isTrue(has('es6-weak-map'));
		}
		else {
			assert.isFalse(has('es6-weak-map'));
		}
	}
};

if (has('es6-weak-map')) {
	suite['native'] = {
		'WeakMap': function () {
			assert.strictEqual(SideTable, WeakMap);
			st = new SideTable();
			assert.instanceOf(st, WeakMap);
		}
	};
}
else {
	suite['non-native'] = {
		'instantiation': function () {
			st = new SideTable();
			assert('get' in st);
			assert('set' in st);
			assert('delete' in st);
			assert('name' in st);
			assert('has' in st);
			var st2 = new SideTable();
			assert.notEqual(st.name, st2.name);
		},
		'getting/setting': function () {
			obj = {};
			fn = function () {};
			value = {};

			assert.isUndefined(st.get(obj));
			st.set(obj, value);
			assert.strictEqual(st.get(obj), value);
			st.get(obj).foo = 'bar';
			assert.strictEqual(value.foo, 'bar');

			assert.isUndefined(st.get(fn));
			st.set(fn, value);
			assert.strictEqual(st.get(fn), value);
			st.get(fn).foo = 'baz';
			assert.strictEqual(value.foo, 'baz');
		},
		'has': function () {
			assert.isTrue(st.has(fn));
			var fn2 = function () {};
			assert.isFalse(st.has(fn2));
		},
		'delete': function () {
			assert(st.get(obj));
			assert(st.get(fn));
			st.delete(obj);
			st.delete(fn);
			assert.isUndefined(st.get(obj));
			assert.isUndefined(st.get(fn));
		}
	};
}

registerSuite(suite);
