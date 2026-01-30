import { OffscreenRenderTarget, Texture2D, ATTACHMENT, TEXTURE_FILTER, PIXEL_TYPE, ShaderPostPass, Matrix4 } from 't3d';
import { unitVectorToOctahedronGLSL, setupDepthTexture, defaultVertexShader, Buffer } from 't3d-effect-composer';

/**
 * FastGBuffer can replace GBuffer with higher performance.
 * It does not redraw the scene, but gets the depth texture from SceneBuffer and calculates the normal map.
 */
export class FastGBuffer extends Buffer {

	constructor(width, height, options) {
		super(width, height, options);

		if (!options.depthTextureAttachment) {
			throw new Error('FastGBuffer requires options.depthTextureAttachment');
		}

		this.globalRoughness = 0.5;
		this.globalMetalness = 0.5;

		this._rt = OffscreenRenderTarget.create2D(width, height);
		this._rt.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.magFilter = TEXTURE_FILTER.NEAREST;
		this._rt.texture.generateMipmaps = false;

		if (options.floatColorBuffer) {
			this._rt.texture.type = PIXEL_TYPE.FLOAT;
		} else {
			this._rt.texture.type = PIXEL_TYPE.HALF_FLOAT;
		}

		this._rt.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

		const supportLogDepth = options.webgl2;

		if (supportLogDepth) {
			const depthTexture = new Texture2D();
			setupDepthTexture(depthTexture, true);

			this._rt.attach(
				depthTexture,
				ATTACHMENT.DEPTH_STENCIL_ATTACHMENT
			);
		}

		this._fastGBufferPass = new ShaderPostPass(fastGBufferShader);
		this._fastGBufferPass.material.defines.SUPPORT_LOGDEPTH = supportLogDepth;

		// don't use this render target for rendering,
		// it's just used to store the result of the fast gbuffer textures
		this._fakeRenderTarget = OffscreenRenderTarget.create2D(width, height);
		this._fakeRenderTarget.attach(this._rt.texture, ATTACHMENT.COLOR_ATTACHMENT0);
		this._fakeRenderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
	}

	syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
		// save depth attachment to DEPTH_STENCIL_ATTACHMENT no matter whether it is a depth or depth-stencil attachment
		// this is because we want to keep consistency with the GBuffer output
		this._fakeRenderTarget.attach(depthAttachment, ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
	}

	resize(width, height) {
		super.resize(width, height);

		this._rt.resize(width, height);
		// this._fakeRenderTarget.resize(width, height);
	}

	render(renderer, composer, scene, camera) {
		if (!this.needRender()) return;

		const renderStates = scene.getRenderStates(camera);
		projectionViewInv.copy(renderStates.camera.projectionViewMatrix).inverse();

		this._fastGBufferPass.uniforms.depthTexture = this._fakeRenderTarget._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		projectionViewInv.toArray(this._fastGBufferPass.uniforms.projectionViewInv);
		this._fastGBufferPass.uniforms.roughness = this.globalRoughness;
		this._fastGBufferPass.uniforms.metalness = this.globalMetalness;

		const renderLogDepth = this._fastGBufferPass.material.defines.SUPPORT_LOGDEPTH &&
			renderStates.scene.logarithmicDepthBuffer &&
			isPerspectiveMatrix(renderStates.camera.projectionMatrix);
		this._fastGBufferPass.uniforms.renderLogDepth = renderLogDepth;

		if (renderLogDepth) {
			const { near, far, logDepthCameraNear, logDepthBufFC } = renderStates.camera;
			const depthFactors = this._fastGBufferPass.uniforms.depthFactors;
			depthFactors[0] = logDepthCameraNear;
			depthFactors[1] = logDepthBufFC;
			depthFactors[2] = far / (far - near);
			depthFactors[3] = far * near / (near - far);
		}

		this._rt.setColorClearValue(-2.1, -2.1, 0.5, 0.5).setClear(true, true, false);
		this._fastGBufferPass.render(renderer, this._rt);

		// save render states for effects to get camera and scene info from this buffer
		this._renderStates = renderStates;
	}

	output() {
		return this._fastGBufferPass.material.defines.SUPPORT_LOGDEPTH ?
			this._rt : this._fakeRenderTarget;
	}

	getCurrentRenderStates() {
		return this._renderStates;
	}

	dispose() {
		super.dispose();

		this._rt.dispose();
		// this._fakeRenderTarget.dispose();

		this._fastGBufferPass.dispose();
	}

}

const projectionViewInv = new Matrix4();

function isPerspectiveMatrix(m) {
	return m.elements[11] === -1.0;
}

// https://wickedengine.net/2019/09/improved-normal-reconstruction-from-depth/
const fastGBufferShader = {
	name: 'ec_fast_gbuffer',
	defines: {
		SUPPORT_LOGDEPTH: false
	},
	uniforms: {
		depthTexture: null,
		projectionViewInv: new Float32Array(16),
		roughness: 0.5,
		metalness: 0.5,
		renderLogDepth: false,
		depthFactors: [0, 0, 0, 0]
	},

	vertexShader: defaultVertexShader,

	fragmentShader: `
		uniform vec2 u_RenderTargetSize;

        uniform sampler2D depthTexture;
        uniform mat4 projectionViewInv;
       
        uniform float roughness;
        uniform float metalness;

        varying vec2 v_Uv;

		#ifdef SUPPORT_LOGDEPTH
			uniform bool renderLogDepth;
			uniform vec4 depthFactors;

			float reverseLogDepth(const float logDepth) {
				float depth = pow(2.0, logDepth * 2.0 / depthFactors.y) + depthFactors.x - 1.0;
				depth = depthFactors.z + depthFactors.w / depth;
				return depth;
			}
		#endif

		float sampleDepth(vec2 uv) {
			float depth = texture2D(depthTexture, uv).r;
			#ifdef SUPPORT_LOGDEPTH
			if (renderLogDepth) {
				depth = reverseLogDepth(depth);
			}
			#endif
			return depth;
		}

        vec3 reconstructPosition(vec2 uv, float z) {
            vec2 xy = uv * 2.0 - 1.0;                              
            vec4 positionS = vec4(xy, z, 1.0);  
            vec4 positionV = projectionViewInv * positionS;  
            return positionV.xyz / positionV.w;   
        }

        vec4 calculateEdges(float centerDepth, float leftDepth, float rightDepth, float topDepth, float bottomDepth) {
            float threshold = 0.1;
            vec4 edges;
            edges.x = abs(centerDepth - leftDepth) < threshold ? 1.0 : 0.0;   // left
            edges.y = abs(centerDepth - rightDepth) < threshold ? 1.0 : 0.0;  // right
            edges.z = abs(centerDepth - topDepth) < threshold ? 1.0 : 0.0;    // top
            edges.w = abs(centerDepth - bottomDepth) < threshold ? 1.0 : 0.0; // bottom
            return edges;
        }

        vec3 calculateNormal(vec4 edgesLRTB, vec3 pixCenterPos, vec3 pixLPos, vec3 pixRPos, vec3 pixTPos, vec3 pixBPos) {
            vec4 acceptedNormals = clamp(vec4(
                edgesLRTB.x * edgesLRTB.z,  // left-top
                edgesLRTB.z * edgesLRTB.y,  // top-right
                edgesLRTB.y * edgesLRTB.w,  // right-bottom
                edgesLRTB.w * edgesLRTB.x   // bottom-left
            ) + 0.01, 0.0, 1.0);

            vec3 vL = normalize(pixLPos - pixCenterPos);
            vec3 vR = normalize(pixRPos - pixCenterPos);
            vec3 vT = normalize(pixTPos - pixCenterPos);
            vec3 vB = normalize(pixBPos - pixCenterPos);

            vec3 pixelNormal = 
                acceptedNormals.x * cross(vL, vT) +
                acceptedNormals.y * cross(vT, vR) +
                acceptedNormals.z * cross(vR, vB) +
                acceptedNormals.w * cross(vB, vL);
            
            return normalize(pixelNormal);
        }
        
        ${unitVectorToOctahedronGLSL}

        void main() {
            vec2 uv0 = v_Uv;

            float depth0 = sampleDepth(uv0);

			#ifdef SUPPORT_LOGDEPTH
				gl_FragDepthEXT = depth0;
            #endif

			if (depth0 > 0.999) {
				gl_FragColor = vec4(-2.1, -2.1, 0.5, 0.5);
				return;
			}

			vec2 texelSize = 1.0 / u_RenderTargetSize;

			vec2 uvL = v_Uv + vec2(-texelSize.x, 0.0); // left
            vec2 uvR = v_Uv + vec2(texelSize.x, 0.0);  // right
            vec2 uvT = v_Uv + vec2(0.0, -texelSize.y); // top
            vec2 uvB = v_Uv + vec2(0.0, texelSize.y);  // bottom

            float depthL = sampleDepth(uvL);
            float depthR = sampleDepth(uvR);
            float depthT = sampleDepth(uvT);
            float depthB = sampleDepth(uvB);

            vec3 pos0 = reconstructPosition(uv0, depth0);
            vec3 posL = reconstructPosition(uvL, depthL);
            vec3 posR = reconstructPosition(uvR, depthR);
            vec3 posT = reconstructPosition(uvT, depthT);
            vec3 posB = reconstructPosition(uvB, depthB);

            vec4 edges = calculateEdges(depth0, depthL, depthR, depthT, depthB);
            vec3 normal = calculateNormal(edges, pos0, posL, posR, posT, posB);

            gl_FragColor = vec4(unitVectorToOctahedron(normal), metalness, roughness);
        }
    `
};