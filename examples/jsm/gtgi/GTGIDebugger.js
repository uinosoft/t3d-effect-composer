import { Debugger } from 't3d-effect-composer';
import GTGIEffect from './GTGIEffect.js';

export default class GTGIDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['SceneBuffer', 'GBuffer'];

		this.defaultEffect = new GTGIEffect();
	}

	render(renderer, composer, outputRenderTarget) {
		const gtgiEffect = composer.getEffect('GTGI') || this.defaultEffect;
		gtgiEffect.render(renderer, composer, null, outputRenderTarget);
	}

	resize(width, height) {
		this.defaultEffect.resize(width, height);
	}

	dispose() {
		this.defaultEffect.dispose();
	}

}