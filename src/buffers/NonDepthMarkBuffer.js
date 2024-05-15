import { RenderTarget2D, RenderBuffer, ATTACHMENT, PIXEL_FORMAT, DRAW_SIDE, BLEND_TYPE, ShaderMaterial, TEXTURE_FILTER, PIXEL_TYPE } from 't3d';
import BufferAttachManager from './BufferAttachManager.js';
import { RenderListMask } from '../Utils.js';
import Buffer from './Buffer.js';

export default class NonDepthMarkBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		const bufferMipmaps = options.bufferMipmaps;
		this._rts = [];
		for (let i = 0; i < options.maxMarkAttachment; i++) {
			const rt = new RenderTarget2D(width, height);
			rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			rt.texture.type = options.highDynamicRange ? PIXEL_TYPE.HALF_FLOAT : PIXEL_TYPE.UNSIGNED_BYTE;
			if (!bufferMipmaps) {
				rt.texture.generateMipmaps = false;
				rt.texture.minFilter = TEXTURE_FILTER.LINEAR;
			}
			this._rts.push(rt);
		}

		this._mrts = [];
		for (let i = 0; i < options.maxMarkAttachment; i++) {
			const mrt = new RenderTarget2D(width, height);
			mrt.attach(
				new RenderBuffer(width, height, options.highDynamicRange ? PIXEL_FORMAT.RGBA16F : PIXEL_FORMAT.RGBA8, options.samplerNumber),
				ATTACHMENT.COLOR_ATTACHMENT0
			);
			mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._mrts.push(mrt);
		}

		this._state = { attachIndex: 0, attachInfo: { count: 0, keys: [], masks: [] } };

		const attachManager = new BufferAttachManager(4);

		this._opacityRenderOptions = {
			getMaterial: createGetMaterialFunction(undefined, this._state, attachManager, RenderListMask.OPAQUE),
			ifRender: createIfRenderFunction(undefined, this._state, RenderListMask.OPAQUE)
		};

		this._transparentRenderOptions = {
			getMaterial: createGetMaterialFunction(undefined, this._state, attachManager, RenderListMask.TRANSPARENT),
			ifRender: createIfRenderFunction(undefined, this._state, RenderListMask.TRANSPARENT)
		};

		this.attachManager = attachManager;

		this.layers = [0];
	}

	setIfRenderReplaceFunction(func) {
		if (func) {
			this._opacityRenderOptions.ifRender = createIfRenderFunction(func, this._state, RenderListMask.OPAQUE);
			this._transparentRenderOptions.ifRender = createIfRenderFunction(func, this._state, RenderListMask.TRANSPARENT);
		} else {
			this._opacityRenderOptions.ifRender = createIfRenderFunction(undefined, this._state, RenderListMask.OPAQUE);
			this._transparentRenderOptions.ifRender = createIfRenderFunction(undefined, this._state, RenderListMask.TRANSPARENT);
		}
	}

	setGeometryReplaceFunction(func) {
		if (func) {
			this._opacityRenderOptions.getGeometry = func;
			this._transparentRenderOptions.getGeometry = func;
		} else {
			delete this._opacityRenderOptions.getGeometry;
			delete this._transparentRenderOptions.getGeometry;
		}
	}

	setMaterialReplaceFunction(func) {
		if (func) {
			this._opacityRenderOptions.getMaterial = createGetMaterialFunction(func, this._state, this.attachManager, RenderListMask.OPAQUE);
			this._transparentRenderOptions.getMaterial = createGetMaterialFunction(func, this._state, this.attachManager, RenderListMask.TRANSPARENT);
		} else {
			this._opacityRenderOptions.getMaterial = createGetMaterialFunction(undefined, this._state, this.attachManager, RenderListMask.OPAQUE);
			this._transparentRenderOptions.getMaterial = createGetMaterialFunction(undefined, this._state, this.attachManager, RenderListMask.TRANSPARENT);
		}
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const attachCount = this.attachManager.attachCount();

		if (attachCount > this._rts.length) {
			console.error('XXMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxMarkAttachment<' + this._rts.length + '>.');
		}

		for (let attachIndex = 0; attachIndex < attachCount; attachIndex++) {
			const rt = this._rts[attachIndex];
			const mrt = this._mrts[attachIndex];

			if (composer.$useMSAA) {
				renderer.setRenderTarget(mrt);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, false, false);
			} else {
				renderer.setRenderTarget(rt);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, false, false);
			}

			const renderStates = scene.getRenderStates(camera);
			const renderQueue = scene.getRenderQueue(camera);

			this._state.attachIndex = attachIndex;
			this.attachManager.getAttachInfo(attachIndex, this._state.attachInfo);

			let attachMask = 0;
			const attachMasks = this._state.attachInfo.masks, maskLength = this._state.attachInfo.count;
			for (let i = 0; i < maskLength; i++) {
				attachMask |= attachMasks[i];
			}

			renderer.beginRender();

			const layers = this.layers;
			for (let i = 0, l = layers.length; i < l; i++) {
				const renderQueueLayer = renderQueue.getLayer(layers[i]);

				if (attachMask & RenderListMask.OPAQUE) {
					renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._opacityRenderOptions);
				}

				if (attachMask & RenderListMask.TRANSPARENT) {
					renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._transparentRenderOptions);
				}
			}

			renderer.endRender();

			if (composer.$useMSAA) {
				renderer.setRenderTarget(rt);
				renderer.blitRenderTarget(mrt, rt, true, false, false);
			}

			// generate mipmaps for down sampler
			renderer.updateRenderTargetMipmap(rt);
		}
	}

	output(attachIndex = 0) {
		return this._rts[attachIndex];
	}

	resize(width, height) {
		super.resize(width, height);
		this._rts.forEach(rt => rt.resize(width, height));
		this._mrts.forEach(mrt => mrt.resize(width, height));
	}

	dispose() {
		super.dispose();
		this._rts.forEach(rt => rt.dispose());
		this._mrts.forEach(mrt => mrt.dispose());
	}

}

function createIfRenderFunction(func = defaultIfRenderReplaceFunction, state, renderMask) {
	return function(renderable) {
		if (!func(renderable)) {
			return false;
		}

		if (!renderable.object.effects) {
			return false;
		}

		let mask = 0;

		for (let i = 0; i < state.attachInfo.count; i++) {
			const key = state.attachInfo.keys[i];
			if (renderable.object.effects[key]) {
				mask |= state.attachInfo.masks[i];
			}
		}

		return mask & renderMask;
	};
}

function defaultIfRenderReplaceFunction(renderable) {
	return true;
}

function createGetMaterialFunction(func = defaultMaterialReplaceFunction, state, attachManager, renderMask) {
	return function(renderable) {
		const material = func(renderable);
		// material.side = renderable.material.side; TODO
		material.side = DRAW_SIDE.DOUBLE;

		for (let channelIndex = 0; channelIndex < 4; channelIndex++) {
			const key = attachManager.getKey(state.attachIndex, channelIndex);
			const mask = attachManager.getMask(state.attachIndex, channelIndex);
			if (mask & renderMask) {
				material.uniforms.mColor[channelIndex] = renderable.object.effects[key] || 0;
			} else {
				material.uniforms.mColor[channelIndex] = 0;
			}
		}

		return material;
	};
}

const materialMap = new Map();

// TODO dispose
function defaultMaterialReplaceFunction(renderable) {
	const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
	const morphTargets = !!renderable.object.morphTargetInfluences;
	const drawMode = renderable.material.drawMode;

	const key = useSkinning + '_' + morphTargets + '_' + drawMode;

	let result;

	if (materialMap.has(key)) {
		result = materialMap.get(key);
	} else {
		result = new ShaderMaterial(markShader);
		result.premultipliedAlpha = true;
		result.transparent = true;
		result.blending = BLEND_TYPE.ADD;
		result.drawMode = drawMode;
		materialMap.set(key, result);
	}

	return result;
}

const markShader = {
	name: 'ec_mark',
	defines: {},
	uniforms: {
		mColor: [1, 1, 1, 1]
	},
	vertexShader: `
        #include <common_vert>
        #include <morphtarget_pars_vert>
        #include <skinning_pars_vert>
        #include <uv_pars_vert>
		#include <logdepthbuf_pars_vert>
        void main() {
        	#include <uv_vert>
        	#include <begin_vert>
        	#include <morphtarget_vert>
        	#include <skinning_vert>
        	#include <pvm_vert>
			#include <logdepthbuf_vert>
        }
    `,
	fragmentShader: `
        #include <common_frag>
        #include <diffuseMap_pars_frag>

        #include <uv_pars_frag>

		#include <logdepthbuf_pars_frag>

		uniform vec4 mColor;

        void main() {
			#include <logdepthbuf_frag>
			
            #if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)
                vec4 texelColor = texture2D(diffuseMap, v_Uv);
                float alpha = texelColor.a * u_Opacity;
                if(alpha < ALPHATEST) discard;
            #endif

            gl_FragColor = mColor;
        }
    `
};