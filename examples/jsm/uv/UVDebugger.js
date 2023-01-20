import { ShaderPostPass, ATTACHMENT } from 't3d';
import { Debugger, copyShader } from 't3d-effect-composer';

export class UVDebugger extends Debugger {

	constructor() {
		super();

		this.bufferDependencies = ['UVBuffer'];

		this._mainPass = new ShaderPostPass(copyShader);
	}

	render(renderer, composer, outputRenderTarget) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 1);
		renderer.renderPass.clear(true, true, false);

		const buffer = composer.getBuffer('UVBuffer');

		this._mainPass.uniforms['tDiffuse'] = buffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._mainPass.render(renderer);
	}

}