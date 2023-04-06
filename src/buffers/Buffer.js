export default class Buffer {

	constructor(width, height, options) {
		this.autoUpdate = true;
		this.needsUpdate = true;
	}

	needRender() {
		if (this.autoUpdate) return true;

		if (this.needsUpdate) {
			this.needsUpdate = false;
			return true;
		}

		return false;
	}

	setGeometryReplaceFunction(func) {}

	setIfRenderReplaceFunction(func) {}

	// SceneBuffer does not have this method
	// setMaterialReplaceFunction(func) {}

	render(renderer, composer, scene, camera) {}

	output(attachIndex) {}

	resize(width, height) {
		this.needsUpdate = true;
	}

	dispose() {
		this.needsUpdate = true;
	}

}