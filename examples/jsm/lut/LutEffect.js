import { ShaderPostPass } from 't3d';
import { Effect } from 't3d-effect-composer';
import { LUTShader } from './LutShader.js';

export class LutEffect extends Effect {

	constructor() {
		super();

		this.lut = null;
		this.intensity = 1;

		this._lutPass = new ShaderPostPass(LUTShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, true);
		}

		const lutPass = this._lutPass;
		const is3dTextureDefine = this.lut.isTexture3D ? 1 : 0;

		if (is3dTextureDefine !== lutPass.material.defines.USE_3DTEXTURE) {
			lutPass.material.defines.USE_3DTEXTURE = is3dTextureDefine;
			lutPass.material.needsUpdate = true;
		}

		lutPass.uniforms.lutSize = this.lut.image.width;
		lutPass.uniforms.lut3d = this.lut;
		lutPass.uniforms.lut = this.lut;
		lutPass.uniforms.intensity = this.intensity;
		lutPass.uniforms['tDiffuse'] = inputRenderTarget.texture;
		if (finish) {
			lutPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			lutPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		lutPass.render(renderer);
		if (finish) {
			lutPass.material.transparent = false;
			lutPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

}