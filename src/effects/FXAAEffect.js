import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { fxaaShader } from '../Utils.js';

export default class FXAAEffect extends Effect {

	constructor() {
		super();

		this._mainPass = new ShaderPostPass(fxaaShader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		this._mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		composer.$setEffectContextStates(outputRenderTarget, this._mainPass, finish);
		this._mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}