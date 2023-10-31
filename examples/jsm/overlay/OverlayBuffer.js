import { RenderTarget2D, RenderBuffer, PIXEL_FORMAT, PIXEL_TYPE, ATTACHMENT } from 't3d';
import { Buffer, RenderListMask } from 't3d-effect-composer';

export class OverlayBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._rt = new RenderTarget2D(width, height);
		this._rt.texture.type = options.highDynamicRange ? PIXEL_TYPE.HALF_FLOAT : PIXEL_TYPE.UNSIGNED_BYTE;

		this._mrt = new RenderTarget2D(width, height);
		this._mrt.attach(
			new RenderBuffer(width, height, options.highDynamicRange ? PIXEL_FORMAT.RGBA16F : PIXEL_FORMAT.RGBA8, options.samplerNumber),
			ATTACHMENT.COLOR_ATTACHMENT0
		);
		this._mrt.attach(
			new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH24_STENCIL8, options.samplerNumber),
			ATTACHMENT.DEPTH_STENCIL_ATTACHMENT
		);

		this.renderLayers = [
			{ id: 10, mask: RenderListMask.ALL }
		];

		this._renderOptions = {};
	}

	setGeometryReplaceFunction(func) {
		if (func) {
			this._renderOptions.getGeometry = func;
		} else {
			delete this._renderOptions.getGeometry;
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

		renderer.setRenderTarget(renderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, true);

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		const renderOptions = this._renderOptions;

		renderer.beginRender();

		const renderLayers = this.renderLayers;
		for (let i = 0, l = renderLayers.length; i < l; i++) {
			const { id, mask } = renderLayers[i];
			const layer = renderQueue.getLayer(id);
			if (layer) {
				if (layer.opaqueCount > 0 && (mask & RenderListMask.OPAQUE)) {
					renderer.renderRenderableList(layer.opaque, renderStates, renderOptions);
				}
				if (layer.transparentCount > 0 && (mask & RenderListMask.TRANSPARENT)) {
					renderer.renderRenderableList(layer.transparent, renderStates, renderOptions);
				}
			}
		}

		renderer.endRender();

		if (useMSAA) {
			renderer.setRenderTarget(this._rt);
			renderer.blitRenderTarget(this._mrt, this._rt, true, true, true);
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

}