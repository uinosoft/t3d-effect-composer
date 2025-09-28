import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { blurShader, additiveShader, highlightShader } from '../Utils.js';

export default class BloomEffect extends Effect {

	constructor() {
		super();

		this.threshold = 0.7;
		this.smoothWidth = 0.01;
		this.blurSize = 2;
		this.strength = 1;

		this._highlightPass = new ShaderPostPass(highlightShader);
		this._blurPass = new ShaderPostPass(blurShader);
		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	resize(width, height) {
		this._blurPass.uniforms.textureSize[0] = width;
		this._blurPass.uniforms.textureSize[1] = height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(1);
		const tempRT3 = composer._renderTargetCache.allocate(1);

		this._highlightPass.uniforms.tDiffuse = inputRenderTarget.texture;
		this._highlightPass.uniforms.threshold = this.threshold;
		this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._highlightPass.render(renderer, tempRT1);

		this._blurPass.uniforms.tDiffuse = tempRT1.texture;
		this._blurPass.uniforms.direction = 0;
		this._blurPass.uniforms.blurSize = this.blurSize;
		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurPass.render(renderer, tempRT2);

		this._blurPass.uniforms.tDiffuse = tempRT2.texture;
		this._blurPass.uniforms.direction = 1;
		this._blurPass.uniforms.blurSize = this.blurSize;
		tempRT3.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurPass.render(renderer, tempRT3);

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT3.texture;
		this._blendPass.uniforms.colorWeight1 = 1;
		this._blendPass.uniforms.alphaWeight1 = 1;
		this._blendPass.uniforms.colorWeight2 = this.strength;
		this._blendPass.uniforms.alphaWeight2 = this.strength;
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 1);
		composer._renderTargetCache.release(tempRT3, 1);
	}

	dispose() {
		this._highlightPass.dispose();
		this._blurPass.dispose();
		this._blendPass.dispose();
	}

}