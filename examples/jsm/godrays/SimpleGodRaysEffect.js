import { ShaderPostPass, ATTACHMENT, Vector3, Color3, Matrix4 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export class SimpleGodRaysEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'GBuffer' }
		];

		this.sunDir = new Vector3(0.1913, 0.0709, 0.05);
		this.sunColor = new Color3(1.0, 0.9, 0.6);
		this.density = 1;
		this.weight = 0.02;
		this.exposure = 1.0;

		this._sunPass = new ShaderPostPass(sunShader);
		this._radialBlurPass = new ShaderPostPass(radialBlurShader);

		this._blendPass = new ShaderPostPass(blendShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const gBuffer = composer.getBuffer('GBuffer');
		const gBufferRenderStates = gBuffer.getCurrentRenderStates();
		const tempRT1 = composer._renderTargetCache.allocate(1);
		const tempRT2 = composer._renderTargetCache.allocate(3);

		gBufferRenderStates.camera.position.toArray(this._sunPass.uniforms.cameraPosition);
		projectionviewInverse.copy(gBufferRenderStates.camera.projectionViewMatrix).inverse();
		projectionviewInverse.toArray(this._sunPass.uniforms.projectionviewInverse);

		this._sunPass.uniforms.sunDir = this.sunDir.toArray();
		this._sunPass.uniforms.sunColor = this.sunColor.toArray();

		this._sunPass.uniforms.sceneDepth = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];

		const camera = gBufferRenderStates.camera;
		camera.projectionMatrix.clone().inverse().toArray(this._sunPass.uniforms.projectionMatrixInv);
		camera.viewMatrix.clone().inverse().toArray(this._sunPass.uniforms.viewMatrixInv);
		camera.position.toArray(this._sunPass.uniforms.cameraPosition);

		renderer.setRenderTarget(tempRT1);
		renderer.setClearColor(0, 0, 0, 0);
		renderer.clear(true, true, true);
		this._sunPass.render(renderer);

		renderer.setRenderTarget(tempRT2);
		renderer.setClearColor(0, 0, 0, 0);
		this._radialBlurPass.uniforms.tDiffuse = tempRT1.texture;
		this._radialBlurPass.uniforms.density = this.density;
		this._radialBlurPass.uniforms.weight = this.weight;
		this._radialBlurPass.uniforms.exposure = this.exposure;
		this._radialBlurPass.uniforms.sunColor = this.sunColor.toArray();
		this._radialBlurPass.uniforms.sunDir = this.sunDir.toArray();
		this._radialBlurPass.uniforms.viewMatrix = gBufferRenderStates.camera.viewMatrix.toArray();
		this._radialBlurPass.uniforms.projectionMatrix = gBufferRenderStates.camera.projectionMatrix.toArray();
		renderer.clear(true, true, true);
		this._radialBlurPass.render(renderer);

		renderer.setRenderTarget(outputRenderTarget);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, true);
		}
		this._blendPass.uniforms.srcTex = tempRT2.texture;
		this._blendPass.uniforms.dstTex = inputRenderTarget.texture;
		this._blendPass.render(renderer);
		composer._renderTargetCache.release(tempRT1, 1);
		composer._renderTargetCache.release(tempRT2, 3);
	}

	resize(width, height) {
		this._sunPass.uniforms.resolution = [width, height];
	}

	dispose() {
		this._sunPass.dispose();
		this._radialBlurPass.dispose();
		this._addPass.dispose();
	}

}
const projectionviewInverse = new Matrix4();


const sunShader = {
	name: 'ec_sun',
	defines: {},
	uniforms: {
		sunDir: [0, 1, 0],
		sceneDepth: null,
		cameraPosition: [0, 0, 0],
		projectionviewInverse: new Float32Array(16),
		resolution: [1024, 1024],
		depthThreshold: 0.99999999

	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform vec2 resolution;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float depthThreshold;
        uniform sampler2D sceneDepth;
  		uniform vec3 cameraPosition;
		uniform mat4 projectionviewInverse;
        
        varying vec2 v_Uv;
        void main() {
            float depth = texture2D(sceneDepth, v_Uv).x;
            float depthUp = texture2D(sceneDepth, v_Uv + vec2(0.0, 2.0/resolution.y)).x;
            float depthDown = texture2D(sceneDepth, v_Uv + vec2(0.0, -2.0/resolution.y)).x;
            float depthLeft = texture2D(sceneDepth, v_Uv + vec2(-2.0/resolution.x, 0.0)).x;
            float depthRight = texture2D(sceneDepth, v_Uv + vec2(2.0/resolution.x, 0.0)).x;
            
            if(depth < depthThreshold && depthUp < depthThreshold && depthDown < depthThreshold && depthLeft < depthThreshold && depthRight < depthThreshold){
                discard;
            }

			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
			vec4 pos = projectionviewInverse * projectedPos;
			vec3 posWorld = pos.xyz / pos.w;

			vec3 cap = cameraPosition;
			vec3 viewDir = cap - posWorld;
        
          	float inscatterFactor = pow(clamp(dot(-normalize(viewDir), -normalize(sunDir)) ,0.0, 1.0),180.);

            vec3 outColor = vec3(0.0, 0.0, 0.0);
            if(inscatterFactor > 0.9){
                outColor = vec3(inscatterFactor);
            }
            gl_FragColor = vec4(outColor, 1.0);
        }
    `
};

const radialBlurShader = {
	name: 'ec_radial_blur',
	defines: {
		SAMPLES: 50
	},
	uniforms: {
		tDiffuse: null,
		sunDir: [0.5, 0.5, 0.5],
		sunColor: [1.0, 0.9, 0.6],
		density: 1,
		weight: 0.02,
		exposure: 1.0,
		viewMatrix: new Array(16),
		projectionMatrix: new Array(16)
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D tDiffuse;

        uniform vec3 sunDir;
		uniform vec3 sunColor;
        
        uniform float density;
        uniform float weight;
		uniform float exposure;

        uniform mat4 viewMatrix;
        uniform mat4 projectionMatrix;
        
        varying vec2 v_Uv;

        float godrays(float density, float weight, vec2 screenSpaceLightPos) {
            float fragColor = 0.0;
            vec2 deltaTextCoord = vec2(v_Uv - screenSpaceLightPos.xy);
            vec2 textCoo = v_Uv;
            deltaTextCoord *= (1.0 / float(SAMPLES)) * density;
            
            for(int i = 0; i < SAMPLES; i++) {
                textCoo -= deltaTextCoord;
                float samp = texture2D(tDiffuse, textCoo).r;
                samp *= weight;
                fragColor += samp;
            }
            
            return fragColor * exposure;
        }
        
        void main() {
            vec4 sunDir = vec4(sunDir, 0.0);
            vec4 viewPos = viewMatrix * sunDir;
            vec4 clipPosition = projectionMatrix * viewPos;
            clipPosition.xyz /= clipPosition.w;
            vec2 screenSpacePosition = vec2(
                (clipPosition.x + 1.0) / 2.0,
                (clipPosition.y + 1.0) / 2.0
            );

            float opacity = godrays(density, weight, screenSpacePosition);

            gl_FragColor = vec4(sunColor, opacity);
        }
    `
};

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