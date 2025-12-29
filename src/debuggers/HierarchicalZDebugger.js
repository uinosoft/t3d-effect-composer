import { ShaderPostPass } from 't3d';
import Debugger from './Debugger.js';
import { defaultVertexShader } from '../Utils.js';

export default class HiZDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['GBuffer'];

		this.level = 0;
		this.channel = Channels.R;
		this.linearize = false;

		this._mainPass = new ShaderPostPass(shader);
	}

	render(renderer, composer, outputRenderTarget) {
		const gBuffer = composer.getBuffer('GBuffer');
		const states = gBuffer.getCurrentRenderStates();

		outputRenderTarget.setColorClearValue(0, 0, 0, 1).setClear(true, true, false);

		this._mainPass.uniforms.depthTexture = gBuffer.hizTexture();
		this._mainPass.uniforms.near = states.camera.near;
		this._mainPass.uniforms.far = states.camera.far;
		this._mainPass.uniforms.linearize = this.linearize ? 1.0 : 0.0;
		this._mainPass.uniforms.level = this.level;
		this._mainPass.uniforms.channel = this.channel | 0;
		this._mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}

const Channels = {
	R: 0,
	G: 1
};

HiZDebugger.Channels = Channels;

const shader = {
	name: 'ec_debug_hiz',
	uniforms: {
		depthTexture: null,
		near: 0.1,
		far: 1000,
		linearize: 0.0,
		channel: 0,
		level: 0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D depthTexture;
		uniform float near;
		uniform float far;
		uniform float linearize;
		uniform int channel;
		uniform int level;

		varying vec2 v_Uv;

		float linearDepthFromClip(float clipDepth, float n, float f) {
			float ndc = clipDepth * 2.0 - 1.0;
			return (2.0 * n * f) / (f + n - ndc * (f - n));
		}

		float pickChannel(vec4 v) {
			if (channel == 0) return v.r;
			return v.g;
		}

		void main() {
			vec4 s = textureLod(depthTexture, v_Uv, float(level));
			float d = pickChannel(s);
			float v = mix(d, linearDepthFromClip(d, near, far) / far, linearize);
			gl_FragColor = vec4(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0);
		}
	`
};
