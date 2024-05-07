import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL, multiplyShader } from 't3d-effect-composer';

/**
 * Ground Truth Ambient Occlusion Effect.
 * Reference: https://github.com/Orillusion/orillusion/blob/main/src/gfx/renderJob/post/GTAOPost.ts
 */
export default class GTAOEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		this.multiBounce = false;
		this.maxDistance = 10;
		this.maxPixel = 40;
		this.rayMarchSegment = 10;
		this.darkFactor = 1.;

		this._gtaoPass = new ShaderPostPass(GTAOShader);
		this._blendPass = new ShaderPostPass(multiplyShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewInv.copy(gBufferRenderStates.camera.viewMatrix).inverse();

		// Step 1: gtao pass

		renderer.setRenderTarget(inputRenderTarget ? tempRT1 : outputRenderTarget);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._gtaoPass.uniforms.maxDistance = this.maxDistance;
		this._gtaoPass.uniforms.maxPixel = this.maxPixel;
		this._gtaoPass.uniforms.rayMarchSegment = this.rayMarchSegment;
		this._gtaoPass.uniforms.darkFactor = this.darkFactor;
		this._setDirections();

		this._gtaoPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._gtaoPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._gtaoPass.uniforms.colorTex = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		this._gtaoPass.uniforms.cameraNear = gBufferRenderStates.camera.near;
		this._gtaoPass.uniforms.cameraFar = gBufferRenderStates.camera.far;
		projectionInv.toArray(this._gtaoPass.uniforms.projectionInv);
		viewInv.toArray(this._gtaoPass.uniforms.viewInv);
		this._gtaoPass.uniforms.texSize[0] = gBuffer.output().width;
		this._gtaoPass.uniforms.texSize[1] = gBuffer.output().height;

		if (this._gtaoPass.material.defines.MULTI_BOUNCE != this.multiBounce) {
			this._gtaoPass.material.needsUpdate = true;
			this._gtaoPass.material.defines.MULTI_BOUNCE = this.multiBounce;
		}

		this._gtaoPass.render(renderer);

		// Step 2: blend pass

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
	}

	dispose() {
		this._gtaoPass.dispose();
		this._blendPass.dispose();
	}

	_setDirections(seed = 0) {
		seed = (seed % 2) + 1;

		if (!_directionsCache[seed]) {
			_directionsCache[seed] = randomDirection(seed);
		}

		this._gtaoPass.uniforms.directions = _directionsCache[seed];
	}

}

const projectionInv = new Matrix4();
const viewInv = new Matrix4();

const _directionsCache = {};

function randomDirection(seed) {
	const directionsArray = new Float32Array(8 * 2);

	const offsetAngle = (Math.PI * 2 * seed) / 16;
	const angleSegment = (Math.PI * 2) / 8;
	for (let i = 0; i < 8; i++) {
		const angle = offsetAngle + i * angleSegment;
		directionsArray[i * 2] = Math.sin(angle);
		directionsArray[i * 2 + 1] = Math.cos(angle);
	}

	return directionsArray;
}

const GTAOShader = {
	name: 'ec_gtao',

	defines: {
		'MULTI_BOUNCE': false
	},

	uniforms: {
		maxDistance: 10,
		maxPixel: 40,
		darkFactor: 1,
		rayMarchSegment: 10,
		directions: new Float32Array(16),
		normalTex: null,
		depthTex: null,
		colorTex: null,
		cameraNear: 1,
		cameraFar: 500,
		projectionInv: new Float32Array(16),
		viewInv: new Float32Array(16),
		texSize: [1024, 1024]
	},

	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float maxDistance;
		uniform float maxPixel;
		uniform float darkFactor;
		uniform float rayMarchSegment;
		uniform vec2 directions[8];

		uniform sampler2D depthTex;
		uniform sampler2D normalTex;
		#ifdef MULTI_BOUNCE
			uniform sampler2D colorTex;
		#endif

		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 projectionInv;
		uniform mat4 viewInv;
		uniform vec2 texSize;

		varying vec2 v_Uv;

		${octahedronToUnitVectorGLSL}

		vec3 MultiBounce(float AO, vec3 Albedo) {
			vec3 A = 2.0 * Albedo - vec3(0.33);
			vec3 B = -4.8 * Albedo + vec3(0.64);
			vec3 C = 2.75 * Albedo + vec3(0.69);
			return max(vec3(AO), ((AO * A + B) * AO + C) * AO);
		}
		
		float calcPixelByNDC(float ndcZ) {
			float nearAspect = cameraNear / (cameraFar - cameraNear);
			float aspect = (1.0 + nearAspect) / (ndcZ + nearAspect);
			float viewPortMax = max(float(texSize[0]), float(texSize[1]));
			float maxPixel = min(viewPortMax, maxPixel * aspect);
			maxPixel = max(0.1, maxPixel);
			return maxPixel;
		}

		vec4 getPosition(const in vec2 screenPosition) {
			float sampleDepth = texture2D(depthTex, screenPosition).r;
			float z = sampleDepth * 2.0 - 1.0;
			vec4 Pos = vec4(screenPosition.xy * 2.0 - 1.0, z, 1.0);
			Pos = viewInv * projectionInv * Pos;
			return Pos/Pos.w;
		}
		
		float rayMarch(float maxPixelScaled) {
			vec3 originNormal = octahedronToUnitVector(texture2D(normalTex, v_Uv).rg);
			float stepPixel = maxPixelScaled / rayMarchSegment;
			float totalWeight = 0.1;
			float darkWeight = 0.0;

			vec4 wPosition = getPosition(v_Uv);
			for (int i = 0; i < 8; i += 1) {
				vec2 dirVec2 = directions[i];
				for(float j = 1.1; j < maxPixelScaled; j += stepPixel) {
					vec2 sampleCoord = dirVec2 * j / texSize + v_Uv;
					if(sampleCoord.x >= 0. && sampleCoord.y >= 0.
						&& sampleCoord.x < texSize.x
						&& sampleCoord.y < texSize.y) {
						totalWeight += 1.0;
						vec4 samplePosition = getPosition(sampleCoord);
						vec3 distanceVec2 = samplePosition.xyz - wPosition.xyz;
						float distance = length(distanceVec2);
						if(distance < maxDistance){
							vec3 sampleDir = normalize(distanceVec2);
							float factor = max(0.0, dot(sampleDir, originNormal) - 0.1);
							factor *= 1.0 - distance / maxDistance;
							darkWeight += factor;
						}
					}
				}
			}
			return darkWeight / totalWeight;
		}
		
		void main() {
			float depth = texture2D(depthTex, v_Uv).r;
			if(depth >= (1.0 - EPSILON)) {
				discard;
			}
			
			float ndcZ = depth * 2.0 - 1.0;
			float maxPixelScaled = calcPixelByNDC(ndcZ);
			float newFactor = rayMarch(maxPixelScaled);
		
			float factor = newFactor;
			factor = max(0., 1.0 - factor * darkFactor);
			vec3 gtao = vec3(factor);
			
			#ifdef MULTI_BOUNCE
				vec4 oc = texture2D(colorTex, v_Uv);
				gtao = MultiBounce(factor, oc.xyz);
			#endif
			
			gl_FragColor = vec4(gtao.xyz, 1.0);
		}
    `
};
