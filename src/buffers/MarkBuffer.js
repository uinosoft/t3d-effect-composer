import { ATTACHMENT } from 't3d';
import { isDepthStencilAttachment } from '../Utils.js';
import NonDepthMarkBuffer from './NonDepthMarkBuffer.js';

export default class MarkBuffer extends NonDepthMarkBuffer {

	constructor(width, height, options) {
		super(width, height, options);
	}

	syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
		this._rts.forEach(rt => rt.dispose());
		this._mrts.forEach(mrt => mrt.dispose());

		if (isDepthStencilAttachment(depthAttachment)) {
			this._rts.forEach(rt => {
				rt.attach(depthAttachment, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				rt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
			});
		} else {
			this._rts.forEach(rt => {
				rt.attach(depthAttachment, ATTACHMENT.DEPTH_ATTACHMENT);
				rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			});
		}

		if (isDepthStencilAttachment(msDepthRenderBuffer)) {
			this._mrts.forEach(mrt => {
				mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				mrt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
			});
		} else {
			this._mrts.forEach(mrt => {
				mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_ATTACHMENT);
				mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			});
		}

		this.needsUpdate = true;
	}

}