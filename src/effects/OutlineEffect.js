import { ShaderPostPass, Color3, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, copyShader, seperableBlurShader } from '../Utils.js';

export default class OutlineEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'NonDepthMarkBuffer' }
		];

		this.color = new Color3(1, 1, 1);
		this.thickness = 1.0;
		this.strength = 1.5;

		this._downsamplerPass = new ShaderPostPass(copyShader);
		this._edgeDetectionPass = new ShaderPostPass(edgeDetectionShader);
		this._blurPass = new ShaderPostPass(seperableBlurShader);
		this._blendPass = new ShaderPostPass(blendShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(1);
		const tempRT2 = composer._renderTargetCache.allocate(1);

		const markBuffer = composer.getBuffer('NonDepthMarkBuffer');

		const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
		const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._downsamplerPass.uniforms.tDiffuse = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._downsamplerPass.render(renderer);

		renderer.renderPass.setRenderTarget(tempRT2);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._edgeDetectionPass.uniforms.tDiffuse = tempRT1.texture;
		this._edgeDetectionPass.uniforms.texSize[0] = tempRT1.width;
		this._edgeDetectionPass.uniforms.texSize[1] = tempRT1.height;
		for (let i = 0; i < 4; i++) {
			this._edgeDetectionPass.uniforms.channelMask[i] = (i === channelIndex) ? 1 : 0;
		}
		this.color.toArray(this._edgeDetectionPass.uniforms.edgeColor);
		this._edgeDetectionPass.render(renderer);

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._blurPass.uniforms.tDiffuse = tempRT2.texture;
		this._blurPass.uniforms.texSize[0] = tempRT2.width;
		this._blurPass.uniforms.texSize[1] = tempRT2.height;
		this._blurPass.uniforms.direction[0] = 1;
		this._blurPass.uniforms.direction[1] = 0;
		this._blurPass.uniforms.kernelRadius = this.thickness;
		this._blurPass.render(renderer);

		renderer.renderPass.setRenderTarget(tempRT2);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);
		this._blurPass.uniforms.tDiffuse = tempRT1.texture;
		this._blurPass.uniforms.direction[0] = 0;
		this._blurPass.uniforms.direction[1] = 1;
		this._blurPass.render(renderer);

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}
		this._blendPass.uniforms.colorTexture =  inputRenderTarget.texture;
		this._blendPass.uniforms.edgeTexture = tempRT2.texture;
		this._blendPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._blendPass.uniforms.strength = this.strength;
		for (let i = 0; i < 4; i++) {
			this._blendPass.uniforms.channelMask[i] = (i === channelIndex) ? 1 : 0;
		}
		if (finish) {
			this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._blendPass.render(renderer);
		if (finish) {
			this._blendPass.material.transparent = false;
			this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		composer._renderTargetCache.release(tempRT1, 1);
		composer._renderTargetCache.release(tempRT2, 1);
	}

	dispose() {
		this._downsamplerPass.dispose();
		this._edgeDetectionPass.dispose();
		this._blurPass.dispose();
		this._blendPass.dispose();
	}

}

const edgeDetectionShader = {
	name: 'ec_outline_edge',
	defines: {},
	uniforms: {
		tDiffuse: null,
		texSize: [0.5, 0.5],
		edgeColor: [1, 1, 1],
		channelMask: [1, 0, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform vec2 texSize;
        uniform vec3 edgeColor;

		uniform vec4 channelMask;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec2 invSize = 1.0 / texSize;
			vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
			float c1 = dot(texture2D(tDiffuse, v_Uv + uvOffset.xy), channelMask);
			float c2 = dot(texture2D(tDiffuse, v_Uv - uvOffset.xy), channelMask);
			float c3 = dot(texture2D(tDiffuse, v_Uv + uvOffset.yw), channelMask);
			float c4 = dot(texture2D(tDiffuse, v_Uv - uvOffset.yw), channelMask);
			float b1 = max(c1, c2);
			float b2 = max(c3, c4);
			float a = max(b1, b2);
			gl_FragColor = vec4(edgeColor, a);
        }
    `
};

const blendShader = {
	name: 'ec_outline_blend',
	defines: {},
	uniforms: {
		maskTexture: null,
		edgeTexture: null,
		colorTexture: null,
		strength: 1,
		channelMask: [1, 0, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D maskTexture;
        uniform sampler2D edgeTexture;
        uniform float strength;

		uniform vec4 channelMask;

        uniform sampler2D colorTexture;
        varying vec2 v_Uv;

        void main() {
            vec4 edgeColor = texture2D(edgeTexture, v_Uv);
            vec4 maskColor = texture2D(maskTexture, v_Uv);

            vec4 outlineColor = edgeColor * strength;
			outlineColor.a *= (1.0 - dot(maskColor, channelMask));

            vec4 color = texture2D(colorTexture, v_Uv);
			
            color.rgb = outlineColor.rgb * outlineColor.a + color.rgb * (1. - outlineColor.a);
			color.a = outlineColor.a + color.a * (1. - outlineColor.a);

            gl_FragColor = color;
        }
    `
}