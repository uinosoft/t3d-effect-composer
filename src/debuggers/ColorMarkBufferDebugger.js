import { ShaderPostPass, ATTACHMENT } from 't3d';
import { copyShader, RenderListMask } from '../Utils.js';
import Debugger from './Debugger.js';

export default class ColorMarkBufferDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['SceneBuffer', 'ColorMarkBuffer'];

		this._mainPass = new ShaderPostPass(copyShader);

		this.channel = '';
		this.mask = RenderListMask.ALL;
	}

	render(renderer, composer, outputRenderTarget) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 1);
		renderer.renderPass.clear(true, true, false);

		const buffer = composer.getBuffer('ColorMarkBuffer');

		const attachIndex = buffer.attachManager.getAttachIndex(this.channel);

		this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._mainPass.render(renderer);
	}

}