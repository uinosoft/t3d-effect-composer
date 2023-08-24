import { PIXEL_FORMAT } from 't3d';

export const defaultVertexShader = `
    attribute vec3 a_Position;
    attribute vec2 a_Uv;

    uniform mat4 u_ProjectionView;
    uniform mat4 u_Model;

    varying vec2 v_Uv;

    void main() {
        v_Uv = a_Uv;
        gl_Position = u_ProjectionView * u_Model * vec4(a_Position, 1.0);
    }
`;

export const blurShader = {
	name: 'ec_blur',
	defines: {
		NORMALTEX_ENABLED: 0,
		DEPTHTEX_ENABLED: 0,
		DEPTH_PACKING: 0,
		KERNEL_SIZE_INT: '5',
		KERNEL_SIZE_FLOAT: '5.0'
	},
	uniforms: {
		tDiffuse: null,
		textureSize: [512, 512],
		direction: 0, // 0 horizontal, 1 vertical
		blurSize: 1,
		kernel: [0.122581, 0.233062, 0.288713, 0.233062, 0.122581],
		normalTex: null,
		depthTex: null,
		projection: new Float32Array(16),
		viewInverseTranspose: new Float32Array(16),
		depthRange: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform vec2 textureSize;
        uniform int direction;
        uniform float blurSize;
        uniform float kernel[KERNEL_SIZE_INT];

        #if NORMALTEX_ENABLED == 1
            uniform sampler2D normalTex;
            uniform mat4 viewInverseTranspose;
            vec3 getViewNormal(const in vec2 screenPosition) {
                vec3 normal = texture2D(normalTex, screenPosition).xyz * 2.0 - 1.0;
                // Convert to view space
                return (viewInverseTranspose * vec4(normal, 0.0)).xyz;
            }
        #endif

        #if DEPTHTEX_ENABLED == 1
			#if DEPTH_PACKING == 1
				#include <packing>
			#endif
			uniform sampler2D depthTex;
			uniform mat4 projection;
			uniform float depthRange;
			float getDepth( const in vec2 screenPosition ) {
				#if DEPTH_PACKING == 1
					return unpackRGBAToDepth( texture2D( depthTex, screenPosition ) );
				#else
					return texture2D( depthTex, screenPosition ).r;
				#endif
			}
			float getLinearDepth(vec2 coord) {
				float depth = getDepth(coord) * 2.0 - 1.0;
				return projection[3][2] / (depth * projection[2][3] - projection[2][2]);
			}
		#endif

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec2 off = vec2(0.0);
            if (direction == 0) {
                off[0] = blurSize / textureSize.x;
            } else {
                off[1] = blurSize / textureSize.y;
            }

            vec4 sum = vec4(0.0);
            float weightAll = 0.0;

            #if NORMALTEX_ENABLED == 1
                vec3 centerNormal = getViewNormal(v_Uv);
            #endif
            #if DEPTHTEX_ENABLED == 1
                float centerDepth = getLinearDepth(v_Uv);
            #endif

            for (int i = 0; i < KERNEL_SIZE_INT; i++) {
				vec2 coord = clamp(v_Uv + vec2(float(i) - (KERNEL_SIZE_FLOAT - 1.) / 2.) * off, vec2(0.0), vec2(1.0));
				float w = kernel[i];

				#if NORMALTEX_ENABLED == 1
					vec3 normal = getViewNormal(coord);
					w *= clamp(dot(normal, centerNormal), 0.0, 1.0);
				#endif
				#if DEPTHTEX_ENABLED == 1
					float d = getLinearDepth(coord);
		            // PENDING Better equation?
		            // w *= (1.0 - smoothstep(abs(centerDepth - d) / depthRange, 0.0, 1.0));
					w *= (1.0 - smoothstep(0.0, 1.0, abs(centerDepth - d) / depthRange));
				#endif

				weightAll += w;
				sum += w * texture2D(tDiffuse, coord);
			}

			gl_FragColor = sum / weightAll;
        }
    `
};

export const additiveShader = {
	name: 'ec_additive',
	defines: {},
	uniforms: {
		texture1: null,
		colorWeight1: 1,
		alphaWeight1: 1,
		texture2: null,
		colorWeight2: 1,
		alphaWeight2: 1
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D texture1;
        uniform float colorWeight1;
        uniform float alphaWeight1;

        uniform sampler2D texture2;
        uniform float colorWeight2;
        uniform float alphaWeight2;

        varying vec2 v_Uv;

        void main() {
            vec4 texel1 = texture2D(texture1, v_Uv);
            vec4 texel2 = texture2D(texture2, v_Uv);
            vec3 color = texel1.rgb * colorWeight1 + texel2.rgb * colorWeight2;
            float alpha = texel1.a * alphaWeight1 + texel2.a * alphaWeight2;
            gl_FragColor = vec4(color, alpha);
        }
    `
};

export const multiplyShader = {
	name: 'ec_multiply',
	defines: {},
	uniforms: {
		texture1: null,
		texture2: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D texture1;
        uniform sampler2D texture2;

        varying vec2 v_Uv;

        void main() {
            vec4 texel1 = texture2D(texture1, v_Uv);
            vec4 texel2 = texture2D(texture2, v_Uv);
            gl_FragColor = texel1 * texel2;
        }
    `
};

export const copyShader = {
	name: 'ec_copy',
	defines: {},
	uniforms: {
		tDiffuse: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D tDiffuse;

        varying vec2 v_Uv;

        void main() {
            gl_FragColor = texture2D(tDiffuse, v_Uv);
        }
    `
};

export const channelShader = {
	name: 'ec_channel',
	defines: {},
	uniforms: {
		tDiffuse: null,
		channelMask: [1, 0, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D tDiffuse;
		uniform vec4 channelMask;

        varying vec2 v_Uv;

        void main() {
			float value = dot(texture2D(tDiffuse, v_Uv), channelMask);
            gl_FragColor = vec4(vec3(value), 1.0);
        }
    `
};

export const maskShader = {
	name: 'ec_mask',
	defines: {},
	uniforms: {
		colorTexture: null,
		maskTexture: null,
		additiveTexture: null,
		channel: [1, 0, 0, 0]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D colorTexture;
		uniform sampler2D maskTexture;

		uniform sampler2D additiveTexture;

		uniform vec4 channel;

        varying vec2 v_Uv;

        void main() {
			vec4 colorTex = texture2D(colorTexture, v_Uv);
			vec4 maskTex = texture2D(maskTexture, v_Uv);
			vec4 addTex = texture2D(additiveTexture, v_Uv);
            gl_FragColor = colorTex * dot(maskTex, channel) + addTex;
        }
    `
};

export const highlightShader = {
	name: 'ec_highlight',
	defines: {},
	uniforms: {
		tDiffuse: null,
		threshold: 1.0,
		smoothWidth: 0.01
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform float threshold;
		uniform float smoothWidth;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec4 texel = texture2D(tDiffuse, v_Uv);
            vec3 luma = vec3(0.299, 0.587, 0.114);
            float v = dot(texel.xyz, luma);
            gl_FragColor = smoothstep(threshold, threshold + smoothWidth, v) * texel;
        }
    `
};

export const seperableBlurShader = {
	name: 'ec_seperable_blur',
	defines: {
		MAX_RADIUS: 4
	},
	uniforms: {
		tDiffuse: null,
		texSize: [0.5, 0.5],
		direction: [0.5, 0.5],
		kernelRadius: 1.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform vec2 texSize;
        uniform vec2 direction;
        uniform float kernelRadius;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        float gaussianPdf(in float x, in float sigma) {
			return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
		}

        void main() {
            vec2 invSize = 1.0 / texSize;
			float weightSum = gaussianPdf(0.0, kernelRadius);
			vec4 diffuseColor = texture2D(tDiffuse, v_Uv);
			vec4 diffuseSum = diffuseColor * weightSum;
			vec2 delta = direction * invSize * kernelRadius / float(MAX_RADIUS);
			vec2 uvOffset = delta;
			for( int i = 1; i <= MAX_RADIUS; i ++ ) {
				float w = gaussianPdf(uvOffset.x, kernelRadius);
				vec4 sample1 = texture2D(tDiffuse, v_Uv + uvOffset);
				vec4 sample2 = texture2D(tDiffuse, v_Uv - uvOffset);
				diffuseSum += ((sample1 + sample2) * w);
				weightSum += (2.0 * w);
				uvOffset += delta;
			}
			vec4 color = diffuseSum / weightSum;
			gl_FragColor = color;
        }
    `
};

export const horizontalBlurShader = {
	name: 'ec_h_blur',
	uniforms: {
		tDiffuse: null,
		h: 1 / 512
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float h;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec4 sum = vec4(0.0);
           
			sum += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * h, v_Uv.y)) * 0.051;
			sum += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * h, v_Uv.y)) * 0.0918;
			sum += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * h, v_Uv.y)) * 0.12245;
			sum += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * h, v_Uv.y)) * 0.1531;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)) * 0.1633;
			sum += texture2D(tDiffuse, vec2(v_Uv.x + 1.0 * h, v_Uv.y)) * 0.1531;
			sum += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * h, v_Uv.y)) * 0.12245;
			sum += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * h, v_Uv.y)) * 0.0918;
			sum += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * h, v_Uv.y)) * 0.051;

			gl_FragColor = sum;
        }
    `
};

export const verticalBlurShader = {
	name: 'ec_v_blur',
	uniforms: {
		tDiffuse: null,
		v: 1 / 512
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
		uniform float v;

        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;

        void main() {
            vec4 sum = vec4(0.0);
           
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 4.0 * v)) * 0.051;
            sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 3.0 * v)) * 0.0918;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 2.0 * v)) * 0.12245;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 1.0 * v)) * 0.1531;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)) * 0.1633;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 1.0 * v)) * 0.1531;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 2.0 * v)) * 0.12245;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 3.0 * v)) * 0.0918;
			sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 4.0 * v)) * 0.051;

			gl_FragColor = sum;
        }
    `
};

export const fxaaShader = {
	name: 'ec_fxaa',
	defines: {},
	uniforms: {
		tDiffuse: null,
		resolution: [1 / 1024, 1 / 512]
	},
	vertexShader: defaultVertexShader,
	fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 v_Uv;
        
        uniform vec2 resolution;  
        
        // FXAA 3.11 implementation by NVIDIA, ported to WebGL by Agost Biro (biro@archilogic.com)
        
        //----------------------------------------------------------------------------------
        // File:        es3-kepler\FXAA\assets\shaders/FXAA_DefaultES.frag
        // SDK Version: v3.00
        // Email:       gameworks@nvidia.com
        // Site:        http://developer.nvidia.com/
        //
        // Copyright (c) 2014-2015, NVIDIA CORPORATION. All rights reserved.
        //
        // Redistribution and use in source and binary forms, with or without
        // modification, are permitted provided that the following conditions
        // are met:
        //  * Redistributions of source code must retain the above copyright
        //    notice, this list of conditions and the following disclaimer.
        //  * Redistributions in binary form must reproduce the above copyright
        //    notice, this list of conditions and the following disclaimer in the
        //    documentation and/or other materials provided with the distribution.
        //  * Neither the name of NVIDIA CORPORATION nor the names of its
        //    contributors may be used to endorse or promote products derived
        //    from this software without specific prior written permission.
        //
        // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS "AS IS" AND ANY
        // EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
        // IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
        // PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
        // CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
        // EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
        // PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
        // PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
        // OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
        // (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
        // OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
        //
        //----------------------------------------------------------------------------------
        
        #define FXAA_PC 1
        #define FXAA_GLSL_100 1
        #define FXAA_QUALITY_PRESET 39
        
        #define FXAA_GREEN_AS_LUMA 1
        
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_PC_CONSOLE
            //
            // The console algorithm for PC is included
            // for developers targeting really low spec machines.
            // Likely better to just run FXAA_PC, and use a really low preset.
            //
            #define FXAA_PC_CONSOLE 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_GLSL_120
            #define FXAA_GLSL_120 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_GLSL_130
            #define FXAA_GLSL_130 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_HLSL_3
            #define FXAA_HLSL_3 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_HLSL_4
            #define FXAA_HLSL_4 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_HLSL_5
            #define FXAA_HLSL_5 0
        #endif
        /*==========================================================================*/
        #ifndef FXAA_GREEN_AS_LUMA
            //
            // For those using non-linear color,
            // and either not able to get luma in alpha, or not wanting to,
            // this enables FXAA to run using green as a proxy for luma.
            // So with this enabled, no need to pack luma in alpha.
            //
            // This will turn off AA on anything which lacks some amount of green.
            // Pure red and blue or combination of only R and B, will get no AA.
            //
            // Might want to lower the settings for both,
            //    fxaaConsoleEdgeThresholdMin
            //    fxaaQualityEdgeThresholdMin
            // In order to insure AA does not get turned off on colors
            // which contain a minor amount of green.
            //
            // 1 = On.
            // 0 = Off.
            //
            #define FXAA_GREEN_AS_LUMA 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_EARLY_EXIT
            //
            // Controls algorithm's early exit path.
            // On PS3 turning this ON adds 2 cycles to the shader.
            // On 360 turning this OFF adds 10ths of a millisecond to the shader.
            // Turning this off on console will result in a more blurry image.
            // So this defaults to on.
            //
            // 1 = On.
            // 0 = Off.
            //
            #define FXAA_EARLY_EXIT 1
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_DISCARD
            //
            // Only valid for PC OpenGL currently.
            // Probably will not work when FXAA_GREEN_AS_LUMA = 1.
            //
            // 1 = Use discard on pixels which don't need AA.
            //     For APIs which enable concurrent TEX+ROP from same surface.
            // 0 = Return unchanged color on pixels which don't need AA.
            //
            #define FXAA_DISCARD 0
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_FAST_PIXEL_OFFSET
            //
            // Used for GLSL 120 only.
            //
            // 1 = GL API supports fast pixel offsets
            // 0 = do not use fast pixel offsets
            //
            #ifdef GL_EXT_gpu_shader4
                #define FXAA_FAST_PIXEL_OFFSET 1
            #endif
            #ifdef GL_NV_gpu_shader5
                #define FXAA_FAST_PIXEL_OFFSET 1
            #endif
            #ifdef GL_ARB_gpu_shader5
                #define FXAA_FAST_PIXEL_OFFSET 1
            #endif
            #ifndef FXAA_FAST_PIXEL_OFFSET
                #define FXAA_FAST_PIXEL_OFFSET 0
            #endif
        #endif
        /*--------------------------------------------------------------------------*/
        #ifndef FXAA_GATHER4_ALPHA
            //
            // 1 = API supports gather4 on alpha channel.
            // 0 = API does not support gather4 on alpha channel.
            //
            #if (FXAA_HLSL_5 == 1)
                #define FXAA_GATHER4_ALPHA 1
            #endif
            #ifdef GL_ARB_gpu_shader5
                #define FXAA_GATHER4_ALPHA 1
            #endif
            #ifdef GL_NV_gpu_shader5
                #define FXAA_GATHER4_ALPHA 1
            #endif
            #ifndef FXAA_GATHER4_ALPHA
                #define FXAA_GATHER4_ALPHA 0
            #endif
        #endif
        
        
        /*============================================================================
                                FXAA QUALITY - TUNING KNOBS
        ------------------------------------------------------------------------------
        NOTE the other tuning knobs are now in the shader function inputs!
        ============================================================================*/
        #ifndef FXAA_QUALITY_PRESET
            //
            // Choose the quality preset.
            // This needs to be compiled into the shader as it effects code.
            // Best option to include multiple presets is to
            // in each shader define the preset, then include this file.
            //
            // OPTIONS
            // -----------------------------------------------------------------------
            // 10 to 15 - default medium dither (10=fastest, 15=highest quality)
            // 20 to 29 - less dither, more expensive (20=fastest, 29=highest quality)
            // 39       - no dither, very expensive
            //
            // NOTES
            // -----------------------------------------------------------------------
            // 12 = slightly faster then FXAA 3.9 and higher edge quality (default)
            // 13 = about same speed as FXAA 3.9 and better than 12
            // 23 = closest to FXAA 3.9 visually and performance wise
            //  _ = the lowest digit is directly related to performance
            // _  = the highest digit is directly related to style
            //
            #define FXAA_QUALITY_PRESET 12
        #endif
        
        
        /*============================================================================
        
                                FXAA QUALITY - PRESETS
        
        ============================================================================*/
        
        /*============================================================================
                            FXAA QUALITY - MEDIUM DITHER PRESETS
        ============================================================================*/
        #if (FXAA_QUALITY_PRESET == 10)
            #define FXAA_QUALITY_PS 3
            #define FXAA_QUALITY_P0 1.5
            #define FXAA_QUALITY_P1 3.0
            #define FXAA_QUALITY_P2 12.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 11)
            #define FXAA_QUALITY_PS 4
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 3.0
            #define FXAA_QUALITY_P3 12.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 12)
            #define FXAA_QUALITY_PS 5
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 4.0
            #define FXAA_QUALITY_P4 12.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 13)
            #define FXAA_QUALITY_PS 6
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 4.0
            #define FXAA_QUALITY_P5 12.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 14)
            #define FXAA_QUALITY_PS 7
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 4.0
            #define FXAA_QUALITY_P6 12.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 15)
            #define FXAA_QUALITY_PS 8
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 4.0
            #define FXAA_QUALITY_P7 12.0
        #endif
        
        /*============================================================================
                            FXAA QUALITY - LOW DITHER PRESETS
        ============================================================================*/
        #if (FXAA_QUALITY_PRESET == 20)
            #define FXAA_QUALITY_PS 3
            #define FXAA_QUALITY_P0 1.5
            #define FXAA_QUALITY_P1 2.0
            #define FXAA_QUALITY_P2 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 21)
            #define FXAA_QUALITY_PS 4
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 22)
            #define FXAA_QUALITY_PS 5
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 23)
            #define FXAA_QUALITY_PS 6
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 24)
            #define FXAA_QUALITY_PS 7
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 3.0
            #define FXAA_QUALITY_P6 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 25)
            #define FXAA_QUALITY_PS 8
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 4.0
            #define FXAA_QUALITY_P7 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 26)
            #define FXAA_QUALITY_PS 9
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 2.0
            #define FXAA_QUALITY_P7 4.0
            #define FXAA_QUALITY_P8 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 27)
            #define FXAA_QUALITY_PS 10
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 2.0
            #define FXAA_QUALITY_P7 2.0
            #define FXAA_QUALITY_P8 4.0
            #define FXAA_QUALITY_P9 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 28)
            #define FXAA_QUALITY_PS 11
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 2.0
            #define FXAA_QUALITY_P7 2.0
            #define FXAA_QUALITY_P8 2.0
            #define FXAA_QUALITY_P9 4.0
            #define FXAA_QUALITY_P10 8.0
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_QUALITY_PRESET == 29)
            #define FXAA_QUALITY_PS 12
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.5
            #define FXAA_QUALITY_P2 2.0
            #define FXAA_QUALITY_P3 2.0
            #define FXAA_QUALITY_P4 2.0
            #define FXAA_QUALITY_P5 2.0
            #define FXAA_QUALITY_P6 2.0
            #define FXAA_QUALITY_P7 2.0
            #define FXAA_QUALITY_P8 2.0
            #define FXAA_QUALITY_P9 2.0
            #define FXAA_QUALITY_P10 4.0
            #define FXAA_QUALITY_P11 8.0
        #endif
        
        /*============================================================================
                            FXAA QUALITY - EXTREME QUALITY
        ============================================================================*/
        #if (FXAA_QUALITY_PRESET == 39)
            #define FXAA_QUALITY_PS 12
            #define FXAA_QUALITY_P0 1.0
            #define FXAA_QUALITY_P1 1.0
            #define FXAA_QUALITY_P2 1.0
            #define FXAA_QUALITY_P3 1.0
            #define FXAA_QUALITY_P4 1.0
            #define FXAA_QUALITY_P5 1.5
            #define FXAA_QUALITY_P6 2.0
            #define FXAA_QUALITY_P7 2.0
            #define FXAA_QUALITY_P8 2.0
            #define FXAA_QUALITY_P9 2.0
            #define FXAA_QUALITY_P10 4.0
            #define FXAA_QUALITY_P11 8.0
        #endif
        
        
        
        /*============================================================================
        
                                        API PORTING
        
        ============================================================================*/
        #if (FXAA_GLSL_100 == 1) || (FXAA_GLSL_120 == 1) || (FXAA_GLSL_130 == 1)
            #define FxaaBool bool
            #define FxaaDiscard discard
            #define FxaaFloat float
            #define FxaaFloat2 vec2
            #define FxaaFloat3 vec3
            #define FxaaFloat4 vec4
            #define FxaaHalf float
            #define FxaaHalf2 vec2
            #define FxaaHalf3 vec3
            #define FxaaHalf4 vec4
            #define FxaaInt2 ivec2
            #define FxaaSat(x) clamp(x, 0.0, 1.0)
            #define FxaaTex sampler2D
        #else
            #define FxaaBool bool
            #define FxaaDiscard clip(-1)
            #define FxaaFloat float
            #define FxaaFloat2 float2
            #define FxaaFloat3 float3
            #define FxaaFloat4 float4
            #define FxaaHalf half
            #define FxaaHalf2 half2
            #define FxaaHalf3 half3
            #define FxaaHalf4 half4
            #define FxaaSat(x) saturate(x)
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_GLSL_100 == 1)
        #define FxaaTexTop(t, p) texture2D(t, p, 0.0)
        #define FxaaTexOff(t, p, o, r) texture2D(t, p + (o * r), 0.0)
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_GLSL_120 == 1)
            // Requires,
            //  #version 120
            // And at least,
            //  #extension GL_EXT_gpu_shader4 : enable
            //  (or set FXAA_FAST_PIXEL_OFFSET 1 to work like DX9)
            #define FxaaTexTop(t, p) texture2DLod(t, p, 0.0)
            #if (FXAA_FAST_PIXEL_OFFSET == 1)
                #define FxaaTexOff(t, p, o, r) texture2DLodOffset(t, p, 0.0, o)
            #else
                #define FxaaTexOff(t, p, o, r) texture2DLod(t, p + (o * r), 0.0)
            #endif
            #if (FXAA_GATHER4_ALPHA == 1)
                // use #extension GL_ARB_gpu_shader5 : enable
                #define FxaaTexAlpha4(t, p) textureGather(t, p, 3)
                #define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)
                #define FxaaTexGreen4(t, p) textureGather(t, p, 1)
                #define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)
            #endif
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_GLSL_130 == 1)
            // Requires '#version 130' or better
            #define FxaaTexTop(t, p) textureLod(t, p, 0.0)
            #define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)
            #if (FXAA_GATHER4_ALPHA == 1)
                // use #extension GL_ARB_gpu_shader5 : enable
                #define FxaaTexAlpha4(t, p) textureGather(t, p, 3)
                #define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)
                #define FxaaTexGreen4(t, p) textureGather(t, p, 1)
                #define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)
            #endif
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_HLSL_3 == 1)
            #define FxaaInt2 float2
            #define FxaaTex sampler2D
            #define FxaaTexTop(t, p) tex2Dlod(t, float4(p, 0.0, 0.0))
            #define FxaaTexOff(t, p, o, r) tex2Dlod(t, float4(p + (o * r), 0, 0))
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_HLSL_4 == 1)
            #define FxaaInt2 int2
            struct FxaaTex { SamplerState smpl; Texture2D tex; };
            #define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)
            #define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)
        #endif
        /*--------------------------------------------------------------------------*/
        #if (FXAA_HLSL_5 == 1)
            #define FxaaInt2 int2
            struct FxaaTex { SamplerState smpl; Texture2D tex; };
            #define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)
            #define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)
            #define FxaaTexAlpha4(t, p) t.tex.GatherAlpha(t.smpl, p)
            #define FxaaTexOffAlpha4(t, p, o) t.tex.GatherAlpha(t.smpl, p, o)
            #define FxaaTexGreen4(t, p) t.tex.GatherGreen(t.smpl, p)
            #define FxaaTexOffGreen4(t, p, o) t.tex.GatherGreen(t.smpl, p, o)
        #endif
        
        
        /*============================================================================
                        GREEN AS LUMA OPTION SUPPORT FUNCTION
        ============================================================================*/
        #if (FXAA_GREEN_AS_LUMA == 0)
            FxaaFloat FxaaLuma(FxaaFloat4 rgba) { return rgba.w; }
        #else
            FxaaFloat FxaaLuma(FxaaFloat4 rgba) { return rgba.y; }
        #endif
        
        
        
        
        /*============================================================================
        
                                    FXAA3 QUALITY - PC
        
        ============================================================================*/
        #if (FXAA_PC == 1)
        /*--------------------------------------------------------------------------*/
        FxaaFloat4 FxaaPixelShader(
            //
            // Use noperspective interpolation here (turn off perspective interpolation).
            // {xy} = center of pixel
            FxaaFloat2 pos,
            //
            // Used only for FXAA Console, and not used on the 360 version.
            // Use noperspective interpolation here (turn off perspective interpolation).
            // {xy_} = upper left of pixel
            // {_zw} = lower right of pixel
            FxaaFloat4 fxaaConsolePosPos,
            //
            // Input color texture.
            // {rgb_} = color in linear or perceptual color space
            // if (FXAA_GREEN_AS_LUMA == 0)
            //     {__a} = luma in perceptual color space (not linear)
            FxaaTex tex,
            //
            // Only used on the optimized 360 version of FXAA Console.
            // For everything but 360, just use the same input here as for 'tex'.
            // For 360, same diffuseMap, just alias with a 2nd sampler.
            // This sampler needs to have an exponent bias of -1.
            FxaaTex fxaaConsole360TexExpBiasNegOne,
            //
            // Only used on the optimized 360 version of FXAA Console.
            // For everything but 360, just use the same input here as for 'tex'.
            // For 360, same diffuseMap, just alias with a 3nd sampler.
            // This sampler needs to have an exponent bias of -2.
            FxaaTex fxaaConsole360TexExpBiasNegTwo,
            //
            // Only used on FXAA Quality.
            // This must be from a constant/uniform.
            // {x_} = 1.0/screenWidthInPixels
            // {_y} = 1.0/screenHeightInPixels
            FxaaFloat2 fxaaQualityRcpFrame,
            //
            // Only used on FXAA Console.
            // This must be from a constant/uniform.
            // This effects sub-pixel AA quality and inversely sharpness.
            //   Where N ranges between,
            //     N = 0.50 (default)
            //     N = 0.33 (sharper)
            // {x__} = -N/screenWidthInPixels
            // {_y_} = -N/screenHeightInPixels
            // {_z_} =  N/screenWidthInPixels
            // {__w} =  N/screenHeightInPixels
            FxaaFloat4 fxaaConsoleRcpFrameOpt,
            //
            // Only used on FXAA Console.
            // Not used on 360, but used on PS3 and PC.
            // This must be from a constant/uniform.
            // {x__} = -2.0/screenWidthInPixels
            // {_y_} = -2.0/screenHeightInPixels
            // {_z_} =  2.0/screenWidthInPixels
            // {__w} =  2.0/screenHeightInPixels
            FxaaFloat4 fxaaConsoleRcpFrameOpt2,
            //
            // Only used on FXAA Console.
            // Only used on 360 in place of fxaaConsoleRcpFrameOpt2.
            // This must be from a constant/uniform.
            // {x__} =  8.0/screenWidthInPixels
            // {_y_} =  8.0/screenHeightInPixels
            // {_z_} = -4.0/screenWidthInPixels
            // {__w} = -4.0/screenHeightInPixels
            FxaaFloat4 fxaaConsole360RcpFrameOpt2,
            //
            // Only used on FXAA Quality.
            // This used to be the FXAA_QUALITY_SUBPIX define.
            // It is here now to allow easier tuning.
            // Choose the amount of sub-pixel aliasing removal.
            // This can effect sharpness.
            //   1.00 - upper limit (softer)
            //   0.75 - default amount of filtering
            //   0.50 - lower limit (sharper, less sub-pixel aliasing removal)
            //   0.25 - almost off
            //   0.00 - completely off
            FxaaFloat fxaaQualitySubpix,
            //
            // Only used on FXAA Quality.
            // This used to be the FXAA_QUALITY_EDGE_THRESHOLD define.
            // It is here now to allow easier tuning.
            // The minimum amount of local contrast required to apply algorithm.
            //   0.333 - too little (faster)
            //   0.250 - low quality
            //   0.166 - default
            //   0.125 - high quality
            //   0.063 - overkill (slower)
            FxaaFloat fxaaQualityEdgeThreshold,
            //
            // Only used on FXAA Quality.
            // This used to be the FXAA_QUALITY_EDGE_THRESHOLD_MIN define.
            // It is here now to allow easier tuning.
            // Trims the algorithm from processing darks.
            //   0.0833 - upper limit (default, the start of visible unfiltered edges)
            //   0.0625 - high quality (faster)
            //   0.0312 - visible limit (slower)
            // Special notes when using FXAA_GREEN_AS_LUMA,
            //   Likely want to set this to zero.
            //   As colors that are mostly not-green
            //   will appear very dark in the green channel!
            //   Tune by looking at mostly non-green content,
            //   then start at zero and increase until aliasing is a problem.
            FxaaFloat fxaaQualityEdgeThresholdMin,
            //
            // Only used on FXAA Console.
            // This used to be the FXAA_CONSOLE_EDGE_SHARPNESS define.
            // It is here now to allow easier tuning.
            // This does not effect PS3, as this needs to be compiled in.
            //   Use FXAA_CONSOLE_PS3_EDGE_SHARPNESS for PS3.
            //   Due to the PS3 being ALU bound,
            //   there are only three safe values here: 2 and 4 and 8.
            //   These options use the shaders ability to a free *|/ by 2|4|8.
            // For all other platforms can be a non-power of two.
            //   8.0 is sharper (default!!!)
            //   4.0 is softer
            //   2.0 is really soft (good only for vector graphics inputs)
            FxaaFloat fxaaConsoleEdgeSharpness,
            //
            // Only used on FXAA Console.
            // This used to be the FXAA_CONSOLE_EDGE_THRESHOLD define.
            // It is here now to allow easier tuning.
            // This does not effect PS3, as this needs to be compiled in.
            //   Use FXAA_CONSOLE_PS3_EDGE_THRESHOLD for PS3.
            //   Due to the PS3 being ALU bound,
            //   there are only two safe values here: 1/4 and 1/8.
            //   These options use the shaders ability to a free *|/ by 2|4|8.
            // The console setting has a different mapping than the quality setting.
            // Other platforms can use other values.
            //   0.125 leaves less aliasing, but is softer (default!!!)
            //   0.25 leaves more aliasing, and is sharper
            FxaaFloat fxaaConsoleEdgeThreshold,
            //
            // Only used on FXAA Console.
            // This used to be the FXAA_CONSOLE_EDGE_THRESHOLD_MIN define.
            // It is here now to allow easier tuning.
            // Trims the algorithm from processing darks.
            // The console setting has a different mapping than the quality setting.
            // This only applies when FXAA_EARLY_EXIT is 1.
            // This does not apply to PS3,
            // PS3 was simplified to avoid more shader instructions.
            //   0.06 - faster but more aliasing in darks
            //   0.05 - default
            //   0.04 - slower and less aliasing in darks
            // Special notes when using FXAA_GREEN_AS_LUMA,
            //   Likely want to set this to zero.
            //   As colors that are mostly not-green
            //   will appear very dark in the green channel!
            //   Tune by looking at mostly non-green content,
            //   then start at zero and increase until aliasing is a problem.
            FxaaFloat fxaaConsoleEdgeThresholdMin,
            //
            // Extra constants for 360 FXAA Console only.
            // Use zeros or anything else for other platforms.
            // These must be in physical constant registers and NOT immedates.
            // Immedates will result in compiler un-optimizing.
            // {xyzw} = float4(1.0, -1.0, 0.25, -0.25)
            FxaaFloat4 fxaaConsole360ConstDir
        ) {
        /*--------------------------------------------------------------------------*/
            FxaaFloat2 posM;
            posM.x = pos.x;
            posM.y = pos.y;
            #if (FXAA_GATHER4_ALPHA == 1)
                #if (FXAA_DISCARD == 0)
                    FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);
                    #if (FXAA_GREEN_AS_LUMA == 0)
                        #define lumaM rgbyM.w
                    #else
                        #define lumaM rgbyM.y
                    #endif
                #endif
                #if (FXAA_GREEN_AS_LUMA == 0)
                    FxaaFloat4 luma4A = FxaaTexAlpha4(tex, posM);
                    FxaaFloat4 luma4B = FxaaTexOffAlpha4(tex, posM, FxaaInt2(-1, -1));
                #else
                    FxaaFloat4 luma4A = FxaaTexGreen4(tex, posM);
                    FxaaFloat4 luma4B = FxaaTexOffGreen4(tex, posM, FxaaInt2(-1, -1));
                #endif
                #if (FXAA_DISCARD == 1)
                    #define lumaM luma4A.w
                #endif
                #define lumaE luma4A.z
                #define lumaS luma4A.x
                #define lumaSE luma4A.y
                #define lumaNW luma4B.w
                #define lumaN luma4B.z
                #define lumaW luma4B.x
            #else
                FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);
                #if (FXAA_GREEN_AS_LUMA == 0)
                    #define lumaM rgbyM.w
                #else
                    #define lumaM rgbyM.y
                #endif
                #if (FXAA_GLSL_100 == 1)
                FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 0.0, 1.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0, 0.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 0.0,-1.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 0.0), fxaaQualityRcpFrame.xy));
                #else
                FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 0, 1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1, 0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 0,-1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 0), fxaaQualityRcpFrame.xy));
                #endif
            #endif
        /*--------------------------------------------------------------------------*/
            FxaaFloat maxSM = max(lumaS, lumaM);
            FxaaFloat minSM = min(lumaS, lumaM);
            FxaaFloat maxESM = max(lumaE, maxSM);
            FxaaFloat minESM = min(lumaE, minSM);
            FxaaFloat maxWN = max(lumaN, lumaW);
            FxaaFloat minWN = min(lumaN, lumaW);
            FxaaFloat rangeMax = max(maxWN, maxESM);
            FxaaFloat rangeMin = min(minWN, minESM);
            FxaaFloat rangeMaxScaled = rangeMax * fxaaQualityEdgeThreshold;
            FxaaFloat range = rangeMax - rangeMin;
            FxaaFloat rangeMaxClamped = max(fxaaQualityEdgeThresholdMin, rangeMaxScaled);
            FxaaBool earlyExit = range < rangeMaxClamped;
        /*--------------------------------------------------------------------------*/
            if(earlyExit)
                #if (FXAA_DISCARD == 1)
                    FxaaDiscard;
                #else
                    return rgbyM;
                #endif
        /*--------------------------------------------------------------------------*/
            #if (FXAA_GATHER4_ALPHA == 0)
                #if (FXAA_GLSL_100 == 1)
                FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0,-1.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0, 1.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0,-1.0), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 1.0), fxaaQualityRcpFrame.xy));
                #else
                FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1,-1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1, 1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1,-1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));
                #endif
            #else
                FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, -1), fxaaQualityRcpFrame.xy));
                FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));
            #endif
        /*--------------------------------------------------------------------------*/
            FxaaFloat lumaNS = lumaN + lumaS;
            FxaaFloat lumaWE = lumaW + lumaE;
            FxaaFloat subpixRcpRange = 1.0/range;
            FxaaFloat subpixNSWE = lumaNS + lumaWE;
            FxaaFloat edgeHorz1 = (-2.0 * lumaM) + lumaNS;
            FxaaFloat edgeVert1 = (-2.0 * lumaM) + lumaWE;
        /*--------------------------------------------------------------------------*/
            FxaaFloat lumaNESE = lumaNE + lumaSE;
            FxaaFloat lumaNWNE = lumaNW + lumaNE;
            FxaaFloat edgeHorz2 = (-2.0 * lumaE) + lumaNESE;
            FxaaFloat edgeVert2 = (-2.0 * lumaN) + lumaNWNE;
        /*--------------------------------------------------------------------------*/
            FxaaFloat lumaNWSW = lumaNW + lumaSW;
            FxaaFloat lumaSWSE = lumaSW + lumaSE;
            FxaaFloat edgeHorz4 = (abs(edgeHorz1) * 2.0) + abs(edgeHorz2);
            FxaaFloat edgeVert4 = (abs(edgeVert1) * 2.0) + abs(edgeVert2);
            FxaaFloat edgeHorz3 = (-2.0 * lumaW) + lumaNWSW;
            FxaaFloat edgeVert3 = (-2.0 * lumaS) + lumaSWSE;
            FxaaFloat edgeHorz = abs(edgeHorz3) + edgeHorz4;
            FxaaFloat edgeVert = abs(edgeVert3) + edgeVert4;
        /*--------------------------------------------------------------------------*/
            FxaaFloat subpixNWSWNESE = lumaNWSW + lumaNESE;
            FxaaFloat lengthSign = fxaaQualityRcpFrame.x;
            FxaaBool horzSpan = edgeHorz >= edgeVert;
            FxaaFloat subpixA = subpixNSWE * 2.0 + subpixNWSWNESE;
        /*--------------------------------------------------------------------------*/
            if(!horzSpan) lumaN = lumaW;
            if(!horzSpan) lumaS = lumaE;
            if(horzSpan) lengthSign = fxaaQualityRcpFrame.y;
            FxaaFloat subpixB = (subpixA * (1.0/12.0)) - lumaM;
        /*--------------------------------------------------------------------------*/
            FxaaFloat gradientN = lumaN - lumaM;
            FxaaFloat gradientS = lumaS - lumaM;
            FxaaFloat lumaNN = lumaN + lumaM;
            FxaaFloat lumaSS = lumaS + lumaM;
            FxaaBool pairN = abs(gradientN) >= abs(gradientS);
            FxaaFloat gradient = max(abs(gradientN), abs(gradientS));
            if(pairN) lengthSign = -lengthSign;
            FxaaFloat subpixC = FxaaSat(abs(subpixB) * subpixRcpRange);
        /*--------------------------------------------------------------------------*/
            FxaaFloat2 posB;
            posB.x = posM.x;
            posB.y = posM.y;
            FxaaFloat2 offNP;
            offNP.x = (!horzSpan) ? 0.0 : fxaaQualityRcpFrame.x;
            offNP.y = ( horzSpan) ? 0.0 : fxaaQualityRcpFrame.y;
            if(!horzSpan) posB.x += lengthSign * 0.5;
            if( horzSpan) posB.y += lengthSign * 0.5;
        /*--------------------------------------------------------------------------*/
            FxaaFloat2 posN;
            posN.x = posB.x - offNP.x * FXAA_QUALITY_P0;
            posN.y = posB.y - offNP.y * FXAA_QUALITY_P0;
            FxaaFloat2 posP;
            posP.x = posB.x + offNP.x * FXAA_QUALITY_P0;
            posP.y = posB.y + offNP.y * FXAA_QUALITY_P0;
            FxaaFloat subpixD = ((-2.0)*subpixC) + 3.0;
            FxaaFloat lumaEndN = FxaaLuma(FxaaTexTop(tex, posN));
            FxaaFloat subpixE = subpixC * subpixC;
            FxaaFloat lumaEndP = FxaaLuma(FxaaTexTop(tex, posP));
        /*--------------------------------------------------------------------------*/
            if(!pairN) lumaNN = lumaSS;
            FxaaFloat gradientScaled = gradient * 1.0/4.0;
            FxaaFloat lumaMM = lumaM - lumaNN * 0.5;
            FxaaFloat subpixF = subpixD * subpixE;
            FxaaBool lumaMLTZero = lumaMM < 0.0;
        /*--------------------------------------------------------------------------*/
            lumaEndN -= lumaNN * 0.5;
            lumaEndP -= lumaNN * 0.5;
            FxaaBool doneN = abs(lumaEndN) >= gradientScaled;
            FxaaBool doneP = abs(lumaEndP) >= gradientScaled;
            if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P1;
            if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P1;
            FxaaBool doneNP = (!doneN) || (!doneP);
            if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P1;
            if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P1;
        /*--------------------------------------------------------------------------*/
            if(doneNP) {
                if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                doneN = abs(lumaEndN) >= gradientScaled;
                doneP = abs(lumaEndP) >= gradientScaled;
                if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P2;
                if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P2;
                doneNP = (!doneN) || (!doneP);
                if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P2;
                if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P2;
        /*--------------------------------------------------------------------------*/
                #if (FXAA_QUALITY_PS > 3)
                if(doneNP) {
                    if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                    if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                    if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                    if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                    doneN = abs(lumaEndN) >= gradientScaled;
                    doneP = abs(lumaEndP) >= gradientScaled;
                    if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P3;
                    if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P3;
                    doneNP = (!doneN) || (!doneP);
                    if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P3;
                    if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P3;
        /*--------------------------------------------------------------------------*/
                    #if (FXAA_QUALITY_PS > 4)
                    if(doneNP) {
                        if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                        if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                        if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                        if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                        doneN = abs(lumaEndN) >= gradientScaled;
                        doneP = abs(lumaEndP) >= gradientScaled;
                        if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P4;
                        if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P4;
                        doneNP = (!doneN) || (!doneP);
                        if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P4;
                        if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P4;
        /*--------------------------------------------------------------------------*/
                        #if (FXAA_QUALITY_PS > 5)
                        if(doneNP) {
                            if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                            if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                            if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                            if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                            doneN = abs(lumaEndN) >= gradientScaled;
                            doneP = abs(lumaEndP) >= gradientScaled;
                            if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P5;
                            if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P5;
                            doneNP = (!doneN) || (!doneP);
                            if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P5;
                            if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P5;
        /*--------------------------------------------------------------------------*/
                            #if (FXAA_QUALITY_PS > 6)
                            if(doneNP) {
                                if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                                if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                                doneN = abs(lumaEndN) >= gradientScaled;
                                doneP = abs(lumaEndP) >= gradientScaled;
                                if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P6;
                                if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P6;
                                doneNP = (!doneN) || (!doneP);
                                if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P6;
                                if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P6;
        /*--------------------------------------------------------------------------*/
                                #if (FXAA_QUALITY_PS > 7)
                                if(doneNP) {
                                    if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                    if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                    if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                                    if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                                    doneN = abs(lumaEndN) >= gradientScaled;
                                    doneP = abs(lumaEndP) >= gradientScaled;
                                    if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P7;
                                    if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P7;
                                    doneNP = (!doneN) || (!doneP);
                                    if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P7;
                                    if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P7;
        /*--------------------------------------------------------------------------*/
            #if (FXAA_QUALITY_PS > 8)
            if(doneNP) {
                if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                doneN = abs(lumaEndN) >= gradientScaled;
                doneP = abs(lumaEndP) >= gradientScaled;
                if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P8;
                if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P8;
                doneNP = (!doneN) || (!doneP);
                if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P8;
                if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P8;
        /*--------------------------------------------------------------------------*/
                #if (FXAA_QUALITY_PS > 9)
                if(doneNP) {
                    if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                    if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                    if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                    if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                    doneN = abs(lumaEndN) >= gradientScaled;
                    doneP = abs(lumaEndP) >= gradientScaled;
                    if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P9;
                    if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P9;
                    doneNP = (!doneN) || (!doneP);
                    if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P9;
                    if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P9;
        /*--------------------------------------------------------------------------*/
                    #if (FXAA_QUALITY_PS > 10)
                    if(doneNP) {
                        if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                        if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                        if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                        if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                        doneN = abs(lumaEndN) >= gradientScaled;
                        doneP = abs(lumaEndP) >= gradientScaled;
                        if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P10;
                        if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P10;
                        doneNP = (!doneN) || (!doneP);
                        if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P10;
                        if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P10;
        /*--------------------------------------------------------------------------*/
                        #if (FXAA_QUALITY_PS > 11)
                        if(doneNP) {
                            if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                            if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                            if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                            if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                            doneN = abs(lumaEndN) >= gradientScaled;
                            doneP = abs(lumaEndP) >= gradientScaled;
                            if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P11;
                            if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P11;
                            doneNP = (!doneN) || (!doneP);
                            if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P11;
                            if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P11;
        /*--------------------------------------------------------------------------*/
                            #if (FXAA_QUALITY_PS > 12)
                            if(doneNP) {
                                if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;
                                if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;
                                doneN = abs(lumaEndN) >= gradientScaled;
                                doneP = abs(lumaEndP) >= gradientScaled;
                                if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P12;
                                if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P12;
                                doneNP = (!doneN) || (!doneP);
                                if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P12;
                                if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P12;
        /*--------------------------------------------------------------------------*/
                            }
                            #endif
        /*--------------------------------------------------------------------------*/
                        }
                        #endif
        /*--------------------------------------------------------------------------*/
                    }
                    #endif
        /*--------------------------------------------------------------------------*/
                }
                #endif
        /*--------------------------------------------------------------------------*/
            }
            #endif
        /*--------------------------------------------------------------------------*/
                                }
                                #endif
        /*--------------------------------------------------------------------------*/
                            }
                            #endif
        /*--------------------------------------------------------------------------*/
                        }
                        #endif
        /*--------------------------------------------------------------------------*/
                    }
                    #endif
        /*--------------------------------------------------------------------------*/
                }
                #endif
        /*--------------------------------------------------------------------------*/
            }
        /*--------------------------------------------------------------------------*/
            FxaaFloat dstN = posM.x - posN.x;
            FxaaFloat dstP = posP.x - posM.x;
            if(!horzSpan) dstN = posM.y - posN.y;
            if(!horzSpan) dstP = posP.y - posM.y;
        /*--------------------------------------------------------------------------*/
            FxaaBool goodSpanN = (lumaEndN < 0.0) != lumaMLTZero;
            FxaaFloat spanLength = (dstP + dstN);
            FxaaBool goodSpanP = (lumaEndP < 0.0) != lumaMLTZero;
            FxaaFloat spanLengthRcp = 1.0/spanLength;
        /*--------------------------------------------------------------------------*/
            FxaaBool directionN = dstN < dstP;
            FxaaFloat dst = min(dstN, dstP);
            FxaaBool goodSpan = directionN ? goodSpanN : goodSpanP;
            FxaaFloat subpixG = subpixF * subpixF;
            FxaaFloat pixelOffset = (dst * (-spanLengthRcp)) + 0.5;
            FxaaFloat subpixH = subpixG * fxaaQualitySubpix;
        /*--------------------------------------------------------------------------*/
            FxaaFloat pixelOffsetGood = goodSpan ? pixelOffset : 0.0;
            FxaaFloat pixelOffsetSubpix = max(pixelOffsetGood, subpixH);
            if(!horzSpan) posM.x += pixelOffsetSubpix * lengthSign;
            if( horzSpan) posM.y += pixelOffsetSubpix * lengthSign;
            #if (FXAA_DISCARD == 1)
                return FxaaTexTop(tex, posM);
            #else
                return FxaaFloat4(FxaaTexTop(tex, posM).xyz, lumaM);
            #endif
        }
        /*==========================================================================*/
        #endif
        
        void main() {
        gl_FragColor = FxaaPixelShader(
            v_Uv,
            vec4(0.0),
            tDiffuse,
            tDiffuse,
            tDiffuse,
            resolution,
            vec4(0.0),
            vec4(0.0),
            vec4(0.0),
            0.75,
            0.166,
            0.0833,
            0.0,
            0.0,
            0.0,
            vec4(0.0)
        );
        
        // TODO avoid querying texture twice for same texel
        gl_FragColor.a = texture2D(tDiffuse, v_Uv).a;
        }
    `
};

export const ToneMappingType = {
	None: 0,
	Linear: 1,
	Reinhard: 2,
	Cineon: 3,
	ACESFilmic: 4
}

export function isDepthStencilAttachment(attachment) {
	return attachment.format === PIXEL_FORMAT.DEPTH_STENCIL
		|| attachment.format === PIXEL_FORMAT.DEPTH24_STENCIL8;
}

export const RenderListMask = {
	OPAQUE: 1, // 0001
	TRANSPARENT: 2, // 0010
	ALL: 15 // 1111
};