import { Vector2, Texture2D, RenderBuffer, PIXEL_FORMAT, ShaderPostPass, TEXTURE_FILTER } from 't3d';
import GBuffer from './buffers/GBuffer.js';
import NonDepthMarkBuffer from './buffers/NonDepthMarkBuffer.js';
import MarkBuffer from './buffers/MarkBuffer.js';
import ColorMarkBuffer from './buffers/ColorMarkBuffer.js';
import SceneBuffer from './buffers/SceneBuffer.js';
import RenderTargetCache from './RenderTargetCache.js';
import { copyShader, isDepthStencilAttachment } from './Utils.js';

export default class EffectComposer {

	/**
	 * @param {Number} width - The width of the actual rendering size.
	 * @param {Number} height - The height of the actual rendering size.
	 * @param {Object} [options={}]
	 * @param {Boolean} [options.webgl2=false] - Whether to support WebGL2 features. Turning on will improve the storage accuracy of GBuffer.
	 * @param {Boolean} [options.bufferMipmaps=false] - Whether to generate mipmaps for buffers.
	 * @param {Boolean} [options.floatColorBuffer=false] - Whether to support the EXT_color_buffer_float feature. Turning on will improve the storage accuracy of GBuffer.
	 * @param {Number} [options.samplerNumber=8] - MSAA sampling multiple.
	 * @param {Number} [options.maxMarkAttachment=5] - Maximum number of mark attachments. Means that it supports up to N*4 effects that need to be marked.
	 * @param {Number} [options.maxColorAttachment=5] - Maximum number of color buffer attachments.
	 */
	constructor(width, height, options = {}) {
		this._size = new Vector2(width, height);

		options.webgl2 = options.webgl2 || false;
		options.bufferMipmaps = options.bufferMipmaps || false;
		options.floatColorBuffer = options.floatColorBuffer || false;
		options.samplerNumber = options.samplerNumber || 8;
		options.maxMarkAttachment = options.maxMarkAttachment || 5;
		options.maxColorAttachment = options.maxColorAttachment || 5;

		// Create buffers

		const sceneBuffer = new SceneBuffer(width, height, options);
		const gBuffer = new GBuffer(width, height, options);
		const nonDepthMarkBuffer = new NonDepthMarkBuffer(width, height, options);
		const markBuffer = new MarkBuffer(width, height, options);
		const colorMarkBuffer = new ColorMarkBuffer(width, height, options);

		this._bufferMap = new Map([
			['SceneBuffer', sceneBuffer],
			['GBuffer', gBuffer],
			['NonDepthMarkBuffer', nonDepthMarkBuffer],
			['MarkBuffer', markBuffer],
			['ColorMarkBuffer', colorMarkBuffer]
		]);

		// Create default attachments.
		// In order to blending with external rendering results, Users may switch the attachments of sceneBuffer and markBuffer through the setExternalAttachment() method.
		// Default ColorTexture and MSColorRenderBuffer are prepared for color attachment of sceneBuffer.
		// Default DepthRenderBuffer and MSDepthRenderBuffer are prepared for depth attachements of sceneBuffer and markBuffer.
		// Noticed that sceneBuffer and markBuffer are sharing the same DepthRenderBuffer MSDepthRenderBuffer.

		this._defaultColorTexture = new Texture2D();
		this._defaultMSColorRenderBuffer = new RenderBuffer(width, height, PIXEL_FORMAT.RGBA8, options.samplerNumber);
		if (!options.bufferMipmaps) {
			this._defaultColorTexture.generateMipmaps = false;
			this._defaultColorTexture.minFilter = TEXTURE_FILTER.LINEAR;
		}

		this._defaultDepthRenderBuffer = new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH_COMPONENT16);
		this._defaultMSDepthRenderBuffer = new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH_COMPONENT16, options.samplerNumber);

		this._defaultDepthStencilRenderBuffer = new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH_STENCIL);
		this._defaultMSDepthStencilRenderBuffer = new RenderBuffer(width, height, PIXEL_FORMAT.DEPTH24_STENCIL8, options.samplerNumber);

		this._externalColorAttachment = null;
		this._externalDepthAttachment = null;

		this._samplerNumber = options.samplerNumber;
		this._externalMSAA = null;
		this._stencilBuffer = false;

		this._syncAttachments();

		//

		this._copyPass = new ShaderPostPass(copyShader);
		this._copyPass.material.premultipliedAlpha = true;

		this._renderTargetCache = new RenderTargetCache(width, height);

		this._effectList = [];

		this._tempClearColor = [0, 0, 0, 1];
		this._tempViewport = [0, 0, 1, 1];
		this._tempBufferNames = new Set();

		this._stats = {
			fboCache: 0,
			markBuffers: 0,
			colorMarkBuffers: 0,
			currentBufferUsage: {}
		};

		// Public properties

		/**
		 * Whether to use msaa.
		 * @type {Boolean}
		 * @default false
		 */
		this.sceneMSAA = false;

		/**
		 * Whether to clear the color buffer before renderring.
		 * @type {Boolean}
		 * @default true
		 */
		this.clearColor = true;

		/**
		 * Whether to clear the depth buffer before renderring.
		 * @type {Boolean}
		 * @default true
		 */
		this.clearDepth = true;

		/**
		 * Whether to clear the stencil buffer before renderring.
		 * @type {Boolean}
		 * @default false
		 */
		this.clearStencil = false;

		/**
		 * The debugger for this effect composer
		 * @type {Null|Debugger}
		 * @default null
		 */
		this.debugger = null;
	}

	/**
	 * Get the base resolution of effect-composer, which is the same as the width and height set by resize().
	 * @return {t3d.Vector2}
	 */
	getSize() {
		return this._size;
	}

	_syncAttachments() {
		const externalColorAttachment = this._externalColorAttachment;
		const externalDepthAttachment = this._externalDepthAttachment;

		const external = !!externalColorAttachment && !!externalDepthAttachment;

		const externalMSAA = this._externalMSAA;

		let stencilBuffer = this._stencilBuffer;
		if (external) {
			stencilBuffer = isDepthStencilAttachment(externalDepthAttachment);
		}

		const defaultDepthRenderBuffer = stencilBuffer ? this._defaultDepthStencilRenderBuffer : this._defaultDepthRenderBuffer;
		const defaultMSDepthRenderBuffer = stencilBuffer ? this._defaultMSDepthStencilRenderBuffer : this._defaultMSDepthRenderBuffer;

		let sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment, depthAttachment, mDepthAttachment;

		if (external) {
			if (externalMSAA) {
				sceneColorAttachment = this._defaultColorTexture;
				sceneDepthAttachment = defaultDepthRenderBuffer;
				sceneMColorAttachment = externalColorAttachment;
				sceneMDepthAttachment = externalDepthAttachment;
				depthAttachment = defaultDepthRenderBuffer;
				mDepthAttachment = externalDepthAttachment;
			} else {
				sceneColorAttachment = externalColorAttachment;
				sceneDepthAttachment = externalDepthAttachment;
				sceneMColorAttachment = this._defaultMSColorRenderBuffer;
				sceneMDepthAttachment = defaultMSDepthRenderBuffer;
				depthAttachment = externalDepthAttachment;
				mDepthAttachment = defaultMSDepthRenderBuffer;
			}
		} else {
			sceneColorAttachment = this._defaultColorTexture;
			sceneDepthAttachment = defaultDepthRenderBuffer;
			sceneMColorAttachment = this._defaultMSColorRenderBuffer;
			sceneMDepthAttachment = defaultMSDepthRenderBuffer;
			depthAttachment = defaultDepthRenderBuffer;
			mDepthAttachment = defaultMSDepthRenderBuffer;
		}

		this._bufferMap.forEach(buffer => {
			if (!!buffer.syncAttachments) {
				buffer.syncAttachments(sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment);
			} else if (!!buffer.syncDepthAttachments) {
				buffer.syncDepthAttachments(depthAttachment, mDepthAttachment);
			}
		});
	}

	set stencilBuffer(value) {
		this._stencilBuffer = value;
		this._syncAttachments();
	}

	get stencilBuffer() {
		return this._stencilBuffer;
	}

	/**
	 * Set external attachments to blending with other rendering results.
	 * If this is set, the setting of sceneMSAA will be invalid, whether to use msaa depends on the external input attachments.
	 * @param {t3d.TextureBase|t3d.RenderBuffer} colorAttachment - The color attachment for scene buffer. Non-multisampled RenderBuffer is not supported for now.
	 * @param {t3d.RenderBuffer} depthAttachment - The depth attachment for scene buffer and mark buffer (They are sharing the same depth attachments).
	 */
	setExternalAttachment(colorAttachment, depthAttachment) {
		const colorMultipleSampling = getMultipleSampling(colorAttachment);
		const depthMultipleSampling = getMultipleSampling(depthAttachment);

		if (colorMultipleSampling !== depthMultipleSampling) {
			console.warn('EffectComposer.setExternalAttachment: color and depth attachment MultipleSampling not match.');
			return;
		}

		this._externalColorAttachment = colorAttachment;
		this._externalDepthAttachment = depthAttachment;

		this._externalMSAA = colorMultipleSampling > 0;

		this._syncAttachments();
	}

	/**
	 * Clear the external attachments setted by setExternalAttachment
	 */
	clearExternalAttachment() {
		this._externalColorAttachment = null;
		this._externalDepthAttachment = null;

		this._externalMSAA = null;

		this._syncAttachments();
	}

	addBuffer(name, buffer) {
		this._bufferMap.set(name, buffer);
	}

	removeBuffer(name) {
		this._bufferMap.delete(name);
	}

	getBuffer(name) {
		return this._bufferMap.get(name);
	}

	addEffect(name, effect, order = 0) {
		if (this.getEffect(name)) {
			console.warn('');
			return;
		}
		effect.name = name;
		this._effectList.push({ name, effect, order });
		effect.resize(this._size.x, this._size.y);
	}

	removeEffect(name) {
		const index = this._effectList.findIndex(item => item.name === name);
		if (index > -1) {
			this._effectList.splice(index, 1);
		}
	}

	getEffect(name) {
		const target = this._effectList.find(item => item.name === name);
		if (target) {
			return target.effect;
		} else {
			return null;
		}
	}

	render(renderer, scene, camera, target) {
		const renderStates = scene.getRenderStates(camera);
		renderer.getClearColor().toArray(this._tempClearColor); // save clear color
		camera.rect.toArray(this._tempViewport);
		camera.rect.set(0, 0, 1, 1);
		renderStates.camera.rect.set(0, 0, 1, 1);

		this._bufferMap.forEach(buffer => {
			if (!!buffer.attachManager) {
				buffer.attachManager.reset();
			}
		});

		if (this.debugger) {
			this.debugger.bufferDependencies.forEach(name => {
				const buffer = this._bufferMap.get(name);
				if (this.debugger.channel && !!buffer.attachManager) {
					buffer.attachManager.allocate(this.debugger.channel, this.debugger.mask);
				}
				buffer.render(renderer, this, scene, camera);
			});

			this.debugger.render(renderer, this, target);

			renderer.setClearColor(...this._tempClearColor); // restore clear color

			return;
		}

		this._effectList.sort(sortByReverseOrder);

		let lastActiveIndex = this._effectList.findIndex(item => item.effect.active);
		const postEffectEnable = lastActiveIndex > -1;

		this._tempBufferNames.clear();

		if (postEffectEnable) {
			this._tempBufferNames.add('SceneBuffer'); // Insert SceneBuffer first

			this._effectList.forEach(item => {
				if (item.effect.active) {
					item.effect.bufferDependencies.forEach(({ key, mask }) => {
						this._tempBufferNames.add(key);
						if (!!this._bufferMap.get(key).attachManager) {
							this._bufferMap.get(key).attachManager.allocate(item.name, mask);
						}
					});
				}
			});

			this._tempBufferNames.forEach(name => {
				this._bufferMap.get(name).render(renderer, this, scene, camera);
			});

			let inputRT = this._renderTargetCache.allocate();
			let outputRT = this._renderTargetCache.allocate();
			let tempRT;

			this._effectList.sort(sortByOrder);
			const len = this._effectList.length;
			const firstActiveIndex = this._effectList.findIndex(item => item.effect.active);
			lastActiveIndex = len - 1 - lastActiveIndex;

			this._effectList.forEach((item, index) => {
				if (!item.effect.active) return;

				const notLast = index < lastActiveIndex;

				item.effect.render(
					renderer,
					this,
					index === firstActiveIndex ? this._bufferMap.get('SceneBuffer').output() : inputRT,
					notLast ? outputRT : target,
					!notLast
				);

				// swap render target
				tempRT = inputRT;
				inputRT = outputRT;
				outputRT = tempRT;
			});

			this._renderTargetCache.release(inputRT);
			this._renderTargetCache.release(outputRT);
		} else if (!!this._externalColorAttachment && !!this._externalDepthAttachment) {
			const sceneBuffer = this._bufferMap.get('SceneBuffer');
			sceneBuffer.render(renderer, this, scene, camera);

			renderer.setRenderTarget(target);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(this.clearColor, this.clearDepth, this.clearStencil);

			const copyPass = this._copyPass;
			copyPass.uniforms.tDiffuse = sceneBuffer.output().texture;
			copyPass.material.transparent = this._tempClearColor[3] < 1 || !this.clearColor;
			copyPass.renderStates.camera.rect.fromArray(this._tempViewport);
			copyPass.render(renderer);
		} else {
			renderer.setRenderTarget(target);
			renderer.setClearColor(...this._tempClearColor);
			renderer.clear(this.clearColor, this.clearDepth, this.clearStencil);
			renderStates.camera.rect.fromArray(this._tempViewport);

			const renderQueue = scene.getRenderQueue(camera);

			const sceneBuffer = this._bufferMap.get('SceneBuffer');
			sceneBuffer.$renderScene(renderer, renderQueue, renderStates);
		}

		renderer.setClearColor(...this._tempClearColor); // restore clear color
		camera.rect.fromArray(this._tempViewport);
		renderStates.camera.rect.fromArray(this._tempViewport);
	}

	getStats() {
		this._renderTargetCache.updateStats(this._stats);
		const count1 = this.getBuffer('MarkBuffer').attachManager.attachCount();
		const count2 = this.getBuffer('NonDepthMarkBuffer').attachManager.attachCount();
		const count3 = this.getBuffer('ColorMarkBuffer').attachManager.attachCount();
		this._stats.markBuffers = count1 + count2;
		this._stats.colorMarkBuffers = count3;

		for (const [key, value] of this._bufferMap) {
			if (value.attachManager) {
				continue;
			}
			this._stats.currentBufferUsage[key] = this._tempBufferNames.has(key) ? 1 : 0;
		}

		return this._stats;
	}

	resize(width, height) {
		this._size.set(width, height);

		this._bufferMap.forEach(buffer => buffer.resize(width, height));

		this._renderTargetCache.resize(width, height);

		this._effectList.forEach(item => item.effect.resize(width, height));
	}

	dispose() {
		this._bufferMap.forEach(buffer => buffer.dispose());

		this._renderTargetCache.dispose();

		this._effectList.forEach(item => item.effect.dispose());

		this._copyPass.dispose();
	}

	// Protected methods

	get $useMSAA() {
		return ((this._externalMSAA !== null) ? this._externalMSAA : this.sceneMSAA) && (this._samplerNumber > 1);
	}

}

function sortByOrder(a, b) {
	return a.order - b.order;
}

function sortByReverseOrder(a, b) {
	return b.order - a.order;
}

function getMultipleSampling(attachment) {
	return attachment.isTexture ? 0 : attachment.multipleSampling;
}