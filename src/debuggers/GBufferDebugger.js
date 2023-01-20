import { ShaderPostPass, ATTACHMENT } from 't3d';
import { defaultVertexShader } from '../Utils.js';
import Debugger from './Debugger.js';

export default class GBufferDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['GBuffer'];

		this._mainPass = new ShaderPostPass(shader);

		this.debugType = DebugTypes.Normal;
	}

	render(renderer, composer, outputRenderTarget) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 1);
		renderer.renderPass.clear(true, true, false);

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		this._mainPass.uniforms['normalGlossinessTexture'] = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._mainPass.uniforms['depthTexture'] = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._mainPass.uniforms['debug'] = this.debugType || 0;
		gBufferRenderStates.camera.projectionViewMatrix.toArray(this._mainPass.uniforms['projectionView']);
		this._mainPass.render(renderer);
	}

}

const DebugTypes = {
	Normal: 0,
	Depth: 1,
	Position: 2,
	Glossiness: 3
};

GBufferDebugger.DebugTypes = DebugTypes;

const shader = {
	name: 'ec_debug_gbuffer',
	defines: {},
	uniforms: {
		normalGlossinessTexture: null,
		depthTexture: null,
		projectionView: new Float32Array(16),
		// DEBUG
		// - 0: normal
		// - 1: depth
		// - 2: position
		// - 3: glossiness
		debug: 0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D normalGlossinessTexture;
		uniform sampler2D depthTexture;
		uniform int debug;

		uniform mat4 projectionView;

		varying vec2 v_Uv;

		void main() {
			vec2 texCoord = v_Uv;
			vec4 texel = texture2D(normalGlossinessTexture, texCoord);

			if (dot(texel.rgb, vec3(1.0)) == 0.0) {
				discard;
			}

			float depth = texture2D(depthTexture, texCoord).r;

			vec2 xy = texCoord * 2.0 - 1.0;
			float z = depth * 2.0 - 1.0;

			vec4 projectedPos = vec4(xy, z, 1.0);
			vec4 p4 = inverse(projectionView) * projectedPos;

			vec3 position = p4.xyz / p4.w;

			if (debug == 0) {
				gl_FragColor = vec4(texel.rgb, 1.0);
			} else if (debug == 1) {
				gl_FragColor = vec4(vec3(depth), 1.0);
			} else if (debug == 2) {
				gl_FragColor = vec4(position, 1.0);
			} else {
				gl_FragColor = vec4(vec3(texel.a), 1.0);
			}
		}
	`
};