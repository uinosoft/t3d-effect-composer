import { Object3D, Camera, RenderTarget2D, ShaderMaterial, Matrix4, TEXTURE_FILTER } from 't3d';
import { DecalShader } from './DecalShader.js';

export class Decal extends Object3D {

	constructor() {
		super();

		this.$camera = new Camera();
		this.$camera.setPerspective(30 / 180 * Math.PI, 16 / 9, 1, 100);

		this.$depthRenderTarget = new RenderTarget2D(512, 512);
		this.$depthRenderTarget.texture.minFilter = TEXTURE_FILTER.NEAREST;
		this.$depthRenderTarget.texture.magFilter = TEXTURE_FILTER.NEAREST;

		this.$material = new ShaderMaterial(DecalShader);
		this.$material.diffuseMap = null;
		this.$material.opacity = 1;
		this.$material.transparent = true;
		this.$material.uniforms.decalPMatrix = this.$camera.projectionMatrix.elements;
		this.$material.uniforms.decalVMatrix = this.$camera.viewMatrix.elements;
		this.$material.uniforms.occlusionTexture = this.$depthRenderTarget.texture;
	}

	lookAt(target, up) {
		_mat4_1.lookAtRH(this.position, target, up);
		this.quaternion.setFromRotationMatrix(_mat4_1);
	}

	updateMatrix(force) {
		super.updateMatrix(force);

		// update camera matrices

		this.$camera.worldMatrix.copy(this.worldMatrix);
		this.$camera.viewMatrix.getInverse(this.worldMatrix);

		this.$camera.projectionViewMatrix.multiplyMatrices(this.$camera.projectionMatrix, this.$camera.viewMatrix);
		this.$camera.frustum.setFromMatrix(this.$camera.projectionViewMatrix);
	}

}

const _mat4_1 = new Matrix4();