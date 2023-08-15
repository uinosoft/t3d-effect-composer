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
		this._sketchPass.uniforms.invResolution[0] = 1 / gBuffer.output().width;
		this._sketchPass.uniforms.invResolution[1] = 1 / gBuffer.output().height;

		this._sketchPass.uniforms.uThreshold = this.threshold;
		this._sketchPass.uniforms.uContrast = this.contrast;

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, true);

		this._sketchPass.render(renderer);

		// (Optional) Render fxaa pass

		if (this.fxaa) {
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, true);

			this._fxaaPass.uniforms.resolution[0] = 1 / gBuffer.output().width;
			this._fxaaPass.uniforms.resolution[1] = 1 / gBuffer.output().height;
			this._fxaaPass.uniforms.tDiffuse = tempRT1.texture;
			this._fxaaPass.render(renderer);
		}

		// Render mix pass

		renderer.setRenderTarget(outputRenderTarget);

		renderer.setClearColor(0, 0, 0, 0);

		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, true);
		}

		this._mixPass.uniforms['diffuse'] = inputRenderTarget.texture;
		this._mixPass.uniforms['sketch'] = this.fxaa ? tempRT2.texture : tempRT1.texture;
		this.color.toArray(this._mixPass.uniforms['color']);

		if (finish) {
			this._mixPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._mixPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}

		this._mixPass.render(renderer);

		if (finish) {
			this._mixPass.material.transparent = false;
			this._mixPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

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
		color: [0, 0, 0],
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