import { ShaderPostPass, ATTACHMENT, Matrix4, Color3, Vector3, Vector2 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export class HeightFogEffect extends Effect {

	constructor() {
		super();

		this.fogColor = new Color3(173 / 255, 216 / 255, 230 / 255);
		this.fogDensity = 1;
		this.heightFallOff = 0.168;
		this.fogHeight = 1.7;
		this.fogStartDis = 10;
		this.fogGradientDis = 50;
		this.maxOpacity = 0.8;

		this.enableSunLight = false;
		this.sunDir = new Vector3(0.6, 0.1, 1);
		this.sunColor = new Color3(255 / 255, 250 / 255, 205 / 255);
		this.fogInscatteringExp = 16;

		this.enableFlow = false;
		this.noiseTexture = null;
		this.flowSpeed = new Vector2(1, 1);
		this.flowStrength = 0.5;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._fogPass = new ShaderPostPass(fogShader);
		this._fogPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const deltaTime = 0.0166666;
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		this._fogPass.uniforms.depthTexture = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._fogPass.uniforms.sceneTexture = inputRenderTarget.texture;

		gBufferRenderStates.camera.position.toArray(this._fogPass.uniforms.cameraPosition);
		projectionviewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();
		projectionviewInverse.toArray(this._fogPass.uniforms.projectionviewInverse);

		this.fogColor.toArray(this._fogPass.uniforms.fogColor);
		this._fogPass.uniforms.fogDensity = this.fogDensity;
		this._fogPass.uniforms.heightFallOff = this.heightFallOff;
		this._fogPass.uniforms.fogHeight = this.fogHeight;
		this._fogPass.uniforms.fogStartDis = this.fogStartDis;
		this._fogPass.uniforms.fogGradientDis = this.fogGradientDis;
		this._fogPass.uniforms.maxOpacity = this.maxOpacity;

		if (this._fogPass.material.defines['SUN_LIGHT'] !== this.enableSunLight) {
			this._fogPass.material.defines['SUN_LIGHT'] = this.enableSunLight;
			this._fogPass.material.needsUpdate = true;
		}

		if (this.enableSunLight) {
			this.sunDir.toArray(this._fogPass.uniforms.sunDir);
			this.sunColor.toArray(this._fogPass.uniforms.sunColor);
			this._fogPass.uniforms.fogInscatteringExp = this.fogInscatteringExp;
		}

		if (this._fogPass.material.defines['FOG_FLOW'] !== this.enableFlow) {
			this._fogPass.material.defines['FOG_FLOW'] = this.enableFlow;
			this._fogPass.material.needsUpdate = true;
		}

		if (this.enableFlow) {
			this._fogPass.uniforms.noiseTexture = this.noiseTexture;
			this._fogPass.material.uniforms['flowOffset'][0] += this.flowSpeed.x * deltaTime / 10.;
			this._fogPass.material.uniforms['flowOffset'][1] += this.flowSpeed.y * deltaTime / 10.;
			this._fogPass.material.uniforms['flowStrength'] = this.flowStrength;
		}

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}
		if (finish) {
			this._fogPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._fogPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._fogPass.render(renderer);
		if (finish) {
			this._fogPass.material.transparent = false;
			this._fogPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._fogPass.dispose();
	}

}

const projectionviewInverse = new Matrix4();

// iquilezles.org/articles/fog/

const fogShader = {
	name: 'ec_heightfog',
	defines: {
		'SUN_LIGHT': false,
		'FOG_FLOW': false
	},
	uniforms: {
		depthTexture: null,
		sceneTexture: null,
		noiseTexture: null,

		cameraPosition: [0, 0, 0],
		projectionviewInverse: new Float32Array(16),

		fogColor: [1, 1, 1],

		fogDensity: 1,

		heightFallOff: 0.25,
		fogHeight: 10,

		fogStartDis: -10.96,
		fogGradientDis: 50,

		maxOpacity: 1.0,

		sunDir: [0.6, 0.1, 1],
		sunColor: [255 / 255, 250 / 255, 205 / 255],
		fogInscatteringExp: 12.9,

		flowOffset: [0, 0],
		flowStrength: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        varying vec2 v_Uv;

        uniform sampler2D depthTexture;
		uniform sampler2D sceneTexture;

		uniform vec3 cameraPosition;
		uniform mat4 projectionviewInverse;

        uniform vec3 fogColor;

        uniform float fogDensity;

        uniform float heightFallOff;
        uniform float fogHeight;

        uniform float fogStartDis;
		uniform float fogGradientDis;

		uniform float maxOpacity;

		#ifdef SUN_LIGHT
			uniform vec3 sunDir;
			uniform vec3 sunColor;
			uniform float fogInscatteringExp;
		#endif

		#ifdef FOG_FLOW
			uniform sampler2D noiseTexture;
			uniform vec2 flowOffset;
			uniform float flowStrength;
		#endif

		float applyFog(float distance, vec3 rayOri, vec3 rayDir){
			vec3 rayOri_pie = rayOri + rayDir * fogStartDis;
			float c = fogDensity / heightFallOff;	
			vec2 data = vec2(-max(0., rayOri_pie.y - fogHeight) * heightFallOff, -max(0., distance - fogStartDis) * rayDir.y * heightFallOff);
			vec2 expData = exp(data);
			float opticalThickness = c * expData.x * (1.0 - expData.y) / rayDir.y;
			float extinction = exp(-opticalThickness);
			float fogAmount = 1. - extinction;
			float distanceFactor = clamp(distance / fogGradientDis, 0.0, 1.0);
			return fogAmount * distanceFactor;
		}

		void main() {
            vec4 depthTexel = texture2D(depthTexture, v_Uv);
			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depthTexel.r * 2.0 - 1.0, 1.0);
			vec4 pos = projectionviewInverse * projectedPos;
			vec3 posWorld = pos.xyz / pos.w;

			vec3 cap = cameraPosition;
			vec3 viewDir = cap - posWorld;

			vec3 rayStep = -normalize(viewDir) * fogStartDis;
			vec3 rayOri_step = cap + rayStep;
			if((rayOri_step.y - fogHeight) > 300.) {
				cap.y = fogHeight + 300. - rayStep.y;
				viewDir = cap - posWorld;
			}
		
            float rayLength = length(viewDir);
	
			float fog = applyFog(rayLength, cap, -normalize(viewDir));
			fog = clamp(fog, 0.0, maxOpacity);

            vec3 finalFogColor = fogColor;

			#ifdef SUN_LIGHT
				float inscatterFactor = pow(clamp(dot(-normalize(viewDir), -normalize(sunDir)) ,0.0, 1.0), fogInscatteringExp);
                finalFogColor = mix(fogColor, sunColor, clamp(inscatterFactor, 0.0, 1.0));
			#endif

			vec4 finalColor = texture2D(sceneTexture, v_Uv);
			
			#ifdef FOG_FLOW
				float noise = texture2D(noiseTexture, v_Uv + flowOffset).r;
				fog = fog * mix(1., noise, flowStrength);
			#endif
			
			finalColor.rgb = mix(finalColor.rgb, finalFogColor, fog);

			gl_FragColor = finalColor;
		}
	`
};
