import { ShaderPostPass, ATTACHMENT, Matrix4, OffscreenRenderTarget, TEXTURE_FILTER } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL, blurShader, copyShader, setupColorTexture } from 't3d-effect-composer';

export default class SSGIEffect extends Effect {

	constructor() {
		super();

		this.needCameraJitter = true;

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		this.maxRayDistance = 200;
		this.pixelStrideZCutoff = 50;

		this.strength = 1;
		this.falloff = 1;

		this.zThicknessThreshold = 1.0;

		this.blurSize = 2;
		this.depthRange = 1;

		this.downScaleLevel = 0;

		this.jitter = true;
		this.sampleCount = 1;

		this.temporalAccumulation = true;
		this.temporalMixRatio = 0.9;

		this.blueNoise = null;
		this.blueNoiseIndex = 0;

		this.envMap = null;

		this._copyRGBPass = new ShaderPostPass(copyRGBShader);
		this._copyPass = new ShaderPostPass(copyShader);
		this._accumPass = new ShaderPostPass(accumulateShader);

		this._ssgiPass = new ShaderPostPass(ssgiShader);

		this._blurPass = new ShaderPostPass(blurShader);
		this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
		this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;

		this._blendPass = new ShaderPostPass(mixSSRShader);
		this._blendPass.material.premultipliedAlpha = true;

		this._historyRT1 = null;
		this._historyRT2 = null;
		this._resetHistory = false;
	}

	reset() {
		this._resetHistory = true;
	}

	resize(width, height) {
		this._resetHistory = true;

		if (this._historyRT1) {
			const divisor = Math.pow(2, this.downScaleLevel);
			const w = Math.ceil(width / divisor);
			const h = Math.ceil(height / divisor);
			this._historyRT1.resize(w, h);
			this._historyRT2.resize(w, h);
		}
	}

	_createHistoryRenderTarget(width, height, options) {
		const rt = OffscreenRenderTarget.create2D(width, height);
		const tex = rt._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		setupColorTexture(tex, options);
		tex.minFilter = TEXTURE_FILTER.LINEAR;
		tex.magFilter = TEXTURE_FILTER.LINEAR;
		tex.generateMipmaps = false;
		rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
		return rt;
	}

	_ensureHistoryRenderTargets(composer, width, height) {
		if (this._historyRT1 && this._historyRT1.width === width && this._historyRT1.height === height) return;

		if (this._historyRT1) this._historyRT1.dispose();
		if (this._historyRT2) this._historyRT2.dispose();

		const options = composer._renderTargetCache ? composer._renderTargetCache._options : {};

		this._historyRT1 = this._createHistoryRenderTarget(width, height, options);
		this._historyRT2 = this._createHistoryRenderTarget(width, height, options);
		this._resetHistory = true;
	}

	_swapHistoryRenderTargets() {
		const temp = this._historyRT1;
		this._historyRT1 = this._historyRT2;
		this._historyRT2 = temp;
	}

	_accumulate(renderer, composer, currTexture, width, height) {
		this._ensureHistoryRenderTargets(composer, width, height);

		const cameraJitter = composer.$cameraJitter;

		if (this.jitter && cameraJitter && !cameraJitter.accumulating()) {
			cameraJitter.reset();
		}

		const mixRatio = this._resetHistory ? 0 : this.temporalMixRatio;

		if (mixRatio === 0) {
			this._copyPass.uniforms.tDiffuse = currTexture;
			this._historyRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._copyPass.render(renderer, this._historyRT2);
		} else {
			this._accumPass.uniforms.currTexture = currTexture;
			this._accumPass.uniforms.prevTexture = this._historyRT1.texture;
			this._accumPass.uniforms.mixRatio = mixRatio;
			this._historyRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this._accumPass.render(renderer, this._historyRT2);
		}

		this._swapHistoryRenderTargets();
		this._resetHistory = false;

		return this._historyRT1.texture;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(this.downScaleLevel);
		const tempRT2 = composer._renderTargetCache.allocate(this.downScaleLevel);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projection.copy(gBufferRenderStates.camera.projectionMatrix);
		projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewMatrix.copy(gBufferRenderStates.camera.viewMatrix);
		viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

		if (inputRenderTarget) {
			this._copyRGBPass.uniforms.tDiffuse = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			tempRT1.setClear(false, false, false);
			this._copyRGBPass.render(renderer, tempRT1);
		} else {
			tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		}

		const sampleCount = Math.max(1, this.sampleCount | 0);
		if (this._ssgiPass.material.defines.SAMPLE_COUNT !== sampleCount) {
			this._ssgiPass.material.defines.SAMPLE_COUNT = sampleCount;
			this._ssgiPass.material.needsUpdate = true;
		}

		this._ssgiPass.uniforms.colorTex = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssgiPass.uniforms.gBufferTexture1 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssgiPass.uniforms.gBufferTexture2 = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._ssgiPass.uniforms.viewportSize[0] = gBuffer.output().width;
		this._ssgiPass.uniforms.viewportSize[1] = gBuffer.output().height;

		this._ssgiPass.uniforms.blueNoiseTexture = this.blueNoise;
		this._ssgiPass.uniforms.blueNoiseIndex++;

		this._ssgiPass.uniforms.envMapInfo.map = this.envMap;

		if (!gBuffer.supportHiz) {
			gBuffer.supportHiz = true;
		}
		// this._ssgiPass.uniforms.hizTexture = gBuffer.hizTexture();
		// this._ssgiPass.uniforms.hizMaxLevel = gBuffer.hizTexture().mipmaps.length - 1;

		projection.toArray(this._ssgiPass.uniforms.projection);
		projectionInv.toArray(this._ssgiPass.uniforms.projectionInv);
		viewInverseTranspose.toArray(this._ssgiPass.uniforms.viewInverseTranspose);
		viewMatrix.toArray(this._ssgiPass.uniforms.viewMatrix);

		this._ssgiPass.uniforms.nearZ = gBufferRenderStates.camera.near;
		this._ssgiPass.uniforms.maxRayDistance = this.maxRayDistance;
		this._ssgiPass.uniforms.pixelStride = 8;
		this._ssgiPass.uniforms.zThicknessThreshold = this.zThicknessThreshold;

		const cameraJitter = composer.$cameraJitter;
		this._ssgiPass.uniforms.jitterOffset = (this.jitter && cameraJitter.accumulating()) ? (cameraJitter.frame() * 0.5 / cameraJitter.totalFrame()) : 0;

		this._ssgiPass.render(renderer, tempRT1);

		this._blurPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._blurPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._blurPass.uniforms.textureSize[0] = gBuffer.output().width;
		this._blurPass.uniforms.textureSize[1] = gBuffer.output().height;

		projection.toArray(this._blurPass.uniforms.projection);
		viewInverseTranspose.toArray(this._blurPass.uniforms.viewInverseTranspose);

		this._blurPass.uniforms.blurSize = this.blurSize;
		this._blurPass.uniforms.depthRange = this.depthRange;

		this._blurPass.uniforms.direction = 0;
		this._blurPass.uniforms.tDiffuse = tempRT1.texture;

		tempRT2.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurPass.render(renderer, tempRT2);

		this._blurPass.uniforms.direction = 1;
		this._blurPass.uniforms.tDiffuse = tempRT2.texture;
		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurPass.render(renderer, tempRT1);

		let ssgiTexture = tempRT1.texture;
		if (this.temporalAccumulation) {
			ssgiTexture = this._accumulate(renderer, composer, ssgiTexture, tempRT1.width, tempRT1.height);
		}

		if (inputRenderTarget) {
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = ssgiTexture;
			this._blendPass.uniforms.strength = this.strength;
			this._blendPass.uniforms.falloff = this.falloff;

			composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
			this._blendPass.render(renderer, outputRenderTarget);
		} else {
			this._copyPass.uniforms.tDiffuse = ssgiTexture;
			composer.$setEffectContextStates(outputRenderTarget, this._copyPass, finish);
			this._copyPass.render(renderer, outputRenderTarget);
		}

		composer._renderTargetCache.release(tempRT1, this.downScaleLevel);
		composer._renderTargetCache.release(tempRT2, this.downScaleLevel);
	}

	dispose() {
		if (this._historyRT1) {
			this._historyRT1.dispose();
			this._historyRT1 = null;
		}
		if (this._historyRT2) {
			this._historyRT2.dispose();
			this._historyRT2 = null;
		}
	}


}

const accumulateShader = {
	name: 'ec_ssgi_accumulate',
	defines: {},
	uniforms: {
		currTexture: null,
		prevTexture: null,
		mixRatio: 0.9
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D currTexture;
		uniform sampler2D prevTexture;
		uniform float mixRatio;
		varying vec2 v_Uv;
		void main() {
			vec4 curr = texture2D(currTexture, v_Uv);
			vec4 prev = texture2D(prevTexture, v_Uv);
			gl_FragColor = mix(curr, prev, mixRatio);
		}
	`
};

const ssgiShader = {
	name: 'ec_ssgi',
	defines: {
		MAX_ITERATION: 64,
		SAMPLE_COUNT: 1
	},
	uniforms: {
		colorTex: null,
		gBufferTexture1: null,
		gBufferTexture2: null,
		hizTexture: null,
		blueNoiseTexture: null,
		blueNoiseIndex: 0,
		hizMaxLevel: 0,
		projection: new Float32Array(16),
		projectionInv: new Float32Array(16),
		viewInverseTranspose: new Float32Array(16),
		viewportSize: [512, 512],
		nearZ: 0,
		maxRayDistance: 200,
		pixelStride: 8,
		zThicknessThreshold: 0.5,
		jitterOffset: 0,
		blueNoiseSize: [128, 128],
		envMapInfo: {
			map: null,
			marginalWeights: null,
			conditionalWeights: null,
			totalSumWhole: 0,
			totalSumDecimal: 0,
			size: [0, 0]
		},
		maxEnvMapMipLevel: 0,
		envBlur: 0.5
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		precision highp float;
		${octahedronToUnitVectorGLSL}

		struct EquirectHdrInfo {
			sampler2D marginalWeights;
			sampler2D conditionalWeights;
			samplerCube map;
			vec2 size;
			float totalSumWhole;
			float totalSumDecimal;
		};

		uniform sampler2D colorTex;
		uniform sampler2D gBufferTexture1;
		uniform sampler2D gBufferTexture2;
		uniform EquirectHdrInfo envMapInfo;

		uniform mat4 projection;
		uniform mat4 projectionInv;
		uniform mat4 viewInverseTranspose;
		uniform mat4 viewMatrix;

		uniform vec2 viewportSize;
		uniform float nearZ;
		uniform float maxRayDistance;
		uniform float pixelStride;
		uniform float zThicknessThreshold;
		uniform float jitterOffset;
		uniform float maxEnvMapMipLevel;
		uniform float envBlur;

		varying vec2 v_Uv;

		#define steps MAX_ITERATION
		#define refineSteps 5
		#define M_PI 3.1415926535897932384626433832795

		vec2 equirectDirectionToUv(const vec3 direction) {
			vec2 uv = vec2(atan(direction.z, direction.x), acos(direction.y));
			uv /= vec2(2.0 * M_PI, M_PI);
			uv.x += 0.5;
			uv.y = 1.0 - uv.y;
			return uv;
		}

		vec3 sampleEquirectEnvMapColor(const vec3 direction, const samplerCube map, const float lod) {
			
			return textureCubeLodEXT(map, direction, float(lod)).rgb;
		}

		float luminance(vec3 c) {
			return dot(c, vec3(0.2126, 0.7152, 0.0722));
		}

		vec3 getEnvColor(vec3 l, float roughness) {
			vec3 reflectedWS = normalize((vec4(l, 0.) * viewMatrix).xyz);
			
			float mip = envBlur * maxEnvMapMipLevel;
			if (roughness < 0.15) {
				mip *= roughness / 0.15;
			}

			vec3 envMapSample = sampleEquirectEnvMapColor(reflectedWS, envMapInfo.map, mip);
			
			float maxEnvLum = 25.0; // PENDING
			if (maxEnvLum != 0.0) {
				float envLum = luminance(envMapSample);
				if (envLum > maxEnvLum) {
					envMapSample *= maxEnvLum / envLum;
				}
			}

			return envMapSample;
		}

		vec3 cosineSampleHemisphere(vec3 n, vec2 u) {
			float r = sqrt(u.x);
			float theta = 6.28318530718 * u.y;

			vec3 b = normalize(cross(n, vec3(0.0, 1.0, 1.0)));
			vec3 t = cross(b, n);

			return normalize(r * sin(theta) * b + sqrt(1.0 - u.x) * n + r * cos(theta) * t);
		}

		vec3 reconstructViewPos(vec2 uv, float depth01) {
			vec4 clip = vec4(uv * 2.0 - 1.0, depth01 * 2.0 - 1.0, 1.0);
			vec4 view = projectionInv * clip;
			return view.xyz / max(view.w, 1e-6);
		}

		vec2 projectToUv(vec3 viewPos) {
			vec4 clip = projection * vec4(viewPos, 1.0);
			vec3 ndc = clip.xyz / max(clip.w, 1e-6);
			return ndc.xy * 0.5 + 0.5;
		}

		vec2 BinarySearch(inout vec3 dir, inout vec3 hitPos) {
			dir *= 0.5;
			hitPos -= dir;

			for (int i = 0; i < refineSteps; i++) {
				vec2 uv = projectToUv(hitPos);
				float sceneDepth01 = texture2D(gBufferTexture2, uv).x;
				vec3 sceneVS = reconstructViewPos(uv, sceneDepth01);
				float rayHitDepthDifference = sceneVS.z - hitPos.z;

				dir *= 0.5;
				if (rayHitDepthDifference >= 0.0) {
					hitPos -= dir;
				} else {
					hitPos += dir;
				}
			}

			return projectToUv(hitPos);
		}

		vec2 RayMarch(inout vec3 dir, inout vec3 hitPos, vec4 random) {
			dir *= maxRayDistance / float(steps);

			vec2 uv = v_Uv;
			for (int i = 1; i < steps; i++) {
				float cs = 1.0 - exp(-0.25 * pow(float(i) + random.b - 0.5, 2.0));
				hitPos += dir * cs;

				uv = projectToUv(hitPos);
				if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

				float sceneDepth01 = texture2D(gBufferTexture2, uv).x;
				vec3 sceneVS = reconstructViewPos(uv, sceneDepth01);
				float rayHitDepthDifference = sceneVS.z - hitPos.z;

				if (rayHitDepthDifference >= 0.0 && rayHitDepthDifference < zThicknessThreshold) {
					if (refineSteps == 0) {
						return uv;
					} else {
						return BinarySearch(dir, hitPos);
					}
				}
			}

			hitPos = vec3(10.0e9);
			return uv;
		}

		uniform sampler2D blueNoiseTexture;
		uniform vec2 blueNoiseSize;
		uniform int blueNoiseIndex;

		// internal RNG state
		uvec4 s1;
		ivec2 pixel;

		void rng_initialize(vec2 p, int index) {
		pixel = ivec2(p);

		// blue noise seed
		s1 = uvec4(index, index * 15843, index * 31 + 4566, index * 2345 + 58585);
		}

		// https://www.pcg-random.org/
		void pcg4d(inout uvec4 v) {
			v = v * 1664525u + 1013904223u;
			v.x += v.y * v.w;
			v.y += v.z * v.x;
			v.z += v.x * v.y;
			v.w += v.y * v.z;
			v = v ^ (v >> 16u);
			v.x += v.y * v.w;
			v.y += v.z * v.x;
			v.z += v.x * v.y;
			v.w += v.y * v.z;
		}

		// random blue noise sampling pos
		ivec2 shift2(ivec2 size) {
		pcg4d(s1);
		return (pixel + ivec2(s1.xy % 0x0fffffffu)) % size;
		}

		// needs a uniform called "resolution" with the size of the render target
		vec4 blueNoise(vec2 uv, int index) {
			if (index == 0)
				return textureLod(blueNoiseTexture, uv * viewportSize / blueNoiseSize, 0.0);

			rng_initialize(v_Uv * viewportSize, index);
			vec4 blueNoise = texelFetch(blueNoiseTexture, shift2(ivec2(blueNoiseSize)), 0);

			return blueNoise;
		}

		vec4 blueNoise() { return blueNoise(v_Uv, int(blueNoiseIndex)); }
		vec4 blueNoise(vec2 uv) { return blueNoise(uv, int(blueNoiseIndex)); }

		vec3 SampleGGXVNDF(const vec3 V, const float ax, const float ay, const float r1, const float r2) {
			vec3 Vh = normalize(vec3(ax * V.x, ay * V.y, V.z));

			float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
			vec3 T1 = lensq > 0. ? vec3(-Vh.y, Vh.x, 0.) * inversesqrt(lensq) : vec3(1., 0., 0.);
			vec3 T2 = cross(Vh, T1);

			float r = sqrt(r1);
			float phi = 2.0 * PI * r2;
			float t1 = r * cos(phi);
			float t2 = r * sin(phi);
			float s = 0.5 * (1.0 + Vh.z);
			t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

			vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;

			return normalize(vec3(ax * Nh.x, ay * Nh.y, max(0.0, Nh.z)));
		}

		void main() {
			vec4 g0 = texture2D(gBufferTexture1, v_Uv);
			if (g0.r < -2.0) discard;

			float depth01 = texture2D(gBufferTexture2, v_Uv).x;
			vec3 viewPos = reconstructViewPos(v_Uv, depth01);

			vec3 normalVS = octahedronToUnitVector(g0.rg);
			normalVS = normalize((viewInverseTranspose * vec4(normalVS, 0.0)).xyz);

			float metalness = clamp(g0.b, 0.0, 1.0);
			float roughness = clamp(g0.a, 0.0, 1.0);

			vec3 viewDir = normalize(viewPos);
			vec3 specDir = normalize(reflect(viewDir, normalVS));

			vec3 sumColor = vec3(0.0);
			float hitCount = 0.0;
			vec3 V = (vec4(viewDir, 0.) * viewMatrix).xyz;
			float roughnessSq = clamp(roughness * roughness, 0.000001, 1.0);

			for (int s = 0; s < SAMPLE_COUNT; s++) {
				float fs = float(s) + 1.0;
				vec4 random = blueNoise(v_Uv);
				vec3 H = SampleGGXVNDF(V, roughnessSq, roughnessSq, random.r, random.g);	
				if (H.z < 0.0)
					H = -H;

				vec3 diffDir = cosineSampleHemisphere(normalVS, random.rg);
				float diffuseMix = roughness * (1.0 - metalness);
				vec3 dirVS = normalize(mix(specDir, diffDir, diffuseMix));

				vec3 hitPos = viewPos;
				vec2 hitUv = RayMarch(dirVS, hitPos, random);

				bool isMissed = hitPos.x == 10.0e9;
				if (!isMissed) {
					sumColor += texture2D(colorTex, hitUv).rgb;
					hitCount += 1.0;
				} else {
					sumColor += getEnvColor(dirVS, roughness);
					hitCount += 1.0;
				}
			}

			if (hitCount <= 0.0) {
				gl_FragColor = vec4(0.0);
			} else {
				gl_FragColor = vec4(sumColor / hitCount, hitCount / float(SAMPLE_COUNT));
			}
		}
	`
};

const copyRGBShader = {
	name: 'ec_copy_rgb',
	defines: {},
	uniforms: {
		tDiffuse: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D tDiffuse;

		varying vec2 v_Uv;

		void main() {
			vec3 color = texture2D(tDiffuse, v_Uv).rgb;
			gl_FragColor = vec4(color, 0.0);
		}
	`
};

const mixSSRShader = {
	name: 'ec_ssr_mix',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null,
		strength: 0.15,
		falloff: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D texture1;
		uniform sampler2D texture2;
		uniform float strength;
		uniform float falloff;
		varying vec2 v_Uv;
		void main() {
            vec4 baseColor = texture2D(texture1, v_Uv);
            vec4 ssrColor = texture2D(texture2, v_Uv);

            float reflectivity = ssrColor.a * strength;
            vec3 finalColor = baseColor.rgb * (1.0 - reflectivity * falloff) + ssrColor.rgb * reflectivity;

            gl_FragColor = vec4(ssrColor);
        }
    `
};
const projection = new Matrix4();
const projectionInv = new Matrix4();
const viewInverseTranspose = new Matrix4();
const viewMatrix = new Matrix4();
