import { ShaderPostPass, Color3, Matrix4, ATTACHMENT } from 't3d';
import { Effect, defaultVertexShader, fxaaShader } from 't3d-effect-composer';
import { SketchShader } from './SketchShader.js';

const _matProjViewInverse = new Matrix4();

export class SketchEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this.threshold = 0.55;
		this.contrast = 0.5;
		this.color = new Color3(0, 0, 0);
		this.fxaa = true;

		this._sketchPass = new ShaderPostPass(SketchShader);
		this._fxaaPass = new ShaderPostPass(fxaaShader);
		this._mixPass = new ShaderPostPass(mixShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		// Render sketch pass

		_matProjViewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();

		_matProjViewInverse.toArray(this._sketchPass.uniforms.matProjViewInverse);
		this._sketchPass.uniforms.normalTexture = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._sketchPass.uniforms.depthTexture = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		this._sketchPass.uniforms.uThreshold = this.threshold;
		this._sketchPass.uniforms.uContrast = this.contrast;

		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._sketchPass.render(renderer, tempRT1);

		// (Optional) Render fxaa pass

		if (this.fxaa) {
			this._fxaaPass.uniforms.tDiffuse = tempRT1.texture;
			tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._fxaaPass.render(renderer, tempRT2);
		}

		// Render mix pass

		this._mixPass.uniforms['diffuse'] = inputRenderTarget.texture;
		this._mixPass.uniforms['sketch'] = this.fxaa ? tempRT2.texture : tempRT1.texture;
		this.color.toArray(this._mixPass.uniforms['color']);
		composer.$setEffectContextStates(outputRenderTarget, this._mixPass, finish);
		this._mixPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._sketchPass.dispose();
		this._fxaaPass.dispose();
		this._mixPass.dispose();
	}

}

const mixShader = {
	name: 'ec_sketch_mix',
	defines: {},
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