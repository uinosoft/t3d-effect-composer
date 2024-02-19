import { ShaderPostPass } from 't3d';
import { Effect, defaultVertexShader, copyShader } from 't3d-effect-composer';

export class TransitionEffect extends Effect {

	constructor() {
		super();

		this.type = 0; // 0: blend, 1: zoom

		this._transitionPass = new ShaderPostPass(transitionShader);
		this._copyPass = new ShaderPostPass(copyShader);

		this._frameShotRenderTarget = null;

		this.progress = 1;
		this.zoomFactor = 0.3;
	}

	resize(width, height) {
		if (this._frameShotRenderTarget) {
			this._frameShotRenderTarget.resize(width, height);
		}
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		if (this.progress <= 0) {
			if (!this._frameShotRenderTarget) {
				this._frameShotRenderTarget = composer._renderTargetCache.allocate(0);
			}

			renderer.setRenderTarget(this._frameShotRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			this._copyPass.material.uniforms.tDiffuse = inputRenderTarget.texture;
			this._copyPass.render(renderer);
		} else if (this.progress < 1 && this._frameShotRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._transitionPass.material.uniforms.texture1 = this._frameShotRenderTarget.texture;
			this._transitionPass.material.uniforms.texture2 = inputRenderTarget.texture;
			this._transitionPass.material.uniforms.type = this.type;
			this._transitionPass.material.uniforms.progress = this.progress;
			this._transitionPass.material.uniforms.strength = this.zoomFactor;
			if (finish) {
				this._transitionPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._transitionPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._transitionPass.render(renderer);
			if (finish) {
				this._transitionPass.material.transparent = false;
				this._transitionPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}

			return;
		} else {
			if (this._frameShotRenderTarget) {
				composer._renderTargetCache.release(this._frameShotRenderTarget, 0);
			}
		}

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}
		this._copyPass.material.uniforms.tDiffuse = inputRenderTarget.texture;
		if (finish) {
			this._copyPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._copyPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._copyPass.render(renderer);
		if (finish) {
			this._copyPass.material.transparent = false;
			this._copyPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._transitionPass.dispose();
		this._copyPass.dispose();
		if (this._frameShotRenderTarget) {
			this._frameShotRenderTarget.dispose();
		}
	}

}

const transitionShader = {
	name: 'ec_transition',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null,
		type: 0,
		progress: 0,
		zoomFactor: 0.3
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
    uniform sampler2D texture1;
    uniform sampler2D texture2;
    uniform int type;
    uniform float progress;
    uniform float zoomFactor;

    varying vec2 v_Uv;

    float Linear_ease(in float begin, in float change, in float duration, in float time) {
        return change * time / duration + begin;
    }

    float Exponential_easeInOut(in float begin, in float change, in float duration, in float time) {
        if (time == 0.0) {
			return begin;
		} else if (time == duration) {
			return begin + change;
		}  
        time = time / (duration / 2.0);
        if (time < 1.0) {
			return change / 2.0 * pow(2.0, 10.0 * (time - 1.0)) + begin;
		} else {
			return change / 2.0 * (-pow(2.0, -10.0 * (time - 1.0)) + 2.0) + begin;
		}
    }

    float Sinusoidal_easeInOut(in float begin, in float change, in float duration, in float time) {
        return -change / 2.0 * (cos(PI * time / duration) - 1.0) + begin;
    }

    float random(in vec3 scale, in float seed) {
        return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
    }

    vec3 crossFade(in vec2 uv, in float dissolve) {
        return mix(texture(texture1, uv).rgb, texture(texture2, uv).rgb, dissolve);
    }

    void main() {
        vec4 color1 = texture2D(texture1, v_Uv);
        vec4 color2 = texture2D(texture2, v_Uv);
        if (type == 0) {
            gl_FragColor = mix(color1, color2, progress);
        } else {
            vec2 center = vec2(Linear_ease(0.5, 0.0, 1.0, progress),0.5);
            float dissolve = Exponential_easeInOut(0.0, 1.0, 1.0, progress);
            float strength = Sinusoidal_easeInOut(0.0, zoomFactor, 0.5, progress);
            vec3 color = vec3(0.0);
            float total = 0.0;
            vec2 toCenter = center - v_Uv;
            float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0) * 0.5;
            
            for (float t = 0.0; t <= 20.0; t++) {
                float percent = (t + offset) / 20.0;
                float weight = 1.0 * (percent - percent * percent);
                color += crossFade(v_Uv + toCenter * percent * strength, dissolve) * weight;
                total += weight;
            }

            gl_FragColor = vec4(color / total, 1.0);
        }
    }
	`
};