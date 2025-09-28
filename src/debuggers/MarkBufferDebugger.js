import { ShaderPostPass, ATTACHMENT } from 't3d';
import { channelShader, RenderListMask } from '../Utils.js';
import Debugger from './Debugger.js';

export default class MarkBufferDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['SceneBuffer', 'MarkBuffer'];

		this._mainPass = new ShaderPostPass(channelShader);

		this.channel = '';
		this.mask = RenderListMask.ALL;
	}

	render(renderer, composer, outputRenderTarget) {
		const buffer = composer.getBuffer('MarkBuffer');

		const attachIndex = buffer.attachManager.getAttachIndex(this.channel);
		const channelIndex = buffer.attachManager.getChannelIndex(this.channel);

		this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		for (let i = 0; i < 4; i++) {
			this._mainPass.uniforms.channelMask[i] = (i === channelIndex) ? 1 : 0;
		}

		outputRenderTarget.setColorClearValue(0, 0, 0, 1).setClear(true, true, false);
		this._mainPass.render(renderer, outputRenderTarget);
	}

}