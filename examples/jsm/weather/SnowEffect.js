import { ShaderPostPass, ATTACHMENT  } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export default class SnowEffect extends Effect {

	constructor() {
		super();

		this.speed = 1;
		this.size = 1.5;
		this.angle = 0;
		this.density = 1;
		this.strength = 1;
		this.cover = 0.6;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._snowPass = new ShaderPostPass(snowShader);
		this._mixSnowPass = new ShaderPostPass(mixSnowShader);

		this._renderCover = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const gBuffer = composer.getBuffer('GBuffer');

		// Step 1: snow pass

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(1, 1, 1, 1);
		renderer.renderPass.clear(true, true, false);

		const deltaTime = 0.0166666;
		this._snowPass.uniforms.time += deltaTime * this.speed / 8.;
		this._snowPass.uniforms.size = this.size;
		this._snowPass.uniforms.angle = this.angle;
		this._snowPass.uniforms.density = this.density;
		this._snowPass.uniforms.strength = this.strength;

		this._snowPass.render(renderer);

		// Step 2: blend pass

		if (this.cover != 0) {
			this.bufferDependencies = [
				{ key: 'GBuffer' }
			];
		} else {
			this.bufferDependencies = [];
		}

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}
		this._mixSnowPass.uniforms.texture1 = inputRenderTarget.texture;
		this._mixSnowPass.uniforms.texture2 = tempRT1.texture;
		this._mixSnowPass.uniforms.texture3 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._mixSnowPass.uniforms.cover = this.cover;
		if (finish) {
			this._mixSnowPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._mixSnowPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._mixSnowPass.render(renderer);
		if (finish) {
			this._mixSnowPass.material.transparent = false;
			this._mixSnowPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
		composer._renderTargetCache.release(tempRT1, 0);
	}

	dispose() {
		this._snowPass.dispose();
		this._mixSnowPass.dispose();
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
		strength: 1.
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		varying vec2 v_Uv;
		uniform float time;
		uniform float size;
		uniform float angle;
		uniform float density;
		uniform float strength;
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
			gl_FragColor = vec4(finalColor * strength , 1.);
		}
	`
};

const mixSnowShader = {
	name: 'ec_snow_mix',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null,
		texture3: null,
		cover: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D texture1;
		uniform sampler2D texture2;
		uniform sampler2D texture3;
		uniform float cover;
		varying vec2 v_Uv;
		void main() {
			vec4 texel1 = texture2D(texture1, v_Uv);
			vec4 texel2 = texture2D(texture2, v_Uv);
			vec4 texel3 = texture2D(texture3, v_Uv);
			vec4 color = vec4(1.0);
			float coverDensity = step(0.1, texel3.y * 2.0 - 1.0) * (texel3.y * 2.0 - 1.0);
			gl_FragColor = vec4(texel1.rgb + texel2.rgb+color.rgb * coverDensity * cover,texel1.a);
		}
	`
};