import { ShaderPostPass, Vector2, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { maskShader, additiveShader, defaultVertexShader, RenderListMask } from '../Utils.js';

export default class RadialTailingEffect extends Effect {

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

		this.center = new Vector2(0.5, 0.5);
		this.strength = 1;

		this._maskPass = new ShaderPostPass(maskShader);
		this._radialTailingPass = new ShaderPostPass(radialTailingShader);
		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const markBuffer = composer.getBuffer('MarkBuffer');
		const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');

		const usedMarkBuffer = markBuffer.attachManager.has(this.name);
		const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
		const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		if (usedMarkBuffer) {
			const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

			this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.additiveTexture = colorBufferTexture;
			for (let i = 0; i < 4; i++) {
				this._maskPass.uniforms.channel[i] = (i === channelIndex) ? 1 : 0;
			}
			tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._maskPass.render(renderer, tempRT1);
		}

		this._radialTailingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
		this._radialTailingPass.uniforms.center[0] = this.center.x;
		this._radialTailingPass.uniforms.center[1] = this.center.y;
		// this.center.toArray(this._radialTailingPass.uniforms.center);
		this._radialTailingPass.uniforms.intensity = 10 * this.strength;
		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._radialTailingPass.render(renderer, tempRT2);

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT2.texture;
		this._blendPass.uniforms.colorWeight1 = 1;
		this._blendPass.uniforms.alphaWeight1 = 1;
		this._blendPass.uniforms.colorWeight2 = 1;
		this._blendPass.uniforms.alphaWeight2 = 0;
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._maskPass.dispose();
		this._radialTailingPass.dispose();
		this._blendPass.dispose();
	}

}

const radialTailingShader = {
	name: 'ec_radial_tailing',
	defines: {},
	uniforms: {
		blurMap: null,
		blurStart: 1.0,
		blurWidth: -0.1,
		intensity: 10,
		glowGamma: 0.8,
		center: [0.5, 0.5]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;
		uniform sampler2D blurMap;
		uniform float blurStart;
		uniform float blurWidth;
		uniform float intensity;
		uniform float glowGamma;
		uniform vec2 center;
		
		void main() {
			vec2 texCoord = v_Uv;
			vec2 ctrPt = center;
			vec4 blurred = texture2D(blurMap, texCoord);
		
			for(float i = 0.0; i < 31.0; i++) {
				float scale = blurStart + blurWidth * ((31.0 - i) / (31.0 - 1.0));
				vec2 tmp = (texCoord - ctrPt) * scale + ctrPt;
				vec4 tmpc = texture2D(blurMap, tmp) * (i / 31.0) * (i / 31.0);
		
				blurred += tmpc / 31.0;
			}
		
			blurred.r = pow(blurred.r, glowGamma);
			blurred.g = pow(blurred.g, glowGamma);
			blurred.b = pow(blurred.b, glowGamma);
			blurred.rgb *= intensity;
			blurred.rgb = clamp(blurred.rgb, 0.0, 1.0);
		
			vec4 origTex = texture2D(blurMap, texCoord);
			vec4 blurResult = origTex + blurred;
			// blurResult *= 2;
		
			vec2 dir = texCoord - ctrPt;
			float dist = sqrt(dir.x * dir.x + dir.y * dir.y);
			float t = dist * 1.0;
			t = clamp(t, 0.0, 1.0); // We need 0 <= t <= 1
		
			gl_FragColor = blurResult * t;
		}
    `
};