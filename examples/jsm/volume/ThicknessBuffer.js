import { RenderTarget2D, PIXEL_TYPE, TEXTURE_FILTER, ShaderMaterial, DRAW_SIDE, COMPARE_FUNC, PIXEL_FORMAT, ATTACHMENT, Texture2D } from 't3d';
import { Buffer } from 't3d-effect-composer';

export default class ThicknessBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		const output = [];
		for (let face = 0; face < 2; face++) {
			const depthTexture = new Texture2D();
			depthTexture.image = { data: null, width: width, height: height };
			depthTexture.type = PIXEL_TYPE.UNSIGNED_INT;
			depthTexture.format = PIXEL_FORMAT.DEPTH_COMPONENT;
			depthTexture.magFilter = TEXTURE_FILTER.NEAREST;
			depthTexture.minFilter = TEXTURE_FILTER.NEAREST;
			depthTexture.generateMipmaps = false;
			depthTexture.flipY = false;

			const renderTarget = new RenderTarget2D(width, height);
			renderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
			renderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;
			renderTarget.texture.generateMipmaps = false;
			renderTarget.texture.type = PIXEL_TYPE.UNSIGNED_BYTE;
			renderTarget.texture.format = options.webgl2 ? PIXEL_FORMAT.RG : PIXEL_FORMAT.RGB;

			renderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			renderTarget.attach(depthTexture, ATTACHMENT.DEPTH_ATTACHMENT);

			output.push(renderTarget);
		}

		this._output = output;
		this._frontDepthRenderTarget = output[0];
		this._backDepthRenderTarget = output[1];

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

	set backDepthFunc(value) {
		this._backMaterial.depthFunc = value;
	}

	get backDepthFunc() {
		return this._backMaterial.depthFunc;
	}

	setGeometryReplaceFunction(func) {
		if (func) {
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

		renderer.setRenderTarget(this._frontDepthRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, false);

		const layers = this.layers;

		renderer.beginRender();

		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._frontRenderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._frontRenderOptions);
		}

		renderer.endRender();

		const reverseDepthCompare = this._backMaterial.depthFunc === COMPARE_FUNC.GEQUAL || this._backMaterial.depthFunc === COMPARE_FUNC.GREATER;

		renderer.setRenderTarget(this._backDepthRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		renderer._state.depthBuffer.setClear(reverseDepthCompare ? 0 : 1);
		renderer.clear(true, true, false);

		renderer.beginRender();

		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._backRenderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._backRenderOptions);
		}

		renderer.endRender();

		renderer._state.depthBuffer.setClear(1);
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

	if (renderable.object.effects['volume']) {
		return true;
	}

	return false;
}

const thicknessShader = {
	name: 'ec_thickness',
	uniforms: {
		volumeid: 0
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

		#include <logdepthbuf_pars_frag>

        uniform int volumeid;

		vec2 encodeID(int id) {
			// id = clamp(id, 0, 65535);

			float high = float(id / 256) / 255.0;
			float low = fract(float(id) / 256.0);

			return vec2(high, low);
		}

        void main() {
			#include <logdepthbuf_frag>
            gl_FragColor = vec4(encodeID(volumeid), 0., 1.);
        }
    `
};