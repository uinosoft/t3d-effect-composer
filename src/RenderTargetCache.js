import { RenderTarget2D, ATTACHMENT, TEXTURE_FILTER, PIXEL_FORMAT, PIXEL_TYPE } from 't3d';

export default class RenderTargetCache {

	constructor(width, height, highDynamicRange = false) {
		this._width = width;
		this._height = height;

		this._highDynamicRange = highDynamicRange;

		this._map = new Map();
	}

	allocate(level = 0) {
		let list = this._map.get(level);
		if (!list) {
			list = [];
			this._map.set(level, list);
		}

		if (list.length > 0) {
			return list.shift();
		} else {
			const divisor = Math.pow(2, level);
			const width = Math.ceil(this._width / divisor);
			const height = Math.ceil(this._height / divisor);

			const renderTarget = new RenderTarget2D(width, height);

			const texture = renderTarget._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
			texture.minFilter = TEXTURE_FILTER.LINEAR;
			texture.magFilter = TEXTURE_FILTER.LINEAR;
			texture.type = this._highDynamicRange ? PIXEL_TYPE.HALF_FLOAT : PIXEL_TYPE.UNSIGNED_BYTE;
			texture.format = PIXEL_FORMAT.RGBA;
			texture.generateMipmaps = false;

			renderTarget.detach(ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

			return renderTarget;
		}
	}

	release(renderTarget, level = 0) {
		let list = this._map.get(level);
		list.push(renderTarget);
	}

	resize(width, height) {
		this._width = width;
		this._height = height;

		this._map.forEach((list, level) => {
			const divisor = Math.pow(2, level);
			const width = Math.ceil(this._width / divisor);
			const height = Math.ceil(this._height / divisor);
			list.forEach(renderTarget => {
				renderTarget.resize(width, height);
			});
		});
	}

	updateStats(stats) {
		let count = 0;
		this._map.forEach((list, level) => {
			const divisor = Math.pow(2, level);
			count += list.length / (divisor * divisor);
		});
		stats.fboCache = count;
	}

	dispose() {
		this._map.forEach(list => {
			list.forEach(renderTarget => {
				renderTarget.dispose();
			});
		});
		this._map.clear();
	}

}