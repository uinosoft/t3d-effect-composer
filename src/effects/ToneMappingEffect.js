import { ShaderPostPass, TEXEL_ENCODING_TYPE } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, ToneMappingType } from '../Utils.js';

// Tone Mapping normally deals with the conversion of HDR to LDR.
export default class ToneMappingEffect extends Effect {

	constructor() {
		super();

		this.toneMapping = ToneMappingType.Reinhard;
		this.toneMappingExposure = 1;
		this.outputColorSpace = TEXEL_ENCODING_TYPE.SRGB;

		this._mainPass = new ShaderPostPass(shader);

		this._toneMapping = null;
		this._outputColorSpace = null;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		const mainPass = this._mainPass;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		mainPass.uniforms.toneMappingExposure = this.toneMappingExposure;

		if (this._toneMapping !== this.toneMapping || this._outputColorSpace !== this.outputColorSpace) {
			this._toneMapping = this.toneMapping;
			this._outputColorSpace = this.outputColorSpace;

			mainPass.material.defines = {};

			if (this._toneMapping === ToneMappingType.Linear) mainPass.material.defines.LINEAR_TONE_MAPPING = '';
			if (this._toneMapping === ToneMappingType.Reinhard) mainPass.material.defines.REINHARD_TONE_MAPPING = '';
			if (this._toneMapping === ToneMappingType.Cineon) mainPass.material.defines.CINEON_TONE_MAPPING = '';
			if (this._toneMapping === ToneMappingType.ACESFilmic) mainPass.material.defines.ACES_FILMIC_TONE_MAPPING = '';

			if (this._outputColorSpace === TEXEL_ENCODING_TYPE.SRGB) mainPass.material.defines.SRGB_COLOR_SPACE = '';

			mainPass.material.needsUpdate = true;
		}

		if (finish) {
			mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		mainPass.render(renderer);
		if (finish) {
			mainPass.material.transparent = false;
			mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._mainPass.dispose();
	}

}

const shader = {
	name: 'ec_tone_mapping',
	defines: {},
	uniforms: {
		tDiffuse: null,
		toneMappingExposure: 1,
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform float toneMappingExposure;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        // exposure only
        vec3 LinearToneMapping(vec3 color) {
            return saturate(toneMappingExposure * color);
        }

        // source: https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
        vec3 ReinhardToneMapping(vec3 color) {
            color *= toneMappingExposure;
            return saturate(color / (vec3(1.0) + color));
        }

        // source: http://filmicworlds.com/blog/filmic-tonemapping-operators/
        vec3 OptimizedCineonToneMapping(vec3 color) {
            // optimized filmic operator by Jim Hejl and Richard Burgess-Dawson
            color *= toneMappingExposure;
            color = max(vec3(0.0), color - 0.004);
            return pow((color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
        }

        // source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
        vec3 RRTAndODTFit(vec3 v) {
            vec3 a = v * (v + 0.0245786) - 0.000090537;
            vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
            return a / b;
        }

        // this implementation of ACES is modified to accommodate a brighter viewing environment.
        // the scale factor of 1/0.6 is subjective. see discussion in https://github.com/mrdoob/three.js/pull/19621.

        vec3 ACESFilmicToneMapping(vec3 color) {
            // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
            const mat3 ACESInputMat = mat3(
                vec3(0.59719, 0.07600, 0.02840), // transposed from source
                vec3(0.35458, 0.90834, 0.13383),
                vec3(0.04823, 0.01566, 0.83777)
            );
        
            // ODT_SAT => XYZ => D60_2_D65 => sRGB
            const mat3 ACESOutputMat = mat3(
                vec3( 1.60475, -0.10208, -0.00327), // transposed from source
                vec3(-0.53108,  1.10813, -0.07276),
                vec3(-0.07367, -0.00605,  1.07602)
            );
        
            color *= toneMappingExposure / 0.6;
        
            color = ACESInputMat * color;
        
            // Apply RRT and ODT
            color = RRTAndODTFit(color);
        
            color = ACESOutputMat * color;
        
            // Clamp to [0, 1]
            return saturate(color);
        }

        void main() {
            gl_FragColor = texture2D(tDiffuse, v_Uv);

            // tone mapping

			#ifdef LINEAR_TONE_MAPPING
				gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
			#elif defined(REINHARD_TONE_MAPPING)
				gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
			#elif defined(CINEON_TONE_MAPPING)
				gl_FragColor.rgb = OptimizedCineonToneMapping(gl_FragColor.rgb);
			#elif defined(ACES_FILMIC_TONE_MAPPING)
				gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
			#endif

            // color space

            #ifdef SRGB_COLOR_SPACE
				gl_FragColor = LinearTosRGB(gl_FragColor);
			#endif
        }
    `
};