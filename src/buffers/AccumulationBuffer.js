
import { RenderTarget2D, TEXTURE_FILTER, PIXEL_TYPE, ATTACHMENT } from 't3d';
import Buffer from './Buffer.js';

// AccumulationBuffer is used to store the accumulation result of the previous frame.
// But it can not render to itself (render method is empty), need TAAEffect to help.
export default class AccumulationBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		function createSwapRenderTarget() {
			const renderTarget = new RenderTarget2D(width, height);
			renderTarget.texture.generateMipmaps = false;
			renderTarget.texture.type = options.highDynamicRange ? PIXEL_TYPE.HALF_FLOAT : PIXEL_TYPE.UNSIGNED_BYTE;
			renderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
			renderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;
			renderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			return renderTarget;
		}

		this._prevRT = createSwapRenderTarget();
		this._accumRT = createSwapRenderTarget();
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