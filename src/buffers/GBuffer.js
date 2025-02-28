import { RenderTarget2D, Texture2D, ATTACHMENT, PIXEL_TYPE, TEXTURE_FILTER, SHADING_TYPE, ShaderMaterial, Vector3, Matrix4, Vector4, ShaderPostPass } from 't3d';
import { unitVectorToOctahedronGLSL, setupDepthTexture, defaultVertexShader } from '../Utils.js';
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
	}

	// only support webGL2
	set supportLogDepth(value) {
		this._supportLogDepth = value;

		if (!this._logDepthRenderTarget) {
			this._logDepthRenderTarget = new RenderTarget2D(this._rt.width, this._rt.height);
			this._logDepthRenderTarget.attach(this._rt.texture, ATTACHMENT.COLOR_ATTACHMENT0);

			const depthTexture = new Texture2D();
			setupDepthTexture(depthTexture, true);

			this._logDepthRenderTarget.attach(depthTexture, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

			// only use this pass to render depth texture
			this._logDepthPass = new ShaderPostPass(logDepthShader);
			this._logDepthPass.material.colorWrite = false;
			// If depth test is disabled, gl_FragDepthEXT will not work
			// this._logDepthPass.material.depthTest = false;
		}
	}

	get supportLogDepth() {
		return this._supportLogDepth;
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
		const renderLogDepth = this._supportLogDepth && fixedRenderStates.scene.logarithmicDepthBuffer && isPerspectiveMatrix(fixedRenderStates.camera.projectionMatrix);
		const oldLogDepthState = fixedRenderStates.scene.logarithmicDepthBuffer;
		fixedRenderStates.scene.logarithmicDepthBuffer = renderLogDepth;

		enableCameraJitter && cameraJitter.jitterProjectionMatrix(fixedRenderStates.camera, this._rt.width, this._rt.height);

		renderer.beginRender();

		const layers = this.layers;
		for (let i = 0, l = layers.length; i < l; i++) {
			const renderQueueLayer = renderQueue.getLayer(layers[i]);
			renderer.renderRenderableList(renderQueueLayer.opaque, fixedRenderStates, renderOptions);
			renderer.renderRenderableList(renderQueueLayer.transparent, fixedRenderStates, renderOptions);
		}

		renderer.endRender();

		fixedRenderStates.scene.logarithmicDepthBuffer = oldLogDepthState; // restore

		if (renderLogDepth) {
			renderer.setRenderTarget(this._logDepthRenderTarget);
			renderer.clear(false, true, true);

			const { near, far } = fixedRenderStates.camera;

			this._logDepthPass.uniforms.depthTexture = this._rt._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._logDepthPass.uniforms.depthFactors[0] = far / (far - near); // a
			this._logDepthPass.uniforms.depthFactors[1] = far * near / (near - far); // b
			this._logDepthPass.uniforms.depthFactors[2] = far; // far
			this._logDepthPass.render(renderer);
		}

		this._renderLogDepth = renderLogDepth;
	}

	output() {
		return this._renderLogDepth ? this._logDepthRenderTarget : this._rt;
	}

	getCurrentRenderStates() {
		return this._fixedRenderStates;
	}

	resize(width, height) {
		super.resize(width, height);
		this._rt.resize(width, height);

		this._logDepthRenderTarget && this._logDepthRenderTarget.resize(width, height);
	}

	dispose() {
		super.dispose();
		this._rt.dispose();

		this._logDepthRenderTarget && this._logDepthRenderTarget.dispose();
		this._logDepthPass && this._logDepthPass.dispose();
	}

	_getFixedRenderStates(renderStates) {
		const output = this._fixedRenderStates;

		// copy others

		output.scene = renderStates.scene;

		// copy lights
		if (renderStates.lighting) { // for t3d v0.4.x or later
			output.lighting = renderStates.lighting;
			output.lights = renderStates.lighting.getGroup(0);
		} else { // for t3d v0.3.x
			output.lights = renderStates.lights;
		}

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
			'_' + side;

		materialRef = materialMap.get(code);
		if (!materialRef) {
			const material = new ShaderMaterial(gBufferShader);
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
		depthFactors: [] // a, b, far
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D depthTexture;
		uniform vec3 depthFactors;
		
		varying vec2 v_Uv;

		void main() {
			float logDepth = texture2D(depthTexture, v_Uv).r;

			float depth = pow(2.0, logDepth * log2(depthFactors.z + 1.0));
			depth = depthFactors.x + depthFactors.y / depth;

			gl_FragDepthEXT = depth;

			gl_FragColor = vec4(0.0);
		}
	`
};
