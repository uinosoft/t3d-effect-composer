import { ShaderPostPass, ATTACHMENT, Matrix4, Texture2D, Vector3, PIXEL_TYPE, TEXTURE_FILTER, TEXTURE_WRAP } from 't3d';
import Effect from './Effect.js';
import { defaultVertexShader, blurShader, multiplyShader } from '../Utils.js';

export default class SSAOEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._ssaoPass = new ShaderPostPass(ssaoShader);

		// Sampling radius in work space.
		// Larger will produce more soft concat shadow.
		// But also needs higher quality or it will have more obvious artifacts
		this.radius = 0.5;

		this.power = 1;

		this.bias = 0.1;

		this.intensity = 1;

		this.autoSampleWeight = false;

		// Quality of SSAO. 'Low'|'Medium'|'High'|'Ultra'
		this.quality = 'Medium';

		this._kernelCode = '';
		this._kernelSize = -1;

		this._setNoiseSize(64);
		this._setKernelSize(16);

		this._blurPass = new ShaderPostPass(blurShader);
		this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
		this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;

		this.blurSize = 1;
		this.depthRange = 1;
		this.jitter = true;

		this._blendPass = new ShaderPostPass(multiplyShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);

		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projection.copy(gBufferRenderStates.camera.projectionMatrix);
		projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

		// Step 1: ssao pass

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._ssaoPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._ssaoPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._ssaoPass.uniforms.texSize[0] = gBuffer.output().width;
		this._ssaoPass.uniforms.texSize[1] = gBuffer.output().height;

		projection.toArray(this._ssaoPass.uniforms.projection);
		projectionInv.toArray(this._ssaoPass.uniforms.projectionInv);
		viewInverseTranspose.toArray(this._ssaoPass.uniforms.viewInverseTranspose);

		const cameraJitter = composer.$cameraJitter;
		this._setKernelSize(_qualityMap[this.quality], (this.jitter && cameraJitter.accumulating()) ? cameraJitter.frame() : 0);

		this._ssaoPass.uniforms.radius = this.radius;
		this._ssaoPass.uniforms.power = this.power;
		this._ssaoPass.uniforms.bias = this.bias;
		this._ssaoPass.uniforms.intensity = this.intensity;
		if (this._ssaoPass.material.defines.AUTO_SAMPLE_WEIGHT != this.autoSampleWeight) {
			this._ssaoPass.material.needsUpdate = true;
			this._ssaoPass.material.defines.AUTO_SAMPLE_WEIGHT = this.autoSampleWeight;
		}

		this._ssaoPass.render(renderer);

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

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._ssaoPass.dispose();
		this._blurPass.dispose();
		this._blendPass.dispose();
	}

	_setKernelSize(size, offset = 0) {
		const code = size + '_' + offset;

		if (this._kernelCode === code) return;

		this._kernelCode = code;

		if (!_kernels[code]) {
			_kernels[code] = generateKernel(size, offset * size);
		}

		this._ssaoPass.uniforms.kernel = _kernels[code];
		if (this._ssaoPass.material.defines.KERNEL_SIZE !== size) {
			this._ssaoPass.material.defines.KERNEL_SIZE = size;
			this._ssaoPass.material.needsUpdate = true;
		}
	}

	_setNoiseSize(size) {
		if (this._noiseSize === size) return;

		this._noiseSize = size;

		const uniforms = this._ssaoPass.uniforms;

		if (!uniforms.noiseTex) {
			uniforms.noiseTex = generateNoiseTexture(size);
		} else {
			uniforms.noiseTex.image.data = generateNoiseData(size);
			uniforms.noiseTex.image.width = size;
			uniforms.noiseTex.image.height = size;
			uniforms.noiseTex.version++;
		}

		uniforms.noiseTexSize[0] = size;
		uniforms.noiseTexSize[1] = size;
	}

}

const projection = new Matrix4();
const projectionInv = new Matrix4();
const viewInverseTranspose = new Matrix4();

const _qualityMap = {
	Low: 6,
	Medium: 12,
	High: 32,
	Ultra: 64
};

// https://en.wikipedia.org/wiki/Halton_sequence halton sequence.
function halton(index, base) {
	let result = 0;
	let f = 1 / base;
	let i = index;
	while (i > 0) {
		result = result + f * (i % base);
		i = Math.floor(i / base);
		f = f / base;
	}
	return result;
}

const _kernels = {};

// hemisphere sample kernel
function generateKernel(size, offset = 0) {
	const kernel = new Float32Array(size * 3);

	for (let i = 0; i < size; i++) {
		const phi = halton(i + offset, 2) * Math.PI * 2;

		// rejecting samples that are close to tangent plane to avoid z-fighting artifacts
		const cosTheta = 1.0 - (halton(i + offset, 3) * 0.85 + 0.15);
		const sinTheta = Math.sqrt(1.0 - cosTheta * cosTheta);

		const r = Math.random();

		// for tbn space
		const x = Math.cos(phi) * sinTheta * r;
		const y = Math.sin(phi) * sinTheta * r;
		const z = cosTheta * r;

		kernel[i * 3] = x;
		kernel[i * 3 + 1] = y;
		kernel[i * 3 + 2] = z;
	}
	return kernel;
}

function generateNoiseTexture(size) {
	const texture = new Texture2D();

	texture.image = { data: generateNoiseData(size), width: size, height: size };

	texture.type = PIXEL_TYPE.UNSIGNED_BYTE;

	texture.magFilter = TEXTURE_FILTER.NEAREST;
	texture.minFilter = TEXTURE_FILTER.NEAREST;

	texture.wrapS = TEXTURE_WRAP.REPEAT;
	texture.wrapT = TEXTURE_WRAP.REPEAT;

	texture.generateMipmaps = false;
	texture.flipY = false;

	texture.version++;

	return texture;
}

// length: size * size * 4
function generateNoiseData(size) {
	const data = new Uint8Array(size * size * 4);
	let n = 0;
	const v3 = new Vector3();
	for (let i = 0; i < size; i++) {
		for (let j = 0; j < size; j++) {
			v3.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0).normalize();
			data[n++] = (v3.x * 0.5 + 0.5) * 255;
			data[n++] = (v3.y * 0.5 + 0.5) * 255;
			data[n++] = 0;
			data[n++] = 255;
		}
	}
	return data;
}

const ssaoShader = {
	name: 'ec_ssao',
	defines: {
		ALCHEMY: false,
		DEPTH_PACKING: 0,
		KERNEL_SIZE: 64,
		AUTO_SAMPLE_WEIGHT: false
	},
	uniforms: {
		normalTex: null,
		depthTex: null,
		texSize: [512, 512],
		noiseTex: null,
		noiseTexSize: [4, 4],
		projection: new Float32Array(16),
		projectionInv: new Float32Array(16),
		viewInverseTranspose: new Float32Array(16),
		kernel: null,
		radius: 0.2,
		power: 1,
		bias: 0.0001,
		intensity: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        #include <packing>

        varying vec2 v_Uv;

        uniform sampler2D normalTex;
        uniform sampler2D depthTex;
        uniform vec2 texSize;

        uniform sampler2D noiseTex;
        uniform vec2 noiseTexSize;

        uniform mat4 projection;
        uniform mat4 projectionInv;
        uniform mat4 viewInverseTranspose;

        uniform vec3 kernel[KERNEL_SIZE];

        uniform float radius;
        uniform float power;
        uniform float bias;
        uniform float intensity;

        float getDepth(const in vec2 screenPosition) {
            #if DEPTH_PACKING == 1
                return unpackRGBAToDepth(texture2D(depthTex, screenPosition));
            #else
                return texture2D(depthTex, screenPosition).r;
            #endif
        }

        vec3 getViewNormal(const in vec2 screenPosition) {
            vec3 normal = texture2D(normalTex, screenPosition).xyz * 2.0 - 1.0;
            // Convert to view space
            return (viewInverseTranspose * vec4(normal, 0.0)).xyz;
        }

        float ssaoEstimator(in mat3 kernelBasis, in vec3 originPos, in vec3 N) {
            float occlusion = 0.0;

			float allWeight = 0.0;

            for (int i = 0; i < KERNEL_SIZE; i++) {
                vec3 samplePos = kernel[i];
                samplePos = kernelBasis * samplePos;
                samplePos = samplePos * radius + originPos;

                vec4 texCoord = projection * vec4(samplePos, 1.0);
                texCoord.xy /= texCoord.w;
                texCoord.xy = texCoord.xy * 0.5 + 0.5;

                float sampleDepth = getDepth(texCoord.xy);
                float z = sampleDepth * 2.0 - 1.0;

				vec4 projectedPos = vec4(texCoord.xy * 2.0 - 1.0, z, 1.0);
				vec4 p4 = projectionInv * projectedPos;
				p4.xyz /= p4.w;

                #ifdef ALCHEMY
                    vec3 cDir = p4.xyz - originPos;

                    float vv = dot(cDir, cDir);
                    float vn = dot(cDir, N);

                    float radius2 = radius * radius;
                    vn = max(vn + p4.z * bias, 0.0);
                    float f = max(radius2 - vv, 0.0) / radius2;
                    occlusion += f * f * f * max(vn / (0.01 + vv), 0.0);

					allWeight += 1.0;
                #else
					float factor = step(samplePos.z, p4.z - bias);
					float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - p4.z));

					#ifdef AUTO_SAMPLE_WEIGHT
						float weight = smoothstep(0., radius, radius - length(originPos.xy - samplePos.xy));
					#else
						float weight = 1.0;
					#endif
					
					occlusion += rangeCheck * factor * weight;
					allWeight += weight;
                #endif
            }

            occlusion = 1.0 - occlusion / allWeight;

            return pow(occlusion, power);
        }

        void main() {
            float centerDepth = getDepth(v_Uv);
            if(centerDepth >= (1.0 - EPSILON)) {
                discard;
            }

            vec3 N = getViewNormal(v_Uv);

            vec2 noiseTexCoord = texSize / vec2(noiseTexSize) * v_Uv;
            vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;

            // Tangent
            vec3 T = normalize(rvec - N * dot(rvec, N));
            // Bitangent
            vec3 BT = normalize(cross(N, T));

            mat3 kernelBasis = mat3(T, BT, N);

            // view position
            float z = centerDepth * 2.0 - 1.0;
            vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, z, 1.0);
            vec4 p4 = projectionInv * projectedPos;
            vec3 position = p4.xyz / p4.w;

            float ao = ssaoEstimator(kernelBasis, position, N);
            ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);

            gl_FragColor = vec4(vec3(ao), 1.0);
        }
    `
};