import { ShaderPostPass } from 't3d';
import { Effect, highlightShader, defaultVertexShader, additiveShader } from 't3d-effect-composer';

/**
 * UnrealBloomEffect is inspired by Unreal Engine's bloom implementation.
 * Reference: github.com/mrdoob/three.js/blob/19b0eebc3ce3908c54dfe66e390fff6593280d0d/examples/jsm/postprocessing/UnrealBloomPass.js
 */
export default class UnrealBloomEffect extends Effect {

	constructor() {
		super();

		this.threshold = 0;
		this.smoothWidth = 0.1;
		this.strength = 1;
		this.radius = 0;

		this._highlightPass = new ShaderPostPass(highlightShader);

		this._separableBlurPasses = [];
		for (let i = 0; i < 5; i++) {
			const kernelRadius = kernelSizeArray[i];

			const seperableBlurPass = new ShaderPostPass(seperableBlurShader);
			seperableBlurPass.material.defines.KERNEL_RADIUS = kernelRadius;

			for (let i = 0; i < kernelRadius; i++) {
				seperableBlurPass.uniforms.gaussianCoefficients.push(
					0.39894 * Math.exp(-0.5 * i * i / (kernelRadius * kernelRadius)) / kernelRadius
				);
			}

			this._separableBlurPasses.push(seperableBlurPass);
		}

		this._compositePass = new ShaderPostPass(compositeShader);

		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;

		this._tempRTList = [];
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(1);

		this._highlightPass.uniforms.tDiffuse = inputRenderTarget.texture;
		this._highlightPass.uniforms.threshold = this.threshold;
		this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._highlightPass.render(renderer, tempRT1);

		let inputRT = tempRT1;
		for (let i = 0; i < kernelSizeArray.length; i++) {
			this._separableBlurPasses[i].uniforms.tDiffuse = inputRT.texture;
			this._separableBlurPasses[i].uniforms.invSize[0] = 1 / inputRT.width;
			this._separableBlurPasses[i].uniforms.invSize[1] = 1 / inputRT.height;
			this._separableBlurPasses[i].uniforms.direction[0] = 1;
			this._separableBlurPasses[i].uniforms.direction[1] = 0;
			const _tempRT1 = composer._renderTargetCache.allocate(i + 1);
			_tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._separableBlurPasses[i].render(renderer, _tempRT1);

			this._separableBlurPasses[i].uniforms.tDiffuse = _tempRT1.texture;
			this._separableBlurPasses[i].uniforms.invSize[0] = 1 / inputRT.width;
			this._separableBlurPasses[i].uniforms.invSize[1] = 1 / inputRT.height;
			this._separableBlurPasses[i].uniforms.direction[0] = 0;
			this._separableBlurPasses[i].uniforms.direction[1] = 1;
			const _tempRT2 = composer._renderTargetCache.allocate(i + 1);
			_tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._separableBlurPasses[i].render(renderer, _tempRT2);

			composer._renderTargetCache.release(_tempRT1, i + 1);
			inputRT = _tempRT2;

			this._tempRTList[i] = _tempRT2;
		}

		this._compositePass.uniforms.blurTexture1 = this._tempRTList[0].texture;
		this._compositePass.uniforms.blurTexture2 = this._tempRTList[1].texture;
		this._compositePass.uniforms.blurTexture3 = this._tempRTList[2].texture;
		this._compositePass.uniforms.blurTexture4 = this._tempRTList[3].texture;
		this._compositePass.uniforms.blurTexture5 = this._tempRTList[4].texture;
		this._compositePass.uniforms.bloomRadius = this.radius;
		this._compositePass.uniforms.bloomStrength = this.strength;
		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._compositePass.render(renderer, tempRT2);

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT2.texture;
		this._blendPass.uniforms.colorWeight1 = 1;
		this._blendPass.uniforms.alphaWeight1 = 1;
		this._blendPass.uniforms.colorWeight2 = 1;
		this._blendPass.uniforms.alphaWeight2 = 0;
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 1);
		this._tempRTList.forEach((rt, i) => composer._renderTargetCache.release(rt, i + 1));
	}

	resize(width, height) {
		let resx = Math.round(width / 2);
		let resy = Math.round(height / 2);
		for (let i = 0; i < 5; i++) {
			this._separableBlurPasses[i].uniforms.invSize = [1 / resx, 1 / resy];
			resx = Math.round(resx / 2);
			resy = Math.round(resy / 2);
		}
	}

	dispose() {
		this._highlightPass.dispose();
		this._compositePass.dispose();
		this._blendPass.dispose();

		for (let i = 0; i < 5; i++) {
			this._separableBlurPasses[i].dispose();
		}
	}

}

const kernelSizeArray = [3, 5, 7, 9, 11];

const seperableBlurShader = {
	name: 'ec_unrealbloom_blur',

	defines: {
		KERNEL_RADIUS: 5
	},

	uniforms: {
		tDiffuse: null,
		invSize: [1 / 512, 1 / 512], // inverse texture size
		direction: [0.5, 0.5],
		gaussianCoefficients: [] // precomputed Gaussian Coefficients
	},

	vertexShader: defaultVertexShader,

	fragmentShader: `
		uniform sampler2D tDiffuse;
		uniform vec2 invSize;
		uniform vec2 direction;
		uniform float gaussianCoefficients[KERNEL_RADIUS];
		varying vec2 v_Uv;
		void main() {
			float weightSum = gaussianCoefficients[0];
			vec3 diffuseSum = texture2D(tDiffuse, v_Uv).rgb * weightSum;
			for(int i = 1; i < KERNEL_RADIUS; i++) {
				float x = float(i);
				float w = gaussianCoefficients[i];
				vec2 uvOffset = direction * invSize * x;
				vec3 sample1 = texture2D(tDiffuse, v_Uv + uvOffset).rgb;
				vec3 sample2 = texture2D(tDiffuse, v_Uv - uvOffset).rgb;
				diffuseSum += (sample1 + sample2) * w;
				weightSum += 2.0 * w;
			}
			gl_FragColor = vec4(diffuseSum / weightSum, 0.0);
		}
	`
};

const compositeShader = {
	name: 'ec_unrealbloom_composite',

	defines: {},

	uniforms: {
		blurTexture1: null,
		blurTexture2: null,
		blurTexture3: null,
		blurTexture4: null,
		blurTexture5: null,
		bloomFactors: [1., 0.8, 0.6, 0.4, 0.2],
		bloomRadius: 0.0,
		bloomStrength: 1
	},

	vertexShader: defaultVertexShader,

	fragmentShader: `
		uniform sampler2D blurTexture1;
		uniform sampler2D blurTexture2;
		uniform sampler2D blurTexture3;
		uniform sampler2D blurTexture4;
		uniform sampler2D blurTexture5;
		uniform float bloomStrength;
		uniform float bloomRadius;
		uniform float bloomFactors[5];

		varying vec2 v_Uv;

		float lerpBloomFactor(const in float factor) {
			float mirrorFactor = 1.2 - factor;
			return mix(factor, mirrorFactor, bloomRadius);
		}

		void main() {
			float factor0 = lerpBloomFactor(bloomFactors[0]);
			float factor1 = lerpBloomFactor(bloomFactors[1]);
			float factor2 = lerpBloomFactor(bloomFactors[2]);
			float factor3 = lerpBloomFactor(bloomFactors[3]);
			float factor4 = lerpBloomFactor(bloomFactors[4]);
			gl_FragColor = bloomStrength * (factor0 * texture2D(blurTexture1, v_Uv) +
				factor1 * texture2D(blurTexture2, v_Uv) +
				factor2 * texture2D(blurTexture3, v_Uv) +
				factor3 * texture2D(blurTexture4, v_Uv) +
				factor4 * texture2D(blurTexture5, v_Uv));
		}
	`
};