import SSAOEffect from '../effects/SSAOEffect.js';
import Debugger from './Debugger.js';

export default class SSAODebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['GBuffer'];

		this.defaultEffect = new SSAOEffect();
	}

	render(renderer, composer, outputRenderTarget) {
		const ssaoEffect = composer.getEffect('SSAO') || this.defaultEffect;
		ssaoEffect.render(renderer, composer, null, outputRenderTarget);
	}

	resize(width, height) {
		this.defaultEffect.resize(width, height);
	}

	dispose() {
		this.defaultEffect.dispose();
	}

}