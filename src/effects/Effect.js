/**
 * Base class for post-processing effects.
 *
 * @abstract
 */
export default class Effect {

	constructor() {
		/**
		 * Effect name used when registering with the composer.
		 * @type {string}
		 */
		this.name = '';

		/**
		 * Buffer dependency declarations required by this effect.
		 * @type {Array<{key: string, mask?: number}>}
		 */
		this.bufferDependencies = [];
		/**
		 * Whether this effect is enabled.
		 * @type {boolean}
		 */
		this.active = true;

		/**
		 * Whether this effect requires camera jitter support.
		 * @type {boolean}
		 */
		this.needCameraJitter = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		console.error('Effect: .render() must be implemented in subclass.');
	}

	resize(width, height) {}

	dispose() {}

}
