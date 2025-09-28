import { ShaderPostPass } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export class KuwaharaEffect extends Effect {

	constructor() {
		super();

		this.radius = 2;

		this._mainPass = new ShaderPostPass(kuwaharaShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const mainPass = this._mainPass;
		mainPass.uniforms.radius = this.radius;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
		composer.$setEffectContextStates(outputRenderTarget, mainPass, finish);
		mainPass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._mainPass.dispose();
	}

}

// https://www.shadertoy.com/view/MsXSz4
const kuwaharaShader = {
	name: 'ec_kuwahara',
	uniforms: {
		tDiffuse: null,
		radius: 2
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform int radius;
        uniform vec2 u_RenderTargetSize;

        varying vec2 v_Uv;

        vec4 kuwahara(vec2 uv, int radius) {
            vec2 texel = 1.0 / u_RenderTargetSize;
            vec4 m[4];
            vec4 s[4];
            for (int k = 0; k < 4; ++k) {
                m[k] = vec4(0.0);
                s[k] = vec4(0.0);
            }

            for (int j = -radius; j <= 0; ++j) {
                for (int i = -radius; i <= 0; ++i) {
                    vec4 c = texture2D(tDiffuse, uv + vec2(i, j) * texel);
                    m[0] += c;
                    s[0] += c * c;
                }
            }

            for (int j = -radius; j <= 0; ++j) {
                for (int i = 0; i <= radius; ++i) {
                    vec4 c = texture2D(tDiffuse, uv + vec2(i, j) * texel);
                    m[1] += c;
                    s[1] += c * c;
                }
            }

            for (int j = 0; j <= radius; ++j) {
                for (int i = 0; i <= radius; ++i) {
                    vec4 c = texture2D(tDiffuse, uv + vec2(i, j) * texel);
                    m[2] += c;
                    s[2] += c * c;
                }
            }

            for (int j = 0; j <= radius; ++j) {
                for (int i = -radius; i <= 0; ++i) {
                    vec4 c = texture2D(tDiffuse, uv + vec2(i, j) * texel);
                    m[3] += c;
                    s[3] += c * c;
                }
            }

            float n = float((radius + 1) * (radius + 1));
            vec4 min_sigma2 = vec4(1e+2);
            vec4 result = vec4(0.0);

            for (int k = 0; k < 4; ++k) {
                m[k] /= n;
                s[k] = abs(s[k] / n - m[k] * m[k]);
                float sigma2 = s[k].r + s[k].g + s[k].b;
                if (sigma2 < min_sigma2.r) {
                    min_sigma2.r = sigma2;
                    result = m[k];
                }
            }

            return result;
        }

        void main() {
            gl_FragColor = kuwahara(v_Uv, radius);
        }
    `
};