import { RenderListMask } from '../Utils.js';

export default class BufferAttachManager {

	constructor(attachChannelSize) {
		this.keys = new Array();
		this.masks = new Array();
		this.attachChannelSize = attachChannelSize;
	}

	allocate(key, mask = RenderListMask.ALL) {
		this.keys.push(key);
		this.masks.push(mask);
		return this.keys.length - 1;
	}

	getAttachIndex(key) {
		const index = this.keys.indexOf(key);
		return Math.max(0, Math.floor(index / this.attachChannelSize));
	}

	getChannelIndex(key) {
		const index = this.keys.indexOf(key);
		return Math.max(0, index % this.attachChannelSize);
	}

	has(key) {
		const index = this.keys.indexOf(key);
		return index > -1;
	}

	count() {
		return this.keys.length;
	}

	attachCount() {
		return Math.ceil(this.keys.length / this.attachChannelSize);
	}

	getKey(attachIndex, channelIndex) {
		return this.keys[attachIndex * this.attachChannelSize + channelIndex];
	}

	getMask(attachIndex, channelIndex) {
		return this.masks[attachIndex * this.attachChannelSize + channelIndex];
	}

	getAttachInfo(attachIndex, result = { count: 0, keys: [], masks: [] }) {
		result.count = 0;

		for (let i = 0; i < this.attachChannelSize; i++) {
			const key = this.getKey(attachIndex, i);
			const mask = this.getMask(attachIndex, i);
			if (key !== undefined && mask !== undefined) {
				result.keys[result.count] = key;
				result.masks[result.count] = mask;
				result.count++;
			}
		}

		return result;
	}

	reset() {
		this.keys.length = 0;
		this.masks.length = 0;
	}

}