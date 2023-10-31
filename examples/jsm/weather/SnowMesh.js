import { Buffer, Geometry, Attribute, Mesh, ShaderMaterial, BLEND_TYPE } from 't3d';

export default class SnowEffect extends Mesh {

	constructor(maxCount = 50000) {
		const positionAttribute = new Attribute(new Buffer(_positionArray, 3));

		const instanceIndices = [];
		for (let r = 0; r < maxCount; r++) instanceIndices.push(r);
		const instanceIndicesAttribute = new Attribute(new Buffer(new Float32Array(instanceIndices), 1));
		instanceIndicesAttribute.divisor = 1;

		const geometry = new Geometry();
		geometry.addAttribute('a_Position', positionAttribute);
		geometry.addAttribute('instanceFeatureAttribute', instanceIndicesAttribute);
		geometry.instanceCount = maxCount;

		const material = new ShaderMaterial(snowShader);
		material.blending = BLEND_TYPE.ADD;
		material.transparent = true;
		material.depthWrite = false;
		material.depthTest = true;

		super(geometry, material);

		this.frustumCulled = false;
		this.renderOrder = 10000;

		this.number = maxCount;
		this.speed = 1.0;
		this.size = 1;

		this._maxCount = maxCount;
	}

	update(deltaTime = 0.0166666) {
		this.material.uniforms.time += deltaTime * 0.006 * this.speed;
		this.material.uniforms.width = this.size;
		if (this.number !== this.geometry.instanceCount) {
			this.geometry.instanceCount = Math.min(this.number, this._maxCount);
		}
	}

}

const _positionArray = new Float32Array([-1, 0, 1, 1, 0, -1, 1, 0, 1]);

const snowShader = {
	name: 'ec_snow_mesh',

	defines: {},

	uniforms: {
		opacity: 1.0,
		particleColor: [0.7434, 0.7434, 0.7434],
		cameraPositiona: [1.0, 100.0, 0.0],
		width: 1.0,
		time: 1.0
	},

	vertexShader: `
		uniform vec3 u_CameraPosition;
		uniform mat4 u_Projection;
		uniform mat4 u_View;

		uniform float width;
		uniform float time;
		uniform vec3 cameraPositiona;
		attribute float instanceFeatureAttribute;
		attribute vec3 a_Position;

		varying vec2 v_Uv;
		vec3 hash31(float p) {
			vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
			p3 += dot(p3, p3.yzx + 33.33);
			return fract((p3.xxy + p3.yzz) * p3.zyx);
		}
		float hash11(float p) {
			p = fract(p * 0.1031);
			p *= p + 33.33;
			p *= p + p;
			return fract(p);
		}
		vec3 rotateVectorByQuaternion(vec3 v, vec4 q) {
			return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
		}
		void main(void) {
			v_Uv = a_Position.xz;
			vec3 rand = hash31(instanceFeatureAttribute);
			vec3 randomPosition = 2.0 * (rand + (0.01 + 0.01 * rand) * floor(0.001 * instanceFeatureAttribute)) - 1.0;
			float angle = 3.1415 * hash11(instanceFeatureAttribute);
			vec3 up = vec3(0, 0, 1);
			vec3 direction = normalize(cameraPositiona);
			vec3 tangent = normalize(cross(direction, up));
			vec3 animatedPos = randomPosition - direction * time;
			vec3 rotationAxis = direction;
			vec4 quat = vec4(rotationAxis * sin(angle), cos(angle));
			tangent = rotateVectorByQuaternion(tangent, quat);
			animatedPos += tangent * 0.25 * sin(dot(animatedPos, direction));
			vec4 pos = mat4(mat3(u_View)) * vec4((mod(1. / width * 500. * animatedPos - u_CameraPosition, 1. / width * 500.) - 0.5 * 1. / width * 500.), 1.0);
			gl_Position = u_Projection * (0.5 * vec4(a_Position.xzy, 0.0) + pos);
		}
	`,

	fragmentShader: `
		uniform float opacity;
		uniform vec3 particleColor;
		varying vec2 v_Uv;
		void main() {
			if(v_Uv.x < 0.0 || v_Uv.y < 0.0) {
			    discard;
			}
			float d = length(v_Uv - vec2(0.5));
			d = smoothstep(0.5, 0.1, d);
			gl_FragColor = opacity * vec4(particleColor * d, d);
		}
	`
};
