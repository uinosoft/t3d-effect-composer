import { ShaderPostPass, ATTACHMENT, Vector3 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export default class RainEffect extends Effect {

	constructor() {
		super();

		this.size = 0.8;
		this.speed = 2;
		this.angle = -10;
		this.density = 2;
		this.cover = 0.4;

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this._rainPass = new ShaderPostPass(rainShader);
		this._rainCoverPass = new ShaderPostPass(rainCoverShader);
		this._blendPass = new ShaderPostPass(mixShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const deltaTime = 0.0166666;
		const tempRT1 = composer._renderTargetCache.allocate(0);
		const tempRT2 = composer._renderTargetCache.allocate(0);
		const gBuffer = composer.getBuffer('GBuffer');

		// Step 1: rain pass

		renderer.renderPass.setRenderTarget(tempRT1);
		renderer.renderPass.setClearColor(1, 1, 1, 1);
		renderer.renderPass.clear(true, true, false);
		this._rainPass.uniforms.normalTex = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._rainPass.uniforms.time += deltaTime * this.speed / 5.;
		this._rainPass.uniforms.rainAngle = this.angle;
		this._rainPass.uniforms.rainSize = this.size;
		this._rainPass.uniforms.rainDensity = this.density;
		this._rainPass.uniforms.u_fragCoord[0] = gBuffer.output().width;
		this._rainPass.uniforms.u_fragCoord[1] = gBuffer.output().height;
		this._rainPass.render(renderer);

		// Step 2: rain cover pass

		renderer.renderPass.setRenderTarget(tempRT2);
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();
		_vec3_1.copy(gBufferRenderStates.camera.position).normalize().negate().toArray(this._rainCoverPass.uniforms.u_cameraWorldDirection);
		this._rainCoverPass.uniforms.u_fragCoord[0] = gBuffer.output().width;
		this._rainCoverPass.uniforms.u_fragCoord[1] = gBuffer.output().height;
		this._rainCoverPass.uniforms.time += deltaTime * this.speed * 1.2;
		this._rainCoverPass.render(renderer);

		// Step 3: blend pass

		renderer.renderPass.setRenderTarget(outputRenderTarget);
		renderer.renderPass.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.renderPass.clear(true, true, false);
		}

		this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
		this._blendPass.uniforms.texture2 = tempRT1.texture;
		this._blendPass.uniforms.texture3 = tempRT2.texture;
		this._blendPass.uniforms.texture4 = gBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._blendPass.uniforms.cover = this.cover;
		if (finish) {
			this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		this._blendPass.render(renderer);
		if (finish) {
			this._blendPass.material.transparent = false;
			this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}

		composer._renderTargetCache.release(tempRT1, 0);
		composer._renderTargetCache.release(tempRT2, 0);
	}

	dispose() {
		this._rainPass.dispose();
		this._blurPass.dispose();
		this._blendPass.dispose();
	}

}

const _vec3_1 = new Vector3();

// www.shadertoy.com/view/wslSD2

const rainShader = {
	name: 'ec_rain',
	defines: {},
	uniforms: {
		rainSize: 2.0,
		rainAngle: -10,
		rainDensity: 4,
		u_fragCoord: [0, 0],
		time: 0,
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		# define MARCH_STEPS 70
		# define RAIN_STEPS 15
		uniform float time;
		uniform float rainSize;
		uniform float rainAngle;
		uniform int rainDensity;
		varying vec2 v_Uv;
		uniform vec2 u_fragCoord;

		float rnd(float t) {
			return fract(sin(t * 745.523) * 7894.552);
		}
		float rain(vec3 p) {
			p.y -= time * 4.0;
			p.xy *= 60.0;
			p.y += rnd(floor(p.x)) * 80.0;
			return clamp(1.0 - length(vec2(cos(p.x * PI), sin(p.y * 0.1) - 1.7)), 0.0, 1.0);
		}
		void main() {
			vec2 uv = vec2(v_Uv.x, v_Uv.y);
			float a = rainAngle*3.1415926/360.;
			float si = sin(a), co = cos(a);
			uv -= 0.5;
			uv /= vec2(u_fragCoord.y / u_fragCoord.x, 1);
			uv *= mat2(co, -si, si, co);
			vec3 s = vec3(1, sin(time * 0.3) * 0.2, -3);
			vec3 t = vec3(0, 0, 0);
			vec3 r = normalize(vec3(-uv, 0.7));
			float dd = 0.0;
			for (int i = 0; i < MARCH_STEPS; ++i) {
				dd += 0.1;
			}
			vec3 col = vec3(0.0);
			vec3 raining = vec3(0.0);
			int steps = RAIN_STEPS;
			float stepsize = 30.0 / float(steps);
			vec3 raystep = r * stepsize / r.z/(0.2+rainSize/2.);
			for (int i = 0; i < rainDensity; ++i) {
				vec3 raypos = raystep * (float(i));
				vec3 rainpos = raypos;
				raining += rain(rainpos) * pow(2.0 * (1.0 - v_Uv.y) * (abs(0.6 - abs(v_Uv.x - 0.5))), 2.0);
			}
			col += raining;
			col = pow(col, vec3(0.6545));
			gl_FragColor=vec4(col,1.0);
		}
	`
};
const rainCoverShader = {
	name: 'ec_rain_cover',
	defines: {},
	uniforms: {
		u_cameraWorldDirection: [0, 0, 0],
		u_fragCoord: [0, 0],
		time: 0.0,
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		# define camPos vec3(0, 4, -4)
		# define camTarget vec3(0)
		# define HASHSCALE3 vec3(.1031, .1030, .0973)
		varying vec2 v_Uv;
		uniform vec3 u_cameraWorldDirection;
		uniform vec2 u_fragCoord;
		uniform float time;
		vec3 hash33(vec3 p3) {
			p3 = fract(p3 * HASHSCALE3);
			p3 += dot(p3, p3.yxz + 19.19);
			return fract((p3.xxy + p3.yxx) * p3.zyx);
		}
		# define vorRainSpeed .8
		# define vorRainScale 1.0
		float bias(float s, float b) {
			return s / ((((1. / b) - 2.) * (1. - s)) + 1.);
		}
		vec3 vorRain(vec3 p, float r) {
			vec3 vw, xy, xz, s1, s2, xx;
			vec3 yz = vec3(0), bz = vec3(0), az = vec3(0), xw = vec3(0);
			p = p.xzy;
			p /= vorRainScale;
			vec3 uv2 = p, p2 = p;
			p = vec3(floor(p));
			float t = time * vorRainSpeed*4./5.;
			vec2 yx = vec2(0);
			for (int j = -1; j <= 1; j++)
				for (int k = -1; k <= 1; k++) {
					vec3 offset = vec3(float(j), float(k), 0.);
					//hashed for grid
					s1.xz = hash33(p + offset.xyz + 127.43 + r).xz;
					//hashed for timer for switching positions of raindrop
					s2.xz = floor(s1.xx + t);
					//add timer to random value so that everytime a ripple fades, a new drop appears
					xz.xz = hash33(p + offset.xyz + (s2) + r).xz;
					xx = hash33(p + offset.xyz + (s2 - 1.));
					s1 = mod(s1 + t, 1.);
					//p2=(p2-p2)+vec3(s1.x,0.0,s1.y);
					p2 = mod(p2, 1.0);
					float op = 1. - s1.x; //opacity
					op = bias(op, .21); //optional smooth blending
					//change the profile of the timer
					s1.x = bias(s1.x, .62); //optional harder fadeout
					float size = mix(4., 1., s1.x); //ripple.expansion over time
					//move ripple formation from the center as it grows
					float size2 = mix(.005, 2.0, s1.x);
					// make the voronoi 'balls'
					xy.xz = vec2(length((p.xy + xz.xz) - (uv2.xy - offset.xy)) * size);
					//xy.xz *= (1.0/9.0);
					xx = vec3(length((p2) + xz) - (uv2 - offset) * 1.30);
					//xx=1.-xx;//optional?
					xy.x = 1. - xy.x; //mandatory!
					xy.x *= size2; //almost optional viscosity
					# define ripp
					if (xy.x > .5) xy.x = mix(1., 0., xy.x);
					xy.x = mix(0., 2., xy.x)
					ripp;
					ripp;
					xy.x = smoothstep(.0, 1., xy.x);
					xy *= op; // fade ripple over time
					yz = 1. - ((1. - yz) * (1. - xy));

				}
			return vec3(yz * .1);
		}
		# define iterRippleCount 2.
		float dfRipples(vec3 p) {
			float pl = (p.y + 1.);
			vec3 r = vec3(0);
			for (float i = 0.; i < iterRippleCount; i++) {
				r += vorRain(p, i + 1.);
			}
			return pl - r.x;
		}
		vec3 CamCross(vec2 p, vec3 o, vec3 t, vec3 u) {
			vec3
			d = normalize(t - o), r = normalize(cross(u, d)),
				Up = p.y * u;
			r *= p.x * u_fragCoord.x / u_fragCoord.y;
			return normalize(((o + d + r + Up) * .86) - (camPos));
		}
		void main() {
			vec2 u = vec2(v_Uv.x, v_Uv.y);
			u = -1. + 2. * u;
			vec3 rayDir = CamCross(u, camPos, camTarget,vec3(0, 1.4+u_cameraWorldDirection.y, 1.4+u_cameraWorldDirection.y));
			vec3 plane1=vec3(0,-.01,0);
			float d = -dot(camPos, plane1) / dot(rayDir, plane1)*5.;
			vec3 hitPoint = (camPos + (d * rayDir));
			hitPoint += .2;
			float std = dfRipples(hitPoint);
			vec2 eps = vec2( .06, 0.);
			float v1 = dfRipples(hitPoint + eps.xyy);
			float v2 = dfRipples(hitPoint + eps.yxy);
			float v3 = dfRipples(hitPoint + eps.yyx);
			vec3 n = vec3(v1, v2, v3) - std;
			n = normalize(n) - vec3(0, 1, 0);
			n=n.zxy;//swivel for "blue" flat water.
			n.xy*=.5;
			gl_FragColor = n.x*vec4(2.);
		}
	`
};

const mixShader = {
	name: 'ec_rain_mix',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null,
		texture3: null,
		texture4: null,
		cover: 0.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform sampler2D texture1;
		uniform sampler2D texture2;
		uniform sampler2D texture3;
		uniform sampler2D texture4;
		uniform float cover;
		varying vec2 v_Uv;
		void main() {
			vec4 texel1 = texture2D(texture1, v_Uv);
			vec4 texel2 = texture2D(texture2, v_Uv);
			vec4 texel3 = texture2D(texture3, v_Uv);
			vec4 texel4 = texture2D(texture4, v_Uv);
			gl_FragColor=(texel4.y*2.0-1.0)>0.90?vec4(vec3(texel1.rgb + texel2.rgb +texel3.rgb *cover),texel1.a) :vec4(vec3(texel1.rgb + texel2.rgb),texel1.a);
		}
	`
};