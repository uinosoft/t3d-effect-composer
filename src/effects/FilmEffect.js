import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader } from '../Utils.js';

export default class FilmEffect extends Effect {

	constructor() {
		super();

		this.noiseIntensity = 0.35;
		this.scanlinesIntensity = 0.5;
		this.scanlinesCount = 2048;
		this.grayscale = true;

		this._time = 0;

		this._mainPass = new ShaderPostPass(shader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const mainPass = this._mainPass;

		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		mainPass.uniforms.nIntensity = this.noiseIntensity;
		mainPass.uniforms.sIntensity = this.scanlinesIntensity;
		mainPass.uniforms.sCount = this.scanlinesCount;
		mainPass.uniforms.grayscale = this.grayscale;

		this._time += 0.01667;
		mainPass.uniforms.time = this._time;

		composer.$setEffectContextStates(outputRenderTarget, mainPass, finish);
		mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}

const shader = {
	name: 'ec_film',
	defines: {},
	uniforms: {
		tDiffuse: null,
		time: 0,
		nIntensity: 0.5,
		sIntensity: 0.05,
		sCount: 4096,
		grayscale: true
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform float time;
        uniform float nIntensity;
        uniform float sIntensity;
        uniform float sCount;
        uniform bool grayscale;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            // sample the source
            vec4 cTextureScreen = texture2D(tDiffuse, v_Uv);
            // make some noise
            float dx = rand(v_Uv + time);
            // add noise
            vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp(0.1 + dx, 0.0, 1.0);
            // get us a sine and cosine
            vec2 sc = vec2(sin(v_Uv.y * sCount), cos(v_Uv.y * sCount));
            // add scanlines
            cResult += cTextureScreen.rgb * vec3(sc.x, sc.y, sc.x) * sIntensity;
            // interpolate between source and result by intensity
            cResult = cTextureScreen.rgb + clamp(nIntensity, 0.0, 1.0) * (cResult - cTextureScreen.rgb);
            // convert to grayscale if desired
            if(grayscale) {
                cResult = vec3(cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11);
            }
            gl_FragColor = vec4(cResult, cTextureScreen.a);
        }
    `
};