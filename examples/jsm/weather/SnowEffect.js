import { ShaderPostPass, ATTACHMENT, Color3  } from 't3d';
import { Effect, defaultVertexShader, fxaaShader } from 't3d-effect-composer';

export default class SnowEffect extends Effect {

	constructor() {
		super();

		this.speed = 1;
		this.size = 1.5;
		this.angle = 0;
		this.density = 1;
		this.strength = 1;
		this.cover = 1;
		this.color = new Color3(1, 1, 1);
		this.fxaa = true;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._snowPass = new ShaderPostPass(snowShader);
		this._snowCoverPass = new ShaderPostPass(snowCoverShader);
		this._fxaaPass = new ShaderPostPass(fxaaShader);
		this._snowMixPass = new ShaderPostPass(snowMixShader);

		this._renderCover = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);
		const tempRT3 = composer._renderTargetCache.allocate(0);
		const gBuffer = composer.getBuffer('GBuffer');

		// Render snow pass

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, false);

		const deltaTime = 0.0166666;
		this._snowPass.uniforms.time += deltaTime * this.speed / 8.;
		this._snowPass.uniforms.size = this.size;
		this._snowPass.uniforms.angle = this.angle;
		this._snowPass.uniforms.density = this.density;
		this._snowPass.uniforms.strength = this.strength;
		this._snowPass.uniforms.viewportSize[0] =  inputRenderTarget.width;
		this._snowPass.uniforms.viewportSize[1] =  inputRenderTarget.height;

		this._snowPass.render(renderer);

		// Render snow cover pass

		renderer.setRenderTarget(tempRT2);
		renderer.setClearColor(1, 1, 1, 1);
		renderer.clear(true, true, false);

		this._snowCoverPass.uniforms.normalTexture = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._snowCoverPass.uniforms.cover = this.cover;

		this._snowCoverPass.render(renderer);

		// (Optional) Render fxaa pass

		if (this.fxaa) 		{
			renderer.setRenderTarget(tempRT3);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, true);

			this._fxaaPass.uniforms.resolution[0] = 1 / gBuffer.output().width;
			this._fxaaPass.uniforms.resolution[1] = 1 / gBuffer.output().height;
			this._fxaaPass.uniforms.tDiffuse = tempRT2.texture;
			this._fxaaPass.render(renderer);
		}

		// Render snow mix pass

		if (this.cover != 0) {
			this.bufferDependencies = [
				{ key: 'GBuffer' }
			];
		} else {
			this.bufferDependencies = [];
		}

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}
		this._snowMixPass.uniforms.texture1 = inputRenderTarget.texture;
		this._snowMixPass.uniforms.texture2 = this.fxaa ? tempRT3.texture : tempRT2.texture;
		this._snowMixPass.uniforms.texture3 = tempRT1.texture;
		this.color.toArray(this._snowMixPass.uniforms.uColor);

		if (finish) {
			this._snowMixPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._snowMixPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._snowMixPass.render(renderer);
		if (finish) {
			this._snowMixPass.material.transparent = false;
			this._snowMixPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

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

const snowShader = {
	name: 'ec_snow',
	defines: {},
	uniforms: {
		time: 1.0,
		size: 2.0,
		angle: 0,
		density: 1.,
		strength: 1.,
		viewportSize: [512, 512]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;
		uniform float time;
		uniform float size;
		uniform float angle;
		uniform float density;
		uniform float strength;
		uniform vec2 viewportSize;
		float snow(vec2 uv,float scale) {
			float time1 = time ;
			float w = smoothstep(1.,0.,-uv.y * (scale/10.));if(w < .1)return 0.;
			uv += time1/scale;
			uv.y += time1 * 2. / scale;uv.x += sin(uv.y + time1*.5) / scale;
			uv *= scale;
			vec2 s = floor(uv),f = fract(uv),p;float k = 3.,d;
			p = .5+.35 * sin(11. * fract(sin((s + p + scale) * mat2(7,3,6,5)) * 5.)) - f;
			d = length(p) / size;
			k = min(d,k);
			k = smoothstep(0.,k,sin(f.x+f.y)*density/400.);
			return k * w;
		}
		void main(void) {
			float a =  angle / 180. * 3.141592;
			float si = sin(a), co = cos(a);
			vec2 uv = v_Uv;
			uv.x = uv.x * viewportSize.x / 1024.;
			uv.y = uv.y * viewportSize.y / 1024.;
			uv *= mat2(co, -si, si, co);
			uv *= density;
			vec3 finalColor = vec3(0);
			float c = 0.;
			c += snow(uv,30.)*.0;
			c += snow(uv,20.)*.0;
			c += snow(uv,15.)*.0;
			c += snow(uv,10.);
			c += snow(uv,8.);
			c += snow(uv,6.);
			c += snow(uv,5.);
			finalColor = (vec3(c));
			gl_FragColor = vec4(finalColor * strength, 1.);
		}
	`
};

const snowCoverShader = {
	name: 'ec_snow_cover',
	defines: {},
	uniforms: {
		normalTexture: null,
		cover: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D normalTexture;
		uniform float cover;
		varying vec2 v_Uv;
		void main() {
			vec4 texel = texture2D(normalTexture, v_Uv);
			float coverDensity = step(0.1, texel.y * 2.0 - 1.0) * (texel.y * 2.0 - 1.0);
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