import { ShaderPostPass, ATTACHMENT } from 't3d';
import { Effect, copyShader } from 't3d-effect-composer';

export class TransmissionEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'TransmissionBuffer' }
		];

		this._copyPass = new ShaderPostPass(copyShader);
		this._copyPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const transmissionBuffer = composer.getBuffer('TransmissionBuffer');

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, true);
		}
		this._copyPass.uniforms.tDiffuse = transmissionBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		if (finish) {
			this._copyPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._copyPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._copyPass.render(renderer);
		if (finish) {
			this._copyPass.material.transparent = false;
			this._copyPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._blendPass.dispose();
	}

}

