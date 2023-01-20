export default class Effect {

	constructor() {
		this.name = '';

		this.bufferDependencies = [];
		this.active = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		console.error('Effect: .render() must be implemented in subclass.');
	}

	resize(width, height) {}

	dispose() {}

}