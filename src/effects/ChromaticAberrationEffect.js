import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader } from '../Utils.js';

export default class ChromaticAberrationEffect extends Effect {

	constructor() {
		super();

		this.chromaFactor = 0.025;

		this._mainPass = new ShaderPostPass(shader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const mainPass = this._mainPass;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		mainPass.uniforms.uChromaFactor = this.chromaFactor;
		composer.$setEffectContextStates(outputRenderTarget, mainPass, finish);
		mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}

const shader = {
	name: 'ec_chromatic_aberration',
	defines: {},
	uniforms: {
		tDiffuse: null,
		uChromaFactor: 0.025,
		uResolutionRatio: [1, 1]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform vec2 u_RenderTargetSize;

        uniform float uChromaFactor;
        uniform vec2 uResolutionRatio;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec2 uv = v_Uv;
            vec2 dist = uv - 0.5;
            vec2 offset = uChromaFactor * dist * length(dist);
			vec2 texelSize = 1.0 / u_RenderTargetSize;
            vec4 col = texture2D(tDiffuse, min(uv, 1.0 - texelSize) * uResolutionRatio);
            col.r = texture2D(tDiffuse, min(uv - offset, 1.0 - texelSize) * uResolutionRatio).r;
            col.b = texture2D(tDiffuse, min(uv + offset, 1.0 - texelSize) * uResolutionRatio).b;
            gl_FragColor = col;
        }
    `
};