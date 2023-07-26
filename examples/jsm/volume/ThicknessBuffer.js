import { RenderTarget2D, PIXEL_TYPE, TEXTURE_FILTER, ShaderMaterial, DRAW_SIDE } from 't3d';
import { Buffer } from 't3d-effect-composer';

export default class ThicknessBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this._frontDepthRenderTarget = new RenderTarget2D(width, height);
		this._frontDepthRenderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._frontDepthRenderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._frontDepthRenderTarget.texture.generateMipmaps = false;

		if (options.floatColorBuffer) {
			this._frontDepthRenderTarget.texture.type = PIXEL_TYPE.FLOAT;
		} else {
			this._frontDepthRenderTarget.texture.type = PIXEL_TYPE.HALF_FLOAT;
		}

		this._backDepthRenderTarget = new RenderTarget2D(width, height);
		this._backDepthRenderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._backDepthRenderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._backDepthRenderTarget.texture.generateMipmaps = false;

		if (options.floatColorBuffer) {
			this._backDepthRenderTarget.texture.type = PIXEL_TYPE.FLOAT;
		} else {
			this._backDepthRenderTarget.texture.type = PIXEL_TYPE.HALF_FLOAT;
		}

		this._output = [this._frontDepthRenderTarget, this._backDepthRenderTarget];

		this._frontMaterial = new ShaderMaterial(thicknessShader);
		this._frontMaterial.side = DRAW_SIDE.FRONT;
		this._backMaterial = new ShaderMaterial(thicknessShader);
		this._backMaterial.side = DRAW_SIDE.BACK;

		const that = this;

		this._frontRenderOptions = {
			ifRender: defaultIfRenderFunction,
			getMaterial: function(renderable) {
				that._frontMaterial.uniforms.volumeid = renderable.object.effects.volume;
				return that._frontMaterial;
			}
		};

		this._backRenderOptions = {
			ifRender: defaultIfRenderFunction,
			getMaterial: function(renderable) {
				that._backMaterial.uniforms.volumeid = renderable.object.effects.volume;
				return that._backMaterial;
			}
		};

		this.layers = [0];
	}

	setGeometryReplaceFunction(func) {
		if (!!func) {
			this._frontRenderOptions.getGeometry = func;
			this._backRenderOptions.getGeometry = func;
		} else {
			delete this._frontRenderOptions.getGeometry;
			delete this._backRenderOptions.getGeometry;
		}
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		renderer.renderPass.setRenderTarget(this._frontDepthRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);

		let layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._frontRenderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._frontRenderOptions);
		}

		renderer.renderPass.setRenderTarget(this._backDepthRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, false);

		layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._backRenderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._backRenderOptions);
		}
	}

	output() {
		return this._output;
	}

	resize(width, height) {
		super.resize(width, height);
		this._frontDepthRenderTarget.resize(width, height);
		this._backDepthRenderTarget.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._frontDepthRenderTarget.dispose();
		this._backDepthRenderTarget.dispose();
	}

}

function defaultIfRenderFunction(renderable) {
	if (!renderable.object.effects) {
		return false;
	}

	if (!!renderable.object.effects['volume']) {
		return true;
	}

	return false;
}

const thicknessShader = {
	name: 'ec_thickness',
	uniforms: {
		volumeid: 0,
	},
	vertexShader: `
        #include <common_vert>
        #include <morphtarget_pars_vert>
        #include <skinning_pars_vert>
        #include <normal_pars_vert>
        #include <uv_pars_vert>
		#include <logdepthbuf_pars_vert>
        void main() {
        	#include <uv_vert>
        	#include <begin_vert>
        	#include <morphtarget_vert>
        	#include <morphnormal_vert>
        	#include <pvm_vert>
			#include <logdepthbuf_vert>
        }
    `,
	fragmentShader: `
        #include <common_frag>
        #include <uv_pars_frag>

        #include <packing>
        #include <normal_pars_frag>

        uniform float volumeid;

		#include <logdepthbuf_pars_frag>

        void main() {
			#include <logdepthbuf_frag>
			float depth = gl_FragCoord.z;
            gl_FragColor = vec4(depth, volumeid, 0., 1.);
        }
    `
};