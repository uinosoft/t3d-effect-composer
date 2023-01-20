import { ShaderPostPass, ATTACHMENT } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader } from '../Utils.js';

export default class DOFEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this.focalDepth = 1;
		this.focalLength = 24;
		this.fstop = 0.9;
		this.maxblur = 1.0;
		this.threshold = 0.9;
		this.gain = 1.0;
		this.bias = 0.5;
		this.dithering = 0.0001;

		this._mainPass = new ShaderPostPass(bokehShader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	resize(width, height) {
		this._mainPass.uniforms.resolution[0] = 1 / width;
		this._mainPass.uniforms.resolution[1] = 1 / height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		this._mainPass.uniforms.tColor = inputRenderTarget.texture;
		this._mainPass.uniforms.tDepth = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		let cameraNear = 0, cameraFar = 0;
		const projectionMatrix = gBufferRenderStates.camera.projectionMatrix;
		if (_isPerspectiveMatrix(projectionMatrix)) {
			cameraNear = projectionMatrix.elements[14] / (projectionMatrix.elements[10] - 1);
			cameraFar = projectionMatrix.elements[14] / (projectionMatrix.elements[10] + 1);
		} else {
			cameraNear = (projectionMatrix.elements[14] + 1) / projectionMatrix.elements[10];
			cameraFar = (projectionMatrix.elements[14] - 1) / projectionMatrix.elements[10];
		}

		this._mainPass.uniforms.znear = cameraNear;
		this._mainPass.uniforms.zfar = cameraFar;

		this._mainPass.uniforms.focalDepth = this.focalDepth;
		this._mainPass.uniforms.focalLength = this.focalLength;
		this._mainPass.uniforms.fstop = this.fstop;
		this._mainPass.uniforms.maxblur = this.maxblur;
		this._mainPass.uniforms.threshold = this.threshold;
		this._mainPass.uniforms.gain = this.gain;
		this._mainPass.uniforms.bias = this.bias;
		this._mainPass.uniforms.dithering = this.dithering;
		if (finish) {
			this._mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._mainPass.render(renderer);
		if (finish) {
			this._mainPass.material.transparent = false;
			this._mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

}

function _isPerspectiveMatrix(m) {
	return m.elements[11] === -1.0;
}

const bokehShader = {
	name: 'ec_bokeh',
	defines: {
		RINGS: 3,
		SAMPLES: 4
	},
	uniforms: {
		tColor: null,
		tDepth: null,
		resolution: [1 / 1024, 1 / 512],
		znear: 0.1,
		zfar: 100,

		focalDepth: 1.0,
		focalLength: 24,
		fstop: 0.9,

		maxblur: 1.0,
		threshold: 0.5,
		gain: 2.0,
		bias: 0.5,

		dithering: 0.0001
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        varying vec2 v_Uv;

        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        
        uniform vec2 resolution;  
        
        uniform float znear;
        uniform float zfar;

        uniform float focalDepth;
        uniform float focalLength;
        uniform float fstop;

        uniform float maxblur; // clamp value of max blur (0.0 = no blur, 1.0 default)
        uniform float threshold; // highlight threshold
        uniform float gain; // highlight gain
        uniform float bias; // bokeh edge bias
        uniform float dithering;

        const int samples = SAMPLES;
        const int rings = RINGS;
        const int maxringsamples = rings * samples;

        float CoC = 0.03; // circle of confusion size in mm (35mm film = 0.03mm)

        vec4 color(vec2 coords, float blur) {
            vec4 col = texture2D(tColor, coords);
            vec3 lumcoeff = vec3(0.299, 0.587, 0.114);
            float lum = dot(col.rgb, lumcoeff);
            float thresh = max((lum - threshold) * gain, 0.0);
            return vec4(col.rgb + mix(vec3(0.0), col.rgb, thresh * blur), col.a);
        }

        float linearize(float depth) {
            return -zfar * znear / (depth * (zfar - znear) - zfar);
        }

        float gather(float i, float j, int ringsamples, inout vec3 colorSum, float w, float h, float blur) {
            float rings2 = float(rings);
            float step = PI * 2.0 / float(ringsamples);
            float pw = cos(j * step) * i;
            float ph = sin(j * step) * i;
			vec4 sampleColor = color(v_Uv + vec2(pw * w, ph * h), blur);
			float weight = mix(1.0, i / rings2, bias) * sampleColor.a;
            colorSum += sampleColor.rgb  * weight;
            return weight;
        }

        void main() {
            float depth = linearize(texture2D(tDepth,  v_Uv).x);
            float fDepth = focalDepth;

            // dof blur factor calculation

            float f = focalLength; // focal length in mm
            float d = fDepth * 1000.; // focal plane in mm
            float o = depth * 1000.; // depth in mm

            float a = (o * f) / (o - f);
            float b = (d * f) / (d - f);
            float c = (d - f) / (d * fstop * CoC);

            float blur = abs(a - b) * c;
            blur = clamp(blur, 0.0, 1.0);

            // calculation of pattern for dithering

            vec2 noise = vec2(rand( v_Uv), rand( v_Uv + vec2(0.4, 0.6))) * dithering * blur;

            // getting blur x and y step factor

            float w = resolution.x * blur * maxblur + noise.x;
            float h = resolution.y * blur * maxblur + noise.y;

            // calculation of final color

            vec3 col = vec3(0.0);
			vec4 centerColor = texture2D(tColor,  v_Uv);

            if (blur < 0.05) {
                col = centerColor.rgb;
            } else {
                col = centerColor.rgb;

                float s = 1.0;
                int ringsamples;

                for(int i = 1; i <= rings; i++) {
                    ringsamples = i * samples;

                    for (int j = 0; j < maxringsamples; j++) {
                        if (j >= ringsamples) break;
                        s += gather(float(i), float(j), ringsamples, col, w, h, blur);
                    }
                }

                col /= s; // divide by sample count
            }

            gl_FragColor = vec4(col, centerColor.a);
        }
    `
};