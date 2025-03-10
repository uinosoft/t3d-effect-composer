import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, octahedronToUnitVectorGLSL, blurShader } from '../Utils.js';

export default class SSREffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		// Single step distance, unit is pixel
		this.pixelStride = 8;
		// Dichotomy search depends on precise collision point, maximum number of iterations
		this.maxIteration = 5;
		// Number of steps
		this.maxSteps = 50;

		// The farthest reflection distance limit, in meters
		this.maxRayDistance = 200;

		// Adjust the step pixel distance according to the depth,
		// the step in and out becomes larger,
		// and the step in the distance becomes smaller.
		this.enablePixelStrideZCutoff = true;
		// ray origin Z at this distance will have a pixel stride of 1.0
		this.pixelStrideZCutoff = 50;

		// distance to screen edge that ray hits will start to fade (0.0 -> 1.0)
		this.screenEdgeFadeStart = 0.9;

		// ray direction's Z that ray hits will start to fade (0.0 -> 1.0)
		this.eyeFadeStart = 0.99;
		// ray direction's Z that ray hits will be cut (0.0 -> 1.0)
		this.eyeFadeEnd = 1;

		// Object larger than minGlossiness will have ssr effect
		this.minGlossiness = 0.2;

		// the strength of ssr effect
		this.strength = 0.2;

		// the falloff of base color when mix with ssr color
		this.falloff = 0;

		// the threshold of z thickness
		this.zThicknessThreshold = 0.5;

		// When turned on, the reflection effect will become more blurred as the Roughness increases,
		// but it will also cause more noise.
		// Noise can be reduced by turning on TAA.
		this.importanceSampling = false;

		this.blurSize = 2;
		this.depthRange = 1;

		this.downScaleLevel = 0;

		this.jitter = true;

		this._copyRGBPass = new ShaderPostPass(copyRGBShader);

		this._ssrPass = new ShaderPostPass(ssrShader);

		this._blurPass = new ShaderPostPass(blurShader);
		this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
		this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;

		this._blendPass = new ShaderPostPass(mixSSRShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(this.downScaleLevel);
		const tempRT2 = composer._renderTargetCache.allocate(this.downScaleLevel);

		const sceneBuffer = composer.getBuffer('SceneBuffer');

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projection.copy(gBufferRenderStates.camera.projectionMatrix);
		projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

		// Step 1: ssr pass

		renderer.setRenderTarget(tempRT1);
		if (inputRenderTarget) {
			this._copyRGBPass.uniforms.tDiffuse = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._copyRGBPass.render(renderer); // clear rgb channel to scene color and alpha channel to 0
		} else {
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
		}

		this._ssrPass.uniforms.colorTex = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssrPass.uniforms.gBufferTexture1 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssrPass.uniforms.gBufferTexture2 = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._ssrPass.uniforms.viewportSize[0] = gBuffer.output().width;
		this._ssrPass.uniforms.viewportSize[1] = gBuffer.output().height;

		projection.toArray(this._ssrPass.uniforms.projection);
		projectionInv.toArray(this._ssrPass.uniforms.projectionInv);
		viewInverseTranspose.toArray(this._ssrPass.uniforms.viewInverseTranspose);

		this._ssrPass.uniforms.pixelStride = this.pixelStride;
		this._ssrPass.uniforms.maxRayDistance = this.maxRayDistance;
		this._ssrPass.uniforms.enablePixelStrideZCutoff = this.enablePixelStrideZCutoff ? 1 : 0;
		this._ssrPass.uniforms.pixelStrideZCutoff = this.pixelStrideZCutoff;
		this._ssrPass.uniforms.screenEdgeFadeStart = this.screenEdgeFadeStart;
		this._ssrPass.uniforms.eyeFadeStart = this.eyeFadeStart;
		this._ssrPass.uniforms.eyeFadeEnd = this.eyeFadeEnd;
		this._ssrPass.uniforms.minGlossiness = this.minGlossiness;
		this._ssrPass.uniforms.nearZ = gBufferRenderStates.camera.near;
		this._ssrPass.uniforms.zThicknessThreshold = this.zThicknessThreshold;

		const cameraJitter = composer.$cameraJitter;
		this._ssrPass.uniforms.jitterOffset = (this.jitter && cameraJitter.accumulating()) ? (cameraJitter.frame() * 0.5 / cameraJitter.totalFrame()) : 0;

		if (this._ssrPass.material.defines.MAX_ITERATION != this.maxSteps || this._ssrPass.material.defines.MAX_BINARY_SEARCH_ITERATION != this.maxIteration) {
			this._ssrPass.material.needsUpdate = true;
			this._ssrPass.material.defines.MAX_ITERATION = this.maxSteps;
			this._ssrPass.material.defines.MAX_BINARY_SEARCH_ITERATION = this.maxIteration;
		}

		const importanceSampling = !!this.importanceSampling;
		if (importanceSampling !== this._ssrPass.material.defines.IMPORTANCE_SAMPLING) {
			this._ssrPass.material.needsUpdate = true;
			this._ssrPass.material.defines.IMPORTANCE_SAMPLING = importanceSampling;
		}

		this._ssrPass.render(renderer);

		// Step 2: blurX pass

		renderer.setRenderTarget(tempRT2);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, false);

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

		this._blurPass.render(renderer);

		// Step 3: blurY pass

		renderer.setRenderTarget(inputRenderTarget ? tempRT1 : outputRenderTarget);
		renderer.clear(true, true, false);

		this._blurPass.uniforms.direction = 1;
		this._blurPass.uniforms.tDiffuse = tempRT2.texture;

		this._blurPass.render(renderer);

		// Step 4: blend pass

		if (inputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}

			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT1.texture;
			this._blendPass.uniforms.strength = this.strength;
			this._blendPass.uniforms.falloff = this.falloff;

			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
		}

		composer._renderTargetCache.release(tempRT1, this.downScaleLevel);
		composer._renderTargetCache.release(tempRT2, this.downScaleLevel);
	}

	dispose() {
		this._ssrPass.dispose();
		this._blurPass.dispose();
		this._blendPass.dispose();
	}

}

const projection = new Matrix4();
const projectionInv = new Matrix4();
const viewInverseTranspose = new Matrix4();

const ssrShader = {
	name: 'ec_ssr',
	defines: {
		MAX_ITERATION: 50,
		MAX_BINARY_SEARCH_ITERATION: 5,
		IMPORTANCE_SAMPLING: false
	},
	uniforms: {
		colorTex: null,
		gBufferTexture1: null,
		gBufferTexture2: null,

		projection: new Float32Array(16),
		projectionInv: new Float32Array(16),
		viewInverseTranspose: new Float32Array(16),

		pixelStride: 8,
		maxRayDistance: 200,

		enablePixelStrideZCutoff: 1.0,
		pixelStrideZCutoff: 50,

		screenEdgeFadeStart: 0.9,

		eyeFadeStart: 0.99,
		eyeFadeEnd: 1,

		minGlossiness: 0.2,
		nearZ: 0.1,

		zThicknessThreshold: 0.5,
		jitterOffset: 0,
		viewportSize: [512, 512]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;

		uniform sampler2D colorTex;
		uniform sampler2D gBufferTexture1;
		uniform sampler2D gBufferTexture2;

		uniform mat4 projection;
		uniform mat4 projectionInv;
		uniform mat4 viewInverseTranspose;

		uniform float pixelStride;

		uniform float maxRayDistance;

		uniform float screenEdgeFadeStart;
	
		uniform float enablePixelStrideZCutoff;
		uniform float pixelStrideZCutoff;

		uniform float eyeFadeStart;
		uniform float eyeFadeEnd;
		
		uniform float minGlossiness;
		uniform float zThicknessThreshold;
		uniform float jitterOffset;

		uniform float nearZ;
		uniform vec2 viewportSize;

		${octahedronToUnitVectorGLSL}

		float fetchDepth(sampler2D depthTexture, vec2 uv) {
			vec4 depthTexel = texture2D(depthTexture, uv);
			return depthTexel.r * 2.0 - 1.0;
		}

		float linearDepth(float depth) {
			return projection[3][2] / (depth * projection[2][3] - projection[2][2]);
		}

		bool rayIntersectDepth(float rayZNear, float rayZFar, vec2 hitPixel) {
			// Swap if bigger
			if (rayZFar > rayZNear) {
				float t = rayZFar; rayZFar = rayZNear; rayZNear = t;
			}
			float cameraZ = linearDepth(fetchDepth(gBufferTexture2, hitPixel));
			// float cameraBackZ = linearDepth(fetchDepth(backDepthTex, hitPixel));
			// Cross z
			return rayZFar <= cameraZ && rayZNear >= cameraZ - zThicknessThreshold;
		}

		#ifdef IMPORTANCE_SAMPLING
			float interleavedGradientNoise(const in vec2 fragCoord, const in float frameMod) {
				vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
				return fract(magic.z * fract(dot(fragCoord.xy + frameMod * vec2(47.0, 17.0) * 0.695, magic.xy)));
			}

			vec3 unrealImportanceSampling(const in float frameMod, const in vec3 tangentX, const in vec3 tangentY, const in vec3 tangentZ, const in vec3 eyeVector, const in float rough4) {
				vec2 E;
				E.x = interleavedGradientNoise(gl_FragCoord.yx, frameMod);
				E.y = fract(E.x * 52.9829189);
				E.y = mix(E.y, 1.0, 0.7);

				float phi = 2.0 * 3.14159 * E.x;
				float cosTheta = pow(max(E.y, 0.000001), rough4 / (2.0 - rough4));
				float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

				vec3 h = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
				h = h.x * tangentX + h.y * tangentY + h.z * tangentZ;
				return normalize((2.0 * dot(eyeVector, h)) * h - eyeVector);
			}
		#endif

		// Trace a ray in screenspace from rayOrigin (in camera space) pointing in rayDir (in camera space)
		//
		// With perspective correct interpolation
		//
		// Returns true if the ray hits a pixel in the depth buffer
		// and outputs the hitPixel (in UV space), the hitPoint (in camera space) and the number
		// of iterations it took to get there.
		//
		// Based on Morgan McGuire & Mike Mara's GLSL implementation:
		// http://casual-effects.blogspot.com/2014/08/screen-space-ray-tracing.html
		bool traceScreenSpaceRay(vec3 rayOrigin, vec3 rayDir, float jitter, out vec2 hitPixel, out vec3 hitPoint, out float iterationCount) {
			// Clip to the near plane
			float rayLength = ((rayOrigin.z + rayDir.z * maxRayDistance) > -nearZ) ? (-nearZ - rayOrigin.z) / rayDir.z : maxRayDistance;

			vec3 rayEnd = rayOrigin + rayDir * rayLength;

			// Project into homogeneous clip space
			vec4 H0 = projection * vec4(rayOrigin, 1.0);
			vec4 H1 = projection * vec4(rayEnd, 1.0);

			float k0 = 1.0 / H0.w, k1 = 1.0 / H1.w;

			// The interpolated homogeneous version of the camera space points
			vec3 Q0 = rayOrigin * k0, Q1 = rayEnd * k1;

			// Screen space endpoints
			// PENDING viewportSize ?
			vec2 P0 = (H0.xy * k0 * 0.5 + 0.5) * viewportSize;
			vec2 P1 = (H1.xy * k1 * 0.5 + 0.5) * viewportSize;

			// If the line is degenerate, make it cover at least one pixel to avoid handling
			// zero-pixel extent as a special case later
			P1 += dot(P1 - P0, P1 - P0) < 0.0001 ? 0.01 : 0.0;
			vec2 delta = P1 - P0;

			// Permute so that the primary iteration is in x to collapse
			// all quadrant-specific DDA case later
			bool permute = false;
			if (abs(delta.x) < abs(delta.y)) {
				// More vertical line
				permute = true;
				delta = delta.yx;
				P0 = P0.yx;
				P1 = P1.yx;
			}
			float stepDir = sign(delta.x);
			float invdx = stepDir / delta.x;

			// Track the derivatives of Q and K
			vec3 dQ = (Q1 - Q0) * invdx;
			float dk = (k1 - k0) * invdx;

			vec2 dP = vec2(stepDir, delta.y * invdx);

			// Calculate pixel stride based on distance of ray origin from camera.
			// Since perspective means distant objects will be smaller in screen space
			// we can use this to have higher quality reflections for far away objects
			// while still using a large pixel stride for near objects (and increase performance)
			// this also helps mitigate artifacts on distant reflections when we use a large
			// pixel stride.
			float strideScaler = 1.0 - min(1.0, -rayOrigin.z / pixelStrideZCutoff);
			float pixStride = mix(pixelStride, 1.0 + strideScaler * pixelStride, enablePixelStrideZCutoff);

			// Scale derivatives by the desired pixel stride and the offset the starting values by the jitter fraction
			dP *= pixStride; dQ *= pixStride; dk *= pixStride;

			// Track ray step and derivatives in a vec4 to parallelize
			vec4 pqk = vec4(P0, Q0.z, k0);
			vec4 dPQK = vec4(dP, dQ.z, dk);

			pqk += dPQK * jitter;
			float rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);
			float rayZNear;

			bool intersect = false;

			vec2 texelSize = 1.0 / viewportSize;

			iterationCount = 0.0;
			float end = P1.x * stepDir;
			for (int i = 0; i < MAX_ITERATION; i++) {
				pqk += dPQK;
				if ((pqk.x * stepDir) >= end) {
					break;
				}

				rayZNear = rayZFar;
				rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);

				hitPixel = permute ? pqk.yx : pqk.xy;
				hitPixel *= texelSize;

				intersect = rayIntersectDepth(rayZNear, rayZFar, hitPixel);

				iterationCount += 1.0;

				// PENDING Right on all platforms?
				if (intersect) {
					break;
				}
			}

			// Binary search refinement
			// FIXME If intersect in first iteration binary search may easily lead to the pixel of reflect object it self
			if (pixStride > 1.0 && intersect && iterationCount > 1.0) {
				// Roll back
				pqk -= dPQK;
				dPQK /= pixStride;

				float originalStride = pixStride * 0.5;
				float stride = originalStride;

				rayZNear = pqk.z / pqk.w;
				rayZFar = rayZNear;

				for (int j = 0; j < MAX_BINARY_SEARCH_ITERATION; j++) {
					pqk += dPQK * stride;
					rayZNear = rayZFar;
					rayZFar = (dPQK.z * -0.5 + pqk.z) / (dPQK.w * -0.5 + pqk.w);
					hitPixel = permute ? pqk.yx : pqk.xy;
					hitPixel *= texelSize;

					originalStride *= 0.5;
					stride = rayIntersectDepth(rayZNear, rayZFar, hitPixel) ? -originalStride : originalStride;
				}
			}

			Q0.xy += dQ.xy * iterationCount;
			Q0.z = pqk.z;
			hitPoint = Q0 / pqk.w;

			return intersect;
		}

		float calculateAlpha(float iterationCount, float reflectivity, vec2 hitPixel, vec3 hitPoint, float dist, vec3 rayDir) {
			float alpha = clamp(reflectivity, 0.0, 1.0);

			// Fade ray hits that approach the maximum iterations
			alpha *= 1.0 - (iterationCount / float(MAX_ITERATION));

			// Fade ray hits that approach the screen edge
			vec2 hitPixelNDC = hitPixel * 2.0 - 1.0;
			float maxDimension = min(1.0, max(abs(hitPixelNDC.x), abs(hitPixelNDC.y)));
			alpha *= 1.0 - max(0.0, maxDimension - screenEdgeFadeStart) / (1.0 - screenEdgeFadeStart);

			// Fade ray hits base on how much they face the camera
			float _eyeFadeStart = eyeFadeStart;
			float _eyeFadeEnd = eyeFadeEnd;
			if (_eyeFadeStart > _eyeFadeEnd) {
				float tmp = _eyeFadeEnd;
				_eyeFadeEnd = _eyeFadeStart;
				_eyeFadeStart = tmp;
			}
			float eyeDir = clamp(rayDir.z, _eyeFadeStart, _eyeFadeEnd);
			alpha *= 1.0 - (eyeDir - _eyeFadeStart) / (_eyeFadeEnd - _eyeFadeStart);

			// Fade ray hits based on distance from ray origin
			alpha *= 1.0 - clamp(dist / maxRayDistance, 0.0, 1.0);

			return alpha;
		}
		void main() {
			vec4 gBufferTexel = texture2D(gBufferTexture1, v_Uv);

			if (gBufferTexel.r < -2.0) {
				discard;
			}

			float g = 1. - gBufferTexel.a;
			if (g <= minGlossiness) {
				discard;
			}

			float reflectivity = g;

			vec3 N = octahedronToUnitVector(gBufferTexel.rg);
			N = normalize((viewInverseTranspose * vec4(N, 0.0)).xyz);

			// Position in view
			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, fetchDepth(gBufferTexture2, v_Uv), 1.0);
			vec4 pos = projectionInv * projectedPos;
			vec3 rayOrigin = pos.xyz / pos.w;

			vec3 rayDir;
			#ifdef IMPORTANCE_SAMPLING
				vec3 upVector = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangentX = normalize(cross(upVector, N));
				vec3 tangentY = normalize(cross(N, tangentX));
				vec3 tangentZ = N;
				rayDir = unrealImportanceSampling(jitterOffset * 20., tangentX, tangentY, tangentZ, -rayOrigin, pow(gBufferTexel.a, 4.0));
			#else
				rayDir = normalize(reflect(normalize(rayOrigin), N));
			#endif

			vec2 hitPixel;
			vec3 hitPoint;
			float iterationCount;

			// Get jitter
			vec2 uv2 = v_Uv * viewportSize;
			float jitter = fract((uv2.x + uv2.y) * 0.25) + jitterOffset;

			bool intersect = traceScreenSpaceRay(rayOrigin, rayDir, jitter, hitPixel, hitPoint, iterationCount);
			// Is empty
			if (!intersect) {
				discard;
			}
			float dist = distance(rayOrigin, hitPoint);

			float alpha = calculateAlpha(iterationCount, reflectivity, hitPixel, hitPoint, dist, rayDir) * float(intersect);

			vec3 hitNormal = octahedronToUnitVector(texture2D(gBufferTexture1, hitPixel).rg);
			hitNormal = normalize((viewInverseTranspose * vec4(hitNormal, 0.0)).xyz);

			// Ignore the pixel not face the ray
			// TODO fadeout ?
			// PENDING Can be configured?
			if (dot(hitNormal, rayDir) >= 0.0) {
				discard;
			}

			vec4 color = texture2D(colorTex, hitPixel);
			gl_FragColor = vec4(color.rgb, color.a * alpha);
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

			gl_FragColor = vec4(finalColor, baseColor.a);
        }
    `
};