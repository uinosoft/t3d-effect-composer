import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { defaultVertexShader, octahedronToUnitVectorGLSL } from '../Utils.js';
import Debugger from './Debugger.js';

export default class GBufferDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['GBuffer'];

		this._mainPass = new ShaderPostPass(shader);

		this.debugType = DebugTypes.Normal;

		this.useAnchorMatrix = true;
	}

	render(renderer, composer, outputRenderTarget) {
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		this._mainPass.uniforms['colorTexture0'] = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._mainPass.uniforms['depthTexture'] = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._mainPass.uniforms['debug'] = this.debugType || 0;
		gBufferRenderStates.camera.projectionViewMatrix.toArray(this._mainPass.uniforms['projectionView']);

		if (this.useAnchorMatrix) {
			_matrix.identity().toArray(this._mainPass.uniforms['anchorMatrix']);
		} else {
			// pass the anchor matrix to convert the debug normals and positions from anchor space to world space
			gBufferRenderStates.scene.anchorMatrix.toArray(this._mainPass.uniforms['anchorMatrix']);
		}

		outputRenderTarget.setColorClearValue(0, 0, 0, 1).setClear(true, true, false);
		this._mainPass.render(renderer, outputRenderTarget);
	}

}

const _matrix = new Matrix4();

const DebugTypes = {
	Normal: 0,
	Depth: 1,
	Position: 2,
	Metalness: 3,
	Roughness: 4
};

GBufferDebugger.DebugTypes = DebugTypes;

const shader = {
	name: 'ec_debug_gbuffer',
	defines: {},
	uniforms: {
		colorTexture0: null,
		depthTexture: null,
		projectionView: new Float32Array(16),
		anchorMatrix: new Float32Array(16),
		debug: 0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D colorTexture0;
		uniform sampler2D depthTexture;
		uniform int debug;

		uniform mat4 projectionView;
		uniform mat4 anchorMatrix;

		varying vec2 v_Uv;

		${octahedronToUnitVectorGLSL}

		void main() {
			vec2 texCoord = v_Uv;
			vec4 texel = texture2D(colorTexture0, texCoord);

			if (texel.r < -2.0) {
				discard;
			}

			vec3 normal = octahedronToUnitVector(texel.rg);
			float depth = texture2D(depthTexture, texCoord).r;

			vec2 xy = texCoord * 2.0 - 1.0;
			float z = depth * 2.0 - 1.0;

			vec4 projectedPos = vec4(xy, z, 1.0);
			vec4 p4 = inverse(projectionView) * projectedPos;

			vec3 position = p4.xyz / p4.w;

			position = (anchorMatrix * vec4(position, 1.0)).xyz;
			normal = (anchorMatrix * vec4(normal, 0.0)).xyz;

			if (debug == 0) {
				gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
			} else if (debug == 1) {
				gl_FragColor = vec4(vec3(depth), 1.0);
			} else if (debug == 2) {
				gl_FragColor = vec4(position, 1.0);
			} else if (debug == 3) {
				gl_FragColor = vec4(vec3(texel.b), 1.0);
			} else {
				gl_FragColor = vec4(vec3(texel.a), 1.0);
			}
		}
	`
};