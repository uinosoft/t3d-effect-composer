import { Matrix4 } from 't3d';

export default class CameraJitter {

	constructor(totalFrameCount = 30) {
		this._enabled = false;

		this._state = JITTER_STATE.DISABLED;

		this._totalFrame = 0;
		this._haltonSequenece = [];
		this._frame = 0;

		this._jitterMatrix = new Matrix4();
		this._originMatrix = new Matrix4();

		this.setTotalFrame(totalFrameCount);
	}

	setTotalFrame(count) {
		this._totalFrame = count;

		const haltonSequenece = [];
		for (let i = 0; i < count; i++) {
			haltonSequenece.push([
				halton(i, 2), halton(i, 3)
			]);
		}

		this._haltonSequence = haltonSequenece;
	}

	set enable(value) {
		if (this._state === JITTER_STATE.DISABLED) {
			if (value) {
				this._frame = 0;
				this._state = JITTER_STATE.ACCUMULATING;
			}
		} else if (this._state === JITTER_STATE.ACCUMULATING) {
			if (!value) {
				this._frame = 0;
				this._state = JITTER_STATE.DISABLED;
			}
		} else if (this._state === JITTER_STATE.FINISHED) {
			if (!value) {
				this._frame = 0;
				this._state = JITTER_STATE.DISABLED;
			}
		}
	}

	get enable() {
		return this._state !== JITTER_STATE.DISABLED;
	}

	reset() {
		if (this._state === JITTER_STATE.DISABLED) return;
		if (this._state === JITTER_STATE.ACCUMULATING) {
			this._frame = 0;
		} else if (this._state === JITTER_STATE.FINISHED) {
			this._state = JITTER_STATE.ACCUMULATING;
		}
	}

	update() {
		if (this._state !== JITTER_STATE.ACCUMULATING) return;

		this._frame++;

		if (this._frame >= this._totalFrame) {
			this._state = JITTER_STATE.FINISHED;
			this._frame = 0;
		}
	}

	finished() {
		return this._state === JITTER_STATE.FINISHED;
	}

	accumulating() {
		return this._state === JITTER_STATE.ACCUMULATING;
	}

	frame() {
		return this._frame;
	}

	totalFrame() {
		return this._totalFrame;
	}

	jitterProjectionMatrix(cameraData, width, height) {
		if (this._state !== JITTER_STATE.ACCUMULATING) return;

		const jitter = this._haltonSequence[this._frame];
		const jitterMatrix = this._jitterMatrix;

		jitterMatrix.elements[12] = (jitter[0] * 2 - 1) / width;
		jitterMatrix.elements[13] = (jitter[1] * 2 - 1) / height;

		this._originMatrix.copy(cameraData.projectionMatrix);

		cameraData.projectionMatrix.premultiply(jitterMatrix);
		cameraData.projectionViewMatrix.multiplyMatrices(cameraData.projectionMatrix, cameraData.viewMatrix);
	}

	restoreProjectionMatrix(cameraData) {
		if (this._state !== JITTER_STATE.ACCUMULATING) return;
		cameraData.projectionMatrix.copy(this._originMatrix);
		cameraData.projectionViewMatrix.multiplyMatrices(cameraData.projectionMatrix, cameraData.viewMatrix);
	}

}

const JITTER_STATE = {
	DISABLED: 1,
	ACCUMULATING: 2,
	FINISHED: 3
};

// Generate halton sequence
// https://en.wikipedia.org/wiki/Halton_sequence
function halton(index, base) {
	let result = 0;
	let f = 1 / base;
	let i = index;
	while (i > 0) {
		result = result + f * (i % base);
		i = Math.floor(i / base);
		f = f / base;
	}
	return result;
}