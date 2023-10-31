import { ShaderPostPass } from 't3d';
import EffectComposer from './EffectComposer.js';

export const RenderLayer = {
	Background: 2,
	Main: 0,
	Overlay: 1
};

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