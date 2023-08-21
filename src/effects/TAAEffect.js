import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { copyShader, defaultVertexShader } from '../Utils.js';

export default class TAAEffect extends Effect {

	constructor() {
		super();

		this.needCameraJitter = true;

		this.bufferDependencies = [
			{ key: 'AccumulationBuffer' }
		];

		this._accumPass = new ShaderPostPass(accumulateShader);
		this._copyPass = new ShaderPostPass(copyShader);

		this._reset = true;
		this._accumulating = true;

		this.onFinish = null;
	}

	reset() {
		this._reset = true;
	}

	resize(width, height) {
		this._reset = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const cameraJitter = composer.$cameraJitter;

		if (this._reset) {
			cameraJitter.reset();
			this._reset = false;
		}

		const accumBuffer = composer.getBuffer('AccumulationBuffer');

		if (cameraJitter.accumulating()) {
			renderer.setRenderTarget(accumBuffer.output());
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, false, false);

			this._accumPass.uniforms.currTexture = inputRenderTarget.texture;
			this._accumPass.uniforms.prevTexture = accumBuffer.accumRT().texture;
			this._accumPass.uniforms.mixRatio = cameraJitter.frame() === 0 ? 0 : 0.9;
			this._accumPass.render(renderer);

			this._accumulating = true;
		} else {
			if (this._accumulating) {
				this.onFinish && this.onFinish();
				this._accumulating = false;
			}
		}

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		const copyPass = this._copyPass;
		copyPass.uniforms.tDiffuse = accumBuffer.output().texture;
		if (finish) {
			copyPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			copyPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		copyPass.render(renderer);
		if (finish) {
			copyPass.material.transparent = false;
			copyPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		accumBuffer.swap();
	}

	dispose() {
		super.dispose();
		this._accumPass.dispose();
		this._copyPass.dispose();
	}

}

const accumulateShader = {
	name: 'accum',
	defines: {},
	uniforms: {
		mixRatio: 0.9,
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D currTexture;
        uniform sampler2D prevTexture;

        uniform float mixRatio;

        varying vec2 v_Uv;

        void main() {
            vec4 texel1 = texture2D(currTexture, v_Uv);
            vec4 texel2 = texture2D(prevTexture, v_Uv);
            gl_FragColor = mix(texel1, texel2, mixRatio);
        }
    `
};