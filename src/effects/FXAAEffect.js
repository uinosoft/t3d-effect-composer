import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { fxaaShader } from '../Utils.js';

export default class FXAAEffect extends Effect {

	constructor() {
		super();

		this._mainPass = new ShaderPostPass(fxaaShader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	resize(width, height) {
		this._mainPass.uniforms.resolution[0] = 1 / width;
		this._mainPass.uniforms.resolution[1] = 1 / height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		this._mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		if (finish) {
			this._mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._mainPass.render(renderer);
		if (finish) {
			this._mainPass.material.transparent = false;
			this._mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._mainPass.dispose();
	}

}