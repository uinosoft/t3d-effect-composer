export default class Effect {

	constructor() {
		this.name = '';

		this.bufferDependencies = [];
		this.active = true;

		this.needCameraJitter = false;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		console.error('Effect: .render() must be implemented in subclass.');
	}

	resize(width, height) {}

	dispose() {}

}