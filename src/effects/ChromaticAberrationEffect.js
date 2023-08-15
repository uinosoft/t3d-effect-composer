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

	resize(width, height) {
		this._mainPass.uniforms.resolution[0] = 1 / width;
		this._mainPass.uniforms.resolution[1] = 1 / height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		const mainPass = this._mainPass;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		mainPass.uniforms.uChromaFactor = this.chromaFactor;
		if (finish) {
			mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		mainPass.render(renderer);
		if (finish) {
			mainPass.material.transparent = false;
			mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
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
		uResolutionRatio: [1, 1],
		resolution: [1 / 1024, 1 / 512]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform float uChromaFactor;
        uniform vec2 uResolutionRatio;
        uniform vec2 resolution;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec2 uv = v_Uv;
            vec2 dist = uv - 0.5;
            vec2 offset = uChromaFactor * dist * length(dist);
            vec4 col = texture2D(tDiffuse, min(uv, 1.0 - resolution) * uResolutionRatio);
            col.r = texture2D(tDiffuse, min(uv - offset, 1.0 - resolution) * uResolutionRatio).r;
            col.b = texture2D(tDiffuse, min(uv + offset, 1.0 - resolution) * uResolutionRatio).b;
            gl_FragColor = col;
        }
    `
};