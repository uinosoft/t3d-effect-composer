import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL } from 't3d-effect-composer';

export default class GTGIEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		this.multiBounce = false;
		this.maxDistance = 10;
		this.maxPixel = 400;
		this.rayMarchSegment = 10;
		this.darkFactor = 2.5;

		this._gtgiPass = new ShaderPostPass(GTGIShader);
		this._blurPass = new ShaderPostPass(blurShader);
		this._blendPass = new ShaderPostPass(mixyShader);
		this._blendPass.material.premultipliedAlpha = true;

		this.randomCount = 0;

		this.tempRT1 = null;
		this.tempRT2 = null;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		if (!this.tempRT1) {
			this.tempRT1 = composer._renderTargetCache.allocate(2);
		}
		if (!this.tempRT2) {
			this.tempRT2 = composer._renderTargetCache.allocate(2);
		}
		const tempRT1 = this.tempRT1;
		const tempRT2 = this.tempRT2;
		const tempRT3 = composer._renderTargetCache.allocate(0);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewInv.copy(gBufferRenderStates.camera.viewMatrix).inverse();

		// Step 1: gtgi pass

		renderer.setRenderTarget(this.randomCount % 2 ? tempRT2 : tempRT1);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._gtgiPass.uniforms.maxDistance = this.maxDistance;
		this._gtgiPass.uniforms.maxPixel = this.maxPixel;
		this._gtgiPass.uniforms.rayMarchSegment = this.rayMarchSegment;
		this._gtgiPass.uniforms.darkFactor = this.darkFactor;
		this._setDirections(this.randomCount++);

		this._gtgiPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._gtgiPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._gtgiPass.uniforms.colorTex = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		this._gtgiPass.uniforms.cameraNear = gBufferRenderStates.camera.near;
		this._gtgiPass.uniforms.cameraFar = gBufferRenderStates.camera.far;
		projectionInv.toArray(this._gtgiPass.uniforms.projectionInv);
		viewInv.toArray(this._gtgiPass.uniforms.viewInv);

		this._gtgiPass.uniforms.texSize[0] = gBuffer.output().width;
		this._gtgiPass.uniforms.texSize[1] = gBuffer.output().height;

		this._gtgiPass.render(renderer);

		// Step 2: blur pass

		renderer.setRenderTarget(inputRenderTarget ? tempRT3 : outputRenderTarget);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._blurPass.uniforms.oldAoTex = tempRT2.texture;
		this._blurPass.uniforms.newAoTex = tempRT1.texture;

		this._blurPass.render(renderer);
		// Step 3: blend pass

		if (inputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}

			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT3.texture;

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

		composer._renderTargetCache.release(tempRT3, 0);
	}

	dispose() {
		this._gtgiPass.dispose();
		this._blendPass.dispose();
		this._blurPass.dispose();
		if (this.tempRT1) {
			this.tempRT1.dispose();
		}
		if (this.tempRT2) {
			this.tempRT2.dispose();
		}
	}

	_setDirections(seed = 0) {
		seed = (seed % 2) + 1;

		if (!_directionsCache[seed]) {
			_directionsCache[seed] = randomDirection(seed);
		}

		this._gtgiPass.uniforms.directions = _directionsCache[seed];
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

const GTGIShader = {
	name: 'ec_gtgi',

	uniforms: {
		maxDistance: 10,
		maxPixel: 40,
		darkFactor: 1,
		rayMarchSegment: 10,
		directions: new Float32Array(16),
		normalTex: null,
		depthTex: null,
		colorTex: null,
		aoTex: null,
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
		uniform sampler2D colorTex;
		uniform sampler2D aoTex;

		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 projectionInv;
		uniform mat4 u_Projection;
		uniform mat4 viewInv;
		uniform vec2 texSize;
		uniform vec2 noiseScale;

		varying vec2 v_Uv;

		${octahedronToUnitVectorGLSL}

		bool isPerspectiveMatrix( mat4 m ) {
			return m[ 2 ][ 3 ] == - 1.0;
		 }
   
		float calcPixelByNDC(float ndcZ) {
			if(isPerspectiveMatrix(u_Projection)) {
				float nearAspect = cameraNear / (cameraFar - cameraNear);
				float aspect = (1.0 + nearAspect) / (ndcZ + nearAspect);
				float viewPortMax = max(float(texSize[0]), float(texSize[1]));
				float maxPixel = min(viewPortMax, maxPixel * aspect);
				maxPixel = max(0.1, maxPixel);
				return maxPixel;
			}
			return maxPixel;
		}

		vec4 getPosition(const in vec2 screenPosition) {
			float sampleDepth = texture2D(depthTex, screenPosition).r;
			float z = sampleDepth * 2.0 - 1.0;
			vec4 Pos = vec4(screenPosition.xy * 2.0 - 1.0, z, 1.0);
			Pos = viewInv * projectionInv * Pos;
			return Pos/Pos.w;
		}

		vec3 getColor(const in vec2 screenPosition) {
			vec3 sampleDepth = texture2D(colorTex, screenPosition).rgb;
			return sampleDepth;
		}

		vec3 rayMarch(float maxPixelScaled) {
			vec3 originNormal = octahedronToUnitVector(texture2D(normalTex, v_Uv).rg);
			float stepPixel = maxPixelScaled / rayMarchSegment;
			float totalWeight = 0.1;
			float darkWeight = 0.0;
			vec3 colors = vec3(0.0);

			vec4 wPosition = getPosition(v_Uv);
			for (int i = 0; i < 8; i += 1) {
				vec2 dirVec2 = directions[i];
			
				for(float j = 1.1; j < maxPixelScaled; j += stepPixel) {

					vec2 sampleCoord = dirVec2 * j / texSize + v_Uv;
					if(sampleCoord.x >= 0. && sampleCoord.y >= 0.
						&& sampleCoord.x < texSize.x
						&& sampleCoord.y < texSize.y) {
						vec3 color = getColor(sampleCoord);	
						vec4 samplePosition = getPosition(sampleCoord );
						vec3 distanceVec2 = samplePosition.xyz - wPosition.xyz;
						float distance = length(distanceVec2);
						if(distance < maxDistance){
							totalWeight += 1.0;
							vec3 sampleDir = normalize(distanceVec2);
							float factor = max(0.0, dot(sampleDir, originNormal) - 0.1) * darkFactor;
							factor *= 1.0 - distance / maxDistance;
							darkWeight += factor;
							colors += color * factor;
						}
					}
				}
			}

			return vec3(colors / totalWeight);
		}
		

		void main() {
			float depth = texture2D(depthTex, v_Uv).r;
			if(depth >= (1.0 - EPSILON)) {
				gl_FragColor = vec4(0.0);
				return;
			}
			
			float ndcZ = depth * 2.0 - 1.0;
			float maxPixelScaled = calcPixelByNDC(ndcZ);
			vec3 newFactor = rayMarch(maxPixelScaled);
				
			gl_FragColor = vec4(newFactor, 1.0);
		}
    `
};

const blurShader = {
	name: 'ec_gtgi_blur',
	defines: {},
	uniforms: {
		oldAoTex: null,
		newAoTex: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D newAoTex;
		uniform sampler2D oldAoTex;
		varying vec2 v_Uv;

		vec3 blurFactor(vec3 centerFactor){
			vec3 factor = texture2D(oldAoTex, v_Uv ).rgb;
			factor = mix(factor, centerFactor, 0.8);
			return factor;
		}

		void main() {
			vec4 centerFactor = texture2D(newAoTex, v_Uv);
			vec3 factor = blurFactor(centerFactor.rgb);
			gl_FragColor = vec4(factor, centerFactor.a);
		}


	`
};

const mixyShader = {
	name: 'ec_mixgi',
	uniforms: {
		texture1: null,
		texture2: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D texture1;
        uniform sampler2D texture2;

        varying vec2 v_Uv;	
			
		vec3 RGBToHSV(vec3 rgb) {
			float r = rgb.r, g = rgb.g, b = rgb.b;
			float max = max(r, max(g, b)), min = min(r, min(g, b));
			float h, s, v = max;

			float d = max - min;
			s = max == 0.0 ? 0.0 : d / max;

			if (max == min) {
				h = 0.0; // achromatic
			} else {
				if (max == r) {
					h = (g - b) / d + (g < b ? 6.0 : 0.0);
				} else if (max == g) {
					h = (b - r) / d + 2.0;
				} else if (max == b) {
					h = (r - g) / d + 4.0;
				}
				h /= 6.0;
			}

			return vec3(h, s, v);
		}

		vec3 HSVToRGB(vec3 hsv) {
			float h = hsv.x, s = hsv.y, v = hsv.z;
			float r, g, b;

			int i = int(h * 6.0);
			float f = h * 6.0 - float(i);
			float p = v * (1.0 - s);
			float q = v * (1.0 - f * s);
			float t = v * (1.0 - (1.0 - f) * s);

			if (i % 6 == 0) {
				r = v, g = t, b = p;
			} else if (i == 1) {
				r = q, g = v, b = p;
			} else if (i == 2) {
				r = p, g = v, b = t;
			} else if (i == 3) {
				r = p, g = q, b = v;
			} else if (i == 4) {
				r = t, g = p, b = v;
			} else if (i == 5) {
				r = v, g = p, b = q;
			}

			return vec3(r, g, b);
		}

        void main() {
            vec4 texel1 = texture2D(texture1, v_Uv);
            vec4 texel2 = texture2D(texture2, v_Uv);

			vec3 finalColor = texel1.rgb  + texel2.rgb ;

			vec3 hsv = RGBToHSV(texel1.rgb);
            vec3 hsv3 = RGBToHSV(finalColor);
        
			hsv.x = hsv3.x;
			hsv.y = hsv3.y;
         
			vec3 rgb = HSVToRGB(hsv);
            gl_FragColor = vec4(rgb, texel1.a);
        }
    `
};