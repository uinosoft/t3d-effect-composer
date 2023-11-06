import { ShaderPostPass, Matrix4, ATTACHMENT, Vector3, Vector2 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

// Adapted from https://github.com/n8python/goodGodRays by n8python(https://github.com/n8python)
// and https://github.com/Ameobea/three-good-godrays by Ameobea(https://github.com/Ameobea)
export class GodRaysEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._light = null;

		this.blueNoise = null;
		this.noiseScale = new Vector2(1, 1);
		this.density = 0.006;
		this.maxDensity = 2 / 3;
		this.distanceAttenuation = 2;
		this.raymarchSteps = 60;

		this.blur = false;
		this.blurVariance = 0.1;

		this.edgeRadius = 2;
		this.edgeStrength = 1;

		this._godrayPass = new ShaderPostPass(godraysShader);
		this._blurPass = new ShaderPostPass(blurShader);
		this._compositorPass = new ShaderPostPass(compositorShader);
	}

	get sphereCulling() {
		return !!this._godrayPass.material.defines['SPHERE_SPACE'];
	}

	set sphereCulling(value) {
		value = !!value;

		const defines = this._godrayPass.material.defines;

		if (defines['SPHERE_SPACE'] !== value) {
			defines['SPHERE_SPACE'] = value;
			this._godrayPass.material.needsUpdate = true;
		}
	}

	set light(light) {
		if (this._light === light) return;

		this._light = light;

		const godrayPass = this._godrayPass;

		if (light.isDirectionalLight) {
			godrayPass.material.defines['LIGHT_TYPE'] = LightType.DIRECTIONAL;
		} else if (light.isPointLight) {
			godrayPass.material.defines['LIGHT_TYPE'] = LightType.POINT;
		} else if (light.isSpotLight) {
			godrayPass.material.defines['LIGHT_TYPE'] = LightType.SPOT;
		} else {
			console.warn('Godrays Effect requires a directional, point or spot light source.');
		}

		godrayPass.material.needsUpdate = true;
	}

	get light() {
		return this._light;
	}

	setBlurKernelSize(value) {
		if (KernelSize[value] !== undefined) return;
		this._blurPass.material.defines.KSIZE_ENUM = KernelSize[value];
		this._blurPass.material.needsUpdate = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const light = this._light;

		if (!light) {
			console.warn('Godrays Effect requires a specified light source. Please set it using \'godraysEffect.light = ...\'.');
			return;
		}

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		const lightShadow = light.shadow;

		const tempRT1 = composer._renderTargetCache.allocate(1);
		const tempRT2 = composer._renderTargetCache.allocate(1);

		// Render godrays illum pass

		this._godrayPass.uniforms.blueNoise = this.blueNoise;
		this.noiseScale.toArray(this._godrayPass.uniforms.noiseScale);
		this._godrayPass.uniforms.sceneDepth = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		this._godrayPass.uniforms.density = this.density;
		this._godrayPass.uniforms.maxDensity = this.maxDensity;
		this._godrayPass.uniforms.distanceAttenuation = this.distanceAttenuation;
		this._godrayPass.uniforms.raymarchSteps = this.raymarchSteps;

		this._godrayPass.uniforms.shadowMap = lightShadow.map;
		this._godrayPass.uniforms.lightCameraNear = lightShadow.cameraNear;
		this._godrayPass.uniforms.lightCameraFar = lightShadow.cameraFar;
		_helpVector.setFromMatrixPosition(light.worldMatrix).toArray(this._godrayPass.uniforms.lightPos);
		if (light.isSpotLight) {
			light.getWorldDirection(_helpVector);
			_helpVector.toArray(this._godrayPass.uniforms.lightDirection);
		}
		lightShadow.camera.projectionViewMatrix.toArray(this._godrayPass.uniforms.premultipliedLightCameraMatrix);
		const fNormals = this._godrayPass.uniforms.fNormals;
		const fConstants = this._godrayPass.uniforms.fConstants;
		lightShadow.camera.frustum.planes.forEach((plane, i) => {
			_helpVector.copy(plane.normal).multiplyScalar(-1).toArray(fNormals, i * 3);
			fConstants[i] = -plane.constant;
		});

		gBufferRenderStates.camera.position.toArray(this._godrayPass.uniforms.cameraPos);
		_helpMatrix.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		_helpMatrix.toArray(this._godrayPass.uniforms.cameraProjectionMatrixInv);
		_helpMatrix.copy(gBufferRenderStates.camera.viewMatrix).inverse();
		_helpMatrix.toArray(this._godrayPass.uniforms.cameraMatrixWorld);

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, true);
		this._godrayPass.render(renderer);

		// (Optional) Render blur pass

		if (this.blur) {
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, true);

			this._blurPass.uniforms.tInput = tempRT1.texture;
			this._blurPass.uniforms.resolution[0] = tempRT1.texture.image.width;
			this._blurPass.uniforms.resolution[1] = tempRT1.texture.image.height;
			this._blurPass.uniforms.bSigma = this.blurVariance;
			this._blurPass.render(renderer);
		}

		// Render compositor pass

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, true);
		}

		this._compositorPass.uniforms['godrays'] = this.blur ? tempRT2.texture : tempRT1.texture;
		this._compositorPass.uniforms['sceneDiffuse'] = inputRenderTarget.texture;
		this._compositorPass.uniforms['sceneDepth'] = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._compositorPass.uniforms.resolution[0] = gBuffer.output().width;
		this._compositorPass.uniforms.resolution[1] = gBuffer.output().height;
		this._compositorPass.uniforms.near = gBufferRenderStates.camera.near;
		this._compositorPass.uniforms.far = gBufferRenderStates.camera.far;
		light.color.toArray(this._compositorPass.uniforms.color);
		this._compositorPass.uniforms.edgeStrength = this.edgeStrength;
		this._compositorPass.uniforms.edgeRadius = this.edgeRadius;

		if (finish) {
			this._compositorPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._compositorPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._compositorPass.render(renderer);
		if (finish) {
			this._compositorPass.material.transparent = false;
			this._compositorPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		//

		composer._renderTargetCache.release(tempRT1, 1);
		composer._renderTargetCache.release(tempRT2, 1);
	}

	dispose() {
		this._godrayPass.dispose();
		this._blurPass.dispose();
		this._compositorPass.dispose();
	}

}

const _helpMatrix = new Matrix4();
const _helpVector = new Vector3();

const KernelSize = {
	VERY_SMALL: 0,
	SMALL: 1,
	MEDIUM: 2,
	LARGE: 3,
	VERY_LARGE: 4,
	HUGE: 5
};

const LightType = {
	DIRECTIONAL: 0,
	SPOT: 1,
	POINT: 2
};

const godraysShader = {
	name: 'ec_godrays',
	defines: {
		LIGHT_TYPE: 0,
		SPHERE_SPACE: false
	},
	uniforms: {
		lightPos: [0, 0, 0],
		lightDirection: [1, 1, 1],
		lightCameraNear: 0.1,
		lightCameraFar: 1000,
		shadowMap: null,
		premultipliedLightCameraMatrix: new Array(16),
		fNormals: new Array(6 * 3),
		fConstants: new Array(6),

		blueNoise: null,
		noiseScale: [1, 1],
		density: 0.006,
		maxDensity: 2 / 3,
		distanceAttenuation: 2,
		raymarchSteps: 80,

		sceneDepth: null,

		cameraPos: [0, 0, 0],
		cameraProjectionMatrixInv: new Array(16),
		cameraMatrixWorld: new Array(16)
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform vec3 lightPos;
		uniform float lightCameraNear;
		uniform float lightCameraFar;
		uniform vec3[6] fNormals;
		uniform float[6] fConstants;
		uniform mat4 premultipliedLightCameraMatrix;

		#if LIGHT_TYPE == 2
			uniform samplerCube shadowMap;
		#elif LIGHT_TYPE == 0
			uniform sampler2D shadowMap;
		#elif LIGHT_TYPE == 1
			uniform sampler2D shadowMap;
			uniform vec3 lightDirection;
		#endif
		
		uniform sampler2D blueNoise;
		uniform vec2 noiseScale;
		uniform float density;
		uniform float maxDensity;
		uniform float distanceAttenuation;
		uniform float raymarchSteps;

		uniform sampler2D sceneDepth;
		
		uniform vec3 cameraPos;
		uniform mat4 cameraProjectionMatrixInv;
		uniform mat4 cameraMatrixWorld;

		varying vec2 v_Uv;

		#include <packing>

		vec3 WorldPosFromDepth(float depth, vec2 coord) {
			float z = depth * 2.0 - 1.0;
			vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
			vec4 viewSpacePosition = cameraProjectionMatrixInv * clipSpacePosition;

			// Perspective division
			viewSpacePosition /= viewSpacePosition.w;
			vec4 worldSpacePosition = cameraMatrixWorld * viewSpacePosition;
			return worldSpacePosition.xyz;
		}

		/**
		 * Projects worldPos onto the shadow map of a directional light and returns
		 * that position in UV space.
		 */
		vec3 projectToShadowMap(vec3 worldPos) {
			// use pre-multiplied matrix to transform to light space
			vec4 lightSpacePos = premultipliedLightCameraMatrix * vec4(worldPos, 1.0);
			
			lightSpacePos /= lightSpacePos.w;
			lightSpacePos = lightSpacePos * 0.5 + 0.5;
			return lightSpacePos.xyz;
		}

		vec2 inShadow(vec3 worldPos) {
			#if LIGHT_TYPE == 2
				vec3 shadowMapUV = worldPos - lightPos;
			#else
				vec3 shadowMapUV = projectToShadowMap(worldPos);

				bool isOutsideShadowMap = shadowMapUV.x < 0.0 || shadowMapUV.x > 1.0 || 
					shadowMapUV.y < 0.0 || shadowMapUV.y > 1.0 ||
					shadowMapUV.z < 0.0 || shadowMapUV.z > 1.0;

				#if defined (SPHERE_SPACE) && LIGHT_TYPE == 1
					isOutsideShadowMap = isOutsideShadowMap ||  ((shadowMapUV.x - 0.5) * (shadowMapUV.x - 0.5) + (shadowMapUV.y - 0.5) * (shadowMapUV.y - 0.5)) > 0.25;
				#endif

				if (isOutsideShadowMap) {
					return vec2(1.0, 0.0);
				}
			#endif
			
			#if LIGHT_TYPE == 2
				float depth = unpackRGBAToDepth(textureCube(shadowMap, normalize(shadowMapUV)));
			#else
				float depth = unpackRGBAToDepth(texture2D(shadowMap, shadowMapUV.xy));
			#endif

			#if LIGHT_TYPE == 2
				float dist = distance(lightPos, worldPos);
				float rate = dist / (lightCameraFar - lightCameraNear);
				return vec2(float((dist - depth * (lightCameraFar - lightCameraNear)) > 0.01) , rate);
			#elif LIGHT_TYPE == 0
				float dist = ((lightCameraFar - lightCameraNear) * shadowMapUV.z);
				return vec2(step(depth, shadowMapUV.z), shadowMapUV.z);
			#elif LIGHT_TYPE == 1
				float dist = distance(lightPos, worldPos);    
				vec3 lightV = normalize(lightPos - worldPos);
				float angleCos = dot(lightV, -normalize(lightDirection));
				float rate = abs((dist * angleCos) / (lightCameraFar - lightCameraNear)); 
				return vec2(step(depth, shadowMapUV.z), rate);
			#endif
		}
			
		/**
		 * Calculates the signed distance from point p to a plane defined by
		 * normal n and distance h from the origin.
		 *
		 * n must be normalized.
		 */
		float sdPlane(vec3 p, vec3 n, float h) {
			return dot(p, n) + h;
		}
		
		/**
		 * Calculates the intersection of a ray defined by rayOrigin and rayDirection
		 * with a plane defined by normal planeNormal and distance planeDistance
		 *
		 * Returns the distance from the ray origin to the intersection point.
		 *
		 * The return value will be negative if the ray does not intersect the plane.
		 */
		float intersectRayPlane(vec3 rayOrigin, vec3 rayDirection, vec3 planeNormal, float planeDistance) {
			float denom = dot(planeNormal, rayDirection);
			return -(sdPlane(rayOrigin, planeNormal, planeDistance) / denom);
		}
			
		void main() {
			float depth = texture2D(sceneDepth, v_Uv).x;
			
			vec3 worldPos = WorldPosFromDepth(depth, v_Uv);

			float inBoxDist = -10000.0;
			for (int i = 0; i < 6; i++) {
				inBoxDist = max(inBoxDist, sdPlane(cameraPos, fNormals[i], fConstants[i]));
			}
			bool cameraIsInBox = inBoxDist < 0.0;

			vec3 startPos = cameraPos;

			#if LIGHT_TYPE == 0 || LIGHT_TYPE == 1
				// optimize spotLight and directionalLight
				if (cameraIsInBox) {
					// If the ray target is outside the shadow box, move it to the nearest
					// point on the box to avoid marching through unlit space
					for(int i = 0; i < 6; i++) {
						if (sdPlane(worldPos, fNormals[i], fConstants[i]) > 0.0) {
							vec3 direction = normalize(worldPos - cameraPos);
							float t = intersectRayPlane(cameraPos, direction, fNormals[i], fConstants[i]);
							worldPos = cameraPos + t * direction;
						}
					}
				} else {
					// Find the first point where the ray intersects the shadow box (startPos)
					vec3 direction = normalize(worldPos - cameraPos);
					float minT = 10000.0;

					for (int i = 0; i < 6; i++) {
						float t = intersectRayPlane(cameraPos, direction, fNormals[i], fConstants[i]);
						if (t < minT && t > 0.0) {
							minT = t;
						}
					}

					if (minT == 10000.0) {
						gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
						return;
					}

					startPos = cameraPos + (minT + 0.001) * direction;
				
					// If the ray target is outside the shadow box, move it to the nearest
					// point on the box to avoid marching through unlit space
					float endInBoxDist = -10000.0;

					for (int i = 0; i < 6; i++) {
						endInBoxDist = max(endInBoxDist, sdPlane(worldPos, fNormals[i], fConstants[i]));
					}

					bool endInBox = false;

					if (endInBoxDist < 0.0) {
						endInBox = true;
					}

					if (!endInBox) {
						float minT = 10000.0;

						for (int i = 0; i < 6; i++) {
							if (sdPlane(worldPos, fNormals[i], fConstants[i]) > 0.0) {
								float t = intersectRayPlane(startPos, direction, fNormals[i], fConstants[i]);
								if (t < minT && t > 0.0) {
									minT = t;
								}
							}
						}
					
						if (minT < distance(worldPos, startPos)) {
							worldPos = startPos + minT * direction;
						}
					}
				}
			#endif

			float illum = 0.0;

			vec4 blueNoiseSample = texture2D(blueNoise, v_Uv * noiseScale);

			float samplesFloat = round(raymarchSteps + ((raymarchSteps / 2.) + 2.) * blueNoiseSample.x);
			int samples = int(samplesFloat);
			for (int i = 0; i < samples; i++) {
				vec3 samplePos = mix(startPos, worldPos, float(i) / samplesFloat);
				vec2 shadowInfo = inShadow(samplePos);
				float shadowAmount = 1.0 - shadowInfo.x;

				#if LIGHT_TYPE == 0
					illum += shadowAmount * (distance(startPos, worldPos) * density) * pow(1.0 - shadowInfo.y, distanceAttenuation);
				#else
					illum += shadowAmount * (distance(startPos, worldPos) * density) * exp(-distanceAttenuation * shadowInfo.y);
				#endif
			}

			illum /= samplesFloat;

			gl_FragColor = vec4(vec3(clamp(1.0 - exp(-illum), 0.0, maxDensity)), depth);
		}
	`
};

const blurShader = {
	name: 'ec_godrays_blur',
	defines: {
		KSIZE_ENUM: KernelSize.SMALL
	},
	uniforms: {
		tInput: null,
		resolution: [1, 1],
		bSigma: 0.1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D tInput;
		uniform vec2 resolution;
		uniform float bSigma;

		varying vec2 v_Uv;

		#if (KSIZE_ENUM == 0)
			#define KSIZE 2
			#define MSIZE 5
			const float kernel[MSIZE] = float[MSIZE](0., 0.24196934138575799, 0.39894, 0.24196934138575799, 0.);
		#elif (KSIZE_ENUM == 1)
			#define KSIZE 3
			#define MSIZE 7
			const float kernel[MSIZE] = float[MSIZE](0., 0.39104045872899694, 0.3969502784491287, 0.39894, 0.3969502784491287, 0.39104045872899694, 0.);
		#elif (KSIZE_ENUM == 2)
			#define KSIZE 4
			#define MSIZE 9
			const float kernel[MSIZE] = float[MSIZE](0., 0.3813856354024969, 0.39104045872899694, 0.3969502784491287, 0.39894, 0.3969502784491287, 0.39104045872899694, 0.3813856354024969, 0.);
		#elif (KSIZE_ENUM == 3)
			#define KSIZE 5
			#define MSIZE 11
			const float kernel[MSIZE] = float[MSIZE](0., 0.03682680352274845, 0.03813856354024969, 0.039104045872899694, 0.03969502784491287, 0.039894, 0.03969502784491287, 0.039104045872899694, 0.03813856354024969, 0.03682680352274845, 0.);
		#elif (KSIZE_ENUM == 4)
			#define KSIZE 6
			#define MSIZE 13
			const float kernel[MSIZE] = float[MSIZE](0., 0.035206331431709856, 0.03682680352274845, 0.03813856354024969, 0.039104045872899694, 0.03969502784491287, 0.039894, 0.03969502784491287, 0.039104045872899694, 0.03813856354024969, 0.03682680352274845, 0.035206331431709856, 0.);
		#elif (KSIZE_ENUM == 5)
			#define KSIZE 7
			#define MSIZE 15
			const float kernel[MSIZE] = float[MSIZE](0.031225216, 0.033322271, 0.035206333, 0.036826804, 0.038138565, 0.039104044, 0.039695028, 0.039894000, 0.039695028, 0.039104044, 0.038138565, 0.036826804, 0.035206333, 0.033322271, 0.031225216);
		#endif

		float normpdf(in float x, in float sigma) {
			return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
		}

		float normpdf3(in vec3 v, in float sigma) {
			return 0.39894 * exp(-0.5 * dot(v, v) / (sigma * sigma)) / sigma;
		}

		void main() {
			vec3 c = texture(tInput, v_Uv).rgb;
			ivec2 fragCoord = ivec2(v_Uv * resolution);
			vec3 finalColor = vec3(0.);

			float bZ = 1.0 / normpdf(0.0, bSigma);
			float totalFactor = 0.;
			for (int i = -KSIZE; i <= KSIZE; ++i) {
				for (int j = -KSIZE; j <= KSIZE; ++j) {
					vec3 cc = texelFetch(tInput, fragCoord + ivec2(i, j), 0).rgb;
					float factor = normpdf3(cc - c, bSigma) * bZ * kernel[KSIZE + j] * kernel[KSIZE + i];
					totalFactor += factor;
					finalColor += factor * cc;
				}
			}

			gl_FragColor = vec4(finalColor / totalFactor, 1.);
		}
	`
};

const compositorShader = {
	name: 'ec_godrays_blend',
	defines: {},
	uniforms: {
		godrays: null,
		sceneDiffuse: null,
		sceneDepth: null,
		resolution: [1, 1],
		near: 0.1,
		far: 1000.0,
		color: [1, 1, 1],
		edgeStrength: 2,
		edgeRadius: 2
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D godrays;
		uniform sampler2D sceneDiffuse;
		uniform sampler2D sceneDepth;
		uniform vec2 resolution;
		uniform float near;
		uniform float far;
		uniform vec3 color;
		uniform float edgeStrength;
		uniform float edgeRadius;

		varying vec2 v_Uv;

		#define DITHERING

		#include <dithering_pars_frag>

		float linearize_depth (float d, float zNear, float zFar) {
			return zNear * zFar / (zFar + d * (zNear - zFar));
		}

		void main() {
			float rawDepth = texture2D(sceneDepth, v_Uv).x;
			float correctDepth = linearize_depth(rawDepth, near, far);

			vec2 pushDir = vec2(0.0);
			float count = 0.0;
			for (float x = -edgeRadius; x <= edgeRadius; x++) {
				for (float y = -edgeRadius; y <= edgeRadius; y++) {
					vec2 sampleUv = (v_Uv * resolution + vec2(x, y)) / resolution;

					// float sampleDepth = linearize_depth(texture2D(sceneDepth, sampleUv).x, near, far);
					float sampleDepth = texelFetch(sceneDepth, ivec2(sampleUv * resolution), 0).x;

					sampleDepth = linearize_depth(sampleDepth, near, far);

					if (abs(sampleDepth - correctDepth) < 0.05 * correctDepth) {
						pushDir += vec2(x, y);
						count += 1.0;
					}
				}
			}

			if (count == 0.0) {
				count = 1.0;
			}

			pushDir /= count;
			pushDir = normalize(pushDir);
			vec2 sampleUv = length(pushDir) > 0.0 ? v_Uv + edgeStrength * (pushDir / resolution) : v_Uv;
			float bestChoice = texture2D(godrays, sampleUv).x;

			vec3 diffuse = texture2D(sceneDiffuse, v_Uv).rgb;

			gl_FragColor = vec4(mix(diffuse, color, bestChoice), 1.0);

			#include <dithering_frag>
		}
	`
};