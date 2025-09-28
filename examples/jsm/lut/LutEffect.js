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

		composer.$setEffectContextStates(outputRenderTarget, lutPass, finish);
		lutPass.render(renderer, outputRenderTarget);
	}

}