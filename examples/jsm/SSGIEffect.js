import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, blurShader } from 't3d-effect-composer';

export default class SSGIEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'SceneBuffer' },
			{ key: 'GBuffer' }
		];

		this._ssgiPass = new ShaderPostPass(SSGIShader);
		this.sept = 8;
		this.maxRayDistance = 15;
		this.depthRange = 1;
		this.intensity = 1;

		this._blurPass = new ShaderPostPass(blurShader);
		this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
		this._blurPass.material.defines.KERNEL_SIZE_INT = 13;
		this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;
		this._blendPass = new ShaderPostPass(mixShader);
		this._blendPass.material.premultipliedAlpha = true;
		this.blurSize = 10;

		this.debugGI = false;
		this.debugBlur = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);

		const sceneBuffer = composer.getBuffer('SceneBuffer');
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		projMat.copy(gBufferRenderStates.camera.projectionMatrix);
		viewMat.copy(gBufferRenderStates.camera.viewMatrix);
		viewMatrixInv.copy(gBufferRenderStates.camera.viewMatrix).inverse();
		projectionMatrixInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
		viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();
		projViewMat.copy(projMat).multiply(viewMat);

		// Step 1: ssgi pass
		renderer.setRenderTarget(inputRenderTarget ? tempRT1 : outputRenderTarget);
		if (this.debugGI) {
			renderer.setRenderTarget(outputRenderTarget);
		}
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._ssgiPass.uniforms.sceneDepth = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		this._ssgiPass.uniforms.sceneDiffuse = sceneBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];

		projectionMatrixInv.toArray(this._ssgiPass.uniforms.projectionMatrixInv);
		viewMatrixInv.toArray(this._ssgiPass.uniforms.viewMatrixInv);
		viewMat.toArray(this._ssgiPass.uniforms.viewMat);
		projMat.toArray(this._ssgiPass.uniforms.projMat);
		projViewMat.toArray(this._ssgiPass.uniforms.projViewMat);

		gBufferRenderStates.camera.position.toArray(this._ssgiPass.uniforms.cameraPos);

		this._ssgiPass.uniforms.time = performance.now() / 1000;
		this._ssgiPass.uniforms.samples = this.sept;
		this._ssgiPass.uniforms.maxRayDistance = this.maxRayDistance;
		this._ssgiPass.uniforms.intensity = this.intensity;

		this._ssgiPass.render(renderer);
		if (!this.debugGI) {
			// Step 2: blurX pass

			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);

			this._blurPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._blurPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._blurPass.uniforms.textureSize[0] = gBuffer.output().width;
			this._blurPass.uniforms.textureSize[1] = gBuffer.output().height;

			projMat.toArray(this._blurPass.uniforms.projection);
			viewInverseTranspose.toArray(this._blurPass.uniforms.viewInverseTranspose);

			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.uniforms.depthRange = this.depthRange;

			this._blurPass.uniforms.direction = 0;
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;

			this._blurPass.render(renderer);

			// Step 3: blurY pass

			renderer.setRenderTarget(tempRT1);
			if (this.debugBlur) {
				renderer.setRenderTarget(outputRenderTarget);
			}
			renderer.clear(true, true, false);

			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;

			this._blurPass.render(renderer);


			// Step 2: blend pass

			if (inputRenderTarget && !this.debugBlur) {
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
		}

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	resize(width, height) {
		this._ssgiPass.uniforms.resolution[0] == 1 / width;
		this._ssgiPass.uniforms.resolution[1] = 1 / height;
	}

	dispose() {
		this._ssgiPass.dispose();
		this._blendPass.dispose();
	}

}

const projMat = new Matrix4();
const viewMat = new Matrix4();
const projectionMatrixInv = new Matrix4();
const viewMatrixInv = new Matrix4();
const viewInverseTranspose = new Matrix4();
const projViewMat = new Matrix4();


const SSGIShader = {
	name: 'ec_ssgi',

	uniforms: {
		sceneDiffuse: null,
		sceneDepth: null,
		projMat: new Float32Array(16),
		viewMat: new Float32Array(16),
		projectionMatrixInv: new Float32Array(16),
		viewMatrixInv: new Float32Array(16),
		projViewMat: new Float32Array(16),
		cameraPos: [0, 0, 0],
		resolution: [1024, 512],
		samples: 16,
		time: 0,
		maxRayDistance: 0.5,
		intensity: 10
	},

	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D sceneDiffuse;
		uniform sampler2D sceneDepth;
		uniform mat4 projectionMatrixInv;
		uniform mat4 viewMatrixInv;
		uniform mat4 projMat;
		uniform mat4 viewMat;
		uniform mat4 projViewMat;
		uniform vec3 cameraPos;
		uniform vec2 resolution;
		uniform float time;
		uniform float samples;
		uniform float maxRayDistance;
		uniform float intensity;

		varying vec2 v_Uv ;

		float linearize_depth(float d, float zNear, float zFar){
			float z_n = 2.0 * d - 1.0;
			return 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
		}

		vec3 getWorldPos(float depth, vec2 coord) {
			float z = depth * 2.0 - 1.0;
			vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
			vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
			// Perspective division
			vec4 worldSpacePosition = viewMatrixInv * viewSpacePosition;
			worldSpacePosition.xyz /= worldSpacePosition.w;
			return worldSpacePosition.xyz;
		}

		vec3 computeNormal(vec3 worldPos, vec2 v_Uv ) {
			vec2 downUv = v_Uv  + vec2(0.0, 1.0 / resolution.y);
			vec3 downPos = getWorldPos( texture2D(sceneDepth, downUv).x, downUv).xyz;
			vec2 rightUv = v_Uv  + vec2(1.0 / resolution.x, 0.0);
			vec3 rightPos = getWorldPos(texture2D(sceneDepth, rightUv).x, rightUv).xyz;
			vec2 upUv = v_Uv  - vec2(0.0, 1.0 / resolution.y);
			vec3 upPos = getWorldPos(texture2D(sceneDepth, upUv).x, upUv).xyz;
			vec2 leftUv = v_Uv  - vec2(1.0 / resolution.x, 0.0);;
			vec3 leftPos = getWorldPos(texture2D(sceneDepth, leftUv).x, leftUv).xyz;
			int hChoice;
			int vChoice;
			if (length(leftPos - worldPos) < length(rightPos - worldPos)) {
				hChoice = 0;
			} else {
				hChoice = 1;
			}
			if (length(upPos - worldPos) < length(downPos - worldPos)) {
				vChoice = 0;
			} else {
				vChoice = 1;
			}
			vec3 hVec;
			vec3 vVec;
			if (hChoice == 0 && vChoice == 0) {
				hVec = leftPos - worldPos;
				vVec = upPos - worldPos;
			} else if (hChoice == 0 && vChoice == 1) {
				hVec = leftPos - worldPos;
				vVec = worldPos - downPos;
			} else if (hChoice == 1 && vChoice == 1) {
				hVec = rightPos - worldPos;
				vVec = downPos - worldPos;
			} else if (hChoice == 1 && vChoice == 0) {
				hVec = rightPos - worldPos;
				vVec = worldPos - upPos;
			}
			return normalize(cross(hVec, vVec));
		}

		float rand(float n){
			return fract(sin(n) * 43758.5453123);
		}

		float random(vec2 co){
			float a = 12.9898;
			float b = 78.233;
			float c = 43758.5453;
			float dt= dot(co.xy ,vec2(a,b));
			float sn= mod(dt,3.14);
			return fract(sin(sn) * c);
		}

		float seed = 0.0;
		float rand(){
			/*float result = fract(sin(seed + mod(time, 1000.0) + dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
			//_Seed += 1.0;
			seed += 1.0;
			return result;*/
			float result = random(v_Uv  + seed / 10.0/* + mod(time / 100.0, 100.0)*/);
			seed += 1.0;
			return result;
		}

		void main() {
			vec4 diffuse = texture2D(sceneDiffuse, v_Uv );
			float depth = texture2D(sceneDepth, v_Uv ).x;
			vec3 worldPos = getWorldPos(depth, v_Uv );
			vec3 normal = computeNormal(worldPos, v_Uv );
			vec3 occluded = vec3(0.0);
			float factor = 0.0;
			for(float i = 0.0; i < samples; i++) {
				vec3 sampleDirection = normalize(vec3(
				rand() /*rand (v_Uv .x + v_Uv .y + i)*/ - 0.5,
				rand() /*rand (v_Uv .x + v_Uv .y + i * (i + 1.0))*/ - 0.5,
				rand() /*rand (v_Uv .x + v_Uv .y + i * (i + 1.0) * (i + 2.0))*/ - 0.5
				));
				if (dot(normal, sampleDirection) < 0.0) {
				sampleDirection *= -1.0;
				}
				float radius = maxRayDistance * (i / samples);
				float moveAmt = rand() * rand() /*rand(v_Uv .x + v_Uv .y + i) * rand(2.0 * (v_Uv .x + v_Uv .y + i))*/;
				vec3 samplePos = worldPos + radius * moveAmt * sampleDirection ;
				vec4 offset = projViewMat * vec4(samplePos, 1.0);
				offset.xyz /= offset.w;
				offset.xyz = offset.xyz * 0.5 + 0.5;
				float sampleDepth = texture2D(sceneDepth, offset.xy).x;
				float distSample =linearize_depth(sampleDepth, 0.1, 1000.0);// length(getWorldPos(sampleDepth, v_Uv ) - cameraPos);
				float distWorld = linearize_depth(offset.z, 0.1, 1000.0);//length(samplePos - cameraPos);
				float rangeCheck = smoothstep(0.0, 1.0, radius / abs(distSample - distWorld));
				vec3 lightPos = getWorldPos(sampleDepth, offset.xy);
				occluded += rangeCheck * texture2D(sceneDiffuse, offset.xy).rgb * max(dot(normal, normalize(lightPos - worldPos)), 0.0) * max(dot(computeNormal(lightPos, offset.xy), normalize(worldPos - lightPos)), 0.0);
				factor += rangeCheck / intensity;
			}
			occluded /= factor;
			gl_FragColor = vec4(vec3(occluded), 1.0);
		}`
};

const mixShader = {
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