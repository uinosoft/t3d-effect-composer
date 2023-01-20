import EffectComposer from './EffectComposer.js';

export const RenderLayer = {
	Background: 2,
	Main: 0,
	Overlay: 1
}

EffectComposer.prototype.setGeometryReplaceFunction = function(func) {
	console.warn('EffectComposer.setGeometryReplaceFunction has been removed, use SceneBuffer.setGeometryReplaceFunction instead.');
	const sceneBuffer = this._bufferMap.get('SceneBuffer');
	sceneBuffer.setGeometryReplaceFunction(func);
}

Object.defineProperties(EffectComposer.prototype, {
	customRenderLayers: {
		set: function(value) {
			console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
		},
		get: function() {
			console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
		}
	}
})