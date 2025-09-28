import { ShaderPostPass, Color3 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export class ColorSketchEffect extends Effect {

	constructor() {
		super();

		this.color = new Color3(0, 0, 0);
		this.lineWidth = 1.0;
		this.threshold = 0.2;
		this.gamma = 0.05;

		this._edgeDetectorPass = new ShaderPostPass(colorEdgeDetectorShader);
		this._blendPass = new ShaderPostPass(blendShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);

		// Step 1: edge detection pass

		const edgeDetectorPass = this._edgeDetectorPass;
		edgeDetectorPass.material.uniforms.colorTex = inputRenderTarget.texture;
		edgeDetectorPass.material.uniforms.lineWidth = this.lineWidth;
		edgeDetectorPass.uniforms.threshold = this.threshold;
		edgeDetectorPass.uniforms.gamma = this.gamma;
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		edgeDetectorPass.render(renderer, tempRT1);

		// Step 2: blend pass

		this._blendPass.uniforms.diffuse = inputRenderTarget.texture;
		this._blendPass.uniforms.sketch = tempRT1.texture;
		this.color.toArray(this._blendPass.uniforms.color);
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
	}

	dispose() {
		this._edgeDetectorPass.dispose();
	}

}

// reference: gist.github.com/Hebali/6ebfc66106459aacee6a9fac029d0115
// reference: homepages.inf.ed.ac.uk/rbf/HIPR2/sobel.htm
const colorEdgeDetectorShader = {
	name: 'ec_colorsketch',
	defines: {},
	uniforms: {
		colorTex: null,

		lineWidth: 1.0,
		threshold: 0.05,
		gamma: 0.05
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform vec2 u_RenderTargetSize;

    	varying vec2 v_Uv;

		uniform sampler2D colorTex;

        uniform float lineWidth;
        uniform float threshold;
		uniform float gamma;

        void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord) {
			vec2 texelSize = 1.0 / u_RenderTargetSize;

            float w = texelSize.x * lineWidth;
            float h = texelSize.y * lineWidth;

            n[0] = texture2D(tex, coord + vec2( -w, -h));
            n[1] = texture2D(tex, coord + vec2(0.0, -h));
            n[2] = texture2D(tex, coord + vec2(  w, -h));
            n[3] = texture2D(tex, coord + vec2( -w, 0.0));
            n[4] = texture2D(tex, coord);
            n[5] = texture2D(tex, coord + vec2(  w, 0.0));
            n[6] = texture2D(tex, coord + vec2( -w, h));
            n[7] = texture2D(tex, coord + vec2(0.0, h));
            n[8] = texture2D(tex, coord + vec2(  w, h));
        }

        void main(void) {
            vec4 n[9];
            make_kernel(n, colorTex, v_Uv);
			
            vec4 sobel_edge_h = n[2] + (2.0 * n[5]) + n[8] - (n[0] + (2.0 * n[3]) + n[6]);
            vec4 sobel_edge_v = n[0] + (2.0 * n[1]) + n[2] - (n[6] + (2.0 * n[7]) + n[8]);
            vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));
            float max = max(sobel.r, max(sobel.g, sobel.b));

			// float factor = step(threshold, max) * max;
			float factor = smoothstep(threshold - gamma, threshold + gamma, max) * max;

            gl_FragColor = vec4(factor, 0.0, 0.0, 1.0);
        }
		
	`
};

const blendShader = {
	name: 'ec_colorsketch_blend',
	uniforms: {
		sketch: null,
		diffuse: null,
		color: [0, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D sketch;
        uniform sampler2D diffuse;
        uniform vec3 color;

        varying vec2 v_Uv;	

        void main() {
            vec4 diffuseTexel = texture2D(diffuse, v_Uv);
            vec4 sketchTexel = texture2D(sketch, v_Uv);
            gl_FragColor = mix(diffuseTexel, vec4(color, sketchTexel.r), sketchTexel.r);
        }
    `
};