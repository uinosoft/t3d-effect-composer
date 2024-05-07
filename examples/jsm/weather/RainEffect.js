import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL } from 't3d-effect-composer';

export default class RainEffect extends Effect {

	constructor() {
		super();

		this.speed = 1;
		this.size = 0.6;
		this.angle = 10;
		this.density = 1;
		this.strength = 1;

		this.coverStrength = 0.2;
		this.coverDensity = 0.75;
		this.coverSize = 5.0;
		this.coverSpeed = 1;

		this.rainCoverTexture = null;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._rainPass = new ShaderPostPass(rainShader);
		this._rainCoverPass = new ShaderPostPass(rainCoverShader);
		this._blendPass = new ShaderPostPass(mixShader);

		this._renderCover = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);
		const gBuffer = composer.getBuffer('GBuffer');

		// Step 1: rain pass

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		const deltaTime = 0.0166666;
		this._rainPass.uniforms.time += deltaTime * this.speed * 0.4;
		this._rainPass.uniforms.angle = this.angle;
		this._rainPass.uniforms.size = this.size;
		this._rainPass.uniforms.density = this.density;
		this._rainPass.uniforms.strength = this.strength;
		this._rainPass.uniforms.viewportSize[0] = inputRenderTarget.width;
		this._rainPass.uniforms.viewportSize[1] = inputRenderTarget.height;

		this._rainPass.render(renderer);

		// Step 2: rain cover pass

		if (this.coverStrength <= 0 || !this.rainCoverTexture) {
			this._renderCover = false;
		}

		renderer.setRenderTarget(tempRT2);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, false);

		if (this._renderCover) {
			const gBufferRenderStates = gBuffer.getCurrentRenderStates();
			this._rainCoverPass.uniforms.rainCoverTexture = this.rainCoverTexture;
			this._rainCoverPass.uniforms.depthTexture = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			projectionViewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();
			projectionViewInverse.toArray(this._rainCoverPass.uniforms.projectionViewInverse);
			this._rainCoverPass.uniforms.time += deltaTime * this.coverSpeed * 1.2;
			this._rainCoverPass.uniforms.coverDensity = this.coverDensity;
			this._rainCoverPass.uniforms.coverSize = this.coverSize;
			this._rainCoverPass.render(renderer);
		}

		if (this.coverStrength > 0 && !!this.rainCoverTexture) {
			this.bufferDependencies = [
				{ key: 'GBuffer' }
			];
			this._renderCover = true;
		} else {
			this.bufferDependencies = [];
			this._renderCover = false;
		}

		// Step 3: blend pass

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT1.texture;
		this._blendPass.uniforms.texture3 = tempRT2.texture;
		this._blendPass.uniforms.texture4 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._blendPass.uniforms.coverStrength = this.coverStrength;
		if (finish) {
			this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._blendPass.render(renderer);
		if (finish) {
			this._blendPass.material.transparent = false;
			this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._rainPass.dispose();
		this._rainCoverPass.dispose();
		this._blendPass.dispose();
	}

}

const projectionViewInverse = new Matrix4();

// shadertoy.com/view/wslSD2

const rainShader = {
	name: 'ec_rain',
	uniforms: {
		size: 2.0,
		angle: -10,
		density: 1,
		time: 1,
		viewportSize: [512, 512],
		strength: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float time;
		uniform float size;
		uniform float angle;
		uniform float density;
		uniform float strength;
		uniform vec2 viewportSize;
		varying vec2 v_Uv;
		float hash(float x) {
			return fract(sin(x*133.3)*13.13);
		}
		void main() {
			vec3 col = vec3(.6, .7, .8);
			float a = angle / 180. * 3.141592;
			float si = sin(a), co = cos(a);
			vec2 uv = v_Uv;
			uv.x = uv.x * viewportSize.x / 1024.;
			uv.y = uv.y * viewportSize.y / 1024.;
			uv *= mat2(co, -si, si, co);
			uv *= length(uv + vec2(0, 4.9)) * .3 + 4. / density;
			float v = 1. - sin(hash(floor(uv.x * 100.)));
			float b = clamp(abs(sin(20. * time * v + uv.y / size * (5. / (2. + v)))) - .85, 0., 1.);
			col *= v * b;
			gl_FragColor = vec4(col * strength, 1.0);
		}
	`
};

// https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/
const rainCoverShader = {
	name: 'ec_rain_cover',
	uniforms: {
		time: 0.0,
		projectionViewInverse: new Float32Array(16),
		depthTexture: null,
		rainCoverTexture: null,
		coverDensity: 1.,
		coverSize: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;

		uniform sampler2D depthTexture;
		uniform sampler2D rainCoverTexture;
		uniform mat4 projectionViewInverse;
		uniform float time;
		uniform float coverDensity;
		uniform float coverSize;

		vec3 ComputeRipple(vec2 UV, float CurrentTime, float Weight) {
			vec4 Ripple = texture2D(rainCoverTexture, UV);
			Ripple.yz = Ripple.yz * 2. - 1.; // Decompress perturbation
			float DropFrac = fract(Ripple.w + CurrentTime); // Apply time shift
			float TimeFrac = DropFrac - 1.0 + Ripple.x;
			float DropFactor = saturate(0.2 + Weight * 0.8 - DropFrac);
			float FinalFactor = DropFactor * Ripple.x * sin(clamp(TimeFrac * 9.0, 0.0, 3.0) * PI);
			return vec3(FinalFactor);
		}
		
		void main() {
			vec4 depthTexel = texture2D(depthTexture, v_Uv);
			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depthTexel.r * 2.0 - 1.0, 1.0);
			vec4 pos = projectionViewInverse * projectedPos;
			vec3 posWorld = pos.xyz / pos.w / coverSize;

			vec4 TimeMul = vec4(1.0, 0.85, 0.93, 1.13); 
			vec4 TimeAdd = vec4(0.0, 0.2, 0.45, 0.7); 
			vec4 Times = (time * TimeMul + TimeAdd) * 0.6;

			vec4 Weights = coverDensity - vec4(0., 0.25, 0.5, 0.75) + 0.25;
			vec3 coverColor1 = ComputeRipple(posWorld.xz + vec2(0.25, .0), Times.x, Weights.x); 
			vec3 coverColor2 = ComputeRipple(posWorld.xz + vec2(-0.55, .3), Times.y, Weights.y); 
			vec3 coverColor3 = ComputeRipple(posWorld.xz + vec2(0.6, .85), Times.z, Weights.z); 
			vec3 coverColor4 = ComputeRipple(posWorld.xz + vec2(0.5, .75), Times.w, Weights.w); 
			vec3 coverColor = vec3(Weights.x * coverColor1.xyz + Weights.y * coverColor2.xyz + Weights.z * coverColor3.xyz + Weights.w * coverColor4.xyz);
			gl_FragColor = vec4(coverColor, 1.0);
		}
	`
};

const mixShader = {
	name: 'ec_rain_mix',
	uniforms: {
		texture1: null,
		texture2: null,
		texture3: null,
		texture4: null,
		coverStrength: 0.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D texture1;
		uniform sampler2D texture2;
		uniform sampler2D texture3;
		uniform sampler2D texture4;
		uniform float coverStrength;
		varying vec2 v_Uv;

		${octahedronToUnitVectorGLSL}

		void main() {
			vec4 texel1 = texture2D(texture1, v_Uv);
			vec4 texel2 = texture2D(texture2, v_Uv);
			vec4 texel3 = texture2D(texture3, v_Uv);
			vec4 texel4 = texture2D(texture4, v_Uv);
			vec3 normal = octahedronToUnitVector(texel4.rg);
			float coverDensity = step(0.9, normal.y);
			gl_FragColor = vec4(vec3(texel1.rgb + texel2.rgb + texel3.rgb * coverStrength * coverDensity), texel1.a);
		}
	`
};