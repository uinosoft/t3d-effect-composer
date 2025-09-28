import { ShaderPostPass, ATTACHMENT } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export class OverlayEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'OverlayBuffer' }
		];

		this._blendPass = new ShaderPostPass(blendShader);
		this._blendPass.material.premultipliedAlpha = true;
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const overlayBuffer = composer.getBuffer('OverlayBuffer');

		this._blendPass.uniforms.srcTex = overlayBuffer.output()._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		this._blendPass.uniforms.dstTex = inputRenderTarget.texture;
		composer.$setEffectContextStates(outputRenderTarget, this._blendPass, finish);
		this._blendPass.render(renderer, outputRenderTarget);
	}

}

const blendShader = {
	name: 'ec_overlay_blend',
	defines: {},
	uniforms: {
		srcTex: null,
		dstTex: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D srcTex;
        uniform sampler2D dstTex;

        varying vec2 v_Uv;

        void main() {
            vec4 srcTexel = texture2D(srcTex, v_Uv);
            vec4 dstTexel = texture2D(dstTex, v_Uv);
            
            vec4 color;
            color.rgb = srcTexel.rgb * srcTexel.a + dstTexel.rgb * (1. - srcTexel.a);
			color.a = srcTexel.a + dstTexel.a * (1. - srcTexel.a);

            gl_FragColor = color;
        }
    `
};