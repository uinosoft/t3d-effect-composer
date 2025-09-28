import { ShaderPostPass } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader } from '../Utils.js';

export default class ColorCorrectionEffect extends Effect {

	constructor() {
		super();

		this.brightness = 0;
		this.contrast = 1.02;
		this.exposure = 0;
		this.gamma = 1;
		this.saturation = 1.02;

		this._mainPass = new ShaderPostPass(shader);
		this._mainPass.material.premultipliedAlpha = true;
		this._mainPass.uniforms.contrast = 1.02;
		this._mainPass.uniforms.saturation = 1.02;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const mainPass = this._mainPass;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		mainPass.uniforms.brightness = this.brightness;
		mainPass.uniforms.contrast = this.contrast;
		mainPass.uniforms.exposure = this.exposure;
		mainPass.uniforms.gamma = this.gamma;
		mainPass.uniforms.saturation = this.saturation;
		composer.$setEffectContextStates(outputRenderTarget, mainPass, finish);
		mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}

const shader = {
	name: 'ec_color_correction',
	defines: {},
	uniforms: {
		tDiffuse: null,
		brightness: 0.0,
		contrast: 1.0,
		exposure: 0.0,
		gamma: 1.0,
		saturation: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform float brightness;
        uniform float contrast;
        uniform float exposure;
        uniform float gamma;
        uniform float saturation;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        // Values from "Graphics Shaders: Theory and Practice" by Bailey and Cunningham
        const vec3 w = vec3(0.2125, 0.7154, 0.0721);

        void main() {
            vec4 tex = texture2D(tDiffuse, v_Uv);
            // brightness
            vec3 color = clamp(tex.rgb + vec3(brightness), 0.0, 1.0);
            // contrast
            color = clamp((color - vec3(0.5)) * contrast + vec3(0.5), 0.0, 1.0);
            // exposure
            color = clamp(color * pow(2.0, exposure), 0.0, 1.0);
            // gamma
            color = clamp(pow(color, vec3(gamma)), 0.0, 1.0);
            float luminance = dot(color, w);
            color = mix(vec3(luminance), color, saturation);
            gl_FragColor = vec4(color, tex.a);
        }
    `
};