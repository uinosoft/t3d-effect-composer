
import { RenderTarget2D, TEXTURE_FILTER, ATTACHMENT } from 't3d';
import Buffer from './Buffer.js';

// AccumulationBuffer is used to store the accumulation result of the previous frame.
// But it can not render to itself (render method is empty), need TAAEffect to help.
export default class AccumulationBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._prevRT = new RenderTarget2D(width, height);
		this._prevRT.texture.generateMipmaps = false;
		this._prevRT.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._prevRT.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._prevRT.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		this._accumRT = new RenderTarget2D(width, height);
		this._accumRT.texture.generateMipmaps = false;
		this._accumRT.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._accumRT.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._accumRT.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
	}

	swap() {
		const tempRT = this._prevRT;
		this._prevRT = this._accumRT;
		this._accumRT = tempRT;
	}

	accumRT() {
		return this._accumRT;
	}

	output() {
		return this._prevRT;
	}

	resize(width, height) {
		super.resize(width, height);
		this._prevRT.resize(width, height);
		this._accumRT.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._prevRT.dispose();
		this._accumRT.dispose();
	}

}

