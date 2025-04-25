import { RenderTarget3D, PIXEL_TYPE, PIXEL_FORMAT, TEXTURE_FILTER, Vector3, ShaderPostPass } from 't3d';
import { defaultVertexShader } from 't3d-effect-composer';

class VolumeLightingGenerator {

	constructor() {
		const prelightRT = new RenderTarget3D(512, 512);
		prelightRT.texture.type = PIXEL_TYPE.HALF_FLOAT;
		prelightRT.texture.format = PIXEL_FORMAT.RED;
		prelightRT.texture.magFilter = TEXTURE_FILTER.LINEAR;
		prelightRT.texture.minFilter = TEXTURE_FILTER.LINEAR;
		prelightRT.texture.generateMipmaps = false;

		this._prelightRenderTarget = prelightRT;
		this._prelightPass = new ShaderPostPass(volumeLightingShader);

		this.lightDirection = new Vector3(0, 0, 1);
		this.sampleSteps = 10;
		this.sampleDistance = 0.5;
		this.maskIntensity = 1.0;
	}

	get lightTexture() {
		return this._prelightRenderTarget.texture;
	}

	dispose() {
		this._prelightRenderTarget.dispose();
		this._prelightPass.dispose();
	}

	detectSupport(renderer) {
		const capabilities = renderer.capabilities;
		const isWebGL2 = capabilities.version > 1;

		if (isWebGL2) {
			capabilities.getExtension('EXT_color_buffer_float');
		} else {
			capabilities.getExtension('OES_texture_half_float');
			capabilities.getExtension('OES_texture_half_float_linear');
		}

		capabilities.getExtension('OES_texture_float_linear');
		capabilities.getExtension('EXT_color_buffer_half_float');
	}

	prelight(renderer, inputTexture) {
		const prelightRT = this._prelightRenderTarget;
		const prelightPass = this._prelightPass;

		const { width, height, depth } = inputTexture.image;

		if (prelightRT.width !== width || prelightRT.height !== height || prelightRT.depth !== depth) {
			prelightRT.resize(width, height, depth);
		}

		this.lightDirection.toArray(prelightPass.uniforms.lightDirection);
		prelightPass.uniforms.sampleDistance = this.sampleDistance;
		prelightPass.uniforms.maskIntensity = this.maskIntensity;

		if (prelightPass.material.defines.MAX_SAMPLE_STEPS !== this.sampleSteps) {
			prelightPass.material.defines.MAX_SAMPLE_STEPS = this.sampleSteps;
			prelightPass.material.needsUpdate = true;
		}

		for (let i = 0; i < depth; i++) {
			prelightRT.activeLayer = i;
			renderer.setRenderTarget(prelightRT);

			prelightPass.uniforms.textureDepth = i / depth;
			prelightPass.uniforms.volumeTexture = inputTexture;

			prelightPass.render(renderer);
		}

		return prelightRT.texture;
	}

}

const volumeLightingShader = {
	defines: {
		MAX_SAMPLE_STEPS: 10
	},
	uniforms: {
		textureDepth: 0,
		volumeTexture: null,
		lightDirection: [1.0, 0.0, 0.0],
		sampleDistance: 0.5,
		maskIntensity: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
	precision highp sampler3D;

	uniform sampler3D volumeTexture;
	uniform float textureDepth;
	uniform float maskIntensity;
	uniform float sampleDistance;
	uniform vec3 lightDirection;

	varying vec2 v_Uv;

	void main() {
		vec3 screenPos = vec3(v_Uv, textureDepth);
		vec3 ndcPos = screenPos * 2.0 - 1.0;

		vec3 sampleOrigin = ndcPos;
		vec3 sampleDirection = lightDirection.xyz;

		float dx = sampleDistance * 2.0 / float(MAX_SAMPLE_STEPS);

		float totalMask = 0.0;
		
		for (int i = 0; i <= MAX_SAMPLE_STEPS; i++) {
			vec3 sampleCoord = sampleOrigin - sampleDirection * dx * float(i);
			sampleCoord = (sampleCoord + 1.0) / 2.0;

			if(sampleCoord.x < 0.0 || sampleCoord.x > 1.0 || sampleCoord.y < 0.0 || sampleCoord.y > 1.0 || sampleCoord.z < 0.0 || sampleCoord.z > 1.0) {
				break;
			}
			
			float mask = texture(volumeTexture, sampleCoord).r;
			float weightI = (i == 0 || i == MAX_SAMPLE_STEPS) ? 0.5 : 1.0;
			totalMask += mask * weightI * dx;
		}
		
		float density = totalMask;
		gl_FragColor = vec4(density * maskIntensity);
	}
	`
};

export { VolumeLightingGenerator };