import { ShaderPostPass, ATTACHMENT, Color3 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export default class SkylineEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this.lineColor = new Color3().setHex(0xff0000);
		this.lineWidth = 1.0;
		this.threshold = 0.1;

		this._skylinePass = new ShaderPostPass(SkylineShader);
		this._skylinePass.material.depthTest = false;
		this._skylinePass.material.depthWrite = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const gBuffer = composer.getBuffer('GBuffer');
		const renderStates = gBuffer.getCurrentRenderStates();
		const depthTexture = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		const projectionMatrix = renderStates.camera.projectionMatrix;
		const cameraNear = renderStates.camera.near;
		const cameraFar = renderStates.camera.far;

		const skylinePass = this._skylinePass;

		skylinePass.material.uniforms.colorTex = inputRenderTarget.texture;
		skylinePass.material.uniforms.depthTex = depthTexture;
		skylinePass.material.uniforms.cameraNear = cameraNear;
		skylinePass.material.uniforms.cameraFar = cameraFar;
		projectionMatrix.toArray(skylinePass.material.uniforms.projection);

		skylinePass.material.uniforms.threshold = this.threshold;
		skylinePass.material.uniforms.lineWidth = this.lineWidth;
		this.lineColor.toArray(skylinePass.material.uniforms.lineColor);

		composer.$setEffectContextStates(outputRenderTarget, skylinePass, finish);
		skylinePass.render(renderer, outputRenderTarget);
	}

	dispose() {
		this._skylinePass.dispose();
	}

}

const SkylineShader = {
	name: 'ec_skyline',
	defines: {},
	uniforms: {
		colorTex: null,
		depthTex: null,
		cameraNear: 0.1,
		cameraFar: 0.1,
		projection: new Float32Array(16),
		lineColor: [1.0, 0.0, 0.0],
		lineWidth: 1.0,
		threshold: 0.1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform vec2 u_RenderTargetSize;

		uniform sampler2D depthTex;
		uniform sampler2D colorTex;
		
		uniform mat4 projection;
		uniform float cameraNear;
		uniform float cameraFar;

		uniform vec3 lineColor;
		uniform float lineWidth;
		uniform float threshold;
		
		varying vec2 v_Uv;

		float fetchDepth(vec2 uv) {
			vec4 depthTexel = texture2D(depthTex, uv);
			return depthTexel.r * 2.0 - 1.0;
		}

		float viewZToOrthographicDepth(const in float viewZ, const in float near, const in float far) {
			return (viewZ + near) / (near - far);
		}

		float perspectiveDepthToViewZ(const in float invClipZ, const in float near, const in float far) {
			return (near * far) / ((far - near) * invClipZ - far);
		}

		float getLinearDepth(vec2 coord) {
			float depth = fetchDepth(coord);
			float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          	return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
		}

		void main() {
			float depth = getLinearDepth(v_Uv);

			vec2 offsets[8];
			offsets[0] = vec2(-1, -1);
			offsets[1] = vec2(0, -1);
			offsets[2] = vec2(1, -1);
			offsets[3] = vec2(-1, 0);
			offsets[4] = vec2(1, 0);
			offsets[5] = vec2(-1, 1);
			offsets[6] = vec2(0, 1);
			offsets[7] = vec2(1, 1);

			vec2 texelSize = 1.0 / u_RenderTargetSize;

			float total = 0.0;
			for (int i = 0; i < 8; i++) {
				float sampleDepth = getLinearDepth(v_Uv + (offsets[i] * texelSize * lineWidth));
				total += abs(sampleDepth - depth);
			}
			total /= 8.0;

			float factor = smoothstep(threshold, threshold * 2.0, total);
			gl_FragColor = vec4(mix(texture2D( colorTex, v_Uv ).rgb, lineColor, factor), 1.0);
		}
	`
};