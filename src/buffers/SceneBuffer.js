import { RenderTarget2D, ATTACHMENT } from 't3d';
import { isDepthStencilAttachment, RenderListMask } from '../Utils.js';
import Buffer from './Buffer.js';

export default class SceneBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._rt = new RenderTarget2D(width, height);
		this._rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		this._mrt = new RenderTarget2D(width, height);
		this._mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		this.clearColor = true;
		this.clearDepth = true;
		this.clearStencil = true;

		// Allow append custom layer render
		// element type: { id: 0, mask: RenderListMask.ALL, options: {} }
		this.renderLayers = [
			{ id: 0, mask: RenderListMask.ALL }
		];

		this._sceneRenderOptions = {};
	}

	syncAttachments(colorAttachment, depthAttachment, msColorRenderBuffer, msDepthRenderBuffer) {
		this._rt.dispose();
		this._mrt.dispose();

		this._rt.attach(colorAttachment, ATTACHMENT.COLOR_ATTACHMENT0);

		if (isDepthStencilAttachment(depthAttachment)) {
			this._rt.attach(depthAttachment, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._rt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
		} else {
			this._rt.attach(depthAttachment, ATTACHMENT.DEPTH_ATTACHMENT);
			this._rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		}

		this._mrt.attach(msColorRenderBuffer, ATTACHMENT.COLOR_ATTACHMENT0);

		if (isDepthStencilAttachment(msDepthRenderBuffer)) {
			this._mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._mrt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
		} else {
			this._mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_ATTACHMENT);
			this._mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		}

		this.needsUpdate = true;
	}

	setIfRenderReplaceFunction(func) {
		if (!!func) {
			this._sceneRenderOptions.ifRender = func;
		} else {
			delete this._sceneRenderOptions.ifRender;
		}
	}

	setGeometryReplaceFunction(func) {
		if (!!func) {
			this._sceneRenderOptions.getGeometry = func;
		} else {
			delete this._sceneRenderOptions.getGeometry;
		}
	}

	setOutputEncoding(encoding) {
		this._rt.texture.encoding = encoding;
	}

	getOutputEncoding() {
		return this._rt.texture.encoding;
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const useMSAA = composer.$useMSAA;
		const renderTarget = useMSAA ? this._mrt : this._rt;
		const hasStencil = !!renderTarget._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		renderer.setRenderTarget(renderTarget);

		if (composer.clearColor) {
			renderer.setClearColor(...composer._tempClearColor);
		} else {
			renderer.setClearColor(0, 0, 0, 0);
		}

		renderer.clear(this.clearColor, this.clearDepth, this.clearStencil && hasStencil);

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		this.$renderScene(renderer, renderQueue, renderStates);

		if (useMSAA) {
			renderer.setRenderTarget(this._rt);
			renderer.blitRenderTarget(this._mrt, this._rt, true, true, hasStencil);
		}

		// generate mipmaps for down sampler
		renderer.updateRenderTargetMipmap(this._rt);
	}

	output() {
		return this._rt;
	}

	resize(width, height) {
		super.resize(width, height);
		this._rt.resize(width, height);
		this._mrt.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();
		this._mrt.dispose();
	}

	$renderScene(renderer, renderQueue, renderStates) {
		const sceneRenderOptions = this._sceneRenderOptions;

		renderer.beginRender();

		const renderLayers = this.renderLayers;
		for (let i = 0, l = renderLayers.length; i < l; i++) {
			const { id, mask, options = sceneRenderOptions } = renderLayers[i];
			const layer = renderQueue.getLayer(id);
			if (layer) {
				if (layer.opaqueCount > 0 && (mask & RenderListMask.OPAQUE)) {
					renderer.renderRenderableList(layer.opaque, renderStates, options);
				}
				if (layer.transparentCount > 0 && (mask & RenderListMask.TRANSPARENT)) {
					renderer.renderRenderableList(layer.transparent, renderStates, options);
				}
			}
		}

		renderer.endRender();

		// TODO Overlay layer

		const overlayLayer = renderQueue.getLayer(1);
		if (overlayLayer && (overlayLayer.opaqueCount + overlayLayer.transparentCount) > 0) {
			renderer.clear(false, true, false);  // TODO Forcing clear depth may cause bugs

			renderer.beginRender();

			renderer.renderRenderableList(overlayLayer.opaque, renderStates, sceneRenderOptions);
			renderer.renderRenderableList(overlayLayer.transparent, renderStates, sceneRenderOptions);

			renderer.endRender();
		}
	}

}