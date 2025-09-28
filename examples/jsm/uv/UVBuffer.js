import { OffscreenRenderTarget, TEXTURE_FILTER, ShaderMaterial } from 't3d';
import { Buffer } from 't3d-effect-composer';

export class UVBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._rt = OffscreenRenderTarget.create2D(width, height);
		this._rt.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.generateMipmaps = false;

		this._uvMaterialCache = new UVMaterialCache();

		this._uvCheckTexture = options.uvCheckTexture;

		this._renderOptions = {
			getMaterial: renderable => {
				const material = this._uvMaterialCache.getUvMaterial(renderable);
				material.uniforms.checkMap = this._uvCheckTexture;
				material.side = renderable.material.side;

				return material;
			},
			ifRender: renderable => {
				return !!renderable.geometry.getAttribute('a_Uv');
			}
		};

		this.layers = [0];
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		this._rt.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);

		renderer.beginRender(this._rt);

		const layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._renderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._renderOptions);
		}

		renderer.endRender();
	}

	output() {
		return this._rt;
	}

	resize(width, height) {
		super.resize(width, height);
		this._rt.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();
	}

}

class UVMaterialCache {

	constructor() {
		this._map = new Map();
		this._weakMap = new WeakMap();
	}

	getUvMaterial(renderable) {
		let materialRef = this._weakMap.get(renderable.material);

		if (!materialRef) {
			const { material, object } = renderable;

			const useSkinning = object.isSkinnedMesh && object.skeleton;
			const morphTargets = !!object.morphTargetInfluences;

			let maxBones = 0;
			if (useSkinning) {
				if (object.skeleton.boneTexture) {
					maxBones = 1024;
				} else {
					maxBones = object.skeleton.bones.length;
				}
			}

			const code = useSkinning +
                '_' + maxBones +
                '_' + morphTargets;

			materialRef = this._map.get(code);
			if (!materialRef) {
				const _material = new ShaderMaterial(uvShader);

				materialRef = { refCount: 0, material: _material };
				this._map.set(code, materialRef);
			}

			this._weakMap.set(material, materialRef);
			materialRef.refCount++;

			function onDispose() {
				material.removeEventListener('dispose', onDispose);

				this._weakMap.delete(material);
				materialRef.refCount--;

				if (materialRef.refCount <= 0) {
					this._map.delete(code);
				}
			}
			material.addEventListener('dispose', onDispose);
		}

		return materialRef.material;
	}

}

const uvShader = {
	name: 'uv_shader',
	defines: {},
	uniforms: {
		checkMap: null
	},
	vertexShader: `
        #include <common_vert>
        #include <morphtarget_pars_vert>
        #include <skinning_pars_vert>
        
        uniform mat3 uvTransform;
        attribute vec2 a_Uv;
        varying vec2 v_Uv;

		#include <logdepthbuf_pars_vert>
        void main() {
        	v_Uv = (uvTransform * vec3(a_Uv, 1.)).xy;
        	#include <begin_vert>
        	#include <morphtarget_vert>
        	#include <skinning_vert>
        	#include <pvm_vert>
			#include <logdepthbuf_vert>
        }
    `,
	fragmentShader: `
        #include <common_frag>

        varying vec2 v_Uv;

		#include <logdepthbuf_pars_frag>

		uniform sampler2D checkMap;

        void main() {
			#include <logdepthbuf_frag>

            vec4 color = texture2D(checkMap, v_Uv);

            gl_FragColor = vec4(color.rgb, 1.);
        }
    `
};