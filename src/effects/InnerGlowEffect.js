import { ShaderPostPass, Color3, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { channelShader, defaultVertexShader } from '../Utils.js';

export default class InnerGlowEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'MarkBuffer' }
		];

		this.color = new Color3(1, 1, 1);
		this.strength = 1.5;
		this.stride = 5;

		this._channelPass = new ShaderPostPass(channelShader);
		this._blurXPass = new ShaderPostPass(innerGlowXShader);
		this._blurYPass = new ShaderPostPass(innerGlowYShader);
		// this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass = new ShaderPostPass(tintShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);
		const tempRT3 = composer._renderTargetCache.allocate(0);

		const markBuffer = composer.getBuffer('MarkBuffer');

		const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
		const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

		this._channelPass.uniforms['tDiffuse'] = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		for (let i = 0; i < 4; i++) {
			this._channelPass.uniforms.channelMask[i] = (i === channelIndex) ? 1 : 0;
		}
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._channelPass.render(renderer, tempRT1);

		this._blurXPass.uniforms.tDiffuse = tempRT1.texture;
		this._blurXPass.uniforms.stride = this.stride;
		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurXPass.render(renderer, tempRT2);

		this._blurYPass.uniforms.tDiffuse = tempRT1.texture;
		this._blurYPass.uniforms.blurX = tempRT2.texture;
		this._blurYPass.uniforms.stride = this.stride;
		this._blurYPass.uniforms.glowness = this.strength;
		this.color.toArray(this._blurYPass.uniforms.glowColor);
		tempRT3.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurYPass.render(renderer, tempRT3);

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT3.texture;
		// this._blendPass.uniforms.colorWeight1 = 1;
		// this._blendPass.uniforms.alphaWeight1 = 1;
		// this._blendPass.uniforms.colorWeight2 = 1;
		// this._blendPass.uniforms.alphaWeight2 = 0;
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
		composer._renderTargetCache.release(tempRT3, 0);
	}

	dispose() {
		this._channelPass.dispose();
		this._blurXPass.dispose();
		this._blurYPass.dispose();
		this._blendPass.dispose();
	}

}

const innerGlowXShader = {
	name: 'ec_innerglow_x',
	defines: {},
	uniforms: {
		tDiffuse: null,
		stride: 10
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		#define WT9_0 1.0
		#define WT9_1 0.8
		#define WT9_2 0.6
		#define WT9_3 0.4
		#define WT9_4 0.2
		#define WT9_NORMALIZE 5.2

		uniform vec2 u_RenderTargetSize;
		varying vec2 v_Uv;
		uniform sampler2D tDiffuse;
		uniform float stride;

		void main() {
			float texelIncrement = 0.25 * stride / u_RenderTargetSize.x;

			float colour = texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.5 * stride / u_RenderTargetSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.75 * stride / u_RenderTargetSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = stride / u_RenderTargetSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			float col = 1.0 - colour * 0.25;

			gl_FragColor = vec4(col,col,col,col);
		}
    `
};

const innerGlowYShader = {
	name: 'ec_innerglow_y',
	defines: {},
	uniforms: {
		tDiffuse: null,
		blurX: null,
		stride: 10,
		glowness: 2,
		glowColor: [1, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		#define WT9_0 1.0
		#define WT9_1 0.8
		#define WT9_2 0.6
		#define WT9_3 0.4
		#define WT9_4 0.2
		#define WT9_NORMALIZE 5.2

		uniform vec2 u_RenderTargetSize;
		varying vec2 v_Uv;
		uniform float stride;
		uniform float glowness;
		uniform vec3 glowColor;
		uniform sampler2D blurX;
		uniform sampler2D tDiffuse;

		void main() {
			float texelIncrement = 0.25 * stride / u_RenderTargetSize.y;

			float colour = texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.5 * stride / u_RenderTargetSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.75 * stride / u_RenderTargetSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = stride / u_RenderTargetSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			vec3 glo = (0.25 * glowness * colour) * glowColor;
			vec4 maskTexel = texture2D(tDiffuse, v_Uv);
			
			gl_FragColor = vec4(maskTexel.x * glo, 1.);
		}
    `
};

const tintShader = {
	name: 'ec_tint',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D texture1;
        uniform sampler2D texture2;
        varying vec2 v_Uv;
        void main() {
            vec4 texel1 = texture2D(texture1, v_Uv);
            vec4 texel2 = texture2D(texture2, v_Uv);

            float v = max(max(texel2.x, texel2.y), texel2.z);

            vec4 color = mix(texel1, vec4(texel2.rgb, texel1.a), v);
            gl_FragColor = color;
        }
    `
};