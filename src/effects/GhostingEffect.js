import { ShaderPostPass, Vector2, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { maskShader, additiveShader, defaultVertexShader, RenderListMask } from '../Utils.js';

export default class GhostingEffect extends Effect {

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
		this._ghostingPass = new ShaderPostPass(ghostingShader);
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

			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._maskPass.uniforms.additiveTexture = colorBufferTexture;
			for (let i = 0; i < 4; i++) {
				this._maskPass.uniforms.channel[i] = (i === channelIndex) ? 1 : 0;
			}
			this._maskPass.render(renderer);
		}

		renderer.setRenderTarget(tempRT2);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, false);
		this._ghostingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
		this._ghostingPass.uniforms.center[0] = this.center.x;
		this._ghostingPass.uniforms.center[1] = this.center.y;
		// this.center.toArray(this._ghostingPass.uniforms.center);
		this._ghostingPass.uniforms.intensity = 3 * this.strength;
		this._ghostingPass.render(renderer);

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
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
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._maskPass.dispose();
		this._ghostingPass.dispose();
		this._blendPass.dispose();
	}

}

const ghostingShader = {
	name: 'ec_ghosting',
	defines: {},
	uniforms: {
		blurMap: null,
		blurStart: 1.0,
		blurWidth: -0.1,
		intensity: 3,
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
			vec2 uv = v_Uv;
			vec2 ctrPt = center;
		
			float scale = blurStart + blurWidth * 1.0;
			vec2 tmp = (uv - ctrPt) * scale + ctrPt;

			vec4 blurred = texture2D(blurMap, tmp);
			blurred.rgb = pow(blurred.rgb, vec3(glowGamma));
			blurred.rgb *= intensity;
			blurred.rgb = clamp(blurred.rgb, 0.0, 1.0);
			
			vec2 dir = uv - ctrPt;
			float dist = sqrt(dir.x * dir.x + dir.y * dir.y);
		
			gl_FragColor = blurred * clamp(dist, 0.0, 1.0);
		}
    `
}