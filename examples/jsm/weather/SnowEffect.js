import { ShaderPostPass, ATTACHMENT, Color3, Matrix4 } from 't3d';
import { Effect, defaultVertexShader, octahedronToUnitVectorGLSL, fxaaShader } from 't3d-effect-composer';

export default class SnowEffect extends Effect {

	constructor() {
		super();

		this.speed = 1;
		this.size = 1.5;
		this.angle = 0;
		this.density = 1;
		this.strength = 1;
		this.color = new Color3(1, 1, 1);
		this.fxaa = true;
		this.coverNoise = 0;
		this.coverNoiseScale = 1;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._snowPass = new ShaderPostPass(snowShader);
		this._snowCoverPass = new ShaderPostPass(snowCoverShader);
		this._fxaaPass = new ShaderPostPass(fxaaShader);
		this._snowMixPass = new ShaderPostPass(snowMixShader);

		this._volumeId = 0;
		this._cover = 1;
	}

	set cover(value) {
		const oldValue = this._cover;

		this._cover = value;

		if ((oldValue == 0) !== (value == 0)) {
			this._setBufferDependencies();
		}
	}

	get cover() {
		return this._cover;
	}

	set volumeId(value) {
		const oldValue = this._volumeId;

		this._volumeId = value;

		if (oldValue > 0 !== value > 0) {
			this._setBufferDependencies();
			this._snowCoverPass.material.defines.USE_VOLUME = value > 0;
			this._snowCoverPass.material.needsUpdate = true;
		}
	}

	get volumeId() {
		return this._volumeId;
	}

	_setBufferDependencies() {
		this.bufferDependencies.length = 0;
		if (this._cover != 0) {
			this.bufferDependencies.push({ key: 'GBuffer' });
			if (this._volumeId > 0) {
				this.bufferDependencies.push({ key: 'ThicknessBuffer' });
			}
		}
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);
		const tempRT3 = composer._renderTargetCache.allocate(0);

		// Render snow pass

		const deltaTime = 0.0166666;
		this._snowPass.uniforms.time += deltaTime * this.speed / 8.;
		this._snowPass.uniforms.size = this.size;
		this._snowPass.uniforms.angle = this.angle;
		this._snowPass.uniforms.density = this.density;
		this._snowPass.uniforms.strength = this.strength;

		tempRT1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this._snowPass.render(renderer, tempRT1);

		// Render snow cover pass

		tempRT2.setColorClearValue(this._cover !== 0 ? 1 : 0, 1, 1, 1).setClear(true, true, false);

		let useRT3 = false;

		if (this._cover != 0) {
			const gBuffer = composer.getBuffer('GBuffer');
			this._snowCoverPass.uniforms.normalTexture = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			this._snowCoverPass.uniforms.cover = this._cover;

			if (this._snowCoverPass.material.defines['USE_NOISE'] !== (this.coverNoise > 0)) {
				this._snowCoverPass.material.defines['USE_NOISE'] = this.coverNoise > 0;
				this._snowCoverPass.material.needsUpdate = true;
			}

			if (this.coverNoise > 0) {
				this._snowCoverPass.uniforms.noiseScale = this.coverNoiseScale;
				this._snowCoverPass.uniforms.noiseStrength = this.coverNoise;
				const gBufferRenderStates = gBuffer.getCurrentRenderStates();
				projectionViewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();
				projectionViewInverse.toArray(this._snowCoverPass.uniforms.projectionViewInverse);
			}

			if (this._volumeId > 0) {
				const thicknessBuffer = composer.getBuffer('ThicknessBuffer');
				this._snowCoverPass.uniforms.volumeId = this._volumeId;
				this._snowCoverPass.uniforms.idTex = thicknessBuffer.output()[1]._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
				this._snowCoverPass.uniforms.frontDepthTex = thicknessBuffer.output()[0]._attachments[ATTACHMENT.DEPTH_ATTACHMENT];
				this._snowCoverPass.uniforms.backDepthTex = thicknessBuffer.output()[1]._attachments[ATTACHMENT.DEPTH_ATTACHMENT];
			}

			if (this.coverNoise > 0 || this._volumeId > 0) {
				this._snowCoverPass.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			}

			this._snowCoverPass.render(renderer, tempRT2);

			// (Optional) Render fxaa pass

			if (this.fxaa) {
				this._fxaaPass.uniforms.tDiffuse = tempRT2.texture;
				tempRT3.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
				this._fxaaPass.render(renderer, tempRT3);

				useRT3 = true;
			}
		} else {
			renderer.beginRender(tempRT2);
			renderer.endRender();
		}

		// Render snow mix pass

		this._snowMixPass.uniforms.texture1 = inputRenderTarget.texture;
		this._snowMixPass.uniforms.texture2 = useRT3 ? tempRT3.texture : tempRT2.texture;
		this._snowMixPass.uniforms.texture3 = tempRT1.texture;
		this.color.toArray(this._snowMixPass.uniforms.uColor);
		composer.$setEffectContextStates(outputRenderTarget, this._snowMixPass, finish);
		this._snowMixPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
		composer._renderTargetCache.release(tempRT3, 0);
	}

	dispose() {
		this._snowPass.dispose();
		this._snowCoverPass.dispose();
		this._fxaaPass.dispose();
		this._snowMixPass.dispose();
	}

}

const projectionViewInverse = new Matrix4();

const snowShader = {
	name: 'ec_snow',
	defines: {},
	uniforms: {
		time: 1.0,
		size: 2.0,
		angle: 0,
		density: 1.,
		strength: 1.
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float time;
		uniform float size;
		uniform float angle;
		uniform float density;
		uniform float strength;

		uniform vec2 u_RenderTargetSize;

		varying vec2 v_Uv;

		float snow(vec2 uv, float scale) {
			uv += time / scale;
			uv.y += time * 2. / scale;
			uv.x += sin(uv.y + time * .5) / scale;
			uv *= scale;
			vec2 s = floor(uv), f = fract(uv), p;
			float k = 3., d;
			p = .5 + .35 * sin(11. * fract(sin((s + p + scale) * mat2(7, 3, 6, 5)) * 5.)) - f;
			d = length(p) / size;
			k = min(d, k);
			k = smoothstep(0., k, sin(f.x + f.y) * density / 400.);
			return k;
		}

		void main(void) {
			float a =  angle / 180. * PI;
			float si = sin(a), co = cos(a);

			vec2 uv = v_Uv;
			uv = (uv - 0.5);
			uv.x = uv.x * u_RenderTargetSize.x / 1024.;
			uv.y = uv.y * u_RenderTargetSize.y / 1024.;
			uv *= mat2(co, -si, si, co);
			uv *= density;

			float c = 0.;
			c += snow(uv, 30.);
			c += snow(uv, 20.);
			c += snow(uv, 15.);
			c += snow(uv, 10.);
			c += snow(uv, 8.);
			c += snow(uv, 6.);
			c += snow(uv, 5.);

			gl_FragColor = vec4(vec3(c) * strength, 1.);
		}
	`
};

const snowCoverShader = {
	name: 'ec_snow_cover',
	defines: {
		USE_VOLUME: false,
		USE_NOISE: false
	},
	uniforms: {
		normalTexture: null,
		cover: 1.0,
		volumeId: 1,
		depthTex: null,
		idTex: null,
		backDepthTex: null,
		frontDepthTex: null,
		noiseScale: 1,
		noiseStrength: 1.0,
		projectionViewInverse: new Float32Array(16)
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D normalTexture;
		uniform float cover;

		#if defined(USE_NOISE) || defined(USE_VOLUME)
			uniform sampler2D depthTex;
		#endif

		#ifdef USE_NOISE
			uniform float noiseScale;
			uniform float noiseStrength;
			uniform mat4 projectionViewInverse;
		#endif

		#ifdef USE_VOLUME
			uniform int volumeId;
			uniform sampler2D idTex;
			uniform sampler2D backDepthTex;
			uniform sampler2D frontDepthTex;

			int decodeID(vec2 encodedID) {
				int high = int(encodedID.x * 255.0);
				int low = int(encodedID.y * 255.0);
				return high * 256 + low;
			}
		#endif

		varying vec2 v_Uv;

		#ifdef USE_NOISE
			const float cHashM = 43758.54;
			vec2 Hashv2v2 (vec2 p) {
				vec2 cHashVA2 = vec2(37., 39.);
				return fract(sin(vec2(dot(p, cHashVA2), dot(p + vec2(1., 0.), cHashVA2))) * cHashM);
			}

			float Noisefv2(vec2 p) {
				vec2 t, ip, fp;
				ip = floor(p);  
				fp = fract(p);
				fp = fp * fp * (3. - 2. * fp);
				t = mix(Hashv2v2(ip), Hashv2v2(ip + vec2(0., 1.)), fp.y);
				return mix(t.x, t.y, fp.x);
			}

			float Fbmn(vec3 p, vec3 n){
				vec3 s;
				float a;
				s = vec3(0.);
				a = 1.;
				for (int j = 0; j < 5; j ++) {
					s += a * vec3(Noisefv2(p.yz), Noisefv2(p.zx), Noisefv2(p.xy));
					a *= 0.5;
					p *= 2.;
				}
				return dot(s, abs(n));
			}
		#endif

		${octahedronToUnitVectorGLSL}

		void main() {
			vec3 normal = octahedronToUnitVector(texture2D(normalTexture, v_Uv).rg);

			#if defined(USE_NOISE) || defined(USE_VOLUME)
				float depth = texture2D(depthTex, v_Uv).r;
			#endif

			float coverDensity = max(0.0, normal.y) * step(0.1, normal.y);

			#ifdef USE_NOISE
				vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
				vec4 pos = projectionViewInverse * projectedPos;
				vec3 posWorld = pos.xyz / pos.w / noiseScale;
				float noise = Fbmn(posWorld, normal);
				noise = mix(1.0, noise, noiseStrength);
				coverDensity *= noise;
			#endif

			#ifdef USE_VOLUME
				vec2 texId = texture2D(idTex, v_Uv).rg;
				float backDepth = texture2D(backDepthTex, v_Uv).r;
				float frontDepth = texture2D(frontDepthTex, v_Uv).r;
				
				// Combine all conditions into a single multiplier
				float volumeMask =
					float(volumeId == decodeID(texId)) *
					float((frontDepth > backDepth) || (depth >= frontDepth)) *
					float(depth <= backDepth);
				
				coverDensity *= volumeMask;
			#endif
			
			gl_FragColor = vec4(vec3(coverDensity * cover), 1.0);
		}
	`
};

const snowMixShader = {
	name: 'ec_snow_mix',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null,
		texture3: null,
		cover: 1.0,
		uColor: [1, 1, 1]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D texture1;
		uniform sampler2D texture2;
		uniform sampler2D texture3;
		uniform float cover;
		uniform vec3 uColor;
		varying vec2 v_Uv;
		void main() {
			vec4 texel1 = texture2D(texture1, v_Uv);
			vec4 texel2 = texture2D(texture2, v_Uv);
			vec4 texel3 = texture2D(texture3, v_Uv);
			vec3 color = mix(texel1.rgb, uColor, texel2.r);
			color += texel3.rgb;
			gl_FragColor = vec4(color, texel1.a);
		}
	`
};