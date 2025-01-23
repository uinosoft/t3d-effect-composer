
import { ATTACHMENT, PIXEL_FORMAT, TEXTURE_FILTER, RenderBuffer, RenderTarget2D } from 't3d';
import { Buffer, isDepthStencilAttachment, RenderListMask, setupColorTexture, getColorBufferFormat } from 't3d-effect-composer';

export class TransmissionBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._rt = new RenderTarget2D(width, height);
		setupColorTexture(this._rt.texture, options);
		this._rt.texture.generateMipmaps = false;
		this._rt.texture.minFilter = TEXTURE_FILTER.LINEAR;

		const colorBufferFormat = getColorBufferFormat(options);
		this._mrt = new RenderTarget2D(width, height);
		this._mrt.attach(
			new RenderBuffer(width, height, colorBufferFormat, options.samplerNumber),
			ATTACHMENT.COLOR_ATTACHMENT0
		);
		this._mrt.attach(
			new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH24_STENCIL8, options.samplerNumber),
			ATTACHMENT.DEPTH_STENCIL_ATTACHMENT
		);

		this.renderLayers = [
			{ id: 20, mask: RenderListMask.ALL }
		];

		this._colorTexture = null;

		this._renderOptions = {
			getMaterial: renderable => {
				const colorTexture = this._colorTexture;
				renderable.material.uniforms.transmissionSamplerMap = colorTexture;
				renderable.material.uniforms.transmissionSamplerSize[0] = colorTexture.image.width;
				renderable.material.uniforms.transmissionSamplerSize[1] = colorTexture.image.height;
				return renderable.material;
			},
			ifRender: renderable => {
				return renderable.material.shaderName === 'TransmissionPBR';
			}
		};
	}

	syncAttachments(colorAttachment, depthAttachment, _msColorRenderBuffer, msDepthRenderBuffer) {
		this._rt.dispose();
		this._mrt.dispose();

		// color attachment is always a texture for now
		// save it for transmission rendering
		this._colorTexture = colorAttachment;

		if (isDepthStencilAttachment(depthAttachment)) {
			this._rt.attach(depthAttachment, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._rt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
		} else {
			this._rt.attach(depthAttachment, ATTACHMENT.DEPTH_ATTACHMENT);
			this._rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		}

		if (isDepthStencilAttachment(msDepthRenderBuffer)) {
			this._mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._mrt.detach(ATTACHMENT.DEPTH_ATTACHMENT);
		} else {
			this._mrt.attach(msDepthRenderBuffer, ATTACHMENT.DEPTH_ATTACHMENT);
			this._mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		}

		this.needsUpdate = true;
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const useMSAA = composer.$useMSAA;
		const renderTarget = useMSAA ? this._mrt : this._rt;

		renderer.setRenderTarget(renderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, false, false);

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

		this._colorTexture = null;
	}

}