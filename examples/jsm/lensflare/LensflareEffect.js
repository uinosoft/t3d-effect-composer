import { ShaderPostPass, BLEND_TYPE, RenderTarget2D, TEXTURE_FILTER } from 't3d';
import { Effect, additiveShader } from 't3d-effect-composer';

export class LensflareEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'LensflareBuffer' }
		];

		this._clipPass = new ShaderPostPass(clipShader);
		this._lensflarePass = new ShaderPostPass(lensflareShader);
		this._lensflarePass.material.transparent = true;
		this._lensflarePass.material.blending = BLEND_TYPE.ADD;
		this._lensflarePass.material.depthWrite = false;
		this._blendPass = new ShaderPostPass(additiveShader);
		this._blendPass.material.premultipliedAlpha = true;

		this._clippedRT = new RenderTarget2D(64, 64);
		this._clippedRT.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._clippedRT.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._clippedRT.texture.generateMipmaps = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);

		const lensflareBuffer = composer.getBuffer('LensflareBuffer');
		const lensflareInfos = lensflareBuffer.lensflareInfos;

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		renderer.renderPass.clear(true, true, true);

		lensflareInfos.forEach(({ screenX, screenY, scaleX, scaleY, elements }) => {
			renderer.renderPass.setRenderTarget(this._clippedRT);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, true);
			this._clipPass.uniforms.tDiffuse = lensflareBuffer.output().texture;
			this._clipPass.uniforms.clipRect[0] = ((screenX - scaleX)  * 0.5 + 0.5);
			this._clipPass.uniforms.clipRect[1] = ((screenY - scaleY) * 0.5 + 0.5);
			this._clipPass.uniforms.clipRect[2] = scaleX;
			this._clipPass.uniforms.clipRect[3] = scaleY;
			this._clipPass.render(renderer);

			renderer.renderPass.setRenderTarget(tempRT1);

			elements.forEach(({ texture, color, scale, offset }) => {
				const vecX = -screenX * 2;
				const vecY = -screenY * 2;

				const lensflareMaterial = this._lensflarePass.material;
				lensflareMaterial.uniforms.map = texture;
				lensflareMaterial.uniforms.occlusionMap = this._clippedRT.texture;
				lensflareMaterial.uniforms.screenPosition[0] = screenX + vecX * offset;
				lensflareMaterial.uniforms.screenPosition[1] = screenY + vecY * offset;
				lensflareMaterial.uniforms.scale[0] = scale * tempRT1.height / tempRT1.width;
				lensflareMaterial.uniforms.scale[1] = scale;
				color.toArray(lensflareMaterial.uniforms.color);

				renderer.renderPass.render(this._lensflarePass.renderQueueLayer.opaque[0], this._lensflarePass.renderStates, this._lensflarePass.renderConfig);
			});
		});

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}
		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT1.texture;
		this._blendPass.uniforms.colorWeight1 = 1;
		this._blendPass.uniforms.alphaWeight1 = 1;
		this._blendPass.uniforms.colorWeight2 = 1;
		this._blendPass.uniforms.alphaWeight2 = 1;
		if (finish) {
			this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._blendPass.render(renderer);
		if (finish) {
			this._blendPass.material.transparent = false;
			this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		composer._renderTargetCache.release(tempRT1, 0);
	}

	resize(width, height) {}

	dispose() {
		this._clippedRT.dispose();
	}

}

const clipShader = {
	name: 'lensflare_clip',
	defines: {},
	uniforms: {
		'tDiffuse': null,
		'clipRect': [0, 0, 1, 1]
	},
	vertexShader: `
		attribute vec3 a_Position;
		attribute vec2 a_Uv;

		uniform mat4 u_ProjectionView;
		uniform mat4 u_Model;

		uniform vec4 clipRect;

		varying vec2 v_Uv;

		void main() {
			v_Uv = a_Uv * clipRect.zw + clipRect.xy;
			gl_Position = u_ProjectionView * u_Model * vec4(a_Position, 1.0);
		}
	`,
	fragmentShader: `
		uniform sampler2D tDiffuse;

		varying vec2 v_Uv;

		void main() {
			vec4 texel = texture2D(tDiffuse, v_Uv);
			gl_FragColor = texel;
		}
	`
};

const lensflareShader = {
	name: 'lensflare',
	defines: {},
	uniforms: {
		'map': null,
		'occlusionMap': null,
		'color': [1, 1, 1],
		'scale': [1, 1],
		'screenPosition': [0, 0, 0]
	},
	vertexShader: `
		uniform vec3 screenPosition;
		uniform vec2 scale;

		uniform sampler2D occlusionMap;

		attribute vec3 a_Position;
		attribute vec2 a_Uv;

		varying vec2 v_Uv;
		varying float v_Visibility;

		void main() {
			v_Uv = a_Uv;

			vec2 pos = a_Position.xz;
			pos.y = -pos.y;

			vec4 visibility = texture2D(occlusionMap, vec2(0.5, 0.5)) * 0.2;
			visibility += texture2D(occlusionMap, vec2(0.34, 0.34)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.34, 0.66)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.66, 0.34)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.66, 0.66)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.18, 0.5)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.82, 0.5)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.5, 0.18)) * 0.1;
			visibility += texture2D(occlusionMap, vec2(0.5, 0.82)) * 0.1;

			v_Visibility = visibility.r;

			gl_Position = vec4(pos * scale + screenPosition.xy, screenPosition.z, 1.0);
		}
	`,
	fragmentShader: `
		uniform sampler2D map;
		uniform vec3 color;

		varying vec2 v_Uv;
		varying float v_Visibility;

		void main() {
			vec4 texture = texture2D(map, v_Uv);
			texture.a *= v_Visibility;
			gl_FragColor = texture;
			gl_FragColor.rgb *= color;
		}
	`
};