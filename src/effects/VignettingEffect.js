import { ShaderPostPass, Color3 } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader } from '../Utils.js';

export default class VignettingEffect extends Effect {

	constructor() {
		super();

		this.color = new Color3(0, 0, 0);
		this.offset = 1.0;

		this._vignettingPass = new ShaderPostPass(vignettingShader);
		this._vignettingPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const vignettingPass = this._vignettingPass;

		vignettingPass.uniforms.tDiffuse = inputRenderTarget.texture;
		this.color.toArray(vignettingPass.uniforms.vignettingColor);
		vignettingPass.uniforms.vignettingOffset = this.offset;

		composer.$setEffectContextStates(outputRenderTarget, vignettingPass, finish);
		vignettingPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._vignettingPass.dispose();
	}

}

const vignettingShader = {
	name: 'ec_vignetting_blend',
	defines: {},
	uniforms: {
		tDiffuse: null,
		vignettingColor: [0, 0, 0],
		vignettingOffset: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform vec3 vignettingColor;
		uniform float vignettingOffset;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec4 color = texture2D(tDiffuse, v_Uv);
            vec2 uv = (v_Uv - vec2(0.5)) * vec2(vignettingOffset);
			color.rgb = mix(color.rgb, vignettingColor, clamp(dot(uv, uv), 0.0, 1.0));
			gl_FragColor = color;
        }
    `
};