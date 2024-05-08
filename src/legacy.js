import { ShaderPostPass } from 't3d';
import EffectComposer from './EffectComposer.js';
import SSREffect from './effects/SSREffect.js';
import GBufferDebugger from './debuggers/GBufferDebugger.js';

EffectComposer.prototype.setGeometryReplaceFunction = function(func) {
	console.warn('EffectComposer.setGeometryReplaceFunction has been removed, use SceneBuffer.setGeometryReplaceFunction instead.');
	const sceneBuffer = this._bufferMap.get('SceneBuffer');
	sceneBuffer.setGeometryReplaceFunction(func);
};

Object.defineProperties(EffectComposer.prototype, {
	customRenderLayers: {
		set: function(value) {
			console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
		},
		get: function() {
			console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
			return [];
		}
	}
});

// Compatible with versions prior to t3d.js-v0.1.3
if (!ShaderPostPass.prototype.dispose) {
	ShaderPostPass.prototype.dispose = function() {
		const renderItem = this.renderQueueLayer.opaque[0];
		if (renderItem) {
			renderItem.geometry.dispose();
			renderItem.material.dispose();
		}
	};
}

// since v0.1.3
// SSREffect mixType property compatibility, to be removed in the future
Object.defineProperties(SSREffect.prototype, {
	mixType: {
		set: function(value) {
			// console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
			this.falloff = value;
		},
		get: function() {
			// console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
			return this.falloff;
		}
	}
});

// Deprecated since v0.2.0, fallback to Roughness
GBufferDebugger.DebugTypes.Glossiness = GBufferDebugger.DebugTypes.Roughness;