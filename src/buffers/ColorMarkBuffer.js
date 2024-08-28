import { RenderTarget2D, RenderBuffer, ATTACHMENT, PIXEL_FORMAT, PIXEL_TYPE, DRAW_SIDE, ShaderMaterial, TEXTURE_FILTER } from 't3d';
import { isDepthStencilAttachment, RenderListMask } from '../Utils.js';
import BufferAttachManager from './BufferAttachManager.js';
import Buffer from './Buffer.js';

export default class ColorMarkBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		const bufferMipmaps = options.bufferMipmaps;
		this._rts = [];
		for (let i = 0; i < options.maxColorAttachment; i++) {
			const rt = new RenderTarget2D(width, height);
			rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			rt.texture.type = options.halfFloatMarkBuffer ? PIXEL_TYPE.HALF_FLOAT : PIXEL_TYPE.UNSIGNED_BYTE;
			if (options.halfFloatMarkBuffer == 2) {
				rt.texture.format = PIXEL_FORMAT.RGB;
				rt.texture.internalformat = 35898;
			}
			if (!bufferMipmaps) {
				rt.texture.generateMipmaps = false;
				rt.texture.minFilter = TEXTURE_FILTER.LINEAR;
			}
			this._rts.push(rt);
		}

		this._mrts = [];
		for (let i = 0; i < options.maxColorAttachment; i++) {
			const mrt = new RenderTarget2D(width, height);
			const mrtPixelFormat = options.halfFloatMarkBuffer ? PIXEL_FORMAT.RGBA16F : PIXEL_FORMAT.RGBA8;
			mrt.attach(
				new RenderBuffer(width, height, options.halfFloatMarkBuffer === 2 ? 35898 : mrtPixelFormat, options.samplerNumber),
				ATTACHMENT.COLOR_ATTACHMENT0
			);
			mrt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._mrts.push(mrt);
		}

		const state = { key: null };
		this._state = state;

		const attachManager = new BufferAttachManager(1);

		this._renderOptions = {
			getMaterial: createGetMaterialFunction(undefined, state),
			ifRender: createIfRenderFunction(undefined, state)
		};

		this.attachManager = attachManager;

		this.layers = [0];
	}

	setIfRenderReplaceFunction(func) {
		if (func) {
			this._renderOptions.ifRender = createIfRenderFunction(func, this._state);
		} else {
			this._renderOptions.ifRender = createIfRenderFunction(undefined, this._state);
		}
	}

	setGeometryReplaceFunction(func) {
		if (func) {
			this._renderOptions.getGeometry = func;
		} else {
			delete this._renderOptions.getGeometry;
		}
	}

	setMaterialReplaceFunction(func) {
		if (func) {
			this._renderOptions.getMaterial = createGetMaterialFunction(func, this._state);
		} else {
			this._renderOptions.getMaterial = createGetMaterialFunction(undefined, this._state);
		}
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

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const attachCount = this.attachManager.attachCount();

		if (attachCount > this._rts.length) {
			console.error('ColorMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxColorAttachment<' + this._rts.length + '>.');
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

			const renderOptions = this._renderOptions;
			const attachManager = this.attachManager;

			const renderStates = scene.getRenderStates(camera);
			const renderQueue = scene.getRenderQueue(camera);

			this._state.key = attachManager.getKey(attachIndex, 0);
			const mask = attachManager.getMask(attachIndex, 0);

			renderer.beginRender();

			const layers = this.layers;
			for (let i = 0, l = layers.length; i < l; i++) {
				const renderQueueLayer = renderQueue.getLayer(layers[i]);

				if (mask & RenderListMask.OPAQUE) {
					renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, renderOptions);
				}

				if (mask & RenderListMask.TRANSPARENT) {
					renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, renderOptions);
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

function createIfRenderFunction(func = defaultIfRenderReplaceFunction, state) {
	return function(renderable) {
		if (!func(renderable)) {
			return false;
		}

		if (!renderable.object.effects) {
			return false;
		}

		if (renderable.object.effects[state.key]) {
			return true;
		}

		return false;
	};
}

function defaultIfRenderReplaceFunction(renderable) {
	return true;
}

function createGetMaterialFunction(func = defaultMaterialReplaceFunction, state) {
	return function(renderable) {
		const material = func(renderable);
		// material.side = renderable.material.side;
		material.side = DRAW_SIDE.DOUBLE;

		material.uniforms.strength = renderable.object.effects[state.key] || 0;

		return material;
	};
}

const materialMap = new Map();

// TODO dispose
function defaultMaterialReplaceFunction(renderable) {
	const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
	const morphTargets = !!renderable.object.morphTargetInfluences;
	const drawMode = renderable.material.drawMode;
	const useDiffuseMap = !!renderable.material.diffuseMap;

	const key = useSkinning + '_' + morphTargets + '_' + drawMode + '' + useDiffuseMap;

	let result;

	if (materialMap.has(key)) {
		result = materialMap.get(key);
	} else {
		result = new ShaderMaterial(colorShader);
		result.premultipliedAlpha = false; // multiply alpha in shader
		result.drawMode = drawMode;
		materialMap.set(key, result);
	}

	result.transparent = renderable.material.transparent;
	result.blending = renderable.material.blending;
	result.opacity = renderable.material.opacity;
	result.diffuse.copy(renderable.material.diffuse);
	result.diffuseMap = renderable.material.diffuseMap;

	return result;
}

const colorShader = {
	name: 'ec_color',
	defines: {},
	uniforms: {
		strength: 1
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

		uniform float strength;

        void main() {
			#include <logdepthbuf_frag>

			vec4 outColor = vec4(u_Color, u_Opacity);

			#ifdef USE_DIFFUSE_MAP
				outColor *= texture2D(diffuseMap, v_Uv);
			#endif

			#ifdef ALPHATEST
				if(outColor.a < ALPHATEST) discard;
			#endif

			outColor.a *= strength;

            gl_FragColor = outColor;
        }
    `
};