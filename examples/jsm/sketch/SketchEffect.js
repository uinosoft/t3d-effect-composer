import { ShaderPostPass, Color3, Matrix4, ATTACHMENT } from 't3d';
import { Effect } from 't3d-effect-composer';
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

		this._sketchPass = new ShaderPostPass(SketchShader);

		this._mixPass = new ShaderPostPass(mixShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		_matProjViewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();

		_matProjViewInverse.toArray(this._sketchPass.uniforms.matProjViewInverse);
		this._sketchPass.uniforms.normalTexture = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._sketchPass.uniforms.depthTexture = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._sketchPass.uniforms.invResolution[0] = 1 / gBuffer.output().width;
		this._sketchPass.uniforms.invResolution[1] = 1 / gBuffer.output().height;

		this._sketchPass.uniforms.uThreshold = this.threshold;
		this._sketchPass.uniforms.uContrast = this.contrast;
		this.color.toArray(this._sketchPass.uniforms.uColor);

		renderer.renderPass.setRenderTarget(tempRT1);

		renderer.renderPass.setClearColor(0, 0, 0, 0);

		renderer.renderPass.clear(true, true, true);

		this._sketchPass.render(renderer);

		renderer.renderPass.setRenderTarget(outputRenderTarget);

		renderer.renderPass.setClearColor(1, 1, 1, 0);

		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, true);
		}

		this._mixPass.uniforms['diffuse'] = inputRenderTarget.texture;

		this._mixPass.uniforms['sketch'] = tempRT1.texture;

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
	}

}

const mixShader = {
	name: 'ec_sketchMix',
	defines: {},
	uniforms: {
		sketch: null,
		diffuse: null
	},
	vertexShader: `
		attribute vec3 a_Position;
		attribute vec2 a_Uv;

		uniform mat4 u_ProjectionView;
		uniform mat4 u_Model;

		varying vec2 v_Uv;

		void main() {
			v_Uv = a_Uv;

			gl_Position = u_ProjectionView * u_Model * vec4( a_Position, 1.0 );
		}
	`,
	fragmentShader: `
		uniform sampler2D sketch;

		uniform sampler2D diffuse;

		varying vec2 v_Uv;

		void main() {
		    vec4 diffuseTexel = texture2D( diffuse, v_Uv );

		    vec4 sketchTexel = texture2D( sketch, v_Uv );

            gl_FragColor = mix(diffuseTexel, sketchTexel, sketchTexel.a);
		}
	`
};