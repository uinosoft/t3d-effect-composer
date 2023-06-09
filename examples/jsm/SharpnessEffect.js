import { ShaderPostPass } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export default class SharpnessEffect extends Effect {

	constructor() {
		super();

		this.strength = 0.2;

		this._mainPass = new ShaderPostPass(sharpnessShader);
		this._mainPass.material.premultipliedAlpha = true;
	}

	resize(width, height) {
		this._mainPass.uniforms.resolution[0] = width;
		this._mainPass.uniforms.resolution[1] = height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);

		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}

		const mainPass = this._mainPass;

		mainPass.uniforms.strength = this.strength;
		mainPass.uniforms.tDiffuse = inputRenderTarget.texture;

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

// https://www.shadertoy.com/view/wtlSWB
const sharpnessShader = {
	name: 'ec_sharpness',
	uniforms: {
		tDiffuse: null,
		resolution: [1024, 512],
		strength: 0.2 // adjusts the amount of sharpness, range [0,1]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        varying vec2 v_Uv;
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float strength;

        vec3 srgb2lin(vec3 color)
        {
            return color * color;    
        }
        
        vec3 lin2srgb(vec3 color)
        {
             return sqrt(color);
        }
        
        // Contrast Adaptive Sharpening (CAS)
        // Reference: Lou Kramer, FidelityFX CAS, AMD Developer Day 2019,
        // https://gpuopen.com/wp-content/uploads/2019/07/FidelityFX-CAS.pptx
        vec3 cas(sampler2D tex, float sharpness_knob, out float transparency)
        {
            vec3 a = srgb2lin(texture2D(tex, v_Uv + vec2(0.0, -1.0 / resolution.y)).rgb);
            vec3 b = srgb2lin(texture2D(tex, v_Uv + vec2(-1.0 / resolution.x, 0.0)).rgb);
            vec4 diffuseColor = texture2D(tex, v_Uv + vec2(0.0, 0.0));
            transparency = diffuseColor.a;
            vec3 c = srgb2lin(diffuseColor.rgb);
            vec3 d = srgb2lin(texture2D(tex, v_Uv + vec2(1.0 / resolution.x, 0.0)).rgb);
            vec3 e = srgb2lin(texture2D(tex, v_Uv + vec2(0.0, 1.0 / resolution.y)).rgb);
        
            float min_g = min(a.g, min(b.g, min(c.g, min(d.g, e.g))));
            float max_g = max(a.g, max(b.g, max(c.g, max(d.g, e.g))));
            float sharpening_amount = sqrt(min(1.0 - max_g, min_g) / max_g);
            float w = sharpening_amount * mix(-0.125, -0.2, sharpness_knob);
        
            return (w * (a + b + d + e) + c) / (4.0 * w + 1.0);
        }
        
        float aastep(float edge, float x)
        {
            float aawidth = 0.7 * fwidth(x);
            return smoothstep(edge - aawidth, edge + aawidth, x);
        }

		void main() {
            float sharpness_knob = strength; // adjusts the amount of sharpening, range [0,1]
            float transparency = 1.0;
            vec3 color_sharpened = cas(tDiffuse, sharpness_knob, transparency);
            gl_FragColor = vec4(lin2srgb(color_sharpened), transparency);
		}
	`
};

