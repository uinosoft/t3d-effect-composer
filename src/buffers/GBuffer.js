import { OffscreenRenderTarget, Texture2D, ATTACHMENT, PIXEL_TYPE, PIXEL_FORMAT, TEXTURE_FILTER, SHADING_TYPE, ShaderMaterial, Vector3, Matrix4, Vector4, ShaderPostPass } from 't3d';
import { unitVectorToOctahedronGLSL, setupDepthTexture, defaultVertexShader } from '../Utils.js';
import Buffer from './Buffer.js';

export default class GBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this.enableCameraJitter = true;

		this._rt = OffscreenRenderTarget.create2D(width, height);
		this._rt.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.generateMipmaps = false;

		if (options.floatColorBuffer) {
			this._rt.texture.type = PIXEL_TYPE.FLOAT;
		} else {
			this._rt.texture.type = PIXEL_TYPE.HALF_FLOAT;
		}

		const depthTexture = new Texture2D();
		setupDepthTexture(depthTexture, true);

		this._rt.attach(
			depthTexture,
			ATTACHMENT.DEPTH_STENCIL_ATTACHMENT
		);

		this._renderOptions = {
			getMaterial: createGetMaterialFunction()
		};

		this._fixedRenderStates = {
			scene: null,
			lights: null,
			camera: {
				id: 0,
				version: 0,
				near: 0,
				far: 0,
				position: new Vector3(),
				logDepthCameraNear: 0,
				logDepthBufFC: 0,
				viewMatrix: new Matrix4(),
				projectionMatrix: new Matrix4(),
				projectionViewMatrix: new Matrix4(),
				rect: new Vector4(0, 0, 1, 1)
			},
			gammaFactor: 2.0,
			outputEncoding: null
		};

		this.layers = [0];

		this.cameraNear = -1;
		this.cameraFar = -1;

		this._supportLogDepth = false;
		this._renderLogDepth = false;
		this._logDepthRenderTarget = null;
		this._logDepthPass = null;

		this._supportHiz = false;
		this._hizGenerator = null;
	}

	// only support webGL2
	set supportLogDepth(value) {
		this._supportLogDepth = value;

		if (!this._logDepthRenderTarget) {
			this._logDepthRenderTarget = OffscreenRenderTarget.create2D(this._rt.width, this._rt.height);
			this._logDepthRenderTarget.attach(this._rt.texture, ATTACHMENT.COLOR_ATTACHMENT0);

			const depthTexture = new Texture2D();
			setupDepthTexture(depthTexture, true);

			this._logDepthRenderTarget.attach(depthTexture, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

			// only render to depth texture in this pass
			this._logDepthPass = new ShaderPostPass(logDepthShader);
			this._logDepthPass.material.colorWrite = false;
			// If depth test is disabled, gl_FragDepthEXT will not work
			// this._logDepthPass.material.depthTest = false;
		}
	}

	get supportLogDepth() {
		return this._supportLogDepth;
	}

	set supportHiz(value) {
		this._supportHiz = value;
		if (this._supportHiz && !this._hizGenerator) {
			this._hizGenerator = new HizGenerator(this._rt.width, this._rt.height);
		}
	}

	get supportHiz() {
		return this._supportHiz;
	}

	setIfRenderReplaceFunction(func) {
		if (func) {
			this._renderOptions.ifRender = func;
		} else {
			delete this._renderOptions.ifRender;
		}
	}

	setGeometryReplaceFunction(func) {
		if (func) {
			this._renderOptions.getGeometry = func;
		} else {
			delete this._renderOptions.getGeometry;
		}
	}

	setMaterialReplaceFunction(func) {
		if (func) {
			this._renderOptions.getMaterial = createGetMaterialFunction(func);
		} else {
			this._renderOptions.getMaterial = createGetMaterialFunction();
		}
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const cameraJitter = composer.$cameraJitter;
		const enableCameraJitter = this.enableCameraJitter && cameraJitter.accumulating();

		const renderOptions = this._renderOptions;

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		const fixedRenderStates = this._getFixedRenderStates(renderStates);
		const renderLogDepth = this._supportLogDepth && fixedRenderStates.scene.logarithmicDepthBuffer && isPerspectiveMatrix(fixedRenderStates.camera.projectionMatrix);
		const oldLogDepthState = fixedRenderStates.scene.logarithmicDepthBuffer;
		fixedRenderStates.scene.logarithmicDepthBuffer = renderLogDepth;

		enableCameraJitter && cameraJitter.jitterProjectionMatrix(fixedRenderStates.camera, this._rt.width, this._rt.height);

		this._rt.setColorClearValue(-2.1, -2.1, 0.5, 0.5).setClear(true, true, false);

		renderer.beginRender(this._rt);

		const layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, fixedRenderStates, renderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, fixedRenderStates, renderOptions);
		}

		renderer.endRender();

		fixedRenderStates.scene.logarithmicDepthBuffer = oldLogDepthState; // restore

		if (renderLogDepth) {
			const { near, far, logDepthCameraNear, logDepthBufFC } = fixedRenderStates.camera;

			this._logDepthPass.uniforms.depthTexture = this._rt._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

			this._logDepthPass.uniforms.depthFactors[0] = logDepthCameraNear; // logDepthCameraNear
			this._logDepthPass.uniforms.depthFactors[1] = logDepthBufFC; // logDepthBufFC
			this._logDepthPass.uniforms.depthFactors[2] = far / (far - near); // a
			this._logDepthPass.uniforms.depthFactors[3] = far * near / (near - far); // b

			this._logDepthRenderTarget.setClear(false, true, true);
			this._logDepthPass.render(renderer, this._logDepthRenderTarget);
		}

		this._renderLogDepth = renderLogDepth;

		if (this._supportHiz) {
			this._hizGenerator.render(renderer, this._renderLogDepth
				? this._logDepthRenderTarget._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT]
				: this._rt._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT]);
		}
	}

	output() {
		return this._renderLogDepth ? this._logDepthRenderTarget : this._rt;
	}

	hizTexture() {
		return this._supportHiz && this._hizGenerator ? this._hizGenerator.texture() : null;
	}

	getCurrentRenderStates() {
		return this._fixedRenderStates;
	}

	resize(width, height) {
		super.resize(width, height);
		this._rt.resize(width, height);

		this._logDepthRenderTarget && this._logDepthRenderTarget.resize(width, height);

		this._hizGenerator && this._hizGenerator.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();

		this._logDepthRenderTarget && this._logDepthRenderTarget.dispose();
		this._logDepthPass && this._logDepthPass.dispose();

		this._hizGenerator && this._hizGenerator.dispose();
	}

	_getFixedRenderStates(renderStates) {
		const output = this._fixedRenderStates;

		// copy others

		output.scene = renderStates.scene;

		// copy lights
		output.lighting = renderStates.lighting;
		output.lights = renderStates.lighting.getGroup(0);

		output.gammaFactor = renderStates.gammaFactor;
		output.outputEncoding = renderStates.outputEncoding;

		const outputCamera = output.camera;
		const sourceCamera = renderStates.camera;

		outputCamera.id = sourceCamera.id;
		outputCamera.version = sourceCamera.version;
		outputCamera.position = sourceCamera.position;
		outputCamera.logDepthCameraNear = sourceCamera.logDepthCameraNear;
		outputCamera.logDepthBufFC = sourceCamera.logDepthBufFC;
		outputCamera.viewMatrix = sourceCamera.viewMatrix;
		outputCamera.rect = sourceCamera.rect;

		// fix camera far & near if needed

		const fixedNear = this.cameraNear > 0 ? this.cameraNear : sourceCamera.near,
			fixedFar = this.cameraFar > 0 ? this.cameraFar : sourceCamera.far;

		outputCamera.near = fixedNear;
		outputCamera.far = fixedFar;

		outputCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);

		if (this.cameraNear > 0 || this.cameraFar > 0) {
			outputCamera.projectionMatrix.elements[10] = -(fixedFar + fixedNear) / (fixedFar - fixedNear);
			outputCamera.projectionMatrix.elements[14] = -2 * fixedFar * fixedNear / (fixedFar - fixedNear);

			outputCamera.projectionViewMatrix.multiplyMatrices(outputCamera.projectionMatrix, outputCamera.viewMatrix);
		} else {
			outputCamera.projectionViewMatrix.copy(sourceCamera.projectionViewMatrix);
		}

		return output;
	}

}

function createGetMaterialFunction(func = defaultMaterialReplaceFunction) {
	return function(renderable) {
		const material = func(renderable);
		material.diffuseMap = renderable.material.diffuseMap;
		material.uniforms['metalness'] = renderable.material.metalness !== undefined ? renderable.material.metalness : 0.5;
		material.uniforms['roughness'] = renderable.material.roughness !== undefined ? renderable.material.roughness : 0.5;
		material.metalnessMap = renderable.material.metalnessMap;
		material.roughnessMap = renderable.material.roughnessMap;
		material.side = renderable.material.side;

		return material;
	};
}

const materialMap = new Map();
const materialWeakMap = new WeakMap();

function defaultMaterialReplaceFunction(renderable) {
	let materialRef = materialWeakMap.get(renderable.material);

	if (!materialRef) {
		const { geometry, material, object } = renderable;

		const useFlatShading = !geometry.attributes['a_Normal'] || (material.shading === SHADING_TYPE.FLAT_SHADING);
		const useDiffuseMap = !!material.diffuseMap;
		const useMetalnessMap = !!material.metalnessMap;
		const useRoughnessMap = !!material.roughnessMap;
		const useSkinning = object.isSkinnedMesh && object.skeleton;
		const morphTargets = !!object.morphTargetInfluences;
		const morphNormals = !!object.morphTargetInfluences && geometry.morphAttributes.normal;
		const side = material.side;

		let maxBones = 0;
		if (useSkinning) {
			if (object.skeleton.boneTexture) {
				maxBones = 1024;
			} else {
				maxBones = object.skeleton.bones.length;
			}
		}

		const code = useFlatShading +
			'_' + useDiffuseMap +
			'_' + useMetalnessMap +
			'_' + useRoughnessMap +
			'_' + useSkinning +
			'_' + maxBones +
			'_' + morphTargets +
			'_' + morphNormals +
			'_' + side;

		materialRef = materialMap.get(code);
		if (!materialRef) {
			const _material = new ShaderMaterial(gBufferShader);
			_material.shading = useFlatShading ? SHADING_TYPE.FLAT_SHADING : SHADING_TYPE.SMOOTH_SHADING;
			_material.alphaTest = useDiffuseMap ? 0.999 : 0; // ignore if alpha < 0.99
			_material.side = side;

			materialRef = { refCount: 0, material: _material };
			materialMap.set(code, materialRef);
		}

		materialWeakMap.set(material, materialRef);
		materialRef.refCount++;

		function onDispose() {
			material.removeEventListener('dispose', onDispose);

			materialWeakMap.delete(material);
			materialRef.refCount--;

			if (materialRef.refCount <= 0) {
				materialMap.delete(code);
			}
		}
		material.addEventListener('dispose', onDispose);
	}

	return materialRef.material;
}

function isPerspectiveMatrix(m) {
	return m.elements[11] === -1.0;
}

const gBufferShader = {
	name: 'ec_gbuffer',
	defines: {},
	uniforms: {
		metalness: 0.5,
		roughness: 0.5
	},
	vertexShader: `
        #include <common_vert>
        #include <morphtarget_pars_vert>
        #include <skinning_pars_vert>
        #include <normal_pars_vert>
        #include <uv_pars_vert>
		#include <diffuseMap_pars_vert>
		#include <modelPos_pars_frag>
		#include <logdepthbuf_pars_vert>

        void main() {
        	#include <uv_vert>
			#include <diffuseMap_vert>
        	#include <begin_vert>
        	#include <morphtarget_vert>
        	#include <morphnormal_vert>
        	#include <skinning_vert>
        	#include <skinnormal_vert>
        	#include <normal_vert>
        	#include <pvm_vert>
			#include <modelPos_vert>
			#include <logdepthbuf_vert>
        }
    `,
	fragmentShader: `
        #include <common_frag>
        #include <diffuseMap_pars_frag>
		#include <alphaTest_pars_frag>

        #include <uv_pars_frag>

        #include <packing>
        #include <normal_pars_frag>

		${unitVectorToOctahedronGLSL}

        uniform float metalness;
		
		#ifdef USE_METALNESSMAP
            uniform sampler2D metalnessMap;
        #endif

		uniform float roughness;

        #ifdef USE_ROUGHNESSMAP
            uniform sampler2D roughnessMap;
        #endif

		#include <logdepthbuf_pars_frag>
		#include <modelPos_pars_frag>

        void main() {
            #if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)
                vec4 texelColor = texture2D(diffuseMap, vDiffuseMapUV);
                float alpha = texelColor.a * u_Opacity;
                if(alpha < u_AlphaTest) discard;
            #endif

			#include <logdepthbuf_frag>

			#ifdef FLAT_SHADED
				vec3 fdx = dFdx(v_modelPos);
				vec3 fdy = dFdy(v_modelPos);
				vec3 normal = normalize(cross(fdx, fdy));
			#else
            	vec3 normal = normalize(v_Normal);
				#ifdef DOUBLE_SIDED
					normal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);
				#endif 
			#endif

			float metalnessFactor = metalness;
            #ifdef USE_METALNESSMAP
				metalnessFactor *= texture2D(metalnessMap, v_Uv).b;
            #endif

            float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
                roughnessFactor *= texture2D(roughnessMap, v_Uv).g;
            #endif

            vec4 outputColor;
            outputColor.xy = unitVectorToOctahedron(normal);
			outputColor.z = saturate(metalnessFactor);
            outputColor.w = saturate(roughnessFactor);
            
            gl_FragColor = outputColor;
        }
    `
};

const logDepthShader = {
	name: 'ec_logdepth',
	uniforms: {
		depthTexture: null,
		depthFactors: [0, 0, 0, 0] // logDepthCameraNear, logDepthBufFC, a, b
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D depthTexture;
		uniform vec4 depthFactors;
		
		varying vec2 v_Uv;

		float reverseLogDepth(const float logDepth) {
			float depth = pow(2.0, logDepth * 2.0 / depthFactors.y) + depthFactors.x - 1.0;
			depth = depthFactors.z + depthFactors.w / depth;
			return depth;
		}

		void main() {
			float logDepth = texture2D(depthTexture, v_Uv).r;

			gl_FragDepthEXT = reverseLogDepth(logDepth);

			gl_FragColor = vec4(0.0);
		}
	`
};

function mipmapsCount(width, height) {
	const maxDim = Math.max(width, height);
	return Math.max(Math.floor(Math.log2(maxDim)), 0);
}

function createHizTexture() {
	const texture = new Texture2D();
	texture.type = PIXEL_TYPE.FLOAT;
	texture.format = PIXEL_FORMAT.RG;
	texture.magFilter = TEXTURE_FILTER.NEAREST;
	texture.minFilter = TEXTURE_FILTER.NEAREST_MIPMAP_NEAREST;
	texture.generateMipmaps = false;
	return texture;
}

function generateMipmaps(texture, width, height, totalMips) {
	texture.mipmaps = [];
	let mipWidth = width;
	let mipHeight = height;
	for (let i = 0; i <= totalMips; i++) {
		texture.mipmaps.push({ width: mipWidth, height: mipHeight, data: null });
		mipWidth = Math.max(mipWidth >> 1, 1);
		mipHeight = Math.max(mipHeight >> 1, 1);
	}
	texture.version++;
	return texture;
}

class HizGenerator {

	constructor(width, height) {
		const totalMips = mipmapsCount(width, height);

		const hizTexture = createHizTexture();
		generateMipmaps(hizTexture, width, height, totalMips);
		this._hizRenderTarget = OffscreenRenderTarget.create2D(width, height);
		this._hizRenderTarget.attach(hizTexture, ATTACHMENT.COLOR_ATTACHMENT0);
		this._hizRenderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		const hizTempTexture = createHizTexture();
		generateMipmaps(hizTempTexture, width, height, totalMips);
		this._hizTempRenderTarget = OffscreenRenderTarget.create2D(width, height);
		this._hizTempRenderTarget.attach(hizTempTexture, ATTACHMENT.COLOR_ATTACHMENT0);
		this._hizTempRenderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		this._hizCopyPass = new ShaderPostPass(hizCopyShader);
		this._hizMipPass = new ShaderPostPass(hizMipShader);
		this._hizMipCopyPass = new ShaderPostPass(hizMipCopyShader);
	}

	resize(width, height) {
		const totalMips = mipmapsCount(width, height);

		this._hizRenderTarget.resize(width, height);
		this._hizTempRenderTarget.resize(width, height);

		generateMipmaps(this._hizRenderTarget.texture, width, height, totalMips);
		generateMipmaps(this._hizTempRenderTarget.texture, width, height, totalMips);
	}

	render(renderer, srcDepthTexture) {
		const maxSize = this._hizRenderTarget.texture.mipmaps.length;

		let srcRT = this._hizRenderTarget;
		let dstRT = this._hizTempRenderTarget;

		// Step 1: Copy original depth to hiz level 0

		this._hizCopyPass.uniforms.depthTexture = srcDepthTexture;
		srcRT.activeMipmapLevel = 0;
		this._hizCopyPass.render(renderer, srcRT);

		// Step 2: Generate even levels to temp hiz texture

		const hizMipPass = this._hizMipPass;
		for (let i = 1; i < maxSize; i++) {
			const dstWidth = dstRT.texture.mipmaps[i].width;
			const dstHeight = dstRT.texture.mipmaps[i].height;

			hizMipPass.uniforms.sourceTexture = srcRT.texture;
			hizMipPass.uniforms.sourceLevel = i - 1;

			hizMipPass.renderStates.camera.rect.z = dstWidth / dstRT.width;
			hizMipPass.renderStates.camera.rect.w = dstHeight / dstRT.height;

			dstRT.activeMipmapLevel = i;

			hizMipPass.render(renderer, dstRT);

			// swap
			const temp = srcRT;
			srcRT = dstRT;
			dstRT = temp;
		}

		// Step 3: Copy odd levels to hiz render target

		srcRT = this._hizTempRenderTarget;
		dstRT = this._hizRenderTarget;

		const hizMipCopyPass = this._hizMipCopyPass;
		for (let i = 0; i < maxSize; i++) {
			if (i % 2 === 0) continue;

			hizMipCopyPass.uniforms.sourceTexture = srcRT.texture;
			hizMipCopyPass.uniforms.sourceLevel = i;

			hizMipCopyPass.renderStates.camera.rect.z = dstRT.texture.mipmaps[i].width / dstRT.width;
			hizMipCopyPass.renderStates.camera.rect.w = dstRT.texture.mipmaps[i].height / dstRT.height;

			dstRT.activeMipmapLevel = i;

			hizMipCopyPass.render(renderer, dstRT);
		}
	}

	dispose() {
		this._hizRenderTarget.dispose();
		this._hizTempRenderTarget.dispose();

		this._hizCopyPass.dispose();
		this._hizMipPass.dispose();
		this._hizMipCopyPass.dispose();
	}

	texture() {
		return this._hizRenderTarget.texture;
	}

}

const hizCopyShader = {
	name: 'ec_hiz_copy',
	uniforms: {
		depthTexture: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D depthTexture;
		varying vec2 v_Uv;
		void main() {
			float depth = texture2D(depthTexture, v_Uv).r;
			gl_FragColor = vec4(depth, depth, .0 ,1.0);
		}
	`
};

// ref: https://sugulee.wordpress.com/2021/01/19/screen-space-reflections-implementation-and-optimization-part-2-hi-z-tracing-method/
const hizMipShader = {
	name: 'ec_hiz_mip',
	uniforms: {
		sourceTexture: null,
		sourceLevel: 0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D sourceTexture;
		uniform int sourceLevel;
		varying vec2 v_Uv;
		void main() {
			ivec2 inSize = textureSize(sourceTexture, sourceLevel);
			ivec2 outSize = max(inSize / 2, ivec2(1));
			vec2 ratio = vec2(inSize) / vec2(outSize);

			ivec2 outCoord = ivec2(gl_FragCoord.xy);

			ivec2 base = outCoord * 2;
			ivec2 maxCoord = inSize - ivec2(1);

			vec2 d0 = texelFetch(sourceTexture, clamp(base + ivec2(0, 0), ivec2(0), maxCoord), sourceLevel).rg;
			vec2 d1 = texelFetch(sourceTexture, clamp(base + ivec2(1, 0), ivec2(0), maxCoord), sourceLevel).rg;
			vec2 d2 = texelFetch(sourceTexture, clamp(base + ivec2(0, 1), ivec2(0), maxCoord), sourceLevel).rg;
			vec2 d3 = texelFetch(sourceTexture, clamp(base + ivec2(1, 1), ivec2(0), maxCoord), sourceLevel).rg;

			float minDepth = min(min(d0.r, d1.r), min(d2.r, d3.r));
			float maxDepth = max(max(d0.g, d1.g), max(d2.g, d3.g));

			bool needExtraSampleX = ratio.x > 2.0;
			bool needExtraSampleY = ratio.y > 2.0;

			if (needExtraSampleX) {
				vec2 d4 = texelFetch(sourceTexture, clamp(base + ivec2(2, 0), ivec2(0), maxCoord), sourceLevel).rg;
				vec2 d5 = texelFetch(sourceTexture, clamp(base + ivec2(2, 1), ivec2(0), maxCoord), sourceLevel).rg;
				minDepth = min(minDepth, min(d4.r, d5.r));
				maxDepth = max(maxDepth, max(d4.g, d5.g));
			}

			if (needExtraSampleY) {
				vec2 d6 = texelFetch(sourceTexture, clamp(base + ivec2(0, 2), ivec2(0), maxCoord), sourceLevel).rg;
				vec2 d7 = texelFetch(sourceTexture, clamp(base + ivec2(1, 2), ivec2(0), maxCoord), sourceLevel).rg;
				minDepth = min(minDepth, min(d6.r, d7.r));
				maxDepth = max(maxDepth, max(d6.g, d7.g));
			}

			if (needExtraSampleX && needExtraSampleY) {
				vec2 d8 = texelFetch(sourceTexture, clamp(base + ivec2(2, 2), ivec2(0), maxCoord), sourceLevel).rg;
				minDepth = min(minDepth, d8.r);
				maxDepth = max(maxDepth, d8.g);
			}

			gl_FragColor = vec4(minDepth, maxDepth, 0.0, 1.0);
		}
	`
};

const hizMipCopyShader = {
	name: 'ec_hiz_mip_copy',
	uniforms: {
		sourceTexture: null,
		sourceLevel: 0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D sourceTexture;
		uniform int sourceLevel;
		varying vec2 v_Uv;
		void main() {
			ivec2 texCoord = ivec2(gl_FragCoord.xy);
			vec2 depth = texelFetch(sourceTexture, texCoord, sourceLevel).rg;
			gl_FragColor = vec4(depth, 0.0, 1.0);
		}
	`
};