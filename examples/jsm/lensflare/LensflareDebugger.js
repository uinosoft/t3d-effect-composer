import { ShaderPostPass, ATTACHMENT } from 't3d';
import { Debugger, copyShader } from 't3d-effect-composer';

export class LensflareDebugger extends Debugger {

	constructor() {
		super();

		this.bufferDependencies = ['SceneBuffer', 'LensflareBuffer'];

		this._mainPass = new ShaderPostPass(copyShader);
	}

	render(renderer, composer, outputRenderTarget) {
		const buffer = composer.getBuffer('LensflareBuffer');

		this._mainPass.uniforms['tDiffuse'] = buffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		outputRenderTarget.setColorClearValue(0, 0, 0, 1).setClear(true, true, false);
		this._mainPass.render(renderer, outputRenderTarget);
	}

}