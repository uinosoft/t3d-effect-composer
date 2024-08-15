import { RenderTarget2D, Texture2D, ATTACHMENT, PIXEL_FORMAT, PIXEL_TYPE, TEXTURE_FILTER, SHADING_TYPE, ShaderMaterial, Vector3, Matrix4, Vector4 } from 't3d';
import { unitVectorToOctahedronGLSL } from '../Utils.js';
import Buffer from './Buffer.js';

export default class GBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		this.enableCameraJitter = true;

		this._rt = new RenderTarget2D(width, height);
		this._rt.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.generateMipmaps = false;

		if (options.floatColorBuffer) {
			this._rt.texture.type = PIXEL_TYPE.FLOAT;
		} else {
			this._rt.texture.type = PIXEL_TYPE.HALF_FLOAT;
		}

		const depthTexture = new Texture2D();
		depthTexture.image = { data: null, width: width, height: height };
		depthTexture.type = PIXEL_TYPE.UNSIGNED_INT_24_8;
		depthTexture.format = PIXEL_FORMAT.DEPTH_STENCIL;
		depthTexture.magFilter = TEXTURE_FILTER.NEAREST;
		depthTexture.minFilter = TEXTURE_FILTER.NEAREST;
		depthTexture.generateMipmaps = false;
		depthTexture.flipY = false;

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

		renderer.setRenderTarget(this._rt);
		renderer.setClearColor(-2.1, -2.1, 0.5, 0.5);
		renderer.clear(true, true, false);

		const renderOptions = this._renderOptions;

		const renderStates = scene.getRenderStates(camera);
		const renderQueue = scene.getRenderQueue(camera);

		const fixedRenderStates = this._getFixedRenderStates(renderStates);

		enableCameraJitter && cameraJitter.jitterProjectionMatrix(fixedRenderStates.camera, this._rt.width, this._rt.height);

		renderer.beginRender();

		const layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, fixedRenderStates, renderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, fixedRenderStates, renderOptions);
		}

		renderer.endRender();
	}

	output() {
		return this._rt;
	}

	getCurrentRenderStates() {
		return this._fixedRenderStates;
	}

	resize(width, height) {
		super.resize(width, height);
		this._rt.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();
	}

	_getFixedRenderStates(renderStates) {
		const output = this._fixedRenderStates;

		// copy others

		output.scene = renderStates.scene;
		output.lights = renderStates.lights;
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
		const useFlatShading = !renderable.geometry.attributes['a_Normal'] || (renderable.material.shading === SHADING_TYPE.FLAT_SHADING);
		const useDiffuseMap = !!renderable.material.diffuseMap;
		const useMetalnessMap = !!renderable.material.metalnessMap;
		const useRoughnessMap = !!renderable.material.roughnessMap;
		const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
		const morphTargets = !!renderable.object.morphTargetInfluences;
		const morphNormals = !!renderable.object.morphTargetInfluences && renderable.object.geometry.morphAttributes.normal;
		const side = renderable.material.side;
		const skipGBuffer = renderable.object.effects && renderable.object.effects.skipGBuffer;

		let maxBones = 0;
		if (useSkinning) {
			if (renderable.object.skeleton.boneTexture) {
				maxBones = 1024;
			} else {
				maxBones = renderable.object.skeleton.bones.length;
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
			'_' + side +
			'_' + skipGBuffer;

		materialRef = materialMap.get(code);
		if (!materialRef) {
			const material = skipGBuffer ? new ShaderMaterial(gBufferSpikShader) : new ShaderMaterial(gBufferShader);
			material.shading = useFlatShading ? SHADING_TYPE.FLAT_SHADING : SHADING_TYPE.SMOOTH_SHADING;
			material.alphaTest = useDiffuseMap ? 0.999 : 0; // ignore if alpha < 0.99
			material.side = side;

			materialRef = { refCount: 0, material };
			materialMap.set(code, materialRef);
		}

		materialWeakMap.set(renderable.material, materialRef);
		materialRef.refCount++;

		function onDispose() {
			renderable.material.removeEventListener('dispose', onDispose);

			materialWeakMap.delete(renderable.material);
			materialRef.refCount--;

			if (materialRef.refCount <= 0) {
				materialMap.delete(code);
			}
		}
		renderable.material.addEventListener('dispose', onDispose);
	}

	return materialRef.material;
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
		#include <modelPos_pars_frag>
        void main() {
        	#include <uv_vert>
        	#include <begin_vert>
        	#include <morphtarget_vert>
        	#include <morphnormal_vert>
        	#include <skinning_vert>
        	#include <skinnormal_vert>
        	#include <normal_vert>
        	#include <pvm_vert>
			#include <modelPos_vert>
        }
    `,
	fragmentShader: `
        #include <common_frag>
        #include <diffuseMap_pars_frag>

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

		#include <modelPos_pars_frag>

        void main() {
            #if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)
                vec4 texelColor = texture2D(diffuseMap, v_Uv);
                float alpha = texelColor.a * u_Opacity;
                if(alpha < ALPHATEST) discard;
            #endif

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
const gBufferSpikShader = {
	name: 'ec_gbuffer_skip',
	vertexShader: gBufferShader.vertexShader,
	fragmentShader: `
        void main() {
            gl_FragColor = vec4(-2.1, -2.1, 0.5, 0.5);
        }
    `
};