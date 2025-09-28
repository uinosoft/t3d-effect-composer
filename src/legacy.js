import EffectComposer from './EffectComposer.js';
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

// deprecated since v0.4.0
Object.defineProperties(EffectComposer.prototype, {
	clearColor: {
		set: function(value) {
			this._clearColor = value;
		},
		get: function() {
			return this._clearColor;
		}
	},
	clearDepth: {
		set: function(value) {
			this._clearDepth = value;
		},
		get: function() {
			return this._clearDepth;
		}
	},
	clearStencil: {
		set: function(value) {
			this._clearStencil = value;
		},
		get: function() {
			return this._clearStencil;
		}
	}
});