import { ShaderPostPass, ATTACHMENT, Matrix4 } from 't3d';
import { Effect, defaultVertexShader } from 't3d-effect-composer';

export default class VolumeEffect extends Effect {

	constructor() {
		super();
		this.bufferDependencies = [
			{ key: 'GBuffer' },
			{ key: 'ThicknessBuffer' }
		];

		// the id of the volume to render,
		// compitable with object.effects.volume
		this.volumeId = 1;

		// the volume texture,
		// can be a texture2d or a texture3d
		this.volumeTexture = null;

		// the color ramp texture
		this.colorRampTexture = null;

		// alphaCorrection is used to discard the transparent part of the volume
		this.alphaCorrection = 0;

		// the opacity of the volume
		this.opacity = 1;

		// blend type of the volume
		// 0: Normal, 1: Additive
		this.mixType = 0;

		// the box region matrix of the volume in world space
		// means the volume data is rendered in the box region
		this.boxMatrix = new Matrix4();

		this._mainPass = new ShaderPostPass(volumeShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const gBuffer = composer.getBuffer('GBuffer');
		const thicknessBuffer = composer.getBuffer('ThicknessBuffer');

		const gBufferRenderStates = gBuffer.getCurrentRenderStates();

		const mainPass = this._mainPass;

		renderer.setRenderTarget(outputRenderTarget);
		renderer.setClearColor(0, 0, 0, 0);
		if (finish) {
			renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
		} else {
			renderer.clear(true, true, false);
		}

		projection.copy(gBufferRenderStates.camera.projectionMatrix);
		ProjViewInverse.multiplyMatrices(gBufferRenderStates.camera.projectionMatrix, gBufferRenderStates.camera.viewMatrix).inverse();
		view.copy(gBufferRenderStates.camera.viewMatrix);

		projection.toArray(mainPass.material.uniforms.projection);
		ProjViewInverse.toArray(mainPass.material.uniforms.ProjViewInverse);
		view.toArray(mainPass.material.uniforms.view);
		gBufferRenderStates.camera.position.toArray(mainPass.material.uniforms.cameraPos);

		mainPass.material.uniforms.id = this.volumeId;
		mainPass.material.uniforms.frontDepthTex = thicknessBuffer.output()[0]._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		mainPass.material.uniforms.backDepthTex = thicknessBuffer.output()[1]._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		mainPass.material.uniforms.diffuseTex = inputRenderTarget.texture;
		mainPass.material.uniforms.depthTex = gBuffer.output()._attachments[ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
		mainPass.material.uniforms.volumeTexture = this.volumeTexture;
		mainPass.material.uniforms.colorRampTexture = this.colorRampTexture;
		mainPass.material.uniforms.near = gBufferRenderStates.camera.near;
		mainPass.material.uniforms.far = gBufferRenderStates.camera.far;
		mainPass.material.uniforms.alphaCorrection = this.alphaCorrection;
		mainPass.material.uniforms.opacity = this.opacity;
		mainPass.material.uniforms.mixType = this.mixType;

		boxMatrixInverse.copy(this.boxMatrix).inverse();
		boxMatrixInverse.toArray(mainPass.material.uniforms.boxMatrixInverse);
		const isTexture3D = !!(this.volumeTexture && this.volumeTexture.isTexture3D);
		if (isTexture3D !== mainPass.material.defines.TEXTURETYPE_3D) {
			mainPass.material.defines.TEXTURETYPE_3D = isTexture3D;
			mainPass.material.needsUpdate = true;
		}

		if (finish) {
			mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
			mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
		}
		mainPass.render(renderer);
		if (finish) {
			mainPass.material.transparent = false;
			mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
		}
	}

	dispose() {
		this._mainPass.dispose();
	}

}
const projection = new Matrix4();
const ProjViewInverse = new Matrix4();
const view = new Matrix4();
const boxMatrixInverse = new Matrix4();

const volumeShader = {
	defines: {
		MAX_ITERATION: 100,
		ZSLICENUM: 256,
		ZSLICEX: 16,
		ZSLICEY: 16,
		TEXTURETYPE_3D: false
	},
	uniforms: {
		volumeTexture: null,
		depthTex: null,
		backDepthTex: null,
		frontDepthTex: null,
		diffuseTex: null,
		colorRampTexture: null,
		id: 1,
		projection: new Float32Array(16),
		ProjViewInverse: new Float32Array(16),
		view: new Float32Array(16),
		boxMatrixInverse: new Float32Array(16),

		cameraPos: [0, 0, 0],
		near: 0.1,
		far: 1000,
		opacity: 1,
		mixType: 0
	},

	vertexShader: defaultVertexShader,
	fragmentShader: `
    precision highp sampler3D;

    uniform sampler2D depthTex;
    uniform sampler2D backDepthTex;
    uniform sampler2D frontDepthTex;

    uniform sampler2D diffuseTex;
    uniform sampler2D colorRampTexture;

    uniform mat4 projection;
    uniform mat4 ProjViewInverse;
    uniform mat4 view;
	uniform mat4 boxMatrixInverse;

    uniform float near;
    uniform float far;
    uniform float id;
    uniform float alphaCorrection;
    uniform float opacity;
    uniform float mixType;

    uniform vec3 cameraPos;
    varying vec2 v_Uv;

    float linearizeDepth(float depth) {
        return (2.0 * near) / (far + near - depth * (far - near));
    }

    vec4 getColor(float intensity) {
        // makes the volume looks brighter;
    	vec2 _uv = vec2(intensity, 0);
		vec4 color = texture2D(colorRampTexture, _uv);
    	float alpha = intensity;
    	if (alpha < 0.03) {
    		alpha = 0.01;
    	}
    	return vec4(color.r, color.g, color.b, alpha);
    }

    #ifdef TEXTURETYPE_3D
        uniform sampler3D volumeTexture;

        vec4 sampleAs3DTexture(vec3 texCoord) {
            texCoord += vec3(0.5);
           
            return getColor(texture(volumeTexture, texCoord).r);
        }
    #else 
        uniform sampler2D volumeTexture;

        // Acts like a texture3D using Z slices and trilinear filtering.
        vec4 sampleAs3DTexture( vec3 texCoord ) {
			texCoord += vec3(0.5);

            vec2 uvL = texCoord.xy / vec2(ZSLICEX , ZSLICEY);
            texCoord.z = texCoord.z * float(ZSLICENUM) / float(ZSLICEX * ZSLICEY);
            float number = floor(texCoord.z * float(ZSLICEX * ZSLICEY));
            vec2 uuv;
            uuv = uvL + vec2( mod(number, float(ZSLICEX)) / float(ZSLICEX) , floor((float(ZSLICEX * ZSLICEY - 1) - number ) / float(ZSLICEY)) / float(ZSLICEY));
            vec4 colorSlice1 = texture2D( volumeTexture, uuv );
            colorSlice1.rgb = texture2D( colorRampTexture, vec2( colorSlice1.a, 0.5)).rgb;
            return colorSlice1;
        }
    #endif

    void main() {
        vec4 diffuseColor = texture2D(diffuseTex, v_Uv);

        float depth = texture2D(depthTex, v_Uv).r;
        float texId = texture2D(backDepthTex, v_Uv).g;
        float backDepth = texture2D(backDepthTex, v_Uv).r;
        float frontDepth = texture2D(frontDepthTex, v_Uv).r;
        
        if(backDepth > 0.99999) {
            gl_FragColor = vec4(diffuseColor.rgb, 1.0); 
            return;
        }
        
        if(int(id) == int(texId)) {
            gl_FragColor = vec4(0.,0.,0. , 1.0);
        } else {
            gl_FragColor = vec4(diffuseColor.rgb , 1.0); 
            return;
        }
   
        float sampleDepth = linearizeDepth(depth);

        // Position in view
		vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
		vec4 pos = ProjViewInverse * projectedPos;
		vec3 worldPos = pos.xyz / pos.w;

        vec4 colorSum = vec4(0.0); 
        float alphaSample;
        float accumulatedAlpha = 0.0;
        vec4 accumulatedColor = vec4(0.0);

        vec4 boxFrontPos = ProjViewInverse * vec4(v_Uv * 2.0 - 1.0, frontDepth * 2.0 - 1.0, 1.0);
        vec4 boxBackPos = ProjViewInverse * vec4(v_Uv * 2.0 - 1.0, backDepth * 2.0 - 1.0, 1.0);
        vec3 direction = normalize(worldPos - cameraPos); 
    
        float dist = length(boxFrontPos.xyz / boxFrontPos.w - boxBackPos.xyz / boxBackPos.w);

        vec3 step = direction * dist / float(MAX_ITERATION);  

        vec3 point = boxFrontPos.xyz / boxFrontPos.w;

        if(backDepth < frontDepth ||  frontDepth > backDepth){
            point = cameraPos;
            dist = length(cameraPos.xyz - boxBackPos.xyz / boxBackPos.w);
            step = direction * dist / float(MAX_ITERATION);  
        }

        // ray marching
        for(int i = 0; i < MAX_ITERATION; i++) {
            point += step;
            vec4 screenPos = projection * view * vec4(point, 1.0);
            screenPos /= screenPos.w;
            screenPos.xyz = screenPos.xyz * 0.5 + 0.5;
            float testDepth = screenPos.z;
            testDepth = linearizeDepth(testDepth);

            if(sampleDepth < testDepth) {
                break;
            }
  
			vec3 rayPosObject = (boxMatrixInverse * vec4(point ,1.0)).xyz;

            colorSum = sampleAs3DTexture(rayPosObject); 
            alphaSample = colorSum.a;
            alphaSample *= (1.0 - accumulatedAlpha);
            accumulatedColor += colorSum * alphaSample;
            accumulatedAlpha += alphaSample;
        }

        if(alphaCorrection > accumulatedAlpha){
            gl_FragColor = diffuseColor;
            return;
        }

        vec3 mixColor; 
        if(mixType == 0.) {
            mixColor = mix(diffuseColor.rgb, accumulatedColor.rgb, accumulatedAlpha * opacity);
        } else {
            mixColor = diffuseColor.rgb + accumulatedColor.rgb * accumulatedAlpha * opacity;
        }

        gl_FragColor = vec4(mixColor, diffuseColor.a); 
    }
	`
};