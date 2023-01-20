export default class Debugger {

	constructor() {
		this.bufferDependencies = [];
	}

	render(renderer, composer, outputRenderTarget) {
		console.error('Debugger: .render() must be implemented in subclass.');
	}

	resize(width, height) {}

	dispose() {}

}