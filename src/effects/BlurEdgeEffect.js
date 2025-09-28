import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, horizontalBlurShader, verticalBlurShader } from '../Utils.js';

export default class BlurEdgeEffect extends Effect {

	constructor() {
		super();

		this.offset = 1.0;

		this._hBlurPass = new ShaderPostPass(horizontalBlurShader);
		this._vBlurPass = new ShaderPostPass(verticalBlurShader);
		this._blendPass = new ShaderPostPass(blurBlendShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	resize(width, height) {
		this._hBlurPass.uniforms.h = 4 / width;
		this._vBlurPass.uniforms.v = 4 / height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(1);
		const tempRT2 = composer._renderTargetCache.allocate(1);

		const blendPass = this._blendPass;

		// Step 1: blur x
		this._hBlurPass.uniforms.tDiffuse = inputRenderTarget.texture;
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._hBlurPass.render(renderer, tempRT1);
		// Step 2: blur y
		this._vBlurPass.uniforms.tDiffuse = tempRT1.texture;
		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._vBlurPass.render(renderer, tempRT2);
		// Step 3: blend
		blendPass.uniforms.tDiffuse = inputRenderTarget.texture;
		blendPass.uniforms.blurOffset = this.offset;
		blendPass.uniforms.blurTexture = tempRT2.texture;
		composer.$setEffectContextStates(outputRenderTarget, blendPass, finish);
		blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 1);
		composer._renderTargetCache.release(tempRT2, 1);
	}

	dispose() {
		this._hBlurPass.dispose();
		this._vBlurPass.dispose();
		this._blendPass.dispose();
	}

}

const blurBlendShader = {
	name: 'ec_blur_blend',
	defines: {},
	uniforms: {
		tDiffuse: null,
		blurOffset: 1.0,
		blurTexture: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float blurOffset;

        uniform sampler2D blurTexture;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec4 color = texture2D(tDiffuse, v_Uv);
            vec2 uv = (v_Uv - vec2(0.5)) * vec2(blurOffset);

            vec3 color2 = texture2D(blurTexture, v_Uv).rgb;

			color.rgb = mix(color.rgb, color2, clamp(dot(uv, uv), 0.0, 1.0));
			gl_FragColor = color;
        }
    `
};