import { ShaderPostPass, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { maskShader, additiveShader, highlightShader, seperableBlurShader, defaultVertexShader, RenderListMask } from '../Utils.js';

export default class GlowEffect extends Effect {

	constructor() {
		super();

		// this.bufferDependencies = [
		// 	{ key: 'SceneBuffer' },
		// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
		// ];

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'MarkBuffer', mask: RenderListMask.OPAQUE },
			{ key: 'ColorMarkBuffer', mask: RenderListMask.TRANSPARENT }
		];

		this.strength = 1;
		this.radius = 0.4;
		this.threshold = 0.01;
		this.smoothWidth = 0.1;

		this._maskPass = new ShaderPostPass(maskShader);
		this._highlightPass = new ShaderPostPass(highlightShader);
		this._blurPass = new ShaderPostPass(seperableBlurShader);
		this._compositePass = new ShaderPostPass(bloomCompositeShader);
		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;

		this._compositePass.uniforms.bloomFactors = new Float32Array([1.0, 0.8, 0.6, 0.4, 0.2]);
		this._compositePass.uniforms.bloomTintColors = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

		this._tempRTList = [];
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(1);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const markBuffer = composer.getBuffer('MarkBuffer');
		const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');

		const usedMarkBuffer = markBuffer.attachManager.has(this.name);
		const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
		const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		if (usedMarkBuffer) {
			const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.additiveTexture = colorBufferTexture;
			for (let i = 0; i < 4; i++) {
				this._maskPass.uniforms.channel[i] = (i === channelIndex) ? 1 : 0;
			}
			this._maskPass.render(renderer);
		}

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._highlightPass.uniforms.tDiffuse = usedMarkBuffer ? tempRT2.texture : colorBufferTexture;
		this._highlightPass.uniforms.threshold = this.threshold;
		this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
		this._highlightPass.render(renderer);

		let inputRT = tempRT1;
		for (let i = 0; i < kernelSizeArray.length; i++) {
			const _tempRT1 = composer._renderTargetCache.allocate(i + 1);
			renderer.renderPass.setRenderTarget(_tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = inputRT.texture;
			this._blurPass.uniforms.texSize[0] = inputRT.width;
			this._blurPass.uniforms.texSize[1] = inputRT.height;
			this._blurPass.uniforms.direction[0] = 1;
			this._blurPass.uniforms.direction[1] = 0;
			this._blurPass.uniforms.kernelRadius = kernelSizeArray[i];
			this._blurPass.render(renderer);

			const _tempRT2 = composer._renderTargetCache.allocate(i + 1);
			renderer.renderPass.setRenderTarget(_tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = _tempRT1.texture;
			this._blurPass.uniforms.direction[0] = 0;
			this._blurPass.uniforms.direction[1] = 1;
			this._blurPass.render(renderer);

			composer._renderTargetCache.release(_tempRT1, i + 1);
			inputRT = _tempRT2;

			this._tempRTList[i] = _tempRT2;
		}

		renderer.renderPass.setRenderTarget(tempRT2);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._compositePass.uniforms.blurTexture1 = this._tempRTList[0].texture;
		this._compositePass.uniforms.blurTexture2 = this._tempRTList[1].texture;
		this._compositePass.uniforms.blurTexture3 = this._tempRTList[2].texture;
		this._compositePass.uniforms.blurTexture4 = this._tempRTList[3].texture;
		this._compositePass.uniforms.blurTexture5 = this._tempRTList[4].texture;
		this._compositePass.uniforms.bloomRadius = this.radius;
		this._compositePass.uniforms.bloomStrength = this.strength;
		this._compositePass.render(renderer);

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}
		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT2.texture;
		this._blendPass.uniforms.colorWeight1 = 1;
		this._blendPass.uniforms.alphaWeight1 = 1;
		this._blendPass.uniforms.colorWeight2 = 1;
		this._blendPass.uniforms.alphaWeight2 = 0;
		if (finish) {
			this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._blendPass.render(renderer);
		if (finish) {
			this._blendPass.material.transparent = false;
			this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 1);
		this._tempRTList.forEach((rt, i) => composer._renderTargetCache.release(rt, i + 1));
	}

	dispose() {
		this._maskPass.dispose();
		this._highlightPass.dispose();
		this._blurPass.dispose();
		this._compositePass.dispose();
		this._blendPass.dispose();
	}

}

const kernelSizeArray = [3, 5, 7, 9, 11];

const bloomCompositeShader = {
	name: 'ec_bloom_composite',
	defines: {
		NUM_MIPS: 5
	},
	uniforms: {
		blurTexture1: null,
		blurTexture2: null,
		blurTexture3: null,
		blurTexture4: null,
		blurTexture5: null,
		bloomStrength: 1.0,
		bloomRadius: 0.0,
		bloomFactors: null,
		bloomTintColors: null
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
		uniform float bloomFactors[NUM_MIPS];
		uniform vec3 bloomTintColors[NUM_MIPS];

        varying vec2 v_Uv;

        float lerpBloomFactor(const in float factor) {
            float mirrorFactor = 1.2 - factor;
            return mix(factor, mirrorFactor, bloomRadius);
        }

        void main() {
            gl_FragColor = bloomStrength * (
				lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, v_Uv) +
				lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, v_Uv) +
				lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, v_Uv) +
				lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, v_Uv) +
				lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, v_Uv)
			);
        }
    `
};