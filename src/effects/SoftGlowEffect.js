import { ShaderPostPass, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, maskShader, horizontalBlurShader, verticalBlurShader, additiveShader, RenderListMask } from '../Utils.js';

export default class SoftGlowEffect extends Effect {

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

		this.strength = 0.5;
		this.blendRate = 0.4;
		this.blurSize = 1;

		this._maskPass = new ShaderPostPass(maskShader);
		this._downSamplerPass = new ShaderPostPass(downSampleShader);
		this._hBlurPass = new ShaderPostPass(horizontalBlurShader);
		this._vBlurPass = new ShaderPostPass(verticalBlurShader);
		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;

		this._tempRTList = [];
		this._tempRTList2 = [];
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		for (let i = 0; i < 6; i++) {
			this._tempRTList[i] = composer._renderTargetCache.allocate(i);
			this._tempRTList2[i] = composer._renderTargetCache.allocate(i);
		}

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const markBuffer = composer.getBuffer('MarkBuffer');
		const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');

		const usedMarkBuffer = markBuffer.attachManager.has(this.name);
		const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
		const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		if (usedMarkBuffer) {
			const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

			renderer.renderPass.setRenderTarget(this._tempRTList[0]);
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

		renderer.renderPass.setRenderTarget(this._tempRTList[1]);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._downSamplerPass.uniforms.tDiffuse = usedMarkBuffer ? this._tempRTList[0].texture : colorBufferTexture;
		this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[0].width;
		this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[0].height;
		this._downSamplerPass.uniforms.bright = 4; // make this brighter
		this._downSamplerPass.render(renderer);

		// down sampler
		for (let i = 2; i < 6; i++) {
			renderer.renderPass.setRenderTarget(this._tempRTList[i]);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._downSamplerPass.uniforms.tDiffuse = this._tempRTList[i - 1].texture;
			this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[i - 1].width;
			this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[i - 1].height;
			this._downSamplerPass.uniforms.bright = 1;
			this._downSamplerPass.render(renderer);
		}

		// up sampler and blur h
		for (let i = 0; i < 5; i++) {
			renderer.renderPass.setRenderTarget(this._tempRTList[i]);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._hBlurPass.uniforms.tDiffuse = this._tempRTList[i + 1].texture;
			this._hBlurPass.uniforms.h = 2 * this.blurSize / this._tempRTList[i].width;
			this._hBlurPass.render(renderer);
		}

		// blur v
		for (let i = 0; i < 5; i++) {
			renderer.renderPass.setRenderTarget(this._tempRTList2[i]);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._vBlurPass.uniforms.tDiffuse = this._tempRTList[i].texture;
			this._vBlurPass.uniforms.v = 2 * this.blurSize / this._tempRTList[i].height;
			this._vBlurPass.render(renderer);
		}

		// blend glow
		for (let i = 3; i >= 0; i--) {
			renderer.renderPass.setRenderTarget(this._tempRTList[i]);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blendPass.uniforms.texture1 = this._tempRTList2[i].texture;
			this._blendPass.uniforms.texture2 = (i < 3) ? this._tempRTList[i + 1].texture : this._tempRTList2[i + 1].texture;
			this._blendPass.uniforms.colorWeight1 = (1 - this.blendRate) * this.strength;
			this._blendPass.uniforms.alphaWeight1 = (1 - this.blendRate) * this.strength;
			this._blendPass.uniforms.colorWeight2 = this.blendRate * this.strength;
			this._blendPass.uniforms.alphaWeight2 = this.blendRate * this.strength;

			this._blendPass.render(renderer);
		}

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}
		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = this._tempRTList[0].texture;
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

		this._tempRTList.forEach((rt, i) => composer._renderTargetCache.release(rt, i));
		this._tempRTList2.forEach((rt, i) => composer._renderTargetCache.release(rt, i));
	}

	dispose() {
		this._maskPass.dispose();
		this._downSamplerPass.dispose();
		this._hBlurPass.dispose();
		this._vBlurPass.dispose();
		this._blendPass.dispose();
	}

}

const downSampleShader = {
	name: 'ec_sg_downsample',
	defines: {},
	uniforms: {
		tDiffuse: null,
		texSize: [512, 512],
		bright: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;

		uniform sampler2D tDiffuse;
		uniform vec2 texSize;
	
		uniform float bright;
		
		void main() {
    		vec4 d = vec4(-1.0, -1.0, 1.0, 1.0) / texSize.xyxy;
			gl_FragColor = (texture2D(tDiffuse, v_Uv + d.xy) +
				texture2D(tDiffuse, v_Uv + d.zy) +
				texture2D(tDiffuse, v_Uv + d.xw) +
				texture2D(tDiffuse, v_Uv + d.zw)) * bright * 0.25;
		}
	`
}