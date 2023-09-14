import { Debugger } from 't3d-effect-composer';
import GTAOEffect from './GTAOEffect.js';

export default class GTAODebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['SceneBuffer', 'GBuffer'];

		this.defaultEffect = new GTAOEffect();
	}

	render(renderer, composer, outputRenderTarget) {
		const gtaoEffect = composer.getEffect('GTAO') || this.defaultEffect;
		gtaoEffect.render(renderer, composer, null, outputRenderTarget);
	}

	resize(width, height) {
		this.defaultEffect.resize(width, height);
	}

	dispose() {
		this.defaultEffect.dispose();
	}

}