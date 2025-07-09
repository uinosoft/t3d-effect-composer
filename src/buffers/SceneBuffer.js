import { RenderTarget2D, ATTACHMENT, TEXTURE_FILTER, MathUtils, ShaderPostPass } from 't3d';
import { copyShader, isDepthStencilAttachment, RenderListMask, setupColorTexture } from '../Utils.js';
import Buffer from './Buffer.js';

export default class SceneBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this.enableCameraJitter = true;

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

		// transmission render target is power-of-two size
		// to avoid artifacts in mipmap generation
		this._transmissionRT = new RenderTarget2D(
			MathUtils.nearestPowerOfTwo(width),
			MathUtils.nearestPowerOfTwo(height)
		);
		setupColorTexture(this._transmissionRT.texture, options);
		this._transmissionRT.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._transmissionRT.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		this._transmissionCopyPass = new ShaderPostPass(copyShader);

		const transmissionRenderOptions = {
			getMaterial: renderable => {
				const samplerMap = this._transmissionRT.texture;
				renderable.material.uniforms.transmissionSamplerMap = samplerMap;
				renderable.material.uniforms.transmissionSamplerSize[0] = samplerMap.image.width;
				renderable.material.uniforms.transmissionSamplerSize[1] = samplerMap.image.height;
				return renderable.material;
			},
			ifRender: renderable => {
				return renderable.material.shaderName === 'TransmissionPBR';
			}
		};

		this.postRenderLayers = {
			transmission: { id: -1, mask: RenderListMask.ALL, options: transmissionRenderOptions },
			postTransmission: { id: -1, mask: RenderListMask.ALL },
			overlay: { id: 1, mask: RenderListMask.ALL }
		};
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
		if (func) {
			this._sceneRenderOptions.ifRender = func;
		} else {
			delete this._sceneRenderOptions.ifRender;
		}
	}

	setGeometryReplaceFunction(func) {
		if (func) {
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
		const cameraJitter = composer.$cameraJitter;
		const enableCameraJitter = this.enableCameraJitter && cameraJitter.accumulating();

		renderer.setRenderTarget(renderTarget);

		if (composer.clearColor) {
			renderer.setClearColor(...composer._tempClearColor);
		} else {
			renderer.setClearColor(0, 0, 0, 0);
		}

		renderer.clear(this.clearColor, this.clearDepth, this.clearStencil && hasStencil);

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		enableCameraJitter && cameraJitter.jitterProjectionMatrix(renderStates.camera, this._rt.width, this._rt.height);

		this.$renderScene(renderer, renderQueue, renderStates);
		this.$renderTransmission(renderer, renderQueue, renderStates, composer);
		this.$renderPostTransmission(renderer, renderQueue, renderStates);
		this.$renderOverlay(renderer, renderQueue, renderStates);

		enableCameraJitter && cameraJitter.restoreProjectionMatrix(renderStates.camera);

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
		this._transmissionRT.resize(
			MathUtils.nearestPowerOfTwo(width),
			MathUtils.nearestPowerOfTwo(height)
		);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();
		this._mrt.dispose();
		this._transmissionRT.dispose();
		this._transmissionCopyPass.dispose();
	}

	_renderOneLayer(renderer, renderQueue, renderStates, renderLayer) {
		const { id, mask = RenderListMask.ALL, options = this._sceneRenderOptions } = renderLayer;
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

	$renderScene(renderer, renderQueue, renderStates) {
		renderer.beginRender();

		const renderLayers = this.renderLayers;
		for (let i = 0, l = renderLayers.length; i < l; i++) {
			this._renderOneLayer(renderer, renderQueue, renderStates, renderLayers[i]);
		}

		renderer.endRender();
	}

	$renderTransmission(renderer, renderQueue, renderStates, composer) {
		const renderLayer = this.postRenderLayers.transmission;

		if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;

		const oldRenderTarget = renderer.getRenderTarget();
		const oldColorBuffer = oldRenderTarget._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		const useMSAA = oldColorBuffer.isRenderBuffer && oldColorBuffer.multipleSampling > 0;

		let sceneRenderTarget = oldRenderTarget;

		if (useMSAA) {
			sceneRenderTarget = composer._renderTargetCache.allocate(0);

			// blit to single-sampled render target
			renderer.setRenderTarget(sceneRenderTarget);
			renderer.blitRenderTarget(this._mrt, sceneRenderTarget, true, false, false);
		}

		// copy to power-of-two transmissionRT and generate mipmaps
		renderer.setRenderTarget(this._transmissionRT);
		this._transmissionCopyPass.uniforms.tDiffuse = sceneRenderTarget.texture;
		this._transmissionCopyPass.render(renderer);
		renderer.updateRenderTargetMipmap(this._transmissionRT);

		if (useMSAA) {
			composer._renderTargetCache.release(sceneRenderTarget, 0);
		}

		renderer.setRenderTarget(oldRenderTarget);

		renderer.beginRender();
		this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
		renderer.endRender();
	}

	$renderPostTransmission(renderer, renderQueue, renderStates) {
		const renderLayer = this.postRenderLayers.postTransmission;

		if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;

		renderer.beginRender();
		this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
		renderer.endRender();
	}

	$renderOverlay(renderer, renderQueue, renderStates) {
		const renderLayer = this.postRenderLayers.overlay;

		if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;

		// TODO Forcing clear depth may cause bugs
		renderer.clear(false, true, false);

		renderer.beginRender();
		this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
		renderer.endRender();
	}

	$isRenderLayerEmpty(renderQueue, renderLayer) {
		const { id, mask = RenderListMask.ALL } = renderLayer;

		if (id == -1) return true; // ignore invalid layer id

		const layer = renderQueue.getLayer(id);

		if (layer) {
			if (layer.opaqueCount > 0 && (mask & RenderListMask.OPAQUE)) {
				return false;
			}
			if (layer.transparentCount > 0 && (mask & RenderListMask.TRANSPARENT)) {
				return false;
			}
		}

		return true;
	}

}