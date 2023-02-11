import SSREffect from '../effects/SSREffect.js';
import Debugger from './Debugger.js';

export default class SSRDebugger extends Debugger {

	constructor() {
		super();
		this.bufferDependencies = ['SceneBuffer', 'GBuffer'];

		this.defaultEffect = new SSREffect();
	}

	render(renderer, composer, outputRenderTarget) {
		const ssrEffect = composer.getEffect('SSR') || this.defaultEffect;
		ssrEffect.render(renderer, composer, null, outputRenderTarget);
	}

	resize(width, height) {
		this.defaultEffect.resize(width, height);
	}

	dispose() {
		this.defaultEffect.dispose();
	}

}