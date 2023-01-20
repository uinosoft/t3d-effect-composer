import { Mesh, ShaderMaterial, Geometry, Buffer, Attribute } from 't3d';

export class LensflareMarker extends Mesh {

	constructor() {
		const occlusionTestMaterial = new ShaderMaterial(occlusionShader);
		occlusionTestMaterial.depthWrite = false;

		super(lensflareGeometry, occlusionTestMaterial);

		this.renderLayer = 5;
		this.frustumCulled = false;

		// { texture: t3d.Texture2D, color: t3d.Color3, scale: 1, offset: 0 }
		this.lensflareElements = [];
	}

	set occlusionScale(value) {
		this.material.uniforms.scale[1] = value;
	}

	get occlusionScale() {
		return this.material.uniforms.scale[1];
	}

}

const lensflareGeometry = new Geometry();
const float32Array = new Float32Array([
	-1, -1, 0, 0, 0,
	1, -1, 0, 1, 0,
	1, 1, 0, 1, 1,
	-1, 1, 0, 0, 1
]);
const buffer = new Buffer(float32Array, 5);
lensflareGeometry.setIndex(
	new Attribute(new Buffer(new Uint16Array([0, 1, 2, 0, 2, 3]), 1))
);
lensflareGeometry.addAttribute('a_Position', new Attribute(buffer, 3, 0));
lensflareGeometry.addAttribute('a_Uv', new Attribute(buffer, 2, 3));

const occlusionShader = {
	name: 'lensflare_marker',
	defines: {},
	uniforms: {
		'scale': [0.1, 0.1],
		'screenPosition': [0, 0, 0]
	},
	vertexShader: `
        uniform vec3 screenPosition;
        uniform vec2 scale;

        attribute vec3 a_Position;
        attribute vec2 a_Uv;

        varying vec2 v_Uv;

        void main() {
            v_Uv = a_Uv;
            vec2 pos = a_Position.xy;
            gl_Position = vec4(pos * scale + screenPosition.xy, screenPosition.z, 1.0);
        }
    `,
	fragmentShader: `
        uniform sampler2D map;
        uniform vec3 color;

        varying vec2 v_Uv;

        void main() {
            float dist = length(v_Uv - vec2(0.5));
            float mask = 1.0 - smoothstep(0.49, 0.5, dist);
            gl_FragColor = vec4(mask, mask, mask, 1.);
        }
    `
};