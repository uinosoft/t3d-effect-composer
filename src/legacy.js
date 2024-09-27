import SSREffect from './effects/SSREffect.js';

// deprecated since v0.1.3, add warning since v0.3.0, to be removed in v0.4.0
Object.defineProperties(SSREffect.prototype, {
	mixType: {
		set: function(value) {
			console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
			this.falloff = value;
		},
		get: function() {
			console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
			return this.falloff;
		}
	}
});