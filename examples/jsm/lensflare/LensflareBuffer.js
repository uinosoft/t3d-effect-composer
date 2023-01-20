import { RenderTarget2D, TEXTURE_FILTER, ATTACHMENT, Vector3 } from 't3d';
import { isDepthStencilAttachment, Buffer } from 't3d-effect-composer';

export class LensflareBuffer extends Buffer {

	constructor(width, height) {
		super(width, height);

		this._occlusionRenderTarget = new RenderTarget2D(width, height);
		this._occlusionRenderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._occlusionRenderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._occlusionRenderTarget.texture.generateMipmaps = false;

		this.lensflareInfos = [];
	}

	syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
		const renderTarget = this._occlusionRenderTarget;

		renderTarget.dispose();

		if (isDepthStencilAttachment(depthAttachment)) {
			renderTarget.attach(depthAttachment, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			renderTarget.detach(ATTACHMENT.DEPTH_ATTACHMENT);
		} else {
			renderTarget.attach(depthAttachment, ATTACHMENT.DEPTH_ATTACHMENT);
			renderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		}

		this.needsUpdate = true;
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		const renderQueueLayer = renderQueue.getLayer(5);

		if (!renderQueueLayer) return;

		renderer.renderPass.setRenderTarget(this._occlusionRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, false, false);

		const aspect = this._occlusionRenderTarget.height / this._occlusionRenderTarget.width;

		this.lensflareInfos.length = 0;

		renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, {
			beforeRender: renderable => {
				const { object, material } = renderable;
				screenPosition.setFromMatrixPosition(object.worldMatrix).applyMatrix4(camera.viewMatrix).applyMatrix4(camera.projectionMatrix);
				screenPosition.toArray(material.uniforms.screenPosition);
				material.uniforms.scale[0] = material.uniforms.scale[1] * aspect; // fix aspect

				this.lensflareInfos.push({
					screenX: screenPosition.x,
					screenY: screenPosition.y,
					scaleX: material.uniforms.scale[0],
					scaleY: material.uniforms.scale[1],
					elements: object.lensflareElements
				});
			}
		});
	}

	output() {
		return this._occlusionRenderTarget;
	}

	resize(width, height) {
		super.resize(width, height);
		this._occlusionRenderTarget.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._occlusionRenderTarget.dispose();
	}

}

const screenPosition = new Vector3();