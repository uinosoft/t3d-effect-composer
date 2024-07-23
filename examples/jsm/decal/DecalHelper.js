import { Mesh, Geometry, Buffer, Attribute, BasicMaterial, Vector3, VERTEX_COLOR, DRAW_MODE, LineMaterial, Color3, Quaternion, Matrix4 } from 't3d';

class DecalHelper extends Mesh {

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
			0, 4, 1, 5, 2, 6, 3, 7 // side
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

class SphereCameraHelper extends Mesh {

	constructor(camera) {
		const geometry = new Geometry();
		const material = new LineMaterial();

		material.vertexColors = VERTEX_COLOR.RGB;

		const vertices = [];
		const colors = [];
		const pointsMap = {};
		const arcStartIdx = [];

		const colorFrustum = new Color3(0xffffff);
		const colorCone = new Color3(0xff0000);
		const colorUp = new Color3(0x00aaff);
		const colorTarget = new Color3(0xffffff);
		const colorCross = new Color3(0x333333);

		// near

		addArc('n1', 'n2', colorFrustum);
		addArc('n2', 'n4', colorFrustum);
		addArc('n4', 'n3', colorFrustum);
		addArc('n3', 'n1', colorFrustum);

		// far

		addArc('f1', 'f2', colorFrustum);
		addArc('f2', 'f4', colorFrustum);
		addArc('f4', 'f3', colorFrustum);
		addArc('f3', 'f1', colorFrustum);

		// sides

		addLine('n1', 'f1', colorFrustum);
		addLine('n2', 'f2', colorFrustum);
		addLine('n3', 'f3', colorFrustum);
		addLine('n4', 'f4', colorFrustum);

		// cone

		addLine('p', 'n1', colorCone);
		addLine('p', 'n2', colorCone);
		addLine('p', 'n3', colorCone);
		addLine('p', 'n4', colorCone);

		// up

		addLine('u1', 'u2', colorUp);
		addLine('u2', 'u3', colorUp);
		addLine('u3', 'u1', colorUp);

		// target

		addLine('c', 't', colorTarget);
		addLine('p', 'c', colorCross);

		// cross

		addArc('cn1', 'cn2', colorCross);
		addArc('cn3', 'cn4', colorCross);

		addArc('cf1', 'cf2', colorCross);
		addArc('cf3', 'cf4', colorCross);

		function addLine(a, b, color) {
			addPoint(a, color);
			addPoint(b, color);
		}

		function addArc(a, b, color) {
			arcStartIdx.push(vertices.length / 3);
			for (let i = 0; i < arcSegments; i++) {
				addLine(i == 0 ? a : '~', i == (arcSegments - 1) ? b : '~', color);
			}
		}

		function addPoint(id, color) {
			if (pointsMap[id] === undefined) {
				pointsMap[id] = [];
			}
			pointsMap[id].push(vertices.length);

			vertices.push(0, 0, 0);
			colors.push(color.r, color.g, color.b);
		}

		geometry.addAttribute('a_Position', new Attribute(new Buffer(new Float32Array(vertices), 3)));
		geometry.addAttribute('a_Color', new Attribute(new Buffer(new Float32Array(colors), 3)));

		super(geometry, material);

		this.camera = camera;
		this.pointsMap = pointsMap;
		this.arcStartIdx = arcStartIdx;

		this.update();
	}

	update() {
		const geometry = this.geometry;

		_mat4.copy(this.camera.projectionMatrixInverse);

		const w = 1, h = 1;

		this._setPoint('c', 0, 0, -1, _mat4);

		const near = _vec3_1.getLength();

		this._setPoint('t', 0, 0, 1, _mat4);

		const far = _vec3_1.getLength();

		this._setPoint('n1', -w, -h, -1, _mat4, near);
		this._setPoint('n2', w, -h, -1, _mat4, near);
		this._setPoint('n3', -w, h, -1, _mat4, near);
		this._setPoint('n4', w, h, -1, _mat4, near);

		// far

		this._setPoint('f1', -w, -h, 1, _mat4, far);
		this._setPoint('f2', w, -h, 1, _mat4, far);
		this._setPoint('f3', -w, h, 1, _mat4, far);
		this._setPoint('f4', w, h, 1, _mat4, far);

		// up

		this._setPoint('u1', w * 0.7, h * 1.1, -1, _mat4, near);
		this._setPoint('u2', -w * 0.7, h * 1.1, -1, _mat4, near);
		this._setPoint('u3', 0, h * 2, -1, _mat4, near);

		// cross

		this._setPoint('cf1', -w, 0, 1, _mat4, far);
		this._setPoint('cf2', w, 0, 1, _mat4, far);
		this._setPoint('cf3', 0, -h, 1, _mat4, far);
		this._setPoint('cf4', 0, h, 1, _mat4, far);

		this._setPoint('cn1', -w, 0, -1, _mat4, near);
		this._setPoint('cn2', w, 0, -1, _mat4, near);
		this._setPoint('cn3', 0, -h, -1, _mat4, near);
		this._setPoint('cn4', 0, h, -1, _mat4, near);

		this._updateArcs();

		geometry.getAttribute('a_Position').buffer.version++;

		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
	}

	_setPoint(point, x, y, z, projectionMatrixInverse, fixLen) {
		const vector = _vec3_1;
		const geometry = this.geometry;
		const pointsMap = this.pointsMap;

		vector.set(x, y, z).applyMatrix4(projectionMatrixInverse);

		if (fixLen) {
			vector.normalize().multiplyScalar(fixLen);
		}

		if (pointsMap[point]) {
			const points = pointsMap[point];
			const position = geometry.getAttribute('a_Position').buffer.array;
			for (let i = 0, l = points.length; i < l; i++) {
				const index = points[i];
				position[index] = vector.x;
				position[index + 1] = vector.y;
				position[index + 2] = vector.z;
			}
		}
	}

	_updateArcs() {
		const geometry = this.geometry;
		const arcStartIdx = this.arcStartIdx;

		const position = geometry.getAttribute('a_Position').buffer.array;

		arcStartIdx.forEach(startIdx => {
			const endIdx = startIdx + arcSegments * 2 - 1;

			_vec3_2.set(position[startIdx * 3], position[startIdx * 3 + 1], position[startIdx * 3 + 2]);
			_vec3_3.set(position[endIdx * 3], position[endIdx * 3 + 1], position[endIdx * 3 + 2]);

			const len = _vec3_2.getLength();

			_vec3_2.normalize();
			_vec3_3.normalize();

			_quat_2.set(0, 0, 0, 1);
			_quat_3.setFromUnitVectors(_vec3_2, _vec3_3);

			for (let i = 1; i < arcSegments * 2 - 2; i += 2) {
				_slerpQuaternions(_quat_2, _quat_3, _quat_1, (i + 1) / 2 / arcSegments);

				_vec3_1.copy(_vec3_2).applyQuaternion(_quat_1).normalize().multiplyScalar(len);

				position[(startIdx + i) * 3] = _vec3_1.x;
				position[(startIdx + i) * 3 + 1] = _vec3_1.y;
				position[(startIdx + i) * 3 + 2] = _vec3_1.z;

				position[(startIdx + i + 1) * 3] = _vec3_1.x;
				position[(startIdx + i + 1) * 3 + 1] = _vec3_1.y;
				position[(startIdx + i + 1) * 3 + 2] = _vec3_1.z;
			}
		});
	}

}

export { DecalHelper, SphereCameraHelper };

const _mat4 = new Matrix4();
const _vec3_1 = new Vector3(), _vec3_2 = new Vector3(), _vec3_3 = new Vector3();
const _quat_1 = new Quaternion(), _quat_2 = new Quaternion(), _quat_3 = new Quaternion();

const arcSegments = 30;

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

const _slerpQuaternions = (qa, qb, qm, t) => {
	return _slerp(qm.copy(qa), qb, t);
};

const _slerp = (qa, qb, t) => {
	if (t === 0) return qa;
	if (t === 1) return qa.copy(qb);

	const x = qa._x, y = qa._y, z = qa._z, w = qa._w;

	let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;

	if (cosHalfTheta < 0) {
		qa._w = -qb._w;
		qa._x = -qb._x;
		qa._y = -qb._y;
		qa._z = -qb._z;

		cosHalfTheta = -cosHalfTheta;
	} else {
		qa.copy(qb);
	}

	if (cosHalfTheta >= 1.0) {
		qa._w = w;
		qa._x = x;
		qa._y = y;
		qa._z = z;

		return qa;
	}

	const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;

	if (sqrSinHalfTheta <= Number.EPSILON) {
		const s = 1 - t;
		qa._w = s * w + t * qa._w;
		qa._x = s * x + t * qa._x;
		qa._y = s * y + t * qa._y;
		qa._z = s * z + t * qa._z;

		qa.normalize();

		return qa;
	}

	const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
	const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
	const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
		ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

	qa._w = (w * ratioA + qa._w * ratioB);
	qa._x = (x * ratioA + qa._x * ratioB);
	qa._y = (y * ratioA + qa._y * ratioB);
	qa._z = (z * ratioA + qa._z * ratioB);

	return qa;
};

