import { ShaderPostPass, ATTACHMENT, Color3, Vector3 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

// refer:
// https://www.flyandnotdown.com/post/3f3b31e8-f589-4e02-9b28-2c3c19f6f79b
// https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/
export class ContactShadowEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this.jitter = true;

		this.shadowColor = new Color3(0, 0, 0);
		this.shadowIntensity = 0.3;
		this.rayLength = 10.0;
		this.lightDirection = new Vector3(0, -1, 0);
		this.pixelStride = 1;
		this.zThicknessThreshold = 0.1;
		this.bias = 0.0001;

		this.numSteps = 200;
		this.thicknessAttenuation = false;
		this.distanceAttenuation = false;

		this._contactShadowPass = new ShaderPostPass(ContactShadowShader);
		this._contactShadowPass.material.depthTest = false;
		this._contactShadowPass.material.depthWrite = false;
	}

	resize(width, height) {
		this._contactShadowPass.uniforms.viewportSize[0] = width;
		this._contactShadowPass.uniforms.viewportSize[1] = height;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const gBuffer = composer.getBuffer('GBuffer');
		const renderStates = gBuffer.getCurrentRenderStates();

		const projectionMatrix = renderStates.camera.projectionMatrix;
		const viewMatrix = renderStates.camera.viewMatrix;
		const cameraNear = renderStates.camera.near;
		const cameraFar = renderStates.camera.far;

		const contactShadowPass = this._contactShadowPass;

		contactShadowPass.material.uniforms.colorTex = inputRenderTarget.texture;
		contactShadowPass.material.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		contactShadowPass.material.uniforms.cameraNear = cameraNear;
		contactShadowPass.material.uniforms.cameraFar = cameraFar;
		projectionMatrix.toArray(contactShadowPass.material.uniforms.projection);
		viewMatrix.toArray(contactShadowPass.material.uniforms.view);

		this.shadowColor.toArray(contactShadowPass.material.uniforms.shadowColor);
		contactShadowPass.material.uniforms.shadowIntensity = this.shadowIntensity;
		contactShadowPass.material.uniforms.rayLength = this.rayLength;
		this.lightDirection.toArray(contactShadowPass.material.uniforms.lightDirection);
		contactShadowPass.material.uniforms.pixelStride = this.pixelStride;
		contactShadowPass.material.uniforms.zThicknessThreshold = this.zThicknessThreshold;
		contactShadowPass.material.uniforms.bias = this.bias;

		const cameraJitter = composer.$cameraJitter;
		contactShadowPass.uniforms.jitterOffset = (this.jitter && cameraJitter.accumulating()) ? (cameraJitter.frame() * 0.5 / cameraJitter.totalFrame()) : 0;

		if (contactShadowPass.material.defines.MAX_STEPS != this.numSteps) {
			contactShadowPass.material.defines.MAX_STEPS = this.numSteps;
			contactShadowPass.material.needsUpdate = true;
		}
		if (contactShadowPass.material.defines.USE_THICKNESS_ATTENUATION != this.thicknessAttenuation) {
			contactShadowPass.material.defines.USE_THICKNESS_ATTENUATION = this.thicknessAttenuation;
			contactShadowPass.material.needsUpdate = true;
		}
		if (contactShadowPass.material.defines.USE_DISTANCE_ATTENUATION != this.distanceAttenuation) {
			contactShadowPass.material.defines.USE_DISTANCE_ATTENUATION = this.distanceAttenuation;
			contactShadowPass.material.needsUpdate = true;
		}

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		if (finish) {
			contactShadowPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			contactShadowPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		contactShadowPass.render(renderer);
		if (finish) {
			contactShadowPass.material.transparent = false;
			contactShadowPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._contactShadowPass.dispose();
	}

}

const ContactShadowShader = {
	name: 'ec_contact_shadow',
	defines: {
		MAX_STEPS: 50,
		USE_THICKNESS_ATTENUATION: false,
		USE_DISTANCE_ATTENUATION: false
	},
	uniforms: {
		colorTex: null,
		depthTex: null,
		cameraNear: 0.1,
		cameraFar: 100.0,
		projection: new Float32Array(16),
		view: new Float32Array(16),
		viewportSize: [512, 512],
		jitterOffset: 0,
		shadowColor: [0.0, 0.0, 0.0],
		shadowIntensity: 0.5,
		rayLength: 5.0,
		pixelStride: 1,
		zThicknessThreshold: 0.5,
		lightDirection: [0.0, -1.0, 0.0],
		bias: 0.0001

	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D depthTex;
		uniform sampler2D colorTex;
		
		uniform mat4 projection;
		uniform mat4 view;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform vec2 viewportSize;
		uniform float jitterOffset;

		uniform vec3 shadowColor;
		uniform float shadowIntensity;
		uniform float rayLength;
		uniform float pixelStride;
		uniform float zThicknessThreshold;
		uniform vec3 lightDirection;
		uniform float bias;

		varying vec2 v_Uv;

		float fetchDepth(vec2 uv) {
			vec4 depthTexel = texture2D(depthTex, uv);
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
			float cameraZ = linearDepth(fetchDepth(hitPixel));
			// Cross z
			return rayZFar <= cameraZ && rayZNear >= cameraZ - zThicknessThreshold;
		}

		float screenFade(vec2 uv) {
			// fade near edges to avoid hard cut
			vec2 edge = min(uv, 1.0 - uv);
			float d = min(edge.x, edge.y);
			return clamp(d * 5.0, 0.0, 1.0);
		}

		float traceScreenSpaceContactShadow(vec3 rayOrigin, vec3 rayDir, float jitter, out vec2 hitPixel, out vec3 hitPoint, out float iterationCount) {
			// Clip to the near plane
			float rayLen = ((rayOrigin.z + rayDir.z * rayLength) > -cameraNear) ? (-cameraNear - rayOrigin.z) / rayDir.z : rayLength;
			vec3 rayEnd = rayOrigin + rayDir * rayLen;

			// Project into homogeneous clip space
			vec4 H0 = projection * vec4(rayOrigin, 1.0);
			vec4 H1 = projection * vec4(rayEnd, 1.0);

			float k0 = 1.0 / H0.w, k1 = 1.0 / H1.w;

			// The interpolated homogeneous version of the camera space points
			vec3 Q0 = rayOrigin * k0, Q1 = rayEnd * k1;

			// Screen space endpoints
			vec2 P0 = (H0.xy * k0 * 0.5 + 0.5) * viewportSize;
			vec2 P1 = (H1.xy * k1 * 0.5 + 0.5) * viewportSize;
			
			// Clip to frustum
			float xMax = viewportSize.x - 0.5, xMin = 0.5, yMax = viewportSize.y - 0.5, yMin = 0.5;
			float alpha = 0.0;
			if ((P1.y > yMax) || (P1.y < yMin)) {
				alpha = (P1.y - ((P1.y > yMax) ? yMax : yMin)) / (P1.y - P0.y);
			}
			if ((P1.x > xMax) || (P1.x < xMin)) {
				alpha = max(alpha, (P1.x - ((P1.x > xMax) ? xMax : xMin)) / (P1.x - P0.x));
			}
			P1 = mix(P1, P0, alpha); k1 = mix(k1, k0, alpha); Q1 = mix(Q1, Q0, alpha);

			// If the line is degenerate, make it cover at least one pixel
			P1 += dot(P1 - P0, P1 - P0) < 0.0001 ? 0.01 : 0.0;
			vec2 delta = P1 - P0;

			// Permute so that the primary iteration is in x
			bool permute = false;
			if (abs(delta.x) < abs(delta.y)) {
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
			
			float pixStride = pixelStride;
			// Scale derivatives by the desired pixel stride
			dP *= pixStride; dQ *= pixStride; dk *= pixStride;

			// Track ray step and derivatives in a vec4
			vec4 pqk = vec4(P0, Q0.z, k0);
			vec4 dPQK = vec4(dP, dQ.z, dk);

			pqk += dPQK * jitter + bias;
			float rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);
			float rayZNear;

			bool intersect = false;
			vec2 texelSize = 1.0 / viewportSize;

			float iteractionCount = 0.0;
			float end = P1.x * stepDir;
			float occlusion = 0.0;
			for (int i = 0; i < MAX_STEPS; i++) {
				pqk += dPQK;
				if ((pqk.x * stepDir) >= end) {
					break;
				}

				rayZNear = rayZFar;
				rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);

				hitPixel = permute ? pqk.yx : pqk.xy;
				hitPixel *= texelSize;

				intersect = rayIntersectDepth(rayZNear, rayZFar, hitPixel);
				iteractionCount += 1.0;

				if (intersect) {
					#ifdef USE_THICKNESS_ATTENUATION
						float cameraZ = linearDepth(fetchDepth(hitPixel));
						float thickness = zThicknessThreshold;
						float fade = screenFade(hitPixel);
						float t = clamp(1.0 - (cameraZ - rayZFar) / max(thickness, 1e-5), 0.0, 1.0);
						t *= t;
						occlusion = fade * t;
						break;
					#else
						occlusion = 1.0;
						break;
					#endif
				}
			}
			Q0.xy += dQ.xy * iterationCount;
			Q0.z = pqk.z;
			hitPoint = Q0 / pqk.w;

			return occlusion;
		}
		
		void main() {
			vec4 originalColor = texture2D(colorTex, v_Uv);
			float depth = fetchDepth(v_Uv);
			
			// Skip background pixels
			if (depth >= 1.0) {
				gl_FragColor = originalColor;
				return;
			}

			// Position in view space
			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depth, 1.0);
			vec4 pos = inverse(projection) * projectedPos;
			vec3 rayOrigin = pos.xyz / pos.w;

			vec3 rayDir = -(view * vec4(normalize(lightDirection), 0.0)).xyz;

			// Get jitter
			vec2 uv2 = v_Uv * viewportSize;
			// float jitter = fract((uv2.x + uv2.y) * 0.25) + jitterOffset;
			float jitter = jitterOffset;

			float iterationCount;
			
			vec2 hitPixel;
			vec3 hitPoint;
			float occlusion;

			occlusion = traceScreenSpaceContactShadow(rayOrigin, rayDir, jitter, hitPixel, hitPoint, iterationCount);

			float shadowFactor = occlusion * shadowIntensity;

			#ifdef USE_DISTANCE_ATTENUATION	
				float dist = distance(rayOrigin, hitPoint);
				shadowFactor *= 1.0 - dist / rayLength;
			#endif

			vec3 finalColor = mix(originalColor.rgb, shadowColor, shadowFactor);
			
			gl_FragColor = vec4(vec3(finalColor), originalColor.a);
		}
	`
};