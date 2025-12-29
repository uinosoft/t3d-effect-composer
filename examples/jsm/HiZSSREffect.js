import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL, blurShader } from 't3d-effect-composer';

// ref: https://sugulee.wordpress.com/2021/01/19/screen-space-reflections-implementation-and-optimization-part-2-hi-z-tracing-method/
export class HiZSSREffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		// Maximum steps of ray marching
		this.maxSteps = 64;

		// Maximum distance of ray marching
		this.maxRayDistance = 200;

		// Object larger than minGlossiness will have ssr effect
		this.minGlossiness = 0.2;

		// the strength of ssr effect
		this.strength = 0.2;

		// the falloff of base color when mix with ssr color
		this.falloff = 1;

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

		if (inputRenderTarget) {
			this._copyRGBPass.uniforms.tDiffuse = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			tempRT1.setClear(false, false, false);
			this._copyRGBPass.render(renderer, tempRT1); // clear rgb channel to scene color and alpha channel to 0
		} else {
			tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		}

		this._ssrPass.uniforms.colorTex = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssrPass.uniforms.gBufferTexture1 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssrPass.uniforms.gBufferTexture2 = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._ssrPass.uniforms.viewportSize[0] = gBuffer.output().width;
		this._ssrPass.uniforms.viewportSize[1] = gBuffer.output().height;

		if (!gBuffer.supportHiz) gBuffer.supportHiz = true;
		this._ssrPass.uniforms.hizTexture = gBuffer.hizTexture();
		this._ssrPass.uniforms.hizMaxLevel = gBuffer.hizTexture().mipmaps.length - 1;

		projection.toArray(this._ssrPass.uniforms.projection);
		projectionInv.toArray(this._ssrPass.uniforms.projectionInv);
		viewInverseTranspose.toArray(this._ssrPass.uniforms.viewInverseTranspose);

		this._ssrPass.uniforms.maxRayDistance = this.maxRayDistance;
		this._ssrPass.uniforms.minGlossiness = this.minGlossiness;
		this._ssrPass.uniforms.nearZ = gBufferRenderStates.camera.near;
		this._ssrPass.uniforms.zThicknessThreshold = this.zThicknessThreshold;

		const cameraJitter = composer.$cameraJitter;
		this._ssrPass.uniforms.jitterOffset = (this.jitter && cameraJitter.accumulating()) ? (cameraJitter.frame() * 0.5 / cameraJitter.totalFrame()) : 0;

		if (this._ssrPass.material.defines.MAX_ITERATION !== this.maxSteps) {
			this._ssrPass.material.needsUpdate = true;
			this._ssrPass.material.defines.MAX_ITERATION = this.maxSteps;
		}

		const importanceSampling = !!this.importanceSampling;
		if (importanceSampling !== this._ssrPass.material.defines.IMPORTANCE_SAMPLING) {
			this._ssrPass.material.needsUpdate = true;
			this._ssrPass.material.defines.IMPORTANCE_SAMPLING = importanceSampling;
		}

		this._ssrPass.render(renderer, tempRT1);

		// Step 2: blurX pass

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

		// Step 3: blurY pass

		this._blurPass.uniforms.direction = 1;
		this._blurPass.uniforms.tDiffuse = tempRT2.texture;
		const renderTarget = (inputRenderTarget ? tempRT1 : outputRenderTarget)
			.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._blurPass.render(renderer, renderTarget);

		// Step 4: blend pass

		if (inputRenderTarget) {
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT1.texture;
			this._blendPass.uniforms.strength = this.strength;
			this._blendPass.uniforms.falloff = this.falloff;

			composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
			this._blendPass.render(renderer, outputRenderTarget);
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
	name: 'ec_ssr_hiz',
	defines: {
		MAX_ITERATION: 64,
		IMPORTANCE_SAMPLING: false
	},
	uniforms: {
		colorTex: null,
		gBufferTexture1: null,
		gBufferTexture2: null,

		hizTexture: null,
		hizMaxLevel: 0,

		projection: new Float32Array(16),
		projectionInv: new Float32Array(16),
		viewInverseTranspose: new Float32Array(16),

		maxRayDistance: 200,
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

        uniform sampler2D hizTexture;
        uniform float hizMaxLevel;

        uniform mat4 projection;
        uniform mat4 projectionInv;
        uniform mat4 viewInverseTranspose;

        uniform float maxRayDistance;
        uniform float minGlossiness;
        uniform float nearZ;
        uniform float zThicknessThreshold;
        uniform float jitterOffset;
        uniform vec2 viewportSize;

        ${octahedronToUnitVectorGLSL}

        float fetchDepth(sampler2D depthTexture, vec2 uv) {
            vec4 depthTexel = texture2D(depthTexture, uv);
            return depthTexel.r * 2.0 - 1.0;
        }

        float linearDepth(float depth) {
            return projection[3][2] / (depth * projection[2][3] - projection[2][2]);
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

        // Hi-Z Helper Functions

        vec2 getCellCount(int level) {
            return floor(viewportSize / exp2(float(level)));
        }

        vec2 getCell(vec2 ray, vec2 cellCount) {
            return floor(ray * cellCount);
        }

        vec3 intersectDepthPlane(vec3 o, vec3 d, float t, float jitter) {	
            vec2 pixelUV = 1.0 / viewportSize;
            float dtPixelX = pixelUV.x / max(abs(d.x), 1e-6);
            float dtPixelY = pixelUV.y / max(abs(d.y), 1e-6);
            float dtPixel  = min(dtPixelX, dtPixelY);
            return o + d * (t + jitter * dtPixel);
        }

        vec3 intersectCellBoundary(vec3 o, vec3 d, vec2 cellIndex, vec2 cellCount, vec2 crossStep, vec2 crossOffset, float jitter) {
            vec2 index = cellIndex + crossStep;
            vec2 boundary = index / cellCount;
            boundary += crossOffset;
            
            vec2 delta = boundary - o.xy;
            delta /= d.xy;
            
            float t = min(delta.x, delta.y);
            
            return intersectDepthPlane(o, d, t, jitter);
        }

        bool crossedCellBoundary(vec2 cellIdxA, vec2 cellIdxB) {
            return (cellIdxA.x != cellIdxB.x) || (cellIdxA.y != cellIdxB.y);
        }

        float getMinimumDepthPlane(vec2 uv, float level) {
            return textureLod(hizTexture, uv, level).r * 2.0 - 1.0;
        }

        float kFromDepth01(float depth01) {
            float viewZ = linearDepth(depth01);
            return 1.0 / viewZ;
        }

        bool FindIntersection_HiZ(
            vec3 samplePosInTS,
            vec3 vReflDirInTS,
            float maxTraceDistance,
            float jitter,
            out vec3 intersection
        ) {
            int maxLevel = int(hizMaxLevel);

            vec2 crossStep = vec2(
                (vReflDirInTS.x >= 0.0) ? 1.0 : -1.0,
                (vReflDirInTS.y >= 0.0) ? 1.0 : -1.0
            );
            vec2 crossOffset = crossStep / viewportSize / 128.0;
            crossStep = clamp(crossStep, 0.0, 1.0);

            vec3 ray = samplePosInTS.xyz;
            float minZ = ray.z;
            float maxZ = ray.z + vReflDirInTS.z * maxTraceDistance;
            float deltaZ = (maxZ - minZ);

            vec3 o = ray;
            vec3 d = vReflDirInTS * maxTraceDistance;

            int startLevel = 0;
            int stopLevel = 0;
            vec2 startCellCount = getCellCount(startLevel);

            vec2 rayCell = getCell(ray.xy, startCellCount);
            ray = intersectCellBoundary(o, d, rayCell, startCellCount, crossStep, crossOffset * 64.0, jitter);

            int level = startLevel;
            int iter = 0;
            bool isBackwardRay = (vReflDirInTS.z < 0.0);
            float rayDir = isBackwardRay ? -1.0 : 1.0;

            while (level >= stopLevel && ray.z * rayDir <= maxZ * rayDir && iter < MAX_ITERATION)
            {
                vec2 cellCount = getCellCount(level);
                vec2 oldCellIdx = getCell(ray.xy, cellCount);

                float cell_minZ = getMinimumDepthPlane((oldCellIdx + 0.5) / cellCount, float(level));
                cell_minZ = kFromDepth01(cell_minZ);
                vec3 tmpRay = ((cell_minZ > ray.z) && !isBackwardRay)
                    ? intersectDepthPlane(o, d, (cell_minZ - minZ) / deltaZ, jitter)
                    : ray;

                vec2 newCellIdx = getCell(tmpRay.xy, cellCount);

                float rayZNearVS = 1.0 / ray.z;
                float cameraZVS = 1.0 / cell_minZ;

                bool tooThick = (level == 0) && !(rayZNearVS >= cameraZVS - zThicknessThreshold);
                bool crossed = (isBackwardRay && (cell_minZ > ray.z))
                    || tooThick
                    || crossedCellBoundary(oldCellIdx, newCellIdx);

                ray = crossed
                    ? intersectCellBoundary(o, d, oldCellIdx, cellCount, crossStep, crossOffset, jitter)
                    : tmpRay;

                level = crossed ? min(maxLevel, level + 1) : (level - 1);

                ++iter;
            }

            bool intersected = (level < stopLevel);
            intersection = ray;

            return intersected;
        }
            
        void ComputePosAndReflection(
            vec3 sampleNormalVS,
            vec4 gBufferTexel,
            out vec3 outSamplePosTS,
            out vec3 outReflDirTS,
            out float outMaxDistance
        ) {
            float sampleDepthNDC = fetchDepth(gBufferTexture2, v_Uv);
            vec4 samplePosCS = vec4(v_Uv * 2.0 - 1.0, sampleDepthNDC, 1.0);

            vec4 samplePosVS4 = projectionInv * samplePosCS;
            vec3 samplePosVS = samplePosVS4.xyz / samplePosVS4.w;

            vec3 vCamToSampleVS = normalize(samplePosVS);
            vec3 reflVS;
            #ifdef IMPORTANCE_SAMPLING
                vec3 upVector = abs(sampleNormalVS.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
                vec3 tangentX = normalize(cross(upVector, sampleNormalVS));
                vec3 tangentY = normalize(cross(sampleNormalVS, tangentX));
                vec3 tangentZ = sampleNormalVS;
                reflVS = unrealImportanceSampling(jitterOffset * 20., tangentX, tangentY, tangentZ, -vCamToSampleVS,pow(clamp(gBufferTexel.a, 0.0, 1.0), 4.0));
            #else
                reflVS = reflect(vCamToSampleVS, normalize(sampleNormalVS));
            #endif

            // Clip ray to near plane if reflecting backwards
            float dist = maxRayDistance;
            if (reflVS.z > 0.0) {
                float t = (-nearZ - 0.01 - samplePosVS.z) / reflVS.z;
                dist = max(t, 0.0);
            }

            vec3 rayEndVS = samplePosVS + reflVS * dist;

            vec4 rayEndCS = projection * vec4(rayEndVS, 1.0);
            vec4 rayEndNDC = rayEndCS / rayEndCS.w;

            vec2 rayEndUV = rayEndNDC.xy * 0.5 + 0.5;
            vec2 startUV = v_Uv;

            outSamplePosTS.xy = startUV;
            outSamplePosTS.z = 1.0 / samplePosVS.z; // k0 (1/viewZ)

            outReflDirTS.xy = rayEndUV - startUV;
            outReflDirTS.z = (1.0 / rayEndVS.z) - outSamplePosTS.z; // deltaK

            // Clip to Screen [0,1]
            float tMax = 1.0;
            if (outReflDirTS.x > 0.0) tMax = min(tMax, (1.0 - startUV.x) / outReflDirTS.x);
            else if (outReflDirTS.x < 0.0) tMax = min(tMax, (0.0 - startUV.x) / outReflDirTS.x);

            if (outReflDirTS.y > 0.0) tMax = min(tMax, (1.0 - startUV.y) / outReflDirTS.y);
            else if (outReflDirTS.y < 0.0) tMax = min(tMax, (0.0 - startUV.y) / outReflDirTS.y);

            outMaxDistance = tMax;
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
        
            vec3 samplePosTS; 
            vec3 reflDirTS;
            float maxDist;
            ComputePosAndReflection(N, gBufferTexel, samplePosTS, reflDirTS, maxDist);

            vec2 uv2 = v_Uv * viewportSize;
            float jitter = fract((uv2.x + uv2.y) * 0.25) + jitterOffset;

            vec3 hitTS;
            bool intersect = false;
            intersect = FindIntersection_HiZ(samplePosTS, reflDirTS, maxDist, jitter, hitTS);
            if (!intersect) {
                discard;
            }

            vec4 col = texture2D(colorTex, hitTS.xy);
            gl_FragColor = vec4(col.rgb, clamp(reflectivity, 0.0, 1.0));     
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