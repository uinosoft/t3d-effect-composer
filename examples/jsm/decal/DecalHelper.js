import { Mesh, Geometry, Buffer, Attribute,  BasicMaterial, Vector3, VERTEX_COLOR, DRAW_MODE } from 't3d';

export class DecalHelper extends Mesh {

	constructor(decal) {
		const geometry = new Geometry();
		const material = new BasicMaterial();
		material.envMap = undefined;
		material.vertexColors = VERTEX_COLOR.RGB;
		material.drawMode = DRAW_MODE.LINES;

		const vertices = new Array(3 * 8);
		const colors = [];
		const indices = [];

		for (let i = 0; i < 8; i++) {
			colors.push(1, 1, 1);
		}

		indices.push(
			0, 1, 1, 2, 2, 3, 3, 0, // near
			4, 5, 5, 6, 6, 7, 7, 4, // far
			0, 4, 1, 5, 2, 6, 3, 7  // side
		);

		geometry.addAttribute('a_Position', new Attribute(new Buffer(new Float32Array(vertices), 3)));
		geometry.addAttribute('a_Color', new Attribute(new Buffer(new Float32Array(colors), 3)));
		geometry.setIndex(new Attribute(new Buffer(new Uint16Array(indices), 1)));

		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();

		super(geometry, material);

		this.updateFrustum(decal);
	}

	updateFrustum(decal) {
		const camera = decal.$camera;

		const array = this.geometry.attributes.a_Position.buffer.array;

		for (let i = 0; i < 8; i++) {
			_vec3_1.fromArray(frustumPoints, i * 3).applyMatrix4(camera.projectionMatrixInverse).toArray(array, i * 3);
		}

		this.geometry.attributes.a_Position.buffer.version++;
	}

}

const _vec3_1 = new Vector3();

const frustumPoints = [
	// near: lefttop, righttop, rightbottom, leftbottom
	-1, +1, -1,
	+1, +1, -1,
	+1, -1, -1,
	-1, -1, -1,
	// far: lefttop, righttop, rightbottom, leftbottom
	-1, +1, +1,
	+1, +1, +1,
	+1, -1, +1,
	-1, -1, +1
];