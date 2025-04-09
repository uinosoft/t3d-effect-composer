// t3d-effect-composer
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('t3d')) :
	typeof define === 'function' && define.amd ? define(['exports', 't3d'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.t3d = global.t3d || {}, global.t3d));
})(this, (function (exports, t3d) { 'use strict';

	class Buffer {
		constructor(width, height, options) {
			this.autoUpdate = true;
			this.needsUpdate = true;
			this.enableCameraJitter = false;
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

	const defaultVertexShader = `
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
	const unitVectorToOctahedronGLSL = `
vec2 unitVectorToOctahedron(vec3 v) {
		vec2 up = v.xz / dot(vec3(1.0), abs(v));
		vec2 down = (1.0 - abs(up.yx)) * sign(up.xy);
		return mix(up, down, step(0.0, -v.y));
}`;
	const octahedronToUnitVectorGLSL = `
vec3 octahedronToUnitVector(vec2 p) {
		vec3 v = vec3(p.x, 1.0 - dot(abs(p), vec2(1.0)), p.y);
		v.xz = mix(v.xz, (1.0 - abs(v.zx)) * sign(v.xz), step(0.0, -v.y));
		return normalize(v);
}`;
	const blurShader = {
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
			direction: 0,
			// 0 horizontal, 1 vertical
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

						${octahedronToUnitVectorGLSL}

						vec3 getViewNormal(const in vec2 screenPosition) {
								vec3 normal = octahedronToUnitVector(texture2D(normalTex, screenPosition).rg);
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
	const additiveShader = {
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
	const multiplyShader = {
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
	const copyShader = {
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
	const channelShader = {
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
	const maskShader = {
		name: 'ec_mask',
		defines: {},
		uniforms: {
			colorTexture: null,
			maskTexture: null,
			channel: [1, 0, 0, 0],
			additiveTexture: null,
			additiveStrength: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform sampler2D colorTexture;

		uniform sampler2D maskTexture;
				uniform vec4 channel;

		uniform sampler2D additiveTexture;
				uniform float additiveStrength;
		
				varying vec2 v_Uv;

				void main() {
			vec4 colorTex = texture2D(colorTexture, v_Uv);
			vec4 maskTex = texture2D(maskTexture, v_Uv);
			vec4 addTex = texture2D(additiveTexture, v_Uv);
						gl_FragColor = colorTex * dot(maskTex, channel) + addTex * additiveStrength;
				}
		`
	};
	const highlightShader = {
		name: 'ec_highlight',
		defines: {},
		uniforms: {
			tDiffuse: null,
			diffuseStrength: 1.0,
			threshold: 1.0,
			smoothWidth: 0.01
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform float threshold;
		uniform float smoothWidth;

				uniform sampler2D tDiffuse;
				uniform float diffuseStrength;

				varying vec2 v_Uv;

				void main() {
						vec4 texel = texture2D(tDiffuse, v_Uv) * diffuseStrength;
						vec3 luma = vec3(0.299, 0.587, 0.114);
						float v = dot(texel.xyz, luma);
						gl_FragColor = smoothstep(threshold, threshold + smoothWidth, v) * texel;
				}
		`
	};
	const seperableBlurShader = {
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
	const horizontalBlurShader = {
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
	const verticalBlurShader = {
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
	const fxaaShader = {
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
				// File:				es3-kepler/FXAA/assets/shaders/FXAA_DefaultES.frag
				// SDK Version: v3.00
				// Email:			 gameworks@nvidia.com
				// Site:				http://developer.nvidia.com/
				//
				// Copyright (c) 2014-2015, NVIDIA CORPORATION. All rights reserved.
				//
				// Redistribution and use in source and binary forms, with or without
				// modification, are permitted provided that the following conditions
				// are met:
				//	* Redistributions of source code must retain the above copyright
				//		notice, this list of conditions and the following disclaimer.
				//	* Redistributions in binary form must reproduce the above copyright
				//		notice, this list of conditions and the following disclaimer in the
				//		documentation and/or other materials provided with the distribution.
				//	* Neither the name of NVIDIA CORPORATION nor the names of its
				//		contributors may be used to endorse or promote products derived
				//		from this software without specific prior written permission.
				//
				// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS "AS IS" AND ANY
				// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
				// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
				// PURPOSE ARE DISCLAIMED.	IN NO EVENT SHALL THE COPYRIGHT OWNER OR
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
						//		fxaaConsoleEdgeThresholdMin
						//		fxaaQualityEdgeThresholdMin
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
						//		 For APIs which enable concurrent TEX+ROP from same surface.
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
						// 39			 - no dither, very expensive
						//
						// NOTES
						// -----------------------------------------------------------------------
						// 12 = slightly faster then FXAA 3.9 and higher edge quality (default)
						// 13 = about same speed as FXAA 3.9 and better than 12
						// 23 = closest to FXAA 3.9 visually and performance wise
						//	_ = the lowest digit is directly related to performance
						// _	= the highest digit is directly related to style
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
						//	#version 120
						// And at least,
						//	#extension GL_EXT_gpu_shader4 : enable
						//	(or set FXAA_FAST_PIXEL_OFFSET 1 to work like DX9)
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
						//		 {__a} = luma in perceptual color space (not linear)
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
						//	 Where N ranges between,
						//		 N = 0.50 (default)
						//		 N = 0.33 (sharper)
						// {x__} = -N/screenWidthInPixels
						// {_y_} = -N/screenHeightInPixels
						// {_z_} =	N/screenWidthInPixels
						// {__w} =	N/screenHeightInPixels
						FxaaFloat4 fxaaConsoleRcpFrameOpt,
						//
						// Only used on FXAA Console.
						// Not used on 360, but used on PS3 and PC.
						// This must be from a constant/uniform.
						// {x__} = -2.0/screenWidthInPixels
						// {_y_} = -2.0/screenHeightInPixels
						// {_z_} =	2.0/screenWidthInPixels
						// {__w} =	2.0/screenHeightInPixels
						FxaaFloat4 fxaaConsoleRcpFrameOpt2,
						//
						// Only used on FXAA Console.
						// Only used on 360 in place of fxaaConsoleRcpFrameOpt2.
						// This must be from a constant/uniform.
						// {x__} =	8.0/screenWidthInPixels
						// {_y_} =	8.0/screenHeightInPixels
						// {_z_} = -4.0/screenWidthInPixels
						// {__w} = -4.0/screenHeightInPixels
						FxaaFloat4 fxaaConsole360RcpFrameOpt2,
						//
						// Only used on FXAA Quality.
						// This used to be the FXAA_QUALITY_SUBPIX define.
						// It is here now to allow easier tuning.
						// Choose the amount of sub-pixel aliasing removal.
						// This can effect sharpness.
						//	 1.00 - upper limit (softer)
						//	 0.75 - default amount of filtering
						//	 0.50 - lower limit (sharper, less sub-pixel aliasing removal)
						//	 0.25 - almost off
						//	 0.00 - completely off
						FxaaFloat fxaaQualitySubpix,
						//
						// Only used on FXAA Quality.
						// This used to be the FXAA_QUALITY_EDGE_THRESHOLD define.
						// It is here now to allow easier tuning.
						// The minimum amount of local contrast required to apply algorithm.
						//	 0.333 - too little (faster)
						//	 0.250 - low quality
						//	 0.166 - default
						//	 0.125 - high quality
						//	 0.063 - overkill (slower)
						FxaaFloat fxaaQualityEdgeThreshold,
						//
						// Only used on FXAA Quality.
						// This used to be the FXAA_QUALITY_EDGE_THRESHOLD_MIN define.
						// It is here now to allow easier tuning.
						// Trims the algorithm from processing darks.
						//	 0.0833 - upper limit (default, the start of visible unfiltered edges)
						//	 0.0625 - high quality (faster)
						//	 0.0312 - visible limit (slower)
						// Special notes when using FXAA_GREEN_AS_LUMA,
						//	 Likely want to set this to zero.
						//	 As colors that are mostly not-green
						//	 will appear very dark in the green channel!
						//	 Tune by looking at mostly non-green content,
						//	 then start at zero and increase until aliasing is a problem.
						FxaaFloat fxaaQualityEdgeThresholdMin,
						//
						// Only used on FXAA Console.
						// This used to be the FXAA_CONSOLE_EDGE_SHARPNESS define.
						// It is here now to allow easier tuning.
						// This does not effect PS3, as this needs to be compiled in.
						//	 Use FXAA_CONSOLE_PS3_EDGE_SHARPNESS for PS3.
						//	 Due to the PS3 being ALU bound,
						//	 there are only three safe values here: 2 and 4 and 8.
						//	 These options use the shaders ability to a free *|/ by 2|4|8.
						// For all other platforms can be a non-power of two.
						//	 8.0 is sharper (default!!!)
						//	 4.0 is softer
						//	 2.0 is really soft (good only for vector graphics inputs)
						FxaaFloat fxaaConsoleEdgeSharpness,
						//
						// Only used on FXAA Console.
						// This used to be the FXAA_CONSOLE_EDGE_THRESHOLD define.
						// It is here now to allow easier tuning.
						// This does not effect PS3, as this needs to be compiled in.
						//	 Use FXAA_CONSOLE_PS3_EDGE_THRESHOLD for PS3.
						//	 Due to the PS3 being ALU bound,
						//	 there are only two safe values here: 1/4 and 1/8.
						//	 These options use the shaders ability to a free *|/ by 2|4|8.
						// The console setting has a different mapping than the quality setting.
						// Other platforms can use other values.
						//	 0.125 leaves less aliasing, but is softer (default!!!)
						//	 0.25 leaves more aliasing, and is sharper
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
						//	 0.06 - faster but more aliasing in darks
						//	 0.05 - default
						//	 0.04 - slower and less aliasing in darks
						// Special notes when using FXAA_GREEN_AS_LUMA,
						//	 Likely want to set this to zero.
						//	 As colors that are mostly not-green
						//	 will appear very dark in the green channel!
						//	 Tune by looking at mostly non-green content,
						//	 then start at zero and increase until aliasing is a problem.
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
	const ToneMappingType = {
		None: 0,
		Linear: 1,
		Reinhard: 2,
		Cineon: 3,
		ACESFilmic: 4,
		Neutral: 5,
		AgX: 6
	};
	function isDepthStencilAttachment(attachment) {
		return attachment.format === t3d.PIXEL_FORMAT.DEPTH_STENCIL || attachment.format === t3d.PIXEL_FORMAT.DEPTH24_STENCIL8;
	}
	function getColorBufferFormat(options) {
		if (options.highDynamicRange) {
			return options.hdrMode === HDRMode.R11G11B10 ? t3d.PIXEL_FORMAT.R11F_G11F_B10F : t3d.PIXEL_FORMAT.RGBA16F;
		}
		return t3d.PIXEL_FORMAT.RGBA8;
	}
	function setupColorTexture(texture, options) {
		texture.type = t3d.PIXEL_TYPE.UNSIGNED_BYTE;
		texture.format = t3d.PIXEL_FORMAT.RGBA;
		if (options.highDynamicRange) {
			texture.type = t3d.PIXEL_TYPE.HALF_FLOAT;
			if (options.hdrMode === HDRMode.R11G11B10) {
				texture.format = t3d.PIXEL_FORMAT.RGB;
				texture.internalformat = t3d.PIXEL_FORMAT.R11F_G11F_B10F;
			}
		}
	}
	function setupDepthTexture(texture, stencil = false) {
		texture.type = stencil ? t3d.PIXEL_TYPE.UNSIGNED_INT_24_8 : t3d.PIXEL_TYPE.UNSIGNED_INT;
		texture.format = stencil ? t3d.PIXEL_FORMAT.DEPTH_STENCIL : t3d.PIXEL_FORMAT.DEPTH_COMPONENT;
		texture.magFilter = texture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
		texture.generateMipmaps = false;
		texture.flipY = false;
	}
	const RenderListMask = {
		OPAQUE: 1,
		// 0001
		TRANSPARENT: 2,
		// 0010
		ALL: 15 // 1111
	};
	const HDRMode = {
		RGBA16: 1,
		R11G11B10: 2
	};

	// AccumulationBuffer is used to store the accumulation result of the previous frame.
	// But it can not render to itself (render method is empty), need TAAEffect to help.
	class AccumulationBuffer extends Buffer {
		constructor(width, height, options) {
			super(width, height, options);
			function createSwapRenderTarget() {
				const renderTarget = new t3d.RenderTarget2D(width, height);
				setupColorTexture(renderTarget.texture, options);
				renderTarget.texture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
				renderTarget.texture.magFilter = t3d.TEXTURE_FILTER.NEAREST;
				renderTarget.texture.generateMipmaps = false;
				renderTarget.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				return renderTarget;
			}
			this._prevRT = createSwapRenderTarget();
			this._accumRT = createSwapRenderTarget();
		}
		swap() {
			const tempRT = this._prevRT;
			this._prevRT = this._accumRT;
			this._accumRT = tempRT;
		}
		accumRT() {
			return this._accumRT;
		}
		output() {
			return this._prevRT;
		}
		resize(width, height) {
			super.resize(width, height);
			this._prevRT.resize(width, height);
			this._accumRT.resize(width, height);
		}
		dispose() {
			super.dispose();
			this._prevRT.dispose();
			this._accumRT.dispose();
		}
	}

	class Effect {
		constructor() {
			this.name = '';
			this.bufferDependencies = [];
			this.active = true;
			this.needCameraJitter = false;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			console.error('Effect: .render() must be implemented in subclass.');
		}
		resize(width, height) {}
		dispose() {}
	}

	class BloomEffect extends Effect {
		constructor() {
			super();
			this.threshold = 0.7;
			this.smoothWidth = 0.01;
			this.blurSize = 2;
			this.strength = 1;
			this._highlightPass = new t3d.ShaderPostPass(highlightShader);
			this._blurPass = new t3d.ShaderPostPass(blurShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._blurPass.uniforms.textureSize[0] = width;
			this._blurPass.uniforms.textureSize[1] = height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(1);
			const tempRT3 = composer._renderTargetCache.allocate(1);
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._highlightPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this._highlightPass.uniforms.threshold = this.threshold;
			this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
			this._highlightPass.render(renderer);
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.uniforms.direction = 0;
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.render(renderer);
			renderer.setRenderTarget(tempRT3);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT3.texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = this.strength;
			this._blendPass.uniforms.alphaWeight2 = this.strength;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 1);
			composer._renderTargetCache.release(tempRT3, 1);
		}
		dispose() {
			this._highlightPass.dispose();
			this._blurPass.dispose();
			this._blendPass.dispose();
		}
	}

	class ChromaticAberrationEffect extends Effect {
		constructor() {
			super();
			this.chromaFactor = 0.025;
			this._mainPass = new t3d.ShaderPostPass(shader$4);
			this._mainPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const mainPass = this._mainPass;
			mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
			mainPass.uniforms.uChromaFactor = this.chromaFactor;
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
	const shader$4 = {
		name: 'ec_chromatic_aberration',
		defines: {},
		uniforms: {
			tDiffuse: null,
			uChromaFactor: 0.025,
			uResolutionRatio: [1, 1],
			resolution: [1 / 1024, 1 / 512]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform float uChromaFactor;
				uniform vec2 uResolutionRatio;
				uniform vec2 resolution;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				void main() {
						vec2 uv = v_Uv;
						vec2 dist = uv - 0.5;
						vec2 offset = uChromaFactor * dist * length(dist);
						vec4 col = texture2D(tDiffuse, min(uv, 1.0 - resolution) * uResolutionRatio);
						col.r = texture2D(tDiffuse, min(uv - offset, 1.0 - resolution) * uResolutionRatio).r;
						col.b = texture2D(tDiffuse, min(uv + offset, 1.0 - resolution) * uResolutionRatio).b;
						gl_FragColor = col;
				}
		`
	};

	class ColorCorrectionEffect extends Effect {
		constructor() {
			super();
			this.brightness = 0;
			this.contrast = 1.02;
			this.exposure = 0;
			this.gamma = 1;
			this.saturation = 1.02;
			this._mainPass = new t3d.ShaderPostPass(shader$3);
			this._mainPass.material.premultipliedAlpha = true;
			this._mainPass.uniforms.contrast = 1.02;
			this._mainPass.uniforms.saturation = 1.02;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const mainPass = this._mainPass;
			mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
			mainPass.uniforms.brightness = this.brightness;
			mainPass.uniforms.contrast = this.contrast;
			mainPass.uniforms.exposure = this.exposure;
			mainPass.uniforms.gamma = this.gamma;
			mainPass.uniforms.saturation = this.saturation;
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
	const shader$3 = {
		name: 'ec_color_correction',
		defines: {},
		uniforms: {
			tDiffuse: null,
			brightness: 0.0,
			contrast: 1.0,
			exposure: 0.0,
			gamma: 1.0,
			saturation: 1.0
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform float brightness;
				uniform float contrast;
				uniform float exposure;
				uniform float gamma;
				uniform float saturation;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				// Values from "Graphics Shaders: Theory and Practice" by Bailey and Cunningham
				const vec3 w = vec3(0.2125, 0.7154, 0.0721);

				void main() {
						vec4 tex = texture2D(tDiffuse, v_Uv);
						// brightness
						vec3 color = clamp(tex.rgb + vec3(brightness), 0.0, 1.0);
						// contrast
						color = clamp((color - vec3(0.5)) * contrast + vec3(0.5), 0.0, 1.0);
						// exposure
						color = clamp(color * pow(2.0, exposure), 0.0, 1.0);
						// gamma
						color = clamp(pow(color, vec3(gamma)), 0.0, 1.0);
						float luminance = dot(color, w);
						color = mix(vec3(luminance), color, saturation);
						gl_FragColor = vec4(color, tex.a);
				}
		`
	};

	class DOFEffect extends Effect {
		constructor() {
			super();
			this.bufferDependencies = [{
				key: 'GBuffer'
			}];
			this.focalDepth = 1;
			this.focalLength = 24;
			this.fstop = 0.9;
			this.maxblur = 1.0;
			this.threshold = 0.9;
			this.gain = 1.0;
			this.bias = 0.5;
			this.dithering = 0.0001;
			this._mainPass = new t3d.ShaderPostPass(bokehShader);
			this._mainPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const gBuffer = composer.getBuffer('GBuffer');
			const gBufferRenderStates = gBuffer.getCurrentRenderStates();
			this._mainPass.uniforms.tColor = inputRenderTarget.texture;
			this._mainPass.uniforms.tDepth = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._mainPass.uniforms.znear = gBufferRenderStates.camera.near;
			this._mainPass.uniforms.zfar = gBufferRenderStates.camera.far;
			this._mainPass.uniforms.focalDepth = this.focalDepth;
			this._mainPass.uniforms.focalLength = this.focalLength;
			this._mainPass.uniforms.fstop = this.fstop;
			this._mainPass.uniforms.maxblur = this.maxblur;
			this._mainPass.uniforms.threshold = this.threshold;
			this._mainPass.uniforms.gain = this.gain;
			this._mainPass.uniforms.bias = this.bias;
			this._mainPass.uniforms.dithering = this.dithering;
			if (finish) {
				this._mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._mainPass.render(renderer);
			if (finish) {
				this._mainPass.material.transparent = false;
				this._mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
		}
		dispose() {
			this._mainPass.dispose();
		}
	}
	const bokehShader = {
		name: 'ec_bokeh',
		defines: {
			RINGS: 3,
			SAMPLES: 4
		},
		uniforms: {
			tColor: null,
			tDepth: null,
			resolution: [1 / 1024, 1 / 512],
			znear: 0.1,
			zfar: 100,
			focalDepth: 1.0,
			focalLength: 24,
			fstop: 0.9,
			maxblur: 1.0,
			threshold: 0.5,
			gain: 2.0,
			bias: 0.5,
			dithering: 0.0001
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				varying vec2 v_Uv;

				uniform sampler2D tColor;
				uniform sampler2D tDepth;
				
				uniform vec2 resolution;	
				
				uniform float znear;
				uniform float zfar;

				uniform float focalDepth;
				uniform float focalLength;
				uniform float fstop;

				uniform float maxblur; // clamp value of max blur (0.0 = no blur, 1.0 default)
				uniform float threshold; // highlight threshold
				uniform float gain; // highlight gain
				uniform float bias; // bokeh edge bias
				uniform float dithering;

				const int samples = SAMPLES;
				const int rings = RINGS;
				const int maxringsamples = rings * samples;

				float CoC = 0.03; // circle of confusion size in mm (35mm film = 0.03mm)

				vec4 color(vec2 coords, float blur) {
						vec4 col = texture2D(tColor, coords);
						vec3 lumcoeff = vec3(0.299, 0.587, 0.114);
						float lum = dot(col.rgb, lumcoeff);
						float thresh = max((lum - threshold) * gain, 0.0);
						return vec4(col.rgb + mix(vec3(0.0), col.rgb, thresh * blur), col.a);
				}

				float linearize(float depth) {
						return -zfar * znear / (depth * (zfar - znear) - zfar);
				}

				float gather(float i, float j, int ringsamples, inout vec3 colorSum, float w, float h, float blur) {
						float rings2 = float(rings);
						float step = PI * 2.0 / float(ringsamples);
						float pw = cos(j * step) * i;
						float ph = sin(j * step) * i;
			vec4 sampleColor = color(v_Uv + vec2(pw * w, ph * h), blur);
			float weight = mix(1.0, i / rings2, bias) * sampleColor.a;
						colorSum += sampleColor.rgb	* weight;
						return weight;
				}

				void main() {
						float depth = linearize(texture2D(tDepth,	v_Uv).x);
						float fDepth = focalDepth;

						// dof blur factor calculation

						float f = focalLength; // focal length in mm
						float d = fDepth * 1000.; // focal plane in mm
						float o = depth * 1000.; // depth in mm

						float a = (o * f) / (o - f);
						float b = (d * f) / (d - f);
						float c = (d - f) / (d * fstop * CoC);

						float blur = abs(a - b) * c;
						blur = clamp(blur, 0.0, 1.0);

						// calculation of pattern for dithering

						vec2 noise = vec2(rand( v_Uv), rand( v_Uv + vec2(0.4, 0.6))) * dithering * blur;

						// getting blur x and y step factor

						float w = resolution.x * blur * maxblur + noise.x;
						float h = resolution.y * blur * maxblur + noise.y;

						// calculation of final color

						vec3 col = vec3(0.0);
			vec4 centerColor = texture2D(tColor,	v_Uv);

						if (blur < 0.05) {
								col = centerColor.rgb;
						} else {
								col = centerColor.rgb;

								float s = 1.0;
								int ringsamples;

								for(int i = 1; i <= rings; i++) {
										ringsamples = i * samples;

										for (int j = 0; j < maxringsamples; j++) {
												if (j >= ringsamples) break;
												s += gather(float(i), float(j), ringsamples, col, w, h, blur);
										}
								}

								col /= s; // divide by sample count
						}

						gl_FragColor = vec4(col, centerColor.a);
				}
		`
	};

	class FilmEffect extends Effect {
		constructor() {
			super();
			this.noiseIntensity = 0.35;
			this.scanlinesIntensity = 0.5;
			this.scanlinesCount = 2048;
			this.grayscale = true;
			this._time = 0;
			this._mainPass = new t3d.ShaderPostPass(shader$2);
			this._mainPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const mainPass = this._mainPass;
			mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
			mainPass.uniforms.nIntensity = this.noiseIntensity;
			mainPass.uniforms.sIntensity = this.scanlinesIntensity;
			mainPass.uniforms.sCount = this.scanlinesCount;
			mainPass.uniforms.grayscale = this.grayscale;
			this._time += 0.01667;
			mainPass.uniforms.time = this._time;
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
	const shader$2 = {
		name: 'ec_film',
		defines: {},
		uniforms: {
			tDiffuse: null,
			time: 0,
			nIntensity: 0.5,
			sIntensity: 0.05,
			sCount: 4096,
			grayscale: true
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform float time;
				uniform float nIntensity;
				uniform float sIntensity;
				uniform float sCount;
				uniform bool grayscale;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				void main() {
						// sample the source
						vec4 cTextureScreen = texture2D(tDiffuse, v_Uv);
						// make some noise
						float dx = rand(v_Uv + time);
						// add noise
						vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp(0.1 + dx, 0.0, 1.0);
						// get us a sine and cosine
						vec2 sc = vec2(sin(v_Uv.y * sCount), cos(v_Uv.y * sCount));
						// add scanlines
						cResult += cTextureScreen.rgb * vec3(sc.x, sc.y, sc.x) * sIntensity;
						// interpolate between source and result by intensity
						cResult = cTextureScreen.rgb + clamp(nIntensity, 0.0, 1.0) * (cResult - cTextureScreen.rgb);
						// convert to grayscale if desired
						if(grayscale) {
								cResult = vec3(cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11);
						}
						gl_FragColor = vec4(cResult, cTextureScreen.a);
				}
		`
	};

	class FXAAEffect extends Effect {
		constructor() {
			super();
			this._mainPass = new t3d.ShaderPostPass(fxaaShader);
			this._mainPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
			if (finish) {
				this._mainPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._mainPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._mainPass.render(renderer);
			if (finish) {
				this._mainPass.material.transparent = false;
				this._mainPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
		}
		dispose() {
			this._mainPass.dispose();
		}
	}

	class SSAOEffect extends Effect {
		constructor() {
			super();
			this.bufferDependencies = [{
				key: 'GBuffer'
			}];
			this._ssaoPass = new t3d.ShaderPostPass(ssaoShader);

			// Sampling radius in work space.
			// Larger will produce more soft concat shadow.
			// But also needs higher quality or it will have more obvious artifacts
			this.radius = 0.5;
			this.power = 1;
			this.bias = 0.1;
			this.intensity = 1;
			this.autoSampleWeight = false;

			// Quality of SSAO. 'Low'|'Medium'|'High'|'Ultra'
			this.quality = 'Medium';
			this._kernelCode = '';
			this._kernelSize = -1;
			this._setNoiseSize(64);
			this._setKernelSize(16);
			this._blurPass = new t3d.ShaderPostPass(blurShader);
			this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
			this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;
			this.blurSize = 1;
			this.depthRange = 1;
			this.jitter = true;
			this.downScaleLevel = 0;
			this._blendPass = new t3d.ShaderPostPass(multiplyShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(this.downScaleLevel);
			const tempRT2 = composer._renderTargetCache.allocate(this.downScaleLevel);
			const gBuffer = composer.getBuffer('GBuffer');
			const gBufferRenderStates = gBuffer.getCurrentRenderStates();
			projection$1.copy(gBufferRenderStates.camera.projectionMatrix);
			projectionInv$1.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
			viewInverseTranspose$1.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

			// Step 1: ssao pass

			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(1, 1, 1, 1);
			renderer.clear(true, true, false);
			this._ssaoPass.uniforms.normalTex = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssaoPass.uniforms.depthTex = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._ssaoPass.uniforms.texSize[0] = gBuffer.output().width;
			this._ssaoPass.uniforms.texSize[1] = gBuffer.output().height;
			projection$1.toArray(this._ssaoPass.uniforms.projection);
			projectionInv$1.toArray(this._ssaoPass.uniforms.projectionInv);
			viewInverseTranspose$1.toArray(this._ssaoPass.uniforms.viewInverseTranspose);
			const cameraJitter = composer.$cameraJitter;
			this._setKernelSize(_qualityMap[this.quality], this.jitter && cameraJitter.accumulating() ? cameraJitter.frame() : 0);
			this._ssaoPass.uniforms.radius = this.radius;
			this._ssaoPass.uniforms.power = this.power;
			this._ssaoPass.uniforms.bias = this.bias;
			this._ssaoPass.uniforms.intensity = this.intensity;
			if (this._ssaoPass.material.defines.AUTO_SAMPLE_WEIGHT != this.autoSampleWeight) {
				this._ssaoPass.material.needsUpdate = true;
				this._ssaoPass.material.defines.AUTO_SAMPLE_WEIGHT = this.autoSampleWeight;
			}
			this._ssaoPass.render(renderer);

			// Step 2: blurX pass

			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.normalTex = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._blurPass.uniforms.depthTex = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._blurPass.uniforms.textureSize[0] = gBuffer.output().width;
			this._blurPass.uniforms.textureSize[1] = gBuffer.output().height;
			projection$1.toArray(this._blurPass.uniforms.projection);
			viewInverseTranspose$1.toArray(this._blurPass.uniforms.viewInverseTranspose);
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.uniforms.depthRange = this.depthRange;
			this._blurPass.uniforms.direction = 0;
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.render(renderer);

			// Step 3: blurY pass

			renderer.setRenderTarget(inputRenderTarget ? tempRT1 : outputRenderTarget);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.render(renderer);

			// Step 4: blend pass

			if (inputRenderTarget) {
				renderer.setRenderTarget(outputRenderTarget);
				renderer.setClearColor(0, 0, 0, 0);
				if (finish) {
					renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
				} else {
					renderer.clear(true, true, false);
				}
				this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
				this._blendPass.uniforms.texture2 = tempRT1.texture;
				if (finish) {
					this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
					this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
				}
				this._blendPass.render(renderer);
				if (finish) {
					this._blendPass.material.transparent = false;
					this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
				}
			}
			composer._renderTargetCache.release(tempRT1, this.downScaleLevel);
			composer._renderTargetCache.release(tempRT2, this.downScaleLevel);
		}
		dispose() {
			this._ssaoPass.dispose();
			this._blurPass.dispose();
			this._blendPass.dispose();
		}
		_setKernelSize(size, offset = 0) {
			const code = size + '_' + offset;
			if (this._kernelCode === code) return;
			this._kernelCode = code;
			if (!_kernels[code]) {
				_kernels[code] = generateKernel(size, offset * size);
			}
			this._ssaoPass.uniforms.kernel = _kernels[code];
			if (this._ssaoPass.material.defines.KERNEL_SIZE !== size) {
				this._ssaoPass.material.defines.KERNEL_SIZE = size;
				this._ssaoPass.material.needsUpdate = true;
			}
		}
		_setNoiseSize(size) {
			if (this._noiseSize === size) return;
			this._noiseSize = size;
			const uniforms = this._ssaoPass.uniforms;
			if (!uniforms.noiseTex) {
				uniforms.noiseTex = generateNoiseTexture(size);
			} else {
				uniforms.noiseTex.image.data = generateNoiseData(size);
				uniforms.noiseTex.image.width = size;
				uniforms.noiseTex.image.height = size;
				uniforms.noiseTex.version++;
			}
			uniforms.noiseTexSize[0] = size;
			uniforms.noiseTexSize[1] = size;
		}
	}
	const projection$1 = new t3d.Matrix4();
	const projectionInv$1 = new t3d.Matrix4();
	const viewInverseTranspose$1 = new t3d.Matrix4();
	const _qualityMap = {
		Low: 6,
		Medium: 12,
		High: 32,
		Ultra: 64
	};

	// https://en.wikipedia.org/wiki/Halton_sequence halton sequence.
	function halton$1(index, base) {
		let result = 0;
		let f = 1 / base;
		let i = index;
		while (i > 0) {
			result = result + f * (i % base);
			i = Math.floor(i / base);
			f = f / base;
		}
		return result;
	}
	const _kernels = {};

	// hemisphere sample kernel
	function generateKernel(size, offset = 0) {
		const kernel = new Float32Array(size * 3);
		for (let i = 0; i < size; i++) {
			const phi = halton$1(i + offset, 2) * Math.PI * 2;

			// rejecting samples that are close to tangent plane to avoid z-fighting artifacts
			const cosTheta = 1.0 - (halton$1(i + offset, 3) * 0.85 + 0.15);
			const sinTheta = Math.sqrt(1.0 - cosTheta * cosTheta);
			const r = Math.random();

			// for tbn space
			const x = Math.cos(phi) * sinTheta * r;
			const y = Math.sin(phi) * sinTheta * r;
			const z = cosTheta * r;
			kernel[i * 3] = x;
			kernel[i * 3 + 1] = y;
			kernel[i * 3 + 2] = z;
		}
		return kernel;
	}
	function generateNoiseTexture(size) {
		const texture = new t3d.Texture2D();
		texture.image = {
			data: generateNoiseData(size),
			width: size,
			height: size
		};
		texture.type = t3d.PIXEL_TYPE.UNSIGNED_BYTE;
		texture.magFilter = t3d.TEXTURE_FILTER.NEAREST;
		texture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
		texture.wrapS = t3d.TEXTURE_WRAP.REPEAT;
		texture.wrapT = t3d.TEXTURE_WRAP.REPEAT;
		texture.generateMipmaps = false;
		texture.flipY = false;
		texture.version++;
		return texture;
	}

	// length: size * size * 4
	function generateNoiseData(size) {
		const data = new Uint8Array(size * size * 4);
		let n = 0;
		const v3 = new t3d.Vector3();
		for (let i = 0; i < size; i++) {
			for (let j = 0; j < size; j++) {
				v3.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0).normalize();
				data[n++] = (v3.x * 0.5 + 0.5) * 255;
				data[n++] = (v3.y * 0.5 + 0.5) * 255;
				data[n++] = 0;
				data[n++] = 255;
			}
		}
		return data;
	}
	const ssaoShader = {
		name: 'ec_ssao',
		defines: {
			ALCHEMY: false,
			DEPTH_PACKING: 0,
			KERNEL_SIZE: 64,
			AUTO_SAMPLE_WEIGHT: false
		},
		uniforms: {
			normalTex: null,
			depthTex: null,
			texSize: [512, 512],
			noiseTex: null,
			noiseTexSize: [4, 4],
			projection: new Float32Array(16),
			projectionInv: new Float32Array(16),
			viewInverseTranspose: new Float32Array(16),
			kernel: null,
			radius: 0.2,
			power: 1,
			bias: 0.0001,
			intensity: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				#include <packing>

				varying vec2 v_Uv;

				uniform sampler2D normalTex;
				uniform sampler2D depthTex;
				uniform vec2 texSize;

				uniform sampler2D noiseTex;
				uniform vec2 noiseTexSize;

				uniform mat4 projection;
				uniform mat4 projectionInv;
				uniform mat4 viewInverseTranspose;

				uniform vec3 kernel[KERNEL_SIZE];

				uniform float radius;
				uniform float power;
				uniform float bias;
				uniform float intensity;

		${octahedronToUnitVectorGLSL}

				float getDepth(const in vec2 screenPosition) {
						#if DEPTH_PACKING == 1
								return unpackRGBAToDepth(texture2D(depthTex, screenPosition));
						#else
								return texture2D(depthTex, screenPosition).r;
						#endif
				}

				vec3 getViewNormal(const in vec2 screenPosition) {
						vec3 normal = octahedronToUnitVector(texture2D(normalTex, screenPosition).rg);
						// Convert to view space
						return (viewInverseTranspose * vec4(normal, 0.0)).xyz;
				}

				float ssaoEstimator(in mat3 kernelBasis, in vec3 originPos, in vec3 N) {
						float occlusion = 0.0;

			float allWeight = 0.0;

						for (int i = 0; i < KERNEL_SIZE; i++) {
								vec3 samplePos = kernel[i];
								samplePos = kernelBasis * samplePos;
								samplePos = samplePos * radius + originPos;

								vec4 texCoord = projection * vec4(samplePos, 1.0);
								texCoord.xy /= texCoord.w;
								texCoord.xy = texCoord.xy * 0.5 + 0.5;

								float sampleDepth = getDepth(texCoord.xy);
								float z = sampleDepth * 2.0 - 1.0;

				vec4 projectedPos = vec4(texCoord.xy * 2.0 - 1.0, z, 1.0);
				vec4 p4 = projectionInv * projectedPos;
				p4.xyz /= p4.w;

								#ifdef ALCHEMY
										vec3 cDir = p4.xyz - originPos;

										float vv = dot(cDir, cDir);
										float vn = dot(cDir, N);

										float radius2 = radius * radius;
										vn = max(vn + p4.z * bias, 0.0);
										float f = max(radius2 - vv, 0.0) / radius2;
										occlusion += f * f * f * max(vn / (0.01 + vv), 0.0);

					allWeight += 1.0;
								#else
					float factor = step(samplePos.z, p4.z - bias);
					float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - p4.z));

					#ifdef AUTO_SAMPLE_WEIGHT
						float weight = smoothstep(0., radius, radius - length(originPos.xy - samplePos.xy));
					#else
						float weight = 1.0;
					#endif
					
					occlusion += rangeCheck * factor * weight;
					allWeight += weight;
								#endif
						}

						occlusion = 1.0 - occlusion / allWeight;

						return pow(occlusion, power);
				}

				void main() {
						float centerDepth = getDepth(v_Uv);
						if(centerDepth >= (1.0 - EPSILON)) {
								discard;
						}

						vec3 N = getViewNormal(v_Uv);

						vec2 noiseTexCoord = texSize / vec2(noiseTexSize) * v_Uv;
						vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;

						// Tangent
						vec3 T = normalize(rvec - N * dot(rvec, N));
						// Bitangent
						vec3 BT = normalize(cross(N, T));

						mat3 kernelBasis = mat3(T, BT, N);

						// view position
						float z = centerDepth * 2.0 - 1.0;
						vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, z, 1.0);
						vec4 p4 = projectionInv * projectedPos;
						vec3 position = p4.xyz / p4.w;

						float ao = ssaoEstimator(kernelBasis, position, N);
						ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);

						gl_FragColor = vec4(vec3(ao), 1.0);
				}
		`
	};

	class SSREffect extends Effect {
		constructor() {
			super();
			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'GBuffer'
			}];

			// Single step distance, unit is pixel
			this.pixelStride = 8;
			// Dichotomy search depends on precise collision point, maximum number of iterations
			this.maxIteration = 5;
			// Number of steps
			this.maxSteps = 50;

			// The farthest reflection distance limit, in meters
			this.maxRayDistance = 200;

			// Adjust the step pixel distance according to the depth,
			// the step in and out becomes larger,
			// and the step in the distance becomes smaller.
			this.enablePixelStrideZCutoff = true;
			// ray origin Z at this distance will have a pixel stride of 1.0
			this.pixelStrideZCutoff = 50;

			// distance to screen edge that ray hits will start to fade (0.0 -> 1.0)
			this.screenEdgeFadeStart = 0.9;

			// ray direction's Z that ray hits will start to fade (0.0 -> 1.0)
			this.eyeFadeStart = 0.99;
			// ray direction's Z that ray hits will be cut (0.0 -> 1.0)
			this.eyeFadeEnd = 1;

			// Object larger than minGlossiness will have ssr effect
			this.minGlossiness = 0.2;

			// the strength of ssr effect
			this.strength = 0.2;

			// the falloff of base color when mix with ssr color
			this.falloff = 0;

			// the threshold of z thickness
			this.zThicknessThreshold = 0.5;

			// When turned on, the reflection effect will become more blurred as the Roughness increases,
			// but it will also cause more noise.
			// Noise can be reduced by turning on TAA.
			this.importanceSampling = false;
			this.blurSize = 2;
			this.depthRange = 1;
			this.downScaleLevel = 0;
			this.jitter = true;
			this._copyRGBPass = new t3d.ShaderPostPass(copyRGBShader);
			this._ssrPass = new t3d.ShaderPostPass(ssrShader);
			this._blurPass = new t3d.ShaderPostPass(blurShader);
			this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
			this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;
			this._blendPass = new t3d.ShaderPostPass(mixSSRShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(this.downScaleLevel);
			const tempRT2 = composer._renderTargetCache.allocate(this.downScaleLevel);
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const gBuffer = composer.getBuffer('GBuffer');
			const gBufferRenderStates = gBuffer.getCurrentRenderStates();
			projection.copy(gBufferRenderStates.camera.projectionMatrix);
			projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
			viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

			// Step 1: ssr pass

			renderer.setRenderTarget(tempRT1);
			if (inputRenderTarget) {
				this._copyRGBPass.uniforms.tDiffuse = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._copyRGBPass.render(renderer); // clear rgb channel to scene color and alpha channel to 0
			} else {
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
			}
			this._ssrPass.uniforms.colorTex = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssrPass.uniforms.gBufferTexture1 = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssrPass.uniforms.gBufferTexture2 = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._ssrPass.uniforms.viewportSize[0] = gBuffer.output().width;
			this._ssrPass.uniforms.viewportSize[1] = gBuffer.output().height;
			projection.toArray(this._ssrPass.uniforms.projection);
			projectionInv.toArray(this._ssrPass.uniforms.projectionInv);
			viewInverseTranspose.toArray(this._ssrPass.uniforms.viewInverseTranspose);
			this._ssrPass.uniforms.pixelStride = this.pixelStride;
			this._ssrPass.uniforms.maxRayDistance = this.maxRayDistance;
			this._ssrPass.uniforms.enablePixelStrideZCutoff = this.enablePixelStrideZCutoff ? 1 : 0;
			this._ssrPass.uniforms.pixelStrideZCutoff = this.pixelStrideZCutoff;
			this._ssrPass.uniforms.screenEdgeFadeStart = this.screenEdgeFadeStart;
			this._ssrPass.uniforms.eyeFadeStart = this.eyeFadeStart;
			this._ssrPass.uniforms.eyeFadeEnd = this.eyeFadeEnd;
			this._ssrPass.uniforms.minGlossiness = this.minGlossiness;
			this._ssrPass.uniforms.nearZ = gBufferRenderStates.camera.near;
			this._ssrPass.uniforms.zThicknessThreshold = this.zThicknessThreshold;
			const cameraJitter = composer.$cameraJitter;
			this._ssrPass.uniforms.jitterOffset = this.jitter && cameraJitter.accumulating() ? cameraJitter.frame() * 0.5 / cameraJitter.totalFrame() : 0;
			if (this._ssrPass.material.defines.MAX_ITERATION != this.maxSteps || this._ssrPass.material.defines.MAX_BINARY_SEARCH_ITERATION != this.maxIteration) {
				this._ssrPass.material.needsUpdate = true;
				this._ssrPass.material.defines.MAX_ITERATION = this.maxSteps;
				this._ssrPass.material.defines.MAX_BINARY_SEARCH_ITERATION = this.maxIteration;
			}
			const importanceSampling = !!this.importanceSampling;
			if (importanceSampling !== this._ssrPass.material.defines.IMPORTANCE_SAMPLING) {
				this._ssrPass.material.needsUpdate = true;
				this._ssrPass.material.defines.IMPORTANCE_SAMPLING = importanceSampling;
			}
			this._ssrPass.render(renderer);

			// Step 2: blurX pass

			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.normalTex = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._blurPass.uniforms.depthTex = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._blurPass.uniforms.textureSize[0] = gBuffer.output().width;
			this._blurPass.uniforms.textureSize[1] = gBuffer.output().height;
			projection.toArray(this._blurPass.uniforms.projection);
			viewInverseTranspose.toArray(this._blurPass.uniforms.viewInverseTranspose);
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.uniforms.depthRange = this.depthRange;
			this._blurPass.uniforms.direction = 0;
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.render(renderer);

			// Step 3: blurY pass

			renderer.setRenderTarget(inputRenderTarget ? tempRT1 : outputRenderTarget);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.render(renderer);

			// Step 4: blend pass

			if (inputRenderTarget) {
				renderer.setRenderTarget(outputRenderTarget);
				renderer.setClearColor(0, 0, 0, 0);
				if (finish) {
					renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
				} else {
					renderer.clear(true, true, false);
				}
				this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
				this._blendPass.uniforms.texture2 = tempRT1.texture;
				this._blendPass.uniforms.strength = this.strength;
				this._blendPass.uniforms.falloff = this.falloff;
				if (finish) {
					this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
					this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
				}
				this._blendPass.render(renderer);
				if (finish) {
					this._blendPass.material.transparent = false;
					this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
				}
			}
			composer._renderTargetCache.release(tempRT1, this.downScaleLevel);
			composer._renderTargetCache.release(tempRT2, this.downScaleLevel);
		}
		dispose() {
			this._ssrPass.dispose();
			this._blurPass.dispose();
			this._blendPass.dispose();
		}
	}
	const projection = new t3d.Matrix4();
	const projectionInv = new t3d.Matrix4();
	const viewInverseTranspose = new t3d.Matrix4();
	const ssrShader = {
		name: 'ec_ssr',
		defines: {
			MAX_ITERATION: 50,
			MAX_BINARY_SEARCH_ITERATION: 5,
			IMPORTANCE_SAMPLING: false
		},
		uniforms: {
			colorTex: null,
			gBufferTexture1: null,
			gBufferTexture2: null,
			projection: new Float32Array(16),
			projectionInv: new Float32Array(16),
			viewInverseTranspose: new Float32Array(16),
			pixelStride: 8,
			maxRayDistance: 200,
			enablePixelStrideZCutoff: 1.0,
			pixelStrideZCutoff: 50,
			screenEdgeFadeStart: 0.9,
			eyeFadeStart: 0.99,
			eyeFadeEnd: 1,
			minGlossiness: 0.2,
			nearZ: 0.1,
			zThicknessThreshold: 0.5,
			jitterOffset: 0,
			viewportSize: [512, 512]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		varying vec2 v_Uv;

		uniform sampler2D colorTex;
		uniform sampler2D gBufferTexture1;
		uniform sampler2D gBufferTexture2;

		uniform mat4 projection;
		uniform mat4 projectionInv;
		uniform mat4 viewInverseTranspose;

		uniform float pixelStride;

		uniform float maxRayDistance;

		uniform float screenEdgeFadeStart;
	
		uniform float enablePixelStrideZCutoff;
		uniform float pixelStrideZCutoff;

		uniform float eyeFadeStart;
		uniform float eyeFadeEnd;
		
		uniform float minGlossiness;
		uniform float zThicknessThreshold;
		uniform float jitterOffset;

		uniform float nearZ;
		uniform vec2 viewportSize;

		${octahedronToUnitVectorGLSL}

		float fetchDepth(sampler2D depthTexture, vec2 uv) {
			vec4 depthTexel = texture2D(depthTexture, uv);
			return depthTexel.r * 2.0 - 1.0;
		}

		float linearDepth(float depth) {
			return projection[3][2] / (depth * projection[2][3] - projection[2][2]);
		}

		bool rayIntersectDepth(float rayZNear, float rayZFar, vec2 hitPixel) {
			// Swap if bigger
			if (rayZFar > rayZNear) {
				float t = rayZFar; rayZFar = rayZNear; rayZNear = t;
			}
			float cameraZ = linearDepth(fetchDepth(gBufferTexture2, hitPixel));
			// float cameraBackZ = linearDepth(fetchDepth(backDepthTex, hitPixel));
			// Cross z
			return rayZFar <= cameraZ && rayZNear >= cameraZ - zThicknessThreshold;
		}

		#ifdef IMPORTANCE_SAMPLING
			float interleavedGradientNoise(const in vec2 fragCoord, const in float frameMod) {
				vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
				return fract(magic.z * fract(dot(fragCoord.xy + frameMod * vec2(47.0, 17.0) * 0.695, magic.xy)));
			}

			vec3 unrealImportanceSampling(const in float frameMod, const in vec3 tangentX, const in vec3 tangentY, const in vec3 tangentZ, const in vec3 eyeVector, const in float rough4) {
				vec2 E;
				E.x = interleavedGradientNoise(gl_FragCoord.yx, frameMod);
				E.y = fract(E.x * 52.9829189);
				E.y = mix(E.y, 1.0, 0.7);

				float phi = 2.0 * 3.14159 * E.x;
				float cosTheta = pow(max(E.y, 0.000001), rough4 / (2.0 - rough4));
				float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

				vec3 h = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
				h = h.x * tangentX + h.y * tangentY + h.z * tangentZ;
				return normalize((2.0 * dot(eyeVector, h)) * h - eyeVector);
			}
		#endif

		// Trace a ray in screenspace from rayOrigin (in camera space) pointing in rayDir (in camera space)
		//
		// With perspective correct interpolation
		//
		// Returns true if the ray hits a pixel in the depth buffer
		// and outputs the hitPixel (in UV space), the hitPoint (in camera space) and the number
		// of iterations it took to get there.
		//
		// Based on Morgan McGuire & Mike Mara's GLSL implementation:
		// http://casual-effects.blogspot.com/2014/08/screen-space-ray-tracing.html
		bool traceScreenSpaceRay(vec3 rayOrigin, vec3 rayDir, float jitter, out vec2 hitPixel, out vec3 hitPoint, out float iterationCount) {
			// Clip to the near plane
			float rayLength = ((rayOrigin.z + rayDir.z * maxRayDistance) > -nearZ) ? (-nearZ - rayOrigin.z) / rayDir.z : maxRayDistance;

			vec3 rayEnd = rayOrigin + rayDir * rayLength;

			// Project into homogeneous clip space
			vec4 H0 = projection * vec4(rayOrigin, 1.0);
			vec4 H1 = projection * vec4(rayEnd, 1.0);

			float k0 = 1.0 / H0.w, k1 = 1.0 / H1.w;

			// The interpolated homogeneous version of the camera space points
			vec3 Q0 = rayOrigin * k0, Q1 = rayEnd * k1;

			// Screen space endpoints
			// PENDING viewportSize ?
			vec2 P0 = (H0.xy * k0 * 0.5 + 0.5) * viewportSize;
			vec2 P1 = (H1.xy * k1 * 0.5 + 0.5) * viewportSize;

			// If the line is degenerate, make it cover at least one pixel to avoid handling
			// zero-pixel extent as a special case later
			P1 += dot(P1 - P0, P1 - P0) < 0.0001 ? 0.01 : 0.0;
			vec2 delta = P1 - P0;

			// Permute so that the primary iteration is in x to collapse
			// all quadrant-specific DDA case later
			bool permute = false;
			if (abs(delta.x) < abs(delta.y)) {
				// More vertical line
				permute = true;
				delta = delta.yx;
				P0 = P0.yx;
				P1 = P1.yx;
			}
			float stepDir = sign(delta.x);
			float invdx = stepDir / delta.x;

			// Track the derivatives of Q and K
			vec3 dQ = (Q1 - Q0) * invdx;
			float dk = (k1 - k0) * invdx;

			vec2 dP = vec2(stepDir, delta.y * invdx);

			// Calculate pixel stride based on distance of ray origin from camera.
			// Since perspective means distant objects will be smaller in screen space
			// we can use this to have higher quality reflections for far away objects
			// while still using a large pixel stride for near objects (and increase performance)
			// this also helps mitigate artifacts on distant reflections when we use a large
			// pixel stride.
			float strideScaler = 1.0 - min(1.0, -rayOrigin.z / pixelStrideZCutoff);
			float pixStride = mix(pixelStride, 1.0 + strideScaler * pixelStride, enablePixelStrideZCutoff);

			// Scale derivatives by the desired pixel stride and the offset the starting values by the jitter fraction
			dP *= pixStride; dQ *= pixStride; dk *= pixStride;

			// Track ray step and derivatives in a vec4 to parallelize
			vec4 pqk = vec4(P0, Q0.z, k0);
			vec4 dPQK = vec4(dP, dQ.z, dk);

			pqk += dPQK * jitter;
			float rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);
			float rayZNear;

			bool intersect = false;

			vec2 texelSize = 1.0 / viewportSize;

			iterationCount = 0.0;
			float end = P1.x * stepDir;
			for (int i = 0; i < MAX_ITERATION; i++) {
				pqk += dPQK;
				if ((pqk.x * stepDir) >= end) {
					break;
				}

				rayZNear = rayZFar;
				rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);

				hitPixel = permute ? pqk.yx : pqk.xy;
				hitPixel *= texelSize;

				intersect = rayIntersectDepth(rayZNear, rayZFar, hitPixel);

				iterationCount += 1.0;

				// PENDING Right on all platforms?
				if (intersect) {
					break;
				}
			}

			// Binary search refinement
			// FIXME If intersect in first iteration binary search may easily lead to the pixel of reflect object it self
			if (pixStride > 1.0 && intersect && iterationCount > 1.0) {
				// Roll back
				pqk -= dPQK;
				dPQK /= pixStride;

				float originalStride = pixStride * 0.5;
				float stride = originalStride;

				rayZNear = pqk.z / pqk.w;
				rayZFar = rayZNear;

				for (int j = 0; j < MAX_BINARY_SEARCH_ITERATION; j++) {
					pqk += dPQK * stride;
					rayZNear = rayZFar;
					rayZFar = (dPQK.z * -0.5 + pqk.z) / (dPQK.w * -0.5 + pqk.w);
					hitPixel = permute ? pqk.yx : pqk.xy;
					hitPixel *= texelSize;

					originalStride *= 0.5;
					stride = rayIntersectDepth(rayZNear, rayZFar, hitPixel) ? -originalStride : originalStride;
				}
			}

			Q0.xy += dQ.xy * iterationCount;
			Q0.z = pqk.z;
			hitPoint = Q0 / pqk.w;

			return intersect;
		}

		float calculateAlpha(float iterationCount, float reflectivity, vec2 hitPixel, vec3 hitPoint, float dist, vec3 rayDir) {
			float alpha = clamp(reflectivity, 0.0, 1.0);

			// Fade ray hits that approach the maximum iterations
			alpha *= 1.0 - (iterationCount / float(MAX_ITERATION));

			// Fade ray hits that approach the screen edge
			vec2 hitPixelNDC = hitPixel * 2.0 - 1.0;
			float maxDimension = min(1.0, max(abs(hitPixelNDC.x), abs(hitPixelNDC.y)));
			alpha *= 1.0 - max(0.0, maxDimension - screenEdgeFadeStart) / (1.0 - screenEdgeFadeStart);

			// Fade ray hits base on how much they face the camera
			float _eyeFadeStart = eyeFadeStart;
			float _eyeFadeEnd = eyeFadeEnd;
			if (_eyeFadeStart > _eyeFadeEnd) {
				float tmp = _eyeFadeEnd;
				_eyeFadeEnd = _eyeFadeStart;
				_eyeFadeStart = tmp;
			}
			float eyeDir = clamp(rayDir.z, _eyeFadeStart, _eyeFadeEnd);
			alpha *= 1.0 - (eyeDir - _eyeFadeStart) / (_eyeFadeEnd - _eyeFadeStart);

			// Fade ray hits based on distance from ray origin
			alpha *= 1.0 - clamp(dist / maxRayDistance, 0.0, 1.0);

			return alpha;
		}
		void main() {
			vec4 gBufferTexel = texture2D(gBufferTexture1, v_Uv);

			if (gBufferTexel.r < -2.0) {
				discard;
			}

			float g = 1. - gBufferTexel.a;
			if (g <= minGlossiness) {
				discard;
			}

			float reflectivity = g;

			vec3 N = octahedronToUnitVector(gBufferTexel.rg);
			N = normalize((viewInverseTranspose * vec4(N, 0.0)).xyz);

			// Position in view
			vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, fetchDepth(gBufferTexture2, v_Uv), 1.0);
			vec4 pos = projectionInv * projectedPos;
			vec3 rayOrigin = pos.xyz / pos.w;

			vec3 rayDir;
			#ifdef IMPORTANCE_SAMPLING
				vec3 upVector = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangentX = normalize(cross(upVector, N));
				vec3 tangentY = normalize(cross(N, tangentX));
				vec3 tangentZ = N;
				rayDir = unrealImportanceSampling(jitterOffset * 20., tangentX, tangentY, tangentZ, -rayOrigin, pow(gBufferTexel.a, 4.0));
			#else
				rayDir = normalize(reflect(normalize(rayOrigin), N));
			#endif

			vec2 hitPixel;
			vec3 hitPoint;
			float iterationCount;

			// Get jitter
			vec2 uv2 = v_Uv * viewportSize;
			float jitter = fract((uv2.x + uv2.y) * 0.25) + jitterOffset;

			bool intersect = traceScreenSpaceRay(rayOrigin, rayDir, jitter, hitPixel, hitPoint, iterationCount);
			// Is empty
			if (!intersect) {
				discard;
			}
			float dist = distance(rayOrigin, hitPoint);

			float alpha = calculateAlpha(iterationCount, reflectivity, hitPixel, hitPoint, dist, rayDir) * float(intersect);

			vec3 hitNormal = octahedronToUnitVector(texture2D(gBufferTexture1, hitPixel).rg);
			hitNormal = normalize((viewInverseTranspose * vec4(hitNormal, 0.0)).xyz);

			// Ignore the pixel not face the ray
			// TODO fadeout ?
			// PENDING Can be configured?
			if (dot(hitNormal, rayDir) >= 0.0) {
				discard;
			}

			vec4 color = texture2D(colorTex, hitPixel);
			gl_FragColor = vec4(color.rgb, color.a * alpha);
		}
		`
	};
	const copyRGBShader = {
		name: 'ec_copy_rgb',
		defines: {},
		uniforms: {
			tDiffuse: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform sampler2D tDiffuse;

				varying vec2 v_Uv;

				void main() {
			vec3 color = texture2D(tDiffuse, v_Uv).rgb;
						gl_FragColor = vec4(color, 0.0);
				}
		`
	};
	const mixSSRShader = {
		name: 'ec_ssr_mix',
		defines: {},
		uniforms: {
			texture1: null,
			texture2: null,
			strength: 0.15,
			falloff: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform sampler2D texture1;
				uniform sampler2D texture2;
		uniform float strength;
		uniform float falloff;
				varying vec2 v_Uv;
				void main() {
			vec4 baseColor = texture2D(texture1, v_Uv);
			vec4 ssrColor = texture2D(texture2, v_Uv);

			float reflectivity = ssrColor.a * strength;
			vec3 finalColor = baseColor.rgb * (1.0 - reflectivity * falloff) + ssrColor.rgb * reflectivity;

			gl_FragColor = vec4(finalColor, baseColor.a);
				}
		`
	};

	class TAAEffect extends Effect {
		constructor() {
			super();
			this.needCameraJitter = true;
			this.bufferDependencies = [{
				key: 'AccumulationBuffer'
			}];
			this._accumPass = new t3d.ShaderPostPass(accumulateShader);
			this._copyPass = new t3d.ShaderPostPass(copyShader);
			this._reset = true;
			this._accumulating = true;
			this.onFinish = null;
		}
		reset() {
			this._reset = true;
		}
		resize(width, height) {
			this._reset = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const cameraJitter = composer.$cameraJitter;
			if (this._reset) {
				cameraJitter.reset();
				this._reset = false;
			}
			const accumBuffer = composer.getBuffer('AccumulationBuffer');
			if (cameraJitter.accumulating()) {
				renderer.setRenderTarget(accumBuffer.output());
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, false, false);
				this._accumPass.uniforms.currTexture = inputRenderTarget.texture;
				this._accumPass.uniforms.prevTexture = accumBuffer.accumRT().texture;
				this._accumPass.uniforms.mixRatio = cameraJitter.frame() === 0 ? 0 : 0.9;
				this._accumPass.render(renderer);
				this._accumulating = true;
			} else {
				if (this._accumulating) {
					this.onFinish && this.onFinish();
					this._accumulating = false;
				}
			}
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const copyPass = this._copyPass;
			copyPass.uniforms.tDiffuse = accumBuffer.output().texture;
			if (finish) {
				copyPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				copyPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			copyPass.render(renderer);
			if (finish) {
				copyPass.material.transparent = false;
				copyPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			accumBuffer.swap();
		}
		dispose() {
			super.dispose();
			this._accumPass.dispose();
			this._copyPass.dispose();
		}
	}
	const accumulateShader = {
		name: 'accum',
		defines: {},
		uniforms: {
			mixRatio: 0.9
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform sampler2D currTexture;
				uniform sampler2D prevTexture;

				uniform float mixRatio;

				varying vec2 v_Uv;

				void main() {
						vec4 texel1 = texture2D(currTexture, v_Uv);
						vec4 texel2 = texture2D(prevTexture, v_Uv);
						gl_FragColor = mix(texel1, texel2, mixRatio);
				}
		`
	};

	// Tone Mapping normally deals with the conversion of HDR to LDR.
	class ToneMappingEffect extends Effect {
		constructor() {
			super();
			this.toneMapping = ToneMappingType.Reinhard;
			this.toneMappingExposure = 1;
			this.outputColorSpace = t3d.TEXEL_ENCODING_TYPE.SRGB;
			this._mainPass = new t3d.ShaderPostPass(shader$1);
			this._toneMapping = null;
			this._outputColorSpace = null;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			const mainPass = this._mainPass;
			mainPass.uniforms.tDiffuse = inputRenderTarget.texture;
			mainPass.uniforms.toneMappingExposure = this.toneMappingExposure;
			if (this._toneMapping !== this.toneMapping || this._outputColorSpace !== this.outputColorSpace) {
				this._toneMapping = this.toneMapping;
				this._outputColorSpace = this.outputColorSpace;
				mainPass.material.defines = {};
				if (this._toneMapping === ToneMappingType.Linear) mainPass.material.defines.LINEAR_TONE_MAPPING = '';else if (this._toneMapping === ToneMappingType.Reinhard) mainPass.material.defines.REINHARD_TONE_MAPPING = '';else if (this._toneMapping === ToneMappingType.Cineon) mainPass.material.defines.CINEON_TONE_MAPPING = '';else if (this._toneMapping === ToneMappingType.ACESFilmic) mainPass.material.defines.ACES_FILMIC_TONE_MAPPING = '';else if (this._toneMapping === ToneMappingType.Neutral) mainPass.material.defines.NEUTRAL_TONE_MAPPING = '';else if (this._toneMapping === ToneMappingType.AgX) mainPass.material.defines.AGX_TONE_MAPPING = '';
				if (this._outputColorSpace === t3d.TEXEL_ENCODING_TYPE.SRGB) mainPass.material.defines.SRGB_COLOR_SPACE = '';
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
	const shader$1 = {
		name: 'ec_tone_mapping',
		defines: {},
		uniforms: {
			tDiffuse: null,
			toneMappingExposure: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform float toneMappingExposure;

		uniform sampler2D tDiffuse;
		varying vec2 v_Uv;

		#ifdef LINEAR_TONE_MAPPING
			// exposure only
			vec3 LinearToneMapping(vec3 color) {
				return saturate(toneMappingExposure * color);
			}
		#elif defined(REINHARD_TONE_MAPPING)
			// source: https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
			vec3 ReinhardToneMapping(vec3 color) {
				color *= toneMappingExposure;
				return saturate(color / (vec3(1.0) + color));
			}
		#elif defined(CINEON_TONE_MAPPING)
			// source: http://filmicworlds.com/blog/filmic-tonemapping-operators/
			vec3 OptimizedCineonToneMapping(vec3 color) {
				// optimized filmic operator by Jim Hejl and Richard Burgess-Dawson
				color *= toneMappingExposure;
				color = max(vec3(0.0), color - 0.004);
				return pow((color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
			}
		#elif defined(ACES_FILMIC_TONE_MAPPING)
			// source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
			vec3 RRTAndODTFit(vec3 v) {
				vec3 a = v * (v + 0.0245786) - 0.000090537;
				vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
				return a / b;
			}

			// this implementation of ACES is modified to accommodate a brighter viewing environment.
			// the scale factor of 1/0.6 is subjective. see discussion in https://github.com/mrdoob/three.js/pull/19621.
			vec3 ACESFilmicToneMapping(vec3 color) {
				// sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
				const mat3 ACESInputMat = mat3(
					vec3(0.59719, 0.07600, 0.02840), // transposed from source
					vec3(0.35458, 0.90834, 0.13383),
					vec3(0.04823, 0.01566, 0.83777)
				);
				// ODT_SAT => XYZ => D60_2_D65 => sRGB
				const mat3 ACESOutputMat = mat3(
					vec3( 1.60475, -0.10208, -0.00327), // transposed from source
					vec3(-0.53108,	1.10813, -0.07276),
					vec3(-0.07367, -0.00605,	1.07602)
				);
				color *= toneMappingExposure / 0.6;
				color = ACESInputMat * color;
				// Apply RRT and ODT
				color = RRTAndODTFit(color);
				color = ACESOutputMat * color;
				// Clamp to [0, 1]
				return saturate(color);
			}
		#elif defined(NEUTRAL_TONE_MAPPING)
			vec3 NeutralToneMapping(vec3 color) {
				const float StartCompression = 0.8 - 0.04;
				const float Desaturation = 0.15;
				color *= toneMappingExposure;
				float x = min(color.r, min(color.g, color.b));
				float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
				color -= offset;
				float peak = max(color.r, max(color.g, color.b));
				if (peak < StartCompression) return color;
				float d = 1. - StartCompression;
				float newPeak = 1. - d * d / (peak + d - StartCompression);
				color *= newPeak / peak;
				float g = 1. - 1. / (Desaturation * (peak - newPeak) + 1.);
				return mix(color, vec3(newPeak), g);
			}
		#elif defined(AGX_TONE_MAPPING)
			// Matrices for rec 2020 <> rec 709 color space conversion
			// matrix provided in row-major order so it has been transposed
			// https://www.itu.int/pub/R-REP-BT.2407-2017
			const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
				vec3(1.6605, -0.1246, -0.0182),
				vec3(-0.5876, 1.1329, -0.1006),
				vec3(-0.0728, -0.0083, 1.1187)
			);

			const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
				vec3(0.6274, 0.0691, 0.0164),
				vec3(0.3293, 0.9195, 0.0880),
				vec3(0.0433, 0.0113, 0.8956)
			);

			// https://iolite-engine.com/blog_posts/minimal_agx_implementation
			// Mean error^2: 3.6705141e-06
			vec3 agxDefaultContrastApprox(vec3 x) {
				vec3 x2 = x * x;
				vec3 x4 = x2 * x2;

				return + 15.5 * x4 * x2
					- 40.14 * x4 * x
					+ 31.96 * x4
					- 6.868 * x2 * x
					+ 0.4298 * x2
					+ 0.1191 * x
					- 0.00232;
			}

			// AgX Tone Mapping implementation based on Filament, which in turn is based
			// on Blender's implementation using rec 2020 primaries
			// https://github.com/google/filament/pull/7236
			// Inputs and outputs are encoded as Linear-sRGB.
			vec3 AgXToneMapping(vec3 color) {
				// AgX constants
				const mat3 AgXInsetMatrix = mat3(
					vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
					vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
					vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
				);

				// explicit AgXOutsetMatrix generated from Filaments AgXOutsetMatrixInv
				const mat3 AgXOutsetMatrix = mat3(
					vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
					vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
					vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
				);

				// LOG2_MIN			= -10.0
				// LOG2_MAX			=	+6.5
				// MIDDLE_GRAY	 =	0.18
				const float AgxMinEv = -12.47393;	// log2(pow(2, LOG2_MIN) * MIDDLE_GRAY)
				const float AgxMaxEv = 4.026069;	 // log2(pow(2, LOG2_MAX) * MIDDLE_GRAY)

				color *= toneMappingExposure;

				color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;

				color = AgXInsetMatrix * color;

				// Log2 encoding
				color = max(color, 1e-10); // avoid 0 or negative numbers for log2
				color = log2(color);
				color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv);

				color = clamp(color, 0.0, 1.0);

				// Apply sigmoid
				color = agxDefaultContrastApprox(color);

				// Apply AgX look
				// v = agxLook(v, look);

				color = AgXOutsetMatrix * color;

				// Linearize
				color = pow(max(vec3(0.0), color), vec3(2.2));

				color = LINEAR_REC2020_TO_LINEAR_SRGB * color;

				// Gamut mapping. Simple clamp for now.
				color = clamp(color, 0.0, 1.0);

				return color;
			}
		#endif

		void main() {
			gl_FragColor = texture2D(tDiffuse, v_Uv);

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING
				gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
			#elif defined(REINHARD_TONE_MAPPING)
				gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
			#elif defined(CINEON_TONE_MAPPING)
				gl_FragColor.rgb = OptimizedCineonToneMapping(gl_FragColor.rgb);
			#elif defined(ACES_FILMIC_TONE_MAPPING)
				gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
			#elif defined(NEUTRAL_TONE_MAPPING)
				gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
			#elif defined(AGX_TONE_MAPPING)
				gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
			#endif

			// color space

			#ifdef SRGB_COLOR_SPACE
				gl_FragColor = LinearTosRGB(gl_FragColor);
			#endif
		}
		`
	};

	class VignettingEffect extends Effect {
		constructor() {
			super();
			this.color = new t3d.Color3(0, 0, 0);
			this.offset = 1.0;
			this._vignettingPass = new t3d.ShaderPostPass(vignettingShader);
			this._vignettingPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const vignettingPass = this._vignettingPass;
			vignettingPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this.color.toArray(vignettingPass.uniforms.vignettingColor);
			vignettingPass.uniforms.vignettingOffset = this.offset;
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			if (finish) {
				vignettingPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				vignettingPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			vignettingPass.render(renderer);
			if (finish) {
				vignettingPass.material.transparent = false;
				vignettingPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
		}
		dispose() {
			this._vignettingPass.dispose();
		}
	}
	const vignettingShader = {
		name: 'ec_vignetting_blend',
		defines: {},
		uniforms: {
			tDiffuse: null,
			vignettingColor: [0, 0, 0],
			vignettingOffset: 1.0
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform vec3 vignettingColor;
		uniform float vignettingOffset;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				void main() {
						vec4 color = texture2D(tDiffuse, v_Uv);
						vec2 uv = (v_Uv - vec2(0.5)) * vec2(vignettingOffset);
			color.rgb = mix(color.rgb, vignettingColor, clamp(dot(uv, uv), 0.0, 1.0));
			gl_FragColor = color;
				}
		`
	};

	class BlurEdgeEffect extends Effect {
		constructor() {
			super();
			this.offset = 1.0;
			this._hBlurPass = new t3d.ShaderPostPass(horizontalBlurShader);
			this._vBlurPass = new t3d.ShaderPostPass(verticalBlurShader);
			this._blendPass = new t3d.ShaderPostPass(blurBlendShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._hBlurPass.uniforms.h = 4 / width;
			this._vBlurPass.uniforms.v = 4 / height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(1);
			const tempRT2 = composer._renderTargetCache.allocate(1);
			const blendPass = this._blendPass;

			// Step 1: blur x
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._hBlurPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this._hBlurPass.render(renderer);
			// Step 2: blur y
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._vBlurPass.uniforms.tDiffuse = tempRT1.texture;
			this._vBlurPass.render(renderer);
			// Step 3: blend
			blendPass.uniforms.tDiffuse = inputRenderTarget.texture;
			blendPass.uniforms.blurOffset = this.offset;
			blendPass.uniforms.blurTexture = tempRT2.texture;
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			if (finish) {
				blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			blendPass.render(renderer);
			if (finish) {
				blendPass.material.transparent = false;
				blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 1);
			composer._renderTargetCache.release(tempRT2, 1);
		}
		dispose() {
			this._hBlurPass.dispose();
			this._vBlurPass.dispose();
			this._blendPass.dispose();
		}
	}
	const blurBlendShader = {
		name: 'ec_blur_blend',
		defines: {},
		uniforms: {
			tDiffuse: null,
			blurOffset: 1.0,
			blurTexture: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform float blurOffset;

				uniform sampler2D blurTexture;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				void main() {
						vec4 color = texture2D(tDiffuse, v_Uv);
						vec2 uv = (v_Uv - vec2(0.5)) * vec2(blurOffset);

						vec3 color2 = texture2D(blurTexture, v_Uv).rgb;

			color.rgb = mix(color.rgb, color2, clamp(dot(uv, uv), 0.0, 1.0));
			gl_FragColor = color;
				}
		`
	};

	class OutlineEffect extends Effect {
		constructor() {
			super();
			this.bufferDependencies = [{
				key: 'NonDepthMarkBuffer'
			}];
			this.color = new t3d.Color3(1, 1, 1);
			this.thickness = 1.0;
			this.strength = 1.5;
			this._downsamplerPass = new t3d.ShaderPostPass(copyShader);
			this._edgeDetectionPass = new t3d.ShaderPostPass(edgeDetectionShader);
			this._blurPass = new t3d.ShaderPostPass(seperableBlurShader);
			this._blendPass = new t3d.ShaderPostPass(blendShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(1);
			const tempRT2 = composer._renderTargetCache.allocate(1);
			const markBuffer = composer.getBuffer('NonDepthMarkBuffer');
			const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._downsamplerPass.uniforms.tDiffuse = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._downsamplerPass.render(renderer);
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._edgeDetectionPass.uniforms.tDiffuse = tempRT1.texture;
			this._edgeDetectionPass.uniforms.texSize[0] = tempRT1.width;
			this._edgeDetectionPass.uniforms.texSize[1] = tempRT1.height;
			for (let i = 0; i < 4; i++) {
				this._edgeDetectionPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this.color.toArray(this._edgeDetectionPass.uniforms.edgeColor);
			this._edgeDetectionPass.render(renderer);
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.uniforms.texSize[0] = tempRT2.width;
			this._blurPass.uniforms.texSize[1] = tempRT2.height;
			this._blurPass.uniforms.direction[0] = 1;
			this._blurPass.uniforms.direction[1] = 0;
			this._blurPass.uniforms.kernelRadius = this.thickness;
			this._blurPass.render(renderer);
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.uniforms.direction[0] = 0;
			this._blurPass.uniforms.direction[1] = 1;
			this._blurPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.colorTexture = inputRenderTarget.texture;
			this._blendPass.uniforms.edgeTexture = tempRT2.texture;
			this._blendPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._blendPass.uniforms.strength = this.strength;
			for (let i = 0; i < 4; i++) {
				this._blendPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 1);
			composer._renderTargetCache.release(tempRT2, 1);
		}
		dispose() {
			this._downsamplerPass.dispose();
			this._edgeDetectionPass.dispose();
			this._blurPass.dispose();
			this._blendPass.dispose();
		}
	}
	const edgeDetectionShader = {
		name: 'ec_outline_edge',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [0.5, 0.5],
			edgeColor: [1, 1, 1],
			channelMask: [1, 0, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform vec2 texSize;
				uniform vec3 edgeColor;

		uniform vec4 channelMask;

				uniform sampler2D tDiffuse;
				varying vec2 v_Uv;

				void main() {
						vec2 invSize = 1.0 / texSize;
			vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
			float c1 = dot(texture2D(tDiffuse, v_Uv + uvOffset.xy), channelMask);
			float c2 = dot(texture2D(tDiffuse, v_Uv - uvOffset.xy), channelMask);
			float c3 = dot(texture2D(tDiffuse, v_Uv + uvOffset.yw), channelMask);
			float c4 = dot(texture2D(tDiffuse, v_Uv - uvOffset.yw), channelMask);
			float b1 = max(c1, c2);
			float b2 = max(c3, c4);
			float a = max(b1, b2);
			gl_FragColor = vec4(edgeColor, a);
				}
		`
	};
	const blendShader = {
		name: 'ec_outline_blend',
		defines: {},
		uniforms: {
			maskTexture: null,
			edgeTexture: null,
			colorTexture: null,
			strength: 1,
			channelMask: [1, 0, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
				uniform sampler2D maskTexture;
				uniform sampler2D edgeTexture;
				uniform float strength;

		uniform vec4 channelMask;

				uniform sampler2D colorTexture;
				varying vec2 v_Uv;

				void main() {
						vec4 edgeColor = texture2D(edgeTexture, v_Uv);
						vec4 maskColor = texture2D(maskTexture, v_Uv);

						vec4 outlineColor = edgeColor * strength;
			outlineColor.a *= (1.0 - dot(maskColor, channelMask));

						vec4 color = texture2D(colorTexture, v_Uv);
			
						color.rgb = outlineColor.rgb * outlineColor.a + color.rgb * (1. - outlineColor.a);
			color.a = outlineColor.a + color.a * (1. - outlineColor.a);

						gl_FragColor = color;
				}
		`
	};

	class InnerGlowEffect extends Effect {
		constructor() {
			super();
			this.bufferDependencies = [{
				key: 'MarkBuffer'
			}];
			this.color = new t3d.Color3(1, 1, 1);
			this.strength = 1.5;
			this.stride = 5;
			this._channelPass = new t3d.ShaderPostPass(channelShader);
			this._blurXPass = new t3d.ShaderPostPass(innerGlowXShader);
			this._blurYPass = new t3d.ShaderPostPass(innerGlowYShader);
			// this._blendPass = new ShaderPostPass(additiveShader);
			this._blendPass = new t3d.ShaderPostPass(tintShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		resize(width, height) {
			this._blurXPass.uniforms.texSize[0] = width;
			this._blurXPass.uniforms.texSize[1] = height;
			this._blurYPass.uniforms.texSize[0] = width;
			this._blurYPass.uniforms.texSize[1] = height;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(0);
			const tempRT3 = composer._renderTargetCache.allocate(0);
			const markBuffer = composer.getBuffer('MarkBuffer');
			const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._channelPass.uniforms['tDiffuse'] = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (let i = 0; i < 4; i++) {
				this._channelPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._channelPass.render(renderer);
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurXPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurXPass.uniforms.stride = this.stride;
			this._blurXPass.render(renderer);
			renderer.setRenderTarget(tempRT3);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._blurYPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurYPass.uniforms.blurX = tempRT2.texture;
			this._blurYPass.uniforms.stride = this.stride;
			this._blurYPass.uniforms.glowness = this.strength;
			this.color.toArray(this._blurYPass.uniforms.glowColor);
			this._blurYPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT3.texture;
			// this._blendPass.uniforms.colorWeight1 = 1;
			// this._blendPass.uniforms.alphaWeight1 = 1;
			// this._blendPass.uniforms.colorWeight2 = 1;
			// this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
			composer._renderTargetCache.release(tempRT3, 0);
		}
		dispose() {
			this._channelPass.dispose();
			this._blurXPass.dispose();
			this._blurYPass.dispose();
			this._blendPass.dispose();
		}
	}
	const innerGlowXShader = {
		name: 'ec_innerglow_x',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [1, 1],
			stride: 10
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		#define WT9_0 1.0
		#define WT9_1 0.8
		#define WT9_2 0.6
		#define WT9_3 0.4
		#define WT9_4 0.2
		#define WT9_NORMALIZE 5.2

		varying vec2 v_Uv;
		uniform sampler2D tDiffuse;
		uniform vec2 texSize;
		uniform float stride;

		void main() {
			float texelIncrement = 0.25 * stride / texSize.x;

			float colour = texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.5 * stride / texSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.75 * stride / texSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = stride / texSize.x;
			colour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);

			float col = 1.0 - colour * 0.25;

			gl_FragColor = vec4(col,col,col,col);
		}
		`
	};
	const innerGlowYShader = {
		name: 'ec_innerglow_y',
		defines: {},
		uniforms: {
			tDiffuse: null,
			blurX: null,
			texSize: [1, 1],
			stride: 10,
			glowness: 2,
			glowColor: [1, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		#define WT9_0 1.0
		#define WT9_1 0.8
		#define WT9_2 0.6
		#define WT9_3 0.4
		#define WT9_4 0.2
		#define WT9_NORMALIZE 5.2

		varying vec2 v_Uv;
		uniform vec2 texSize;
		uniform float stride;
		uniform float glowness;
		uniform vec3 glowColor;
		uniform sampler2D blurX;
		uniform sampler2D tDiffuse;

		void main() {
			float texelIncrement = 0.25 * stride / texSize.y;

			float colour = texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.5 * stride / texSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = 0.75 * stride / texSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			texelIncrement = stride / texSize.y;
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);
			colour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);

			vec3 glo = (0.25 * glowness * colour) * glowColor;
			vec4 maskTexel = texture2D(tDiffuse, v_Uv);
			
			gl_FragColor = vec4(maskTexel.x * glo, 1.);
		}
		`
	};
	const tintShader = {
		name: 'ec_tint',
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

						float v = max(max(texel2.x, texel2.y), texel2.z);

						vec4 color = mix(texel1, vec4(texel2.rgb, texel1.a), v);
						gl_FragColor = color;
				}
		`
	};

	class GlowEffect extends Effect {
		constructor() {
			super();

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			this.strength = 1;
			this.radius = 0.4;
			this.threshold = 0.01;
			this.smoothWidth = 0.1;
			this.maskStrength = 1;
			this._maskPass = new t3d.ShaderPostPass(maskShader);
			this._highlightPass = new t3d.ShaderPostPass(highlightShader);
			this._blurPass = new t3d.ShaderPostPass(seperableBlurShader);
			this._compositePass = new t3d.ShaderPostPass(bloomCompositeShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
			this._compositePass.uniforms.bloomFactors = new Float32Array([1.0, 0.8, 0.6, 0.4, 0.2]);
			this._compositePass.uniforms.bloomTintColors = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
			this._tempRTList = [];
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(1);
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const markBuffer = composer.getBuffer('MarkBuffer');
			const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			const usedMarkBuffer = markBuffer.attachManager.has(this.name);
			const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.setRenderTarget(tempRT2);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				this._maskPass.uniforms.additiveStrength = this.maskStrength;
				for (let i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? this.maskStrength : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.setRenderTarget(tempRT1);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._highlightPass.uniforms.tDiffuse = usedMarkBuffer ? tempRT2.texture : colorBufferTexture;
			this._highlightPass.uniforms.diffuseStrength = usedMarkBuffer ? 1 : this.maskStrength;
			this._highlightPass.uniforms.threshold = this.threshold;
			this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
			this._highlightPass.render(renderer);
			let inputRT = tempRT1;
			for (let i = 0; i < kernelSizeArray.length; i++) {
				const _tempRT1 = composer._renderTargetCache.allocate(i + 1);
				renderer.setRenderTarget(_tempRT1);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._blurPass.uniforms.tDiffuse = inputRT.texture;
				this._blurPass.uniforms.texSize[0] = inputRT.width;
				this._blurPass.uniforms.texSize[1] = inputRT.height;
				this._blurPass.uniforms.direction[0] = 1;
				this._blurPass.uniforms.direction[1] = 0;
				this._blurPass.uniforms.kernelRadius = kernelSizeArray[i];
				this._blurPass.render(renderer);
				const _tempRT2 = composer._renderTargetCache.allocate(i + 1);
				renderer.setRenderTarget(_tempRT2);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._blurPass.uniforms.tDiffuse = _tempRT1.texture;
				this._blurPass.uniforms.direction[0] = 0;
				this._blurPass.uniforms.direction[1] = 1;
				this._blurPass.render(renderer);
				composer._renderTargetCache.release(_tempRT1, i + 1);
				inputRT = _tempRT2;
				this._tempRTList[i] = _tempRT2;
			}
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._compositePass.uniforms.blurTexture1 = this._tempRTList[0].texture;
			this._compositePass.uniforms.blurTexture2 = this._tempRTList[1].texture;
			this._compositePass.uniforms.blurTexture3 = this._tempRTList[2].texture;
			this._compositePass.uniforms.blurTexture4 = this._tempRTList[3].texture;
			this._compositePass.uniforms.blurTexture5 = this._tempRTList[4].texture;
			this._compositePass.uniforms.bloomRadius = this.radius;
			this._compositePass.uniforms.bloomStrength = this.strength;
			this._compositePass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT2.texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = 1;
			this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 1);
			this._tempRTList.forEach((rt, i) => composer._renderTargetCache.release(rt, i + 1));
		}
		dispose() {
			this._maskPass.dispose();
			this._highlightPass.dispose();
			this._blurPass.dispose();
			this._compositePass.dispose();
			this._blendPass.dispose();
		}
	}
	const kernelSizeArray = [3, 5, 7, 9, 11];
	const bloomCompositeShader = {
		name: 'ec_bloom_composite',
		defines: {
			NUM_MIPS: 5
		},
		uniforms: {
			blurTexture1: null,
			blurTexture2: null,
			blurTexture3: null,
			blurTexture4: null,
			blurTexture5: null,
			bloomStrength: 1.0,
			bloomRadius: 0.0,
			bloomFactors: null,
			bloomTintColors: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform sampler2D blurTexture1;
		uniform sampler2D blurTexture2;
		uniform sampler2D blurTexture3;
		uniform sampler2D blurTexture4;
		uniform sampler2D blurTexture5;
		uniform float bloomStrength;
		uniform float bloomRadius;
		uniform float bloomFactors[NUM_MIPS];
		uniform vec3 bloomTintColors[NUM_MIPS];

				varying vec2 v_Uv;

				float lerpBloomFactor(const in float factor) {
						float mirrorFactor = 1.2 - factor;
						return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
						gl_FragColor = bloomStrength * (
				lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, v_Uv) +
				lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, v_Uv) +
				lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, v_Uv) +
				lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, v_Uv) +
				lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, v_Uv)
			);
				}
		`
	};

	class SoftGlowEffect extends Effect {
		constructor() {
			super();

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			this.strength = 0.5;
			this.blendRate = 0.4;
			this.blurSize = 1;
			this.maskStrength = 1;
			this._maskPass = new t3d.ShaderPostPass(maskShader);
			this._downSamplerPass = new t3d.ShaderPostPass(downSampleShader);
			this._hBlurPass = new t3d.ShaderPostPass(horizontalBlurShader);
			this._vBlurPass = new t3d.ShaderPostPass(verticalBlurShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
			this._tempRTList = [];
			this._tempRTList2 = [];
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			for (let i = 0; i < 6; i++) {
				this._tempRTList[i] = composer._renderTargetCache.allocate(i);
				this._tempRTList2[i] = composer._renderTargetCache.allocate(i);
			}
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const markBuffer = composer.getBuffer('MarkBuffer');
			const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			const usedMarkBuffer = markBuffer.attachManager.has(this.name);
			const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.setRenderTarget(this._tempRTList[0]);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				this._maskPass.uniforms.additiveStrength = this.maskStrength;
				for (let i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? this.maskStrength : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.setRenderTarget(this._tempRTList[1]);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._downSamplerPass.uniforms.tDiffuse = usedMarkBuffer ? this._tempRTList[0].texture : colorBufferTexture;
			this._downSamplerPass.uniforms.bright = (usedMarkBuffer ? 1 : this.maskStrength) * 4; // make this brighter
			this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[0].width;
			this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[0].height;
			this._downSamplerPass.render(renderer);

			// down sampler
			for (let i = 2; i < 6; i++) {
				renderer.setRenderTarget(this._tempRTList[i]);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._downSamplerPass.uniforms.tDiffuse = this._tempRTList[i - 1].texture;
				this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[i - 1].width;
				this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[i - 1].height;
				this._downSamplerPass.uniforms.bright = 1;
				this._downSamplerPass.render(renderer);
			}

			// up sampler and blur h
			for (let i = 0; i < 5; i++) {
				renderer.setRenderTarget(this._tempRTList[i]);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._hBlurPass.uniforms.tDiffuse = this._tempRTList[i + 1].texture;
				this._hBlurPass.uniforms.h = 2 * this.blurSize / this._tempRTList[i].width;
				this._hBlurPass.render(renderer);
			}

			// blur v
			for (let i = 0; i < 5; i++) {
				renderer.setRenderTarget(this._tempRTList2[i]);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._vBlurPass.uniforms.tDiffuse = this._tempRTList[i].texture;
				this._vBlurPass.uniforms.v = 2 * this.blurSize / this._tempRTList[i].height;
				this._vBlurPass.render(renderer);
			}

			// blend glow
			for (let i = 3; i >= 0; i--) {
				renderer.setRenderTarget(this._tempRTList[i]);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._blendPass.uniforms.texture1 = this._tempRTList2[i].texture;
				this._blendPass.uniforms.texture2 = i < 3 ? this._tempRTList[i + 1].texture : this._tempRTList2[i + 1].texture;
				this._blendPass.uniforms.colorWeight1 = (1 - this.blendRate) * this.strength;
				this._blendPass.uniforms.alphaWeight1 = (1 - this.blendRate) * this.strength;
				this._blendPass.uniforms.colorWeight2 = this.blendRate * this.strength;
				this._blendPass.uniforms.alphaWeight2 = this.blendRate * this.strength;
				this._blendPass.render(renderer);
			}
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = this._tempRTList[0].texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = 1;
			this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			this._tempRTList.forEach((rt, i) => composer._renderTargetCache.release(rt, i));
			this._tempRTList2.forEach((rt, i) => composer._renderTargetCache.release(rt, i));
		}
		dispose() {
			this._maskPass.dispose();
			this._downSamplerPass.dispose();
			this._hBlurPass.dispose();
			this._vBlurPass.dispose();
			this._blendPass.dispose();
		}
	}
	const downSampleShader = {
		name: 'ec_sg_downsample',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [512, 512],
			bright: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		varying vec2 v_Uv;

		uniform sampler2D tDiffuse;
		uniform vec2 texSize;
	
		uniform float bright;
		
		void main() {
				vec4 d = vec4(-1.0, -1.0, 1.0, 1.0) / texSize.xyxy;
			gl_FragColor = (texture2D(tDiffuse, v_Uv + d.xy) +
				texture2D(tDiffuse, v_Uv + d.zy) +
				texture2D(tDiffuse, v_Uv + d.xw) +
				texture2D(tDiffuse, v_Uv + d.zw)) * bright * 0.25;
		}
	`
	};

	class TailingEffect extends Effect {
		constructor() {
			super();

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			this.center = new t3d.Vector2(0.5, 0.5);
			this.direction = new t3d.Vector2(0.0, 1.0);
			this.strength = 1;
			this._maskPass = new t3d.ShaderPostPass(maskShader);
			this._tailingPass = new t3d.ShaderPostPass(tailingShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(0);
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const markBuffer = composer.getBuffer('MarkBuffer');
			const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			const usedMarkBuffer = markBuffer.attachManager.has(this.name);
			const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.setRenderTarget(tempRT1);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (let i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._tailingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._tailingPass.uniforms.center[0] = this.center.x;
			this._tailingPass.uniforms.center[1] = this.center.y;
			this._tailingPass.uniforms.direction[0] = this.direction.x;
			this._tailingPass.uniforms.direction[1] = this.direction.y;
			// this.center.toArray(this._tailingPass.uniforms.center);
			// this.direction.toArray(this._tailingPass.uniforms.direction);
			this._tailingPass.uniforms.intensity = 10 * this.strength;
			this._tailingPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT2.texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = 1;
			this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
		}
		dispose() {
			this._maskPass.dispose();
			this._tailingPass.dispose();
			this._blendPass.dispose();
		}
	}
	const tailingShader = {
		name: 'ec_tailing',
		defines: {},
		uniforms: {
			blurMap: null,
			blurStart: 1.0,
			blurWidth: -0.1,
			direction: [0, 1],
			intensity: 10,
			glowGamma: 0.8,
			center: [0.5, 0.5]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		varying vec2 v_Uv;
		uniform sampler2D blurMap;
		uniform float blurStart;
		uniform float blurWidth;
		uniform vec2 direction;
		uniform float intensity;
		uniform float glowGamma;
		uniform vec2 center;

		void main() {
			vec2 texCoord = v_Uv;
			vec4 blurred = texture2D(blurMap, texCoord);
			vec2 resCoord = vec2(0.0);

			for(float i = 0.0; i < 31.0; i++) {
				float scale = blurStart + blurWidth * ((31.0 - i) / (31.0 - 1.0));
				vec2 tmp = texCoord * scale;
				resCoord = mix(texCoord, tmp, direction);
				vec4 tmpc = texture2D(blurMap, resCoord) * (i / 31.0) * (i / 31.0);
				blurred += tmpc / 31.0;
			}

			blurred.r = pow(blurred.r, glowGamma);
			blurred.g = pow(blurred.g, glowGamma);
			blurred.b = pow(blurred.b, glowGamma);
			blurred.rgb *= intensity;
			blurred.rgb = clamp(blurred.rgb, 0.0, 1.0);

			vec4 origTex = texture2D(blurMap, texCoord);
			vec4 blurResult = origTex + blurred;
			// blurResult *= 2;

			vec2 dir = texCoord - center;
			float dist = sqrt(dir.x * dir.x + dir.y * dir.y);
			float t = dist * 1.0;
			t = clamp(t, 0.0, 1.0); // We need 0 <= t <= 1

			gl_FragColor = blurResult * t;
		}
		`
	};

	class RadialTailingEffect extends Effect {
		constructor() {
			super();

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			this.center = new t3d.Vector2(0.5, 0.5);
			this.strength = 1;
			this._maskPass = new t3d.ShaderPostPass(maskShader);
			this._radialTailingPass = new t3d.ShaderPostPass(radialTailingShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(0);
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const markBuffer = composer.getBuffer('MarkBuffer');
			const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			const usedMarkBuffer = markBuffer.attachManager.has(this.name);
			const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.setRenderTarget(tempRT1);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (let i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._radialTailingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._radialTailingPass.uniforms.center[0] = this.center.x;
			this._radialTailingPass.uniforms.center[1] = this.center.y;
			// this.center.toArray(this._radialTailingPass.uniforms.center);
			this._radialTailingPass.uniforms.intensity = 10 * this.strength;
			this._radialTailingPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT2.texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = 1;
			this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
		}
		dispose() {
			this._maskPass.dispose();
			this._radialTailingPass.dispose();
			this._blendPass.dispose();
		}
	}
	const radialTailingShader = {
		name: 'ec_radial_tailing',
		defines: {},
		uniforms: {
			blurMap: null,
			blurStart: 1.0,
			blurWidth: -0.1,
			intensity: 10,
			glowGamma: 0.8,
			center: [0.5, 0.5]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		varying vec2 v_Uv;
		uniform sampler2D blurMap;
		uniform float blurStart;
		uniform float blurWidth;
		uniform float intensity;
		uniform float glowGamma;
		uniform vec2 center;
		
		void main() {
			vec2 texCoord = v_Uv;
			vec2 ctrPt = center;
			vec4 blurred = texture2D(blurMap, texCoord);
		
			for(float i = 0.0; i < 31.0; i++) {
				float scale = blurStart + blurWidth * ((31.0 - i) / (31.0 - 1.0));
				vec2 tmp = (texCoord - ctrPt) * scale + ctrPt;
				vec4 tmpc = texture2D(blurMap, tmp) * (i / 31.0) * (i / 31.0);
		
				blurred += tmpc / 31.0;
			}
		
			blurred.r = pow(blurred.r, glowGamma);
			blurred.g = pow(blurred.g, glowGamma);
			blurred.b = pow(blurred.b, glowGamma);
			blurred.rgb *= intensity;
			blurred.rgb = clamp(blurred.rgb, 0.0, 1.0);
		
			vec4 origTex = texture2D(blurMap, texCoord);
			vec4 blurResult = origTex + blurred;
			// blurResult *= 2;
		
			vec2 dir = texCoord - ctrPt;
			float dist = sqrt(dir.x * dir.x + dir.y * dir.y);
			float t = dist * 1.0;
			t = clamp(t, 0.0, 1.0); // We need 0 <= t <= 1
		
			gl_FragColor = blurResult * t;
		}
		`
	};

	class GhostingEffect extends Effect {
		constructor() {
			super();

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			this.center = new t3d.Vector2(0.5, 0.5);
			this.strength = 1;
			this._maskPass = new t3d.ShaderPostPass(maskShader);
			this._ghostingPass = new t3d.ShaderPostPass(ghostingShader);
			this._blendPass = new t3d.ShaderPostPass(additiveShader);
			this._blendPass.material.premultipliedAlpha = true;
		}
		render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			const tempRT1 = composer._renderTargetCache.allocate(0);
			const tempRT2 = composer._renderTargetCache.allocate(0);
			const sceneBuffer = composer.getBuffer('SceneBuffer');
			const markBuffer = composer.getBuffer('MarkBuffer');
			const colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			const usedMarkBuffer = markBuffer.attachManager.has(this.name);
			const colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			const colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.setRenderTarget(tempRT1);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (let i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.setRenderTarget(tempRT2);
			renderer.setClearColor(0, 0, 0, 0);
			renderer.clear(true, true, false);
			this._ghostingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._ghostingPass.uniforms.center[0] = this.center.x;
			this._ghostingPass.uniforms.center[1] = this.center.y;
			// this.center.toArray(this._ghostingPass.uniforms.center);
			this._ghostingPass.uniforms.intensity = 3 * this.strength;
			this._ghostingPass.render(renderer);
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.clear(true, true, false);
			}
			this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
			this._blendPass.uniforms.texture2 = tempRT2.texture;
			this._blendPass.uniforms.colorWeight1 = 1;
			this._blendPass.uniforms.alphaWeight1 = 1;
			this._blendPass.uniforms.colorWeight2 = 1;
			this._blendPass.uniforms.alphaWeight2 = 0;
			if (finish) {
				this._blendPass.material.transparent = composer._tempClearColor[3] < 1 || !composer.clearColor;
				this._blendPass.renderStates.camera.rect.fromArray(composer._tempViewport);
			}
			this._blendPass.render(renderer);
			if (finish) {
				this._blendPass.material.transparent = false;
				this._blendPass.renderStates.camera.rect.set(0, 0, 1, 1);
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
		}
		dispose() {
			this._maskPass.dispose();
			this._ghostingPass.dispose();
			this._blendPass.dispose();
		}
	}
	const ghostingShader = {
		name: 'ec_ghosting',
		defines: {},
		uniforms: {
			blurMap: null,
			blurStart: 1.0,
			blurWidth: -0.1,
			intensity: 3,
			glowGamma: 0.8,
			center: [0.5, 0.5]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		varying vec2 v_Uv;
		uniform sampler2D blurMap;
		uniform float blurStart;
		uniform float blurWidth;
		uniform float intensity;
		uniform float glowGamma;
		uniform vec2 center;
		
		void main() {
			vec2 uv = v_Uv;
			vec2 ctrPt = center;
		
			float scale = blurStart + blurWidth * 1.0;
			vec2 tmp = (uv - ctrPt) * scale + ctrPt;

			vec4 blurred = texture2D(blurMap, tmp);
			blurred.rgb = pow(blurred.rgb, vec3(glowGamma));
			blurred.rgb *= intensity;
			blurred.rgb = clamp(blurred.rgb, 0.0, 1.0);
			
			vec2 dir = uv - ctrPt;
			float dist = sqrt(dir.x * dir.x + dir.y * dir.y);
		
			gl_FragColor = blurred * clamp(dist, 0.0, 1.0);
		}
		`
	};

	class GBuffer extends Buffer {
		constructor(width, height, options) {
			super(width, height, options);
			this.enableCameraJitter = true;
			this._rt = new t3d.RenderTarget2D(width, height);
			this._rt.texture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
			this._rt.texture.magFilter = t3d.TEXTURE_FILTER.NEAREST;
			this._rt.texture.generateMipmaps = false;
			if (options.floatColorBuffer) {
				this._rt.texture.type = t3d.PIXEL_TYPE.FLOAT;
			} else {
				this._rt.texture.type = t3d.PIXEL_TYPE.HALF_FLOAT;
			}
			const depthTexture = new t3d.Texture2D();
			setupDepthTexture(depthTexture, true);
			this._rt.attach(depthTexture, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._renderOptions = {
				getMaterial: createGetMaterialFunction$2()
			};
			this._fixedRenderStates = {
				scene: null,
				lights: null,
				camera: {
					id: 0,
					version: 0,
					near: 0,
					far: 0,
					position: new t3d.Vector3(),
					logDepthCameraNear: 0,
					logDepthBufFC: 0,
					viewMatrix: new t3d.Matrix4(),
					projectionMatrix: new t3d.Matrix4(),
					projectionViewMatrix: new t3d.Matrix4(),
					rect: new t3d.Vector4(0, 0, 1, 1)
				},
				gammaFactor: 2.0,
				outputEncoding: null
			};
			this.layers = [0];
			this.cameraNear = -1;
			this.cameraFar = -1;
			this._supportLogDepth = false;
			this._renderLogDepth = false;
			this._logDepthRenderTarget = null;
			this._logDepthPass = null;
		}

		// only support webGL2
		set supportLogDepth(value) {
			this._supportLogDepth = value;
			if (!this._logDepthRenderTarget) {
				this._logDepthRenderTarget = new t3d.RenderTarget2D(this._rt.width, this._rt.height);
				this._logDepthRenderTarget.attach(this._rt.texture, t3d.ATTACHMENT.COLOR_ATTACHMENT0);
				const depthTexture = new t3d.Texture2D();
				setupDepthTexture(depthTexture, true);
				this._logDepthRenderTarget.attach(depthTexture, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);

				// only use this pass to render depth texture
				this._logDepthPass = new t3d.ShaderPostPass(logDepthShader);
				this._logDepthPass.material.colorWrite = false;
				// If depth test is disabled, gl_FragDepthEXT will not work
				// this._logDepthPass.material.depthTest = false;
			}
		}
		get supportLogDepth() {
			return this._supportLogDepth;
		}
		setIfRenderReplaceFunction(func) {
			if (func) {
				this._renderOptions.ifRender = func;
			} else {
				delete this._renderOptions.ifRender;
			}
		}
		setGeometryReplaceFunction(func) {
			if (func) {
				this._renderOptions.getGeometry = func;
			} else {
				delete this._renderOptions.getGeometry;
			}
		}
		setMaterialReplaceFunction(func) {
			if (func) {
				this._renderOptions.getMaterial = createGetMaterialFunction$2(func);
			} else {
				this._renderOptions.getMaterial = createGetMaterialFunction$2();
			}
		}
		render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			const cameraJitter = composer.$cameraJitter;
			const enableCameraJitter = this.enableCameraJitter && cameraJitter.accumulating();
			renderer.setRenderTarget(this._rt);
			renderer.setClearColor(-2.1, -2.1, 0.5, 0.5);
			renderer.clear(true, true, false);
			const renderOptions = this._renderOptions;
			const renderStates = scene.getRenderStates(camera);
			const renderQueue = scene.getRenderQueue(camera);
			const fixedRenderStates = this._getFixedRenderStates(renderStates);
			const renderLogDepth = this._supportLogDepth && fixedRenderStates.scene.logarithmicDepthBuffer && isPerspectiveMatrix(fixedRenderStates.camera.projectionMatrix);
			const oldLogDepthState = fixedRenderStates.scene.logarithmicDepthBuffer;
			fixedRenderStates.scene.logarithmicDepthBuffer = renderLogDepth;
			enableCameraJitter && cameraJitter.jitterProjectionMatrix(fixedRenderStates.camera, this._rt.width, this._rt.height);
			renderer.beginRender();
			const layers = this.layers;
			for (let i = 0, l = layers.length; i < l; i++) {
				const renderQueueLayer = renderQueue.getLayer(layers[i]);
				renderer.renderRenderableList(renderQueueLayer.opaque, fixedRenderStates, renderOptions);
				renderer.renderRenderableList(renderQueueLayer.transparent, fixedRenderStates, renderOptions);
			}
			renderer.endRender();
			fixedRenderStates.scene.logarithmicDepthBuffer = oldLogDepthState; // restore

			if (renderLogDepth) {
				renderer.setRenderTarget(this._logDepthRenderTarget);
				renderer.clear(false, true, true);
				const {
					near,
					far
				} = fixedRenderStates.camera;
				this._logDepthPass.uniforms.depthTexture = this._rt._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
				this._logDepthPass.uniforms.depthFactors[0] = far / (far - near); // a
				this._logDepthPass.uniforms.depthFactors[1] = far * near / (near - far); // b
				this._logDepthPass.uniforms.depthFactors[2] = far; // far
				this._logDepthPass.render(renderer);
			}
			this._renderLogDepth = renderLogDepth;
		}
		output() {
			return this._renderLogDepth ? this._logDepthRenderTarget : this._rt;
		}
		getCurrentRenderStates() {
			return this._fixedRenderStates;
		}
		resize(width, height) {
			super.resize(width, height);
			this._rt.resize(width, height);
			this._logDepthRenderTarget && this._logDepthRenderTarget.resize(width, height);
		}
		dispose() {
			super.dispose();
			this._rt.dispose();
			this._logDepthRenderTarget && this._logDepthRenderTarget.dispose();
			this._logDepthPass && this._logDepthPass.dispose();
		}
		_getFixedRenderStates(renderStates) {
			const output = this._fixedRenderStates;

			// copy others

			output.scene = renderStates.scene;

			// copy lights
			if (renderStates.lighting) {
				// for t3d v0.4.x or later
				output.lighting = renderStates.lighting;
				output.lights = renderStates.lighting.getGroup(0);
			} else {
				// for t3d v0.3.x
				output.lights = renderStates.lights;
			}
			output.gammaFactor = renderStates.gammaFactor;
			output.outputEncoding = renderStates.outputEncoding;
			const outputCamera = output.camera;
			const sourceCamera = renderStates.camera;
			outputCamera.id = sourceCamera.id;
			outputCamera.version = sourceCamera.version;
			outputCamera.position = sourceCamera.position;
			outputCamera.logDepthCameraNear = sourceCamera.logDepthCameraNear;
			outputCamera.logDepthBufFC = sourceCamera.logDepthBufFC;
			outputCamera.viewMatrix = sourceCamera.viewMatrix;
			outputCamera.rect = sourceCamera.rect;

			// fix camera far & near if needed

			const fixedNear = this.cameraNear > 0 ? this.cameraNear : sourceCamera.near,
				fixedFar = this.cameraFar > 0 ? this.cameraFar : sourceCamera.far;
			outputCamera.near = fixedNear;
			outputCamera.far = fixedFar;
			outputCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
			if (this.cameraNear > 0 || this.cameraFar > 0) {
				outputCamera.projectionMatrix.elements[10] = -(fixedFar + fixedNear) / (fixedFar - fixedNear);
				outputCamera.projectionMatrix.elements[14] = -2 * fixedFar * fixedNear / (fixedFar - fixedNear);
				outputCamera.projectionViewMatrix.multiplyMatrices(outputCamera.projectionMatrix, outputCamera.viewMatrix);
			} else {
				outputCamera.projectionViewMatrix.copy(sourceCamera.projectionViewMatrix);
			}
			return output;
		}
	}
	function createGetMaterialFunction$2(func = defaultMaterialReplaceFunction$2) {
		return function (renderable) {
			const material = func(renderable);
			material.diffuseMap = renderable.material.diffuseMap;
			material.uniforms['metalness'] = renderable.material.metalness !== undefined ? renderable.material.metalness : 0.5;
			material.uniforms['roughness'] = renderable.material.roughness !== undefined ? renderable.material.roughness : 0.5;
			material.metalnessMap = renderable.material.metalnessMap;
			material.roughnessMap = renderable.material.roughnessMap;
			material.side = renderable.material.side;
			return material;
		};
	}
	const materialMap$2 = new Map();
	const materialWeakMap = new WeakMap();
	function defaultMaterialReplaceFunction$2(renderable) {
		let materialRef = materialWeakMap.get(renderable.material);
		if (!materialRef) {
			const useFlatShading = !renderable.geometry.attributes['a_Normal'] || renderable.material.shading === t3d.SHADING_TYPE.FLAT_SHADING;
			const useDiffuseMap = !!renderable.material.diffuseMap;
			const useMetalnessMap = !!renderable.material.metalnessMap;
			const useRoughnessMap = !!renderable.material.roughnessMap;
			const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
			const morphTargets = !!renderable.object.morphTargetInfluences;
			const morphNormals = !!renderable.object.morphTargetInfluences && renderable.object.geometry.morphAttributes.normal;
			const side = renderable.material.side;
			let maxBones = 0;
			if (useSkinning) {
				if (renderable.object.skeleton.boneTexture) {
					maxBones = 1024;
				} else {
					maxBones = renderable.object.skeleton.bones.length;
				}
			}
			const code = useFlatShading + '_' + useDiffuseMap + '_' + useMetalnessMap + '_' + useRoughnessMap + '_' + useSkinning + '_' + maxBones + '_' + morphTargets + '_' + morphNormals + '_' + side;
			materialRef = materialMap$2.get(code);
			if (!materialRef) {
				const material = new t3d.ShaderMaterial(gBufferShader);
				material.shading = useFlatShading ? t3d.SHADING_TYPE.FLAT_SHADING : t3d.SHADING_TYPE.SMOOTH_SHADING;
				material.alphaTest = useDiffuseMap ? 0.999 : 0; // ignore if alpha < 0.99
				material.side = side;
				materialRef = {
					refCount: 0,
					material
				};
				materialMap$2.set(code, materialRef);
			}
			materialWeakMap.set(renderable.material, materialRef);
			materialRef.refCount++;
			function onDispose() {
				renderable.material.removeEventListener('dispose', onDispose);
				materialWeakMap.delete(renderable.material);
				materialRef.refCount--;
				if (materialRef.refCount <= 0) {
					materialMap$2.delete(code);
				}
			}
			renderable.material.addEventListener('dispose', onDispose);
		}
		return materialRef.material;
	}
	function isPerspectiveMatrix(m) {
		return m.elements[11] === -1;
	}
	const gBufferShader = {
		name: 'ec_gbuffer',
		defines: {},
		uniforms: {
			metalness: 0.5,
			roughness: 0.5
		},
		vertexShader: `
				#include <common_vert>
				#include <morphtarget_pars_vert>
				#include <skinning_pars_vert>
				#include <normal_pars_vert>
				#include <uv_pars_vert>
		#include <diffuseMap_pars_vert>
		#include <modelPos_pars_frag>
		#include <logdepthbuf_pars_vert>

				void main() {
					#include <uv_vert>
			#include <diffuseMap_vert>
					#include <begin_vert>
					#include <morphtarget_vert>
					#include <morphnormal_vert>
					#include <skinning_vert>
					#include <skinnormal_vert>
					#include <normal_vert>
					#include <pvm_vert>
			#include <modelPos_vert>
			#include <logdepthbuf_vert>
				}
		`,
		fragmentShader: `
				#include <common_frag>
				#include <diffuseMap_pars_frag>
		#include <alphaTest_pars_frag>

				#include <uv_pars_frag>

				#include <packing>
				#include <normal_pars_frag>

		${unitVectorToOctahedronGLSL}

				uniform float metalness;
		
		#ifdef USE_METALNESSMAP
						uniform sampler2D metalnessMap;
				#endif

		uniform float roughness;

				#ifdef USE_ROUGHNESSMAP
						uniform sampler2D roughnessMap;
				#endif

		#include <logdepthbuf_pars_frag>
		#include <modelPos_pars_frag>

				void main() {
						#if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)
								vec4 texelColor = texture2D(diffuseMap, vDiffuseMapUV);
								float alpha = texelColor.a * u_Opacity;
								if(alpha < u_AlphaTest) discard;
						#endif

			#include <logdepthbuf_frag>

			#ifdef FLAT_SHADED
				vec3 fdx = dFdx(v_modelPos);
				vec3 fdy = dFdy(v_modelPos);
				vec3 normal = normalize(cross(fdx, fdy));
			#else
							vec3 normal = normalize(v_Normal);
				#ifdef DOUBLE_SIDED
					normal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);
				#endif 
			#endif

			float metalnessFactor = metalness;
						#ifdef USE_METALNESSMAP
				metalnessFactor *= texture2D(metalnessMap, v_Uv).b;
						#endif

						float roughnessFactor = roughness;
						#ifdef USE_ROUGHNESSMAP
								roughnessFactor *= texture2D(roughnessMap, v_Uv).g;
						#endif

						vec4 outputColor;
						outputColor.xy = unitVectorToOctahedron(normal);
			outputColor.z = saturate(metalnessFactor);
						outputColor.w = saturate(roughnessFactor);
						
						gl_FragColor = outputColor;
				}
		`
	};
	const logDepthShader = {
		name: 'ec_logdepth',
		uniforms: {
			depthTexture: null,
			depthFactors: [] // a, b, far
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform sampler2D depthTexture;
		uniform vec3 depthFactors;
		
		varying vec2 v_Uv;

		void main() {
			float logDepth = texture2D(depthTexture, v_Uv).r;

			float depth = pow(2.0, logDepth * log2(depthFactors.z + 1.0));
			depth = depthFactors.x + depthFactors.y / depth;

			gl_FragDepthEXT = depth;

			gl_FragColor = vec4(0.0);
		}
	`
	};

	class BufferAttachManager {
		constructor(attachChannelSize) {
			this.keys = new Array();
			this.masks = new Array();
			this.attachChannelSize = attachChannelSize;
		}
		allocate(key, mask = RenderListMask.ALL) {
			this.keys.push(key);
			this.masks.push(mask);
			return this.keys.length - 1;
		}
		getAttachIndex(key) {
			const index = this.keys.indexOf(key);
			return Math.max(0, Math.floor(index / this.attachChannelSize));
		}
		getChannelIndex(key) {
			const index = this.keys.indexOf(key);
			return Math.max(0, index % this.attachChannelSize);
		}
		has(key) {
			const index = this.keys.indexOf(key);
			return index > -1;
		}
		count() {
			return this.keys.length;
		}
		attachCount() {
			return Math.ceil(this.keys.length / this.attachChannelSize);
		}
		getKey(attachIndex, channelIndex) {
			return this.keys[attachIndex * this.attachChannelSize + channelIndex];
		}
		getMask(attachIndex, channelIndex) {
			return this.masks[attachIndex * this.attachChannelSize + channelIndex];
		}
		getAttachInfo(attachIndex, result = {
			count: 0,
			keys: [],
			masks: []
		}) {
			result.count = 0;
			for (let i = 0; i < this.attachChannelSize; i++) {
				const key = this.getKey(attachIndex, i);
				const mask = this.getMask(attachIndex, i);
				if (key !== undefined && mask !== undefined) {
					result.keys[result.count] = key;
					result.masks[result.count] = mask;
					result.count++;
				}
			}
			return result;
		}
		reset() {
			this.keys.length = 0;
			this.masks.length = 0;
		}
	}

	class NonDepthMarkBuffer extends Buffer {
		constructor(width, height, options) {
			super(width, height, options);
			const bufferMipmaps = options.bufferMipmaps;
			this._rts = [];
			for (let i = 0; i < options.maxMarkAttachment; i++) {
				const rt = new t3d.RenderTarget2D(width, height);
				rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				setupColorTexture(rt.texture, options);
				if (!bufferMipmaps) {
					rt.texture.generateMipmaps = false;
					rt.texture.minFilter = t3d.TEXTURE_FILTER.LINEAR;
				}
				this._rts.push(rt);
			}
			const colorBufferFormat = getColorBufferFormat(options);
			this._mrts = [];
			for (let i = 0; i < options.maxMarkAttachment; i++) {
				const mrt = new t3d.RenderTarget2D(width, height);
				mrt.attach(new t3d.RenderBuffer(width, height, colorBufferFormat, options.samplerNumber), t3d.ATTACHMENT.COLOR_ATTACHMENT0);
				mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				this._mrts.push(mrt);
			}
			this._state = {
				attachIndex: 0,
				attachInfo: {
					count: 0,
					keys: [],
					masks: []
				}
			};
			const attachManager = new BufferAttachManager(4);
			this._opacityRenderOptions = {
				getMaterial: createGetMaterialFunction$1(undefined, this._state, attachManager, RenderListMask.OPAQUE),
				ifRender: createIfRenderFunction$1(undefined, this._state, RenderListMask.OPAQUE)
			};
			this._transparentRenderOptions = {
				getMaterial: createGetMaterialFunction$1(undefined, this._state, attachManager, RenderListMask.TRANSPARENT),
				ifRender: createIfRenderFunction$1(undefined, this._state, RenderListMask.TRANSPARENT)
			};
			this.attachManager = attachManager;
			this.layers = [0];
		}
		setIfRenderReplaceFunction(func) {
			if (func) {
				this._opacityRenderOptions.ifRender = createIfRenderFunction$1(func, this._state, RenderListMask.OPAQUE);
				this._transparentRenderOptions.ifRender = createIfRenderFunction$1(func, this._state, RenderListMask.TRANSPARENT);
			} else {
				this._opacityRenderOptions.ifRender = createIfRenderFunction$1(undefined, this._state, RenderListMask.OPAQUE);
				this._transparentRenderOptions.ifRender = createIfRenderFunction$1(undefined, this._state, RenderListMask.TRANSPARENT);
			}
		}
		setGeometryReplaceFunction(func) {
			if (func) {
				this._opacityRenderOptions.getGeometry = func;
				this._transparentRenderOptions.getGeometry = func;
			} else {
				delete this._opacityRenderOptions.getGeometry;
				delete this._transparentRenderOptions.getGeometry;
			}
		}
		setMaterialReplaceFunction(func) {
			if (func) {
				this._opacityRenderOptions.getMaterial = createGetMaterialFunction$1(func, this._state, this.attachManager, RenderListMask.OPAQUE);
				this._transparentRenderOptions.getMaterial = createGetMaterialFunction$1(func, this._state, this.attachManager, RenderListMask.TRANSPARENT);
			} else {
				this._opacityRenderOptions.getMaterial = createGetMaterialFunction$1(undefined, this._state, this.attachManager, RenderListMask.OPAQUE);
				this._transparentRenderOptions.getMaterial = createGetMaterialFunction$1(undefined, this._state, this.attachManager, RenderListMask.TRANSPARENT);
			}
		}
		render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			const attachCount = this.attachManager.attachCount();
			if (attachCount > this._rts.length) {
				console.error('XXMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxMarkAttachment<' + this._rts.length + '>.');
			}
			for (let attachIndex = 0; attachIndex < attachCount; attachIndex++) {
				const rt = this._rts[attachIndex];
				const mrt = this._mrts[attachIndex];
				if (composer.$useMSAA) {
					renderer.setRenderTarget(mrt);
					renderer.setClearColor(0, 0, 0, 0);
					renderer.clear(true, false, false);
				} else {
					renderer.setRenderTarget(rt);
					renderer.setClearColor(0, 0, 0, 0);
					renderer.clear(true, false, false);
				}
				const renderStates = scene.getRenderStates(camera);
				const renderQueue = scene.getRenderQueue(camera);
				this._state.attachIndex = attachIndex;
				this.attachManager.getAttachInfo(attachIndex, this._state.attachInfo);
				let attachMask = 0;
				const attachMasks = this._state.attachInfo.masks,
					maskLength = this._state.attachInfo.count;
				for (let i = 0; i < maskLength; i++) {
					attachMask |= attachMasks[i];
				}
				renderer.beginRender();
				const layers = this.layers;
				for (let i = 0, l = layers.length; i < l; i++) {
					const renderQueueLayer = renderQueue.getLayer(layers[i]);
					if (attachMask & RenderListMask.OPAQUE) {
						renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._opacityRenderOptions);
					}
					if (attachMask & RenderListMask.TRANSPARENT) {
						renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._transparentRenderOptions);
					}
				}
				renderer.endRender();
				if (composer.$useMSAA) {
					renderer.setRenderTarget(rt);
					renderer.blitRenderTarget(mrt, rt, true, false, false);
				}

				// generate mipmaps for down sampler
				renderer.updateRenderTargetMipmap(rt);
			}
		}
		output(attachIndex = 0) {
			return this._rts[attachIndex];
		}
		resize(width, height) {
			super.resize(width, height);
			this._rts.forEach(rt => rt.resize(width, height));
			this._mrts.forEach(mrt => mrt.resize(width, height));
		}
		dispose() {
			super.dispose();
			this._rts.forEach(rt => rt.dispose());
			this._mrts.forEach(mrt => mrt.dispose());
		}
	}
	function createIfRenderFunction$1(func = defaultIfRenderReplaceFunction$1, state, renderMask) {
		return function (renderable) {
			if (!func(renderable)) {
				return false;
			}
			if (!renderable.object.effects) {
				return false;
			}
			let mask = 0;
			for (let i = 0; i < state.attachInfo.count; i++) {
				const key = state.attachInfo.keys[i];
				if (renderable.object.effects[key]) {
					mask |= state.attachInfo.masks[i];
				}
			}
			return mask & renderMask;
		};
	}
	function defaultIfRenderReplaceFunction$1(renderable) {
		return true;
	}
	function createGetMaterialFunction$1(func = defaultMaterialReplaceFunction$1, state, attachManager, renderMask) {
		return function (renderable) {
			const material = func(renderable);
			// material.side = renderable.material.side; TODO
			material.side = t3d.DRAW_SIDE.DOUBLE;
			for (let channelIndex = 0; channelIndex < 4; channelIndex++) {
				const key = attachManager.getKey(state.attachIndex, channelIndex);
				const mask = attachManager.getMask(state.attachIndex, channelIndex);
				if (mask & renderMask) {
					material.uniforms.mColor[channelIndex] = renderable.object.effects[key] || 0;
				} else {
					material.uniforms.mColor[channelIndex] = 0;
				}
			}
			return material;
		};
	}
	const materialMap$1 = new Map();

	// TODO dispose
	function defaultMaterialReplaceFunction$1(renderable) {
		const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
		const morphTargets = !!renderable.object.morphTargetInfluences;
		const drawMode = renderable.material.drawMode;
		const key = useSkinning + '_' + morphTargets + '_' + drawMode;
		let result;
		if (materialMap$1.has(key)) {
			result = materialMap$1.get(key);
		} else {
			result = new t3d.ShaderMaterial(markShader);
			result.premultipliedAlpha = true;
			result.transparent = true;
			result.blending = t3d.BLEND_TYPE.ADD;
			result.drawMode = drawMode;
			materialMap$1.set(key, result);
		}
		return result;
	}
	const markShader = {
		name: 'ec_mark',
		defines: {},
		uniforms: {
			mColor: [1, 1, 1, 1]
		},
		vertexShader: `
				#include <common_vert>
				#include <morphtarget_pars_vert>
				#include <skinning_pars_vert>
				#include <uv_pars_vert>
		#include <diffuseMap_pars_vert>
		#include <logdepthbuf_pars_vert>
				void main() {
					#include <uv_vert>
			#include <diffuseMap_vert>
					#include <begin_vert>
					#include <morphtarget_vert>
					#include <skinning_vert>
					#include <pvm_vert>
			#include <logdepthbuf_vert>
				}
		`,
		fragmentShader: `
				#include <common_frag>
				#include <diffuseMap_pars_frag>
		#include <alphaTest_pars_frag>

				#include <uv_pars_frag>

		#include <logdepthbuf_pars_frag>

		uniform vec4 mColor;

				void main() {
			#include <logdepthbuf_frag>
			
						#if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)
								vec4 texelColor = texture2D(diffuseMap, vDiffuseMapUV);
								float alpha = texelColor.a * u_Opacity;
								if(alpha < u_AlphaTest) discard;
						#endif

						gl_FragColor = mColor;
				}
		`
	};

	class MarkBuffer extends NonDepthMarkBuffer {
		constructor(width, height, options) {
			super(width, height, options);
		}
		syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
			this._rts.forEach(rt => rt.dispose());
			this._mrts.forEach(mrt => mrt.dispose());
			if (isDepthStencilAttachment(depthAttachment)) {
				this._rts.forEach(rt => {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._rts.forEach(rt => {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			if (isDepthStencilAttachment(msDepthRenderBuffer)) {
				this._mrts.forEach(mrt => {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._mrts.forEach(mrt => {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			this.needsUpdate = true;
		}
	}

	class ColorMarkBuffer extends Buffer {
		constructor(width, height, options) {
			super(width, height, options);
			const bufferMipmaps = options.bufferMipmaps;
			this._rts = [];
			for (let i = 0; i < options.maxColorAttachment; i++) {
				const rt = new t3d.RenderTarget2D(width, height);
				rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				setupColorTexture(rt.texture, options);
				if (!bufferMipmaps) {
					rt.texture.generateMipmaps = false;
					rt.texture.minFilter = t3d.TEXTURE_FILTER.LINEAR;
				}
				this._rts.push(rt);
			}
			const colorBufferFormat = getColorBufferFormat(options);
			this._mrts = [];
			for (let i = 0; i < options.maxColorAttachment; i++) {
				const mrt = new t3d.RenderTarget2D(width, height);
				mrt.attach(new t3d.RenderBuffer(width, height, colorBufferFormat, options.samplerNumber), t3d.ATTACHMENT.COLOR_ATTACHMENT0);
				mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				this._mrts.push(mrt);
			}
			const state = {
				key: null
			};
			this._state = state;
			const attachManager = new BufferAttachManager(1);
			this._renderOptions = {
				getMaterial: createGetMaterialFunction(undefined, state),
				ifRender: createIfRenderFunction(undefined, state)
			};
			this.attachManager = attachManager;
			this.layers = [0];
		}
		setIfRenderReplaceFunction(func) {
			if (func) {
				this._renderOptions.ifRender = createIfRenderFunction(func, this._state);
			} else {
				this._renderOptions.ifRender = createIfRenderFunction(undefined, this._state);
			}
		}
		setGeometryReplaceFunction(func) {
			if (func) {
				this._renderOptions.getGeometry = func;
			} else {
				delete this._renderOptions.getGeometry;
			}
		}
		setMaterialReplaceFunction(func) {
			if (func) {
				this._renderOptions.getMaterial = createGetMaterialFunction(func, this._state);
			} else {
				this._renderOptions.getMaterial = createGetMaterialFunction(undefined, this._state);
			}
		}
		syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
			this._rts.forEach(rt => rt.dispose());
			this._mrts.forEach(mrt => mrt.dispose());
			if (isDepthStencilAttachment(depthAttachment)) {
				this._rts.forEach(rt => {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._rts.forEach(rt => {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			if (isDepthStencilAttachment(msDepthRenderBuffer)) {
				this._mrts.forEach(mrt => {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._mrts.forEach(mrt => {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			this.needsUpdate = true;
		}
		render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			const attachCount = this.attachManager.attachCount();
			if (attachCount > this._rts.length) {
				console.error('ColorMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxColorAttachment<' + this._rts.length + '>.');
			}
			for (let attachIndex = 0; attachIndex < attachCount; attachIndex++) {
				const rt = this._rts[attachIndex];
				const mrt = this._mrts[attachIndex];
				if (composer.$useMSAA) {
					renderer.setRenderTarget(mrt);
					renderer.setClearColor(0, 0, 0, 0);
					renderer.clear(true, false, false);
				} else {
					renderer.setRenderTarget(rt);
					renderer.setClearColor(0, 0, 0, 0);
					renderer.clear(true, false, false);
				}
				const renderOptions = this._renderOptions;
				const attachManager = this.attachManager;
				const renderStates = scene.getRenderStates(camera);
				const renderQueue = scene.getRenderQueue(camera);
				this._state.key = attachManager.getKey(attachIndex, 0);
				const mask = attachManager.getMask(attachIndex, 0);
				renderer.beginRender();
				const layers = this.layers;
				for (let i = 0, l = layers.length; i < l; i++) {
					const renderQueueLayer = renderQueue.getLayer(layers[i]);
					if (mask & RenderListMask.OPAQUE) {
						renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, renderOptions);
					}
					if (mask & RenderListMask.TRANSPARENT) {
						renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, renderOptions);
					}
				}
				renderer.endRender();
				if (composer.$useMSAA) {
					renderer.setRenderTarget(rt);
					renderer.blitRenderTarget(mrt, rt, true, false, false);
				}

				// generate mipmaps for down sampler
				renderer.updateRenderTargetMipmap(rt);
			}
		}
		output(attachIndex = 0) {
			return this._rts[attachIndex];
		}
		resize(width, height) {
			super.resize(width, height);
			this._rts.forEach(rt => rt.resize(width, height));
			this._mrts.forEach(mrt => mrt.resize(width, height));
		}
		dispose() {
			super.dispose();
			this._rts.forEach(rt => rt.dispose());
			this._mrts.forEach(mrt => mrt.dispose());
		}
	}
	function createIfRenderFunction(func = defaultIfRenderReplaceFunction, state) {
		return function (renderable) {
			if (!func(renderable)) {
				return false;
			}
			if (!renderable.object.effects) {
				return false;
			}
			if (renderable.object.effects[state.key]) {
				return true;
			}
			return false;
		};
	}
	function defaultIfRenderReplaceFunction(renderable) {
		return true;
	}
	function createGetMaterialFunction(func = defaultMaterialReplaceFunction, state) {
		return function (renderable) {
			const material = func(renderable);
			// material.side = renderable.material.side;
			material.side = t3d.DRAW_SIDE.DOUBLE;
			material.uniforms.strength = renderable.object.effects[state.key] || 0;
			return material;
		};
	}
	const materialMap = new Map();

	// TODO dispose
	function defaultMaterialReplaceFunction(renderable) {
		const useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
		const morphTargets = !!renderable.object.morphTargetInfluences;
		const drawMode = renderable.material.drawMode;
		const useDiffuseMap = !!renderable.material.diffuseMap;
		const key = useSkinning + '_' + morphTargets + '_' + drawMode + '' + useDiffuseMap;
		let result;
		if (materialMap.has(key)) {
			result = materialMap.get(key);
		} else {
			result = new t3d.ShaderMaterial(colorShader);
			result.premultipliedAlpha = false; // multiply alpha in shader
			result.drawMode = drawMode;
			materialMap.set(key, result);
		}
		result.transparent = renderable.material.transparent;
		result.blending = renderable.material.blending;
		result.opacity = renderable.material.opacity;
		result.diffuse.copy(renderable.material.diffuse);
		result.diffuseMap = renderable.material.diffuseMap;
		return result;
	}
	const colorShader = {
		name: 'ec_color',
		defines: {},
		uniforms: {
			strength: 1
		},
		vertexShader: `
				#include <common_vert>
				#include <morphtarget_pars_vert>
				#include <skinning_pars_vert>
				#include <uv_pars_vert>
		#include <diffuseMap_pars_vert>
		#include <logdepthbuf_pars_vert>
				void main() {
					#include <uv_vert>
			#include <diffuseMap_vert>
					#include <begin_vert>
					#include <morphtarget_vert>
					#include <skinning_vert>
					#include <pvm_vert>
			#include <logdepthbuf_vert>
				}
		`,
		fragmentShader: `
				#include <common_frag>
				#include <diffuseMap_pars_frag>
		#include <alphaTest_pars_frag>

				#include <uv_pars_frag>

		#include <logdepthbuf_pars_frag>

		uniform float strength;

				void main() {
			#include <logdepthbuf_frag>

			vec4 outColor = vec4(u_Color, u_Opacity);

			#ifdef USE_DIFFUSE_MAP
				outColor *= texture2D(diffuseMap, vDiffuseMapUV);
			#endif

			#ifdef ALPHATEST
				if(outColor.a < u_AlphaTest) discard;
			#endif

			outColor.a *= strength;

						gl_FragColor = outColor;
				}
		`
	};

	class SceneBuffer extends Buffer {
		constructor(width, height, options) {
			super(width, height, options);
			this.enableCameraJitter = true;
			this._rt = new t3d.RenderTarget2D(width, height);
			this._rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this._mrt = new t3d.RenderTarget2D(width, height);
			this._mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			this.clearColor = true;
			this.clearDepth = true;
			this.clearStencil = true;

			// Allow append custom layer render
			// element type: { id: 0, mask: RenderListMask.ALL, options: {} }
			this.renderLayers = [{
				id: 0,
				mask: RenderListMask.ALL
			}];
			this._sceneRenderOptions = {};
			this._transmissionRT = new t3d.RenderTarget2D(width, height);
			setupColorTexture(this._transmissionRT.texture, options);
			this._transmissionRT.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			const transmissionRenderOptions = {
				getMaterial: renderable => {
					const samplerMap = this._transmissionRT.texture;
					renderable.material.uniforms.transmissionSamplerMap = samplerMap;
					renderable.material.uniforms.transmissionSamplerSize[0] = samplerMap.image.width;
					renderable.material.uniforms.transmissionSamplerSize[1] = samplerMap.image.height;
					return renderable.material;
				},
				ifRender: renderable => {
					return renderable.material.shaderName === 'TransmissionPBR';
				}
			};
			this.postRenderLayers = {
				transmission: {
					id: -1,
					mask: RenderListMask.ALL,
					options: transmissionRenderOptions
				},
				postTransmission: {
					id: -1,
					mask: RenderListMask.ALL
				},
				overlay: {
					id: 1,
					mask: RenderListMask.ALL
				}
			};
		}
		syncAttachments(colorAttachment, depthAttachment, msColorRenderBuffer, msDepthRenderBuffer) {
			this._rt.dispose();
			this._mrt.dispose();
			this._rt.attach(colorAttachment, t3d.ATTACHMENT.COLOR_ATTACHMENT0);
			if (isDepthStencilAttachment(depthAttachment)) {
				this._rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				this._rt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
			} else {
				this._rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				this._rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			}
			this._mrt.attach(msColorRenderBuffer, t3d.ATTACHMENT.COLOR_ATTACHMENT0);
			if (isDepthStencilAttachment(msDepthRenderBuffer)) {
				this._mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				this._mrt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
			} else {
				this._mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				this._mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			}
			this.needsUpdate = true;
		}
		setIfRenderReplaceFunction(func) {
			if (func) {
				this._sceneRenderOptions.ifRender = func;
			} else {
				delete this._sceneRenderOptions.ifRender;
			}
		}
		setGeometryReplaceFunction(func) {
			if (func) {
				this._sceneRenderOptions.getGeometry = func;
			} else {
				delete this._sceneRenderOptions.getGeometry;
			}
		}
		setOutputEncoding(encoding) {
			this._rt.texture.encoding = encoding;
		}
		getOutputEncoding() {
			return this._rt.texture.encoding;
		}
		render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			const useMSAA = composer.$useMSAA;
			const renderTarget = useMSAA ? this._mrt : this._rt;
			const hasStencil = !!renderTarget._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			const cameraJitter = composer.$cameraJitter;
			const enableCameraJitter = this.enableCameraJitter && cameraJitter.accumulating();
			renderer.setRenderTarget(renderTarget);
			if (composer.clearColor) {
				renderer.setClearColor(...composer._tempClearColor);
			} else {
				renderer.setClearColor(0, 0, 0, 0);
			}
			renderer.clear(this.clearColor, this.clearDepth, this.clearStencil && hasStencil);
			const renderStates = scene.getRenderStates(camera);
			const renderQueue = scene.getRenderQueue(camera);
			enableCameraJitter && cameraJitter.jitterProjectionMatrix(renderStates.camera, this._rt.width, this._rt.height);
			this.$renderScene(renderer, renderQueue, renderStates);
			this.$renderTransmission(renderer, renderQueue, renderStates);
			this.$renderPostTransmission(renderer, renderQueue, renderStates);
			this.$renderOverlay(renderer, renderQueue, renderStates);
			enableCameraJitter && cameraJitter.restoreProjectionMatrix(renderStates.camera);
			if (useMSAA) {
				renderer.setRenderTarget(this._rt);
				renderer.blitRenderTarget(this._mrt, this._rt, true, true, hasStencil);
			}

			// generate mipmaps for down sampler
			renderer.updateRenderTargetMipmap(this._rt);
		}
		output() {
			return this._rt;
		}
		resize(width, height) {
			super.resize(width, height);
			this._rt.resize(width, height);
			this._mrt.resize(width, height);
			this._transmissionRT.resize(width, height);
		}
		dispose() {
			super.dispose();
			this._rt.dispose();
			this._mrt.dispose();
			this._transmissionRT.dispose();
		}
		_renderOneLayer(renderer, renderQueue, renderStates, renderLayer) {
			const {
				id,
				mask = RenderListMask.ALL,
				options = this._sceneRenderOptions
			} = renderLayer;
			const layer = renderQueue.getLayer(id);
			if (layer) {
				if (layer.opaqueCount > 0 && mask & RenderListMask.OPAQUE) {
					renderer.renderRenderableList(layer.opaque, renderStates, options);
				}
				if (layer.transparentCount > 0 && mask & RenderListMask.TRANSPARENT) {
					renderer.renderRenderableList(layer.transparent, renderStates, options);
				}
			}
		}
		$renderScene(renderer, renderQueue, renderStates) {
			renderer.beginRender();
			const renderLayers = this.renderLayers;
			for (let i = 0, l = renderLayers.length; i < l; i++) {
				this._renderOneLayer(renderer, renderQueue, renderStates, renderLayers[i]);
			}
			renderer.endRender();
		}
		$renderTransmission(renderer, renderQueue, renderStates) {
			const renderLayer = this.postRenderLayers.transmission;
			if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;
			const oldRenderTarget = renderer.getRenderTarget();
			renderer.setRenderTarget(this._transmissionRT);
			renderer.blitRenderTarget(oldRenderTarget, this._transmissionRT, true, false, false);
			renderer.updateRenderTargetMipmap(this._transmissionRT);
			renderer.setRenderTarget(oldRenderTarget);
			renderer.beginRender();
			this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
			renderer.endRender();
		}
		$renderPostTransmission(renderer, renderQueue, renderStates) {
			const renderLayer = this.postRenderLayers.postTransmission;
			if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;
			renderer.beginRender();
			this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
			renderer.endRender();
		}
		$renderOverlay(renderer, renderQueue, renderStates) {
			const renderLayer = this.postRenderLayers.overlay;
			if (this.$isRenderLayerEmpty(renderQueue, renderLayer)) return;

			// TODO Forcing clear depth may cause bugs
			renderer.clear(false, true, false);
			renderer.beginRender();
			this._renderOneLayer(renderer, renderQueue, renderStates, renderLayer);
			renderer.endRender();
		}
		$isRenderLayerEmpty(renderQueue, renderLayer) {
			const {
				id,
				mask = RenderListMask.ALL
			} = renderLayer;
			if (id == -1) return true; // ignore invalid layer id

			const layer = renderQueue.getLayer(id);
			if (layer) {
				if (layer.opaqueCount > 0 && mask & RenderListMask.OPAQUE) {
					return false;
				}
				if (layer.transparentCount > 0 && mask & RenderListMask.TRANSPARENT) {
					return false;
				}
			}
			return true;
		}
	}

	class RenderTargetCache {
		constructor(width, height, options) {
			this._width = width;
			this._height = height;
			this._options = options;
			this._map = new Map();
		}
		allocate(level = 0) {
			let list = this._map.get(level);
			if (!list) {
				list = [];
				this._map.set(level, list);
			}
			if (list.length > 0) {
				return list.shift();
			} else {
				const divisor = Math.pow(2, level);
				const width = Math.ceil(this._width / divisor);
				const height = Math.ceil(this._height / divisor);
				const renderTarget = new t3d.RenderTarget2D(width, height);
				const texture = renderTarget._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				setupColorTexture(texture, this._options);
				texture.minFilter = t3d.TEXTURE_FILTER.LINEAR;
				texture.magFilter = t3d.TEXTURE_FILTER.LINEAR;
				texture.generateMipmaps = false;
				renderTarget.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				return renderTarget;
			}
		}
		release(renderTarget, level = 0) {
			const list = this._map.get(level);
			list.push(renderTarget);
		}
		resize(width, height) {
			this._width = width;
			this._height = height;
			this._map.forEach((list, level) => {
				const divisor = Math.pow(2, level);
				const width = Math.ceil(this._width / divisor);
				const height = Math.ceil(this._height / divisor);
				list.forEach(renderTarget => {
					renderTarget.resize(width, height);
				});
			});
		}
		updateStats(stats) {
			let count = 0;
			this._map.forEach((list, level) => {
				const divisor = Math.pow(2, level);
				count += list.length / (divisor * divisor);
			});
			stats.fboCache = count;
		}
		dispose() {
			this._map.forEach(list => {
				list.forEach(renderTarget => {
					renderTarget.dispose();
				});
			});
			this._map.clear();
		}
	}

	class CameraJitter {
		constructor(totalFrameCount = 30) {
			this._enabled = false;
			this._state = JITTER_STATE.DISABLED;
			this._totalFrame = 0;
			this._haltonSequenece = [];
			this._frame = 0;
			this._jitterMatrix = new t3d.Matrix4();
			this._originMatrix = new t3d.Matrix4();
			this.setTotalFrame(totalFrameCount);
		}
		setTotalFrame(count) {
			this._totalFrame = count;
			const haltonSequenece = [];
			for (let i = 0; i < count; i++) {
				haltonSequenece.push([halton(i, 2), halton(i, 3)]);
			}
			this._haltonSequence = haltonSequenece;
		}
		set enable(value) {
			if (this._state === JITTER_STATE.DISABLED) {
				if (value) {
					this._frame = 0;
					this._state = JITTER_STATE.ACCUMULATING;
				}
			} else if (this._state === JITTER_STATE.ACCUMULATING) {
				if (!value) {
					this._frame = 0;
					this._state = JITTER_STATE.DISABLED;
				}
			} else if (this._state === JITTER_STATE.FINISHED) {
				if (!value) {
					this._frame = 0;
					this._state = JITTER_STATE.DISABLED;
				}
			}
		}
		get enable() {
			return this._state !== JITTER_STATE.DISABLED;
		}
		reset() {
			if (this._state === JITTER_STATE.DISABLED) return;
			if (this._state === JITTER_STATE.ACCUMULATING) {
				this._frame = 0;
			} else if (this._state === JITTER_STATE.FINISHED) {
				this._state = JITTER_STATE.ACCUMULATING;
			}
		}
		update() {
			if (this._state !== JITTER_STATE.ACCUMULATING) return;
			this._frame++;
			if (this._frame >= this._totalFrame) {
				this._state = JITTER_STATE.FINISHED;
				this._frame = 0;
			}
		}
		finished() {
			return this._state === JITTER_STATE.FINISHED;
		}
		accumulating() {
			return this._state === JITTER_STATE.ACCUMULATING;
		}
		frame() {
			return this._frame;
		}
		totalFrame() {
			return this._totalFrame;
		}
		jitterProjectionMatrix(cameraData, width, height) {
			if (this._state !== JITTER_STATE.ACCUMULATING) return;
			const jitter = this._haltonSequence[this._frame];
			const jitterMatrix = this._jitterMatrix;
			jitterMatrix.elements[12] = (jitter[0] * 2 - 1) / width;
			jitterMatrix.elements[13] = (jitter[1] * 2 - 1) / height;
			this._originMatrix.copy(cameraData.projectionMatrix);
			cameraData.projectionMatrix.premultiply(jitterMatrix);
			cameraData.projectionViewMatrix.multiplyMatrices(cameraData.projectionMatrix, cameraData.viewMatrix);
		}
		restoreProjectionMatrix(cameraData) {
			if (this._state !== JITTER_STATE.ACCUMULATING) return;
			cameraData.projectionMatrix.copy(this._originMatrix);
			cameraData.projectionViewMatrix.multiplyMatrices(cameraData.projectionMatrix, cameraData.viewMatrix);
		}
	}
	const JITTER_STATE = {
		DISABLED: 1,
		ACCUMULATING: 2,
		FINISHED: 3
	};

	// Generate halton sequence
	// https://en.wikipedia.org/wiki/Halton_sequence
	function halton(index, base) {
		let result = 0;
		let f = 1 / base;
		let i = index;
		while (i > 0) {
			result = result + f * (i % base);
			i = Math.floor(i / base);
			f = f / base;
		}
		return result;
	}

	class EffectComposer {
		/**
		 * @param {Number} width - The width of the actual rendering size.
		 * @param {Number} height - The height of the actual rendering size.
		 * @param {Object} [options={}]
		 * @param {Boolean} [options.webgl2=false] - Whether to support WebGL2 features. Turning on will improve the storage accuracy of GBuffer.
		 * @param {Number} [options.samplerNumber=8] - MSAA sampling multiple.
		 * @param {Number} [options.maxMarkAttachment=5] - Maximum number of mark attachments. Means that it supports up to N*4 effects that need to be marked.
		 * @param {Number} [options.maxColorAttachment=5] - Maximum number of color buffer attachments.
		 * @param {Boolean} [options.depthTextureAttachment=false] - Whether to use depth texture as default depth attachment. Turning on will allow you to get the depth texture of the scene buffer.
		 * @param {Boolean} [options.bufferMipmaps=false] - Whether to generate mipmaps for buffers.
		 * @param {Boolean} [options.floatColorBuffer=false] - Whether to support the EXT_color_buffer_float feature. Turning on will improve the storage accuracy of GBuffer.
		 * @param {Boolean} [options.highDynamicRange=false] - Whether to use high dynamic range (HDR) rendering.
		 * @param {HDRMode} [options.hdrMode=HDRMode.RGBA16] - The pixel format of the HDR buffer. Only valid when hdr is enabled.
		 */
		constructor(width, height, options = {}) {
			this._size = new t3d.Vector2(width, height);
			options.webgl2 = options.webgl2 || false;
			options.samplerNumber = options.samplerNumber || 8;
			options.maxMarkAttachment = options.maxMarkAttachment || 5;
			options.maxColorAttachment = options.maxColorAttachment || 5;
			options.depthTextureAttachment = options.depthTextureAttachment || false;
			options.bufferMipmaps = options.bufferMipmaps || false;
			options.floatColorBuffer = options.floatColorBuffer || false;
			options.highDynamicRange = options.highDynamicRange || false;
			options.hdrMode = options.hdrMode || HDRMode.RGBA16;
			if (!options.webgl2 && options.hdrMode === HDRMode.R11G11B10) {
				console.warn('EffectComposer: HDRMode.R11G11B10 is only supported in WebGL2, fallback to HDRMode.RGBA16.');
				options.hdrMode = HDRMode.RGBA16;
			}
			if (options.halfFloatMarkBuffer) {
				console.warn('EffectComposer: The `halfFloatMarkBuffer` option is deprecated. Override mark buffer class to impltement this.');
			}

			// Create buffers

			const sceneBuffer = new SceneBuffer(width, height, options);
			const gBuffer = new GBuffer(width, height, options);
			const nonDepthMarkBuffer = new NonDepthMarkBuffer(width, height, options);
			const markBuffer = new MarkBuffer(width, height, options);
			const colorMarkBuffer = new ColorMarkBuffer(width, height, options);
			this._bufferMap = new Map([['SceneBuffer', sceneBuffer], ['GBuffer', gBuffer], ['NonDepthMarkBuffer', nonDepthMarkBuffer], ['MarkBuffer', markBuffer], ['ColorMarkBuffer', colorMarkBuffer]]);

			// Create default attachments.
			// In order to blending with external rendering results, Users may switch the attachments of sceneBuffer and markBuffer through the setExternalAttachment() method.
			// Default ColorTexture and MSColorRenderBuffer are prepared for color attachment of sceneBuffer.
			// Default DepthRenderBuffer and MSDepthRenderBuffer are prepared for depth attachements of sceneBuffer and markBuffer.
			// Noticed that sceneBuffer and markBuffer are sharing the same DepthRenderBuffer MSDepthRenderBuffer.

			this._defaultColorTexture = new t3d.Texture2D();
			setupColorTexture(this._defaultColorTexture, options);
			this._defaultMSColorRenderBuffer = new t3d.RenderBuffer(width, height, getColorBufferFormat(options), options.samplerNumber);
			if (!options.bufferMipmaps) {
				this._defaultColorTexture.generateMipmaps = false;
				this._defaultColorTexture.minFilter = t3d.TEXTURE_FILTER.LINEAR;
			}

			// Use DEPTH_COMPONENT24 in WebGL 2 for better depth precision.
			const defaultDepthFormat = options.webgl2 ? t3d.PIXEL_FORMAT.DEPTH_COMPONENT24 : t3d.PIXEL_FORMAT.DEPTH_COMPONENT16;
			if (options.depthTextureAttachment) {
				this._defaultDepthAttachment = new t3d.Texture2D();
				setupDepthTexture(this._defaultDepthAttachment);
			} else {
				this._defaultDepthAttachment = new t3d.RenderBuffer(width, height, defaultDepthFormat);
			}
			this._defaultMSDepthRenderBuffer = new t3d.RenderBuffer(width, height, defaultDepthFormat, options.samplerNumber);
			if (options.depthTextureAttachment) {
				this._defaultDepthStencilAttachment = new t3d.Texture2D();
				setupDepthTexture(this._defaultDepthStencilAttachment, true);
			} else {
				// Reference: https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.5
				// In WebGL 2, renderbufferStorage can accept DEPTH_STENCIL as internal format for backward compatibility, which is mapped to DEPTH24_STENCIL8 by implementations,
				// but renderbufferStorageMultisample can only accept DEPTH24_STENCIL8 as internal format.
				this._defaultDepthStencilAttachment = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH_STENCIL);
			}
			this._defaultMSDepthStencilRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH24_STENCIL8, options.samplerNumber);
			this._externalColorAttachment = null;
			this._externalDepthAttachment = null;
			this._samplerNumber = options.samplerNumber;
			this._externalMSAA = null;
			this._stencilBuffer = false;
			this._syncAttachments();

			//

			this._copyPass = new t3d.ShaderPostPass(copyShader);
			this._copyPass.material.premultipliedAlpha = true;
			this._renderTargetCache = new RenderTargetCache(width, height, options);
			this._cameraJitter = new CameraJitter();
			this._effectList = [];
			this._tempClearColor = [0, 0, 0, 1];
			this._tempViewport = [0, 0, 1, 1];
			this._tempBufferNames = new Set();
			this._stats = {
				fboCache: 0,
				markBuffers: 0,
				colorMarkBuffers: 0,
				currentBufferUsage: {}
			};

			// Public properties

			/**
			 * Whether to use msaa.
			 * @type {Boolean}
			 * @default false
			 */
			this.sceneMSAA = false;

			/**
			 * Whether to clear the color buffer before renderring.
			 * @type {Boolean}
			 * @default true
			 */
			this.clearColor = true;

			/**
			 * Whether to clear the depth buffer before renderring.
			 * @type {Boolean}
			 * @default true
			 */
			this.clearDepth = true;

			/**
			 * Whether to clear the stencil buffer before renderring.
			 * @type {Boolean}
			 * @default false
			 */
			this.clearStencil = false;

			/**
			 * The debugger for this effect composer
			 * @type {Null|Debugger}
			 * @default null
			 */
			this.debugger = null;
		}

		/**
		 * Get the base resolution of effect-composer, which is the same as the width and height set by resize().
		 * @return {t3d.Vector2}
		 */
		getSize() {
			return this._size;
		}
		_syncAttachments() {
			const externalColorAttachment = this._externalColorAttachment;
			const externalDepthAttachment = this._externalDepthAttachment;
			const external = !!externalColorAttachment && !!externalDepthAttachment;
			const externalMSAA = this._externalMSAA;
			let stencilBuffer = this._stencilBuffer;
			if (external) {
				stencilBuffer = isDepthStencilAttachment(externalDepthAttachment);
			}
			const defaultDepthRenderBuffer = stencilBuffer ? this._defaultDepthStencilAttachment : this._defaultDepthAttachment;
			const defaultMSDepthRenderBuffer = stencilBuffer ? this._defaultMSDepthStencilRenderBuffer : this._defaultMSDepthRenderBuffer;
			let sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment, depthAttachment, mDepthAttachment;
			if (external) {
				if (externalMSAA) {
					sceneColorAttachment = this._defaultColorTexture;
					sceneDepthAttachment = defaultDepthRenderBuffer;
					sceneMColorAttachment = externalColorAttachment;
					sceneMDepthAttachment = externalDepthAttachment;
					depthAttachment = defaultDepthRenderBuffer;
					mDepthAttachment = externalDepthAttachment;
				} else {
					sceneColorAttachment = externalColorAttachment;
					sceneDepthAttachment = externalDepthAttachment;
					sceneMColorAttachment = this._defaultMSColorRenderBuffer;
					sceneMDepthAttachment = defaultMSDepthRenderBuffer;
					depthAttachment = externalDepthAttachment;
					mDepthAttachment = defaultMSDepthRenderBuffer;
				}
			} else {
				sceneColorAttachment = this._defaultColorTexture;
				sceneDepthAttachment = defaultDepthRenderBuffer;
				sceneMColorAttachment = this._defaultMSColorRenderBuffer;
				sceneMDepthAttachment = defaultMSDepthRenderBuffer;
				depthAttachment = defaultDepthRenderBuffer;
				mDepthAttachment = defaultMSDepthRenderBuffer;
			}
			this._bufferMap.forEach(buffer => {
				if (buffer.syncAttachments) {
					buffer.syncAttachments(sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment);
				} else if (buffer.syncDepthAttachments) {
					buffer.syncDepthAttachments(depthAttachment, mDepthAttachment);
				}
			});
		}
		set stencilBuffer(value) {
			this._stencilBuffer = value;
			this._syncAttachments();
		}
		get stencilBuffer() {
			return this._stencilBuffer;
		}

		/**
		 * Set external attachments to blending with other rendering results.
		 * If this is set, the setting of sceneMSAA will be invalid, whether to use msaa depends on the external input attachments.
		 * @param {t3d.TextureBase|t3d.RenderBuffer} colorAttachment - The color attachment for scene buffer. Non-multisampled RenderBuffer is not supported for now.
		 * @param {t3d.RenderBuffer} depthAttachment - The depth attachment for scene buffer and mark buffer (They are sharing the same depth attachments).
		 */
		setExternalAttachment(colorAttachment, depthAttachment) {
			const colorMultipleSampling = getMultipleSampling(colorAttachment);
			const depthMultipleSampling = getMultipleSampling(depthAttachment);
			if (colorMultipleSampling !== depthMultipleSampling) {
				console.warn('EffectComposer.setExternalAttachment: color and depth attachment MultipleSampling not match.');
				return;
			}
			this._externalColorAttachment = colorAttachment;
			this._externalDepthAttachment = depthAttachment;
			this._externalMSAA = colorMultipleSampling > 0;
			this._syncAttachments();
		}

		/**
		 * Clear the external attachments setted by setExternalAttachment
		 */
		clearExternalAttachment() {
			this._externalColorAttachment = null;
			this._externalDepthAttachment = null;
			this._externalMSAA = null;
			this._syncAttachments();
		}
		addBuffer(name, buffer) {
			this._bufferMap.set(name, buffer);
		}
		removeBuffer(name) {
			this._bufferMap.delete(name);
		}
		getBuffer(name) {
			return this._bufferMap.get(name);
		}
		addEffect(name, effect, order = 0) {
			if (this.getEffect(name)) {
				console.warn('');
				return;
			}
			effect.name = name;
			this._effectList.push({
				name,
				effect,
				order
			});
			effect.resize(this._size.x, this._size.y);
		}
		removeEffect(name) {
			const index = this._effectList.findIndex(item => item.name === name);
			if (index > -1) {
				this._effectList.splice(index, 1);
			}
		}
		getEffect(name) {
			const target = this._effectList.find(item => item.name === name);
			if (target) {
				return target.effect;
			} else {
				return null;
			}
		}
		render(renderer, scene, camera, target) {
			const renderStates = scene.getRenderStates(camera);
			renderer.getClearColor().toArray(this._tempClearColor); // save clear color
			camera.rect.toArray(this._tempViewport);
			camera.rect.set(0, 0, 1, 1);
			renderStates.camera.rect.set(0, 0, 1, 1);
			this._bufferMap.forEach(buffer => {
				if (buffer.attachManager) {
					buffer.attachManager.reset();
				}
			});
			if (this.debugger) {
				this.debugger.bufferDependencies.forEach(name => {
					const buffer = this._bufferMap.get(name);
					if (this.debugger.channel && !!buffer.attachManager) {
						buffer.attachManager.allocate(this.debugger.channel, this.debugger.mask);
					}
					buffer.render(renderer, this, scene, camera);
				});
				this.debugger.render(renderer, this, target);
				renderer.setClearColor(...this._tempClearColor); // restore clear color

				return;
			}
			this._effectList.sort(sortByReverseOrder);
			let lastActiveIndex = this._effectList.findIndex(item => item.effect.active);
			const postEffectEnable = lastActiveIndex > -1;
			this._tempBufferNames.clear();
			const sceneBuffer = this._bufferMap.get('SceneBuffer');
			const renderQueue = scene.getRenderQueue(camera);
			if (postEffectEnable) {
				this._tempBufferNames.add('SceneBuffer'); // Insert SceneBuffer first

				let needCameraJitter = false;
				this._effectList.forEach(item => {
					if (item.effect.active) {
						item.effect.bufferDependencies.forEach(({
							key,
							mask
						}) => {
							this._tempBufferNames.add(key);
							if (this._bufferMap.get(key).attachManager) {
								this._bufferMap.get(key).attachManager.allocate(item.name, mask);
							}
						});
						needCameraJitter = needCameraJitter || item.effect.needCameraJitter;
					}
				});
				this._cameraJitter.enable = needCameraJitter;
				this._tempBufferNames.forEach(name => {
					this._bufferMap.get(name).render(renderer, this, scene, camera);
				});
				let inputRT = this._renderTargetCache.allocate();
				let outputRT = this._renderTargetCache.allocate();
				let tempRT;
				this._effectList.sort(sortByOrder);
				const len = this._effectList.length;
				const firstActiveIndex = this._effectList.findIndex(item => item.effect.active);
				lastActiveIndex = len - 1 - lastActiveIndex;
				this._effectList.forEach((item, index) => {
					if (!item.effect.active) return;
					const notLast = index < lastActiveIndex;
					item.effect.render(renderer, this, index === firstActiveIndex ? sceneBuffer.output() : inputRT, notLast ? outputRT : target, !notLast);

					// swap render target
					tempRT = inputRT;
					inputRT = outputRT;
					outputRT = tempRT;
				});
				this._renderTargetCache.release(inputRT);
				this._renderTargetCache.release(outputRT);
				this._cameraJitter.update();
			} else if (!!this._externalColorAttachment && !!this._externalDepthAttachment || !sceneBuffer.$isRenderLayerEmpty(renderQueue, sceneBuffer.postRenderLayers.transmission)) {
				sceneBuffer.render(renderer, this, scene, camera);
				renderer.setRenderTarget(target);
				renderer.setClearColor(0, 0, 0, 0);
				renderer.clear(this.clearColor, this.clearDepth, this.clearStencil);
				const copyPass = this._copyPass;
				copyPass.uniforms.tDiffuse = sceneBuffer.output().texture;
				copyPass.material.transparent = this._tempClearColor[3] < 1 || !this.clearColor;
				copyPass.renderStates.camera.rect.fromArray(this._tempViewport);
				copyPass.render(renderer);
			} else {
				renderer.setRenderTarget(target);
				renderer.setClearColor(...this._tempClearColor);
				renderer.clear(this.clearColor, this.clearDepth, this.clearStencil);
				renderStates.camera.rect.fromArray(this._tempViewport);
				sceneBuffer.$renderScene(renderer, renderQueue, renderStates);
				sceneBuffer.$renderPostTransmission(renderer, renderQueue, renderStates);
				sceneBuffer.$renderOverlay(renderer, renderQueue, renderStates);
			}
			renderer.setClearColor(...this._tempClearColor); // restore clear color
			camera.rect.fromArray(this._tempViewport);
			renderStates.camera.rect.fromArray(this._tempViewport);
		}
		getStats() {
			this._renderTargetCache.updateStats(this._stats);
			const count1 = this.getBuffer('MarkBuffer').attachManager.attachCount();
			const count2 = this.getBuffer('NonDepthMarkBuffer').attachManager.attachCount();
			const count3 = this.getBuffer('ColorMarkBuffer').attachManager.attachCount();
			this._stats.markBuffers = count1 + count2;
			this._stats.colorMarkBuffers = count3;
			for (const [key, value] of this._bufferMap) {
				if (value.attachManager) {
					continue;
				}
				this._stats.currentBufferUsage[key] = this._tempBufferNames.has(key) ? 1 : 0;
			}
			return this._stats;
		}
		resize(width, height) {
			this._size.set(width, height);
			this._bufferMap.forEach(buffer => buffer.resize(width, height));
			this._renderTargetCache.resize(width, height);
			this._effectList.forEach(item => item.effect.resize(width, height));
		}
		dispose() {
			this._bufferMap.forEach(buffer => buffer.dispose());
			this._renderTargetCache.dispose();
			this._effectList.forEach(item => item.effect.dispose());
			this._copyPass.dispose();
		}

		// Protected methods

		get $useMSAA() {
			return (this._externalMSAA !== null ? this._externalMSAA : this.sceneMSAA) && this._samplerNumber > 1;
		}
		get $cameraJitter() {
			return this._cameraJitter;
		}
	}
	function sortByOrder(a, b) {
		return a.order - b.order;
	}
	function sortByReverseOrder(a, b) {
		return b.order - a.order;
	}
	function getMultipleSampling(attachment) {
		return attachment.isTexture ? 0 : attachment.multipleSampling;
	}

	class DefaultEffectComposer extends EffectComposer {
		constructor(width, height, options) {
			super(width, height, options);
			this.addEffect('SSAO', new SSAOEffect(), 0);
			this.addEffect('SSR', new SSREffect(), 1);
			this.addEffect('ColorCorrection', new ColorCorrectionEffect(), 2);
			this.addEffect('DOF', new DOFEffect(), 3);
			this.addEffect('Bloom', new BloomEffect(), 4);
			this.addEffect('InnerGlow', new InnerGlowEffect(), 10);
			this.addEffect('Glow', new GlowEffect(), 11);
			this.addEffect('SoftGlow', new SoftGlowEffect(), 12);
			this.addEffect('Tailing', new TailingEffect(), 13);
			this.addEffect('RadialTailing', new RadialTailingEffect(), 14);
			this.addEffect('Ghosting', new GhostingEffect(), 15);

			// Insert outline effects here.

			this.addEffect('FXAA', new FXAAEffect(), 101);
			this.addEffect('ChromaticAberration', new ChromaticAberrationEffect(), 102);
			this.addEffect('Vignetting', new VignettingEffect(), 103);
			this.addEffect('BlurEdge', new BlurEdgeEffect(), 104);
			this.addEffect('Film', new FilmEffect(), 105);
			this._effectList.forEach(item => item.effect.active = false); // auto close
		}
	}

	class Debugger {
		constructor() {
			this.bufferDependencies = [];
		}
		render(renderer, composer, outputRenderTarget) {
			console.error('Debugger: .render() must be implemented in subclass.');
		}
		resize(width, height) {}
		dispose() {}
	}

	class ColorMarkBufferDebugger extends Debugger {
		constructor() {
			super();
			this.bufferDependencies = ['SceneBuffer', 'ColorMarkBuffer'];
			this._mainPass = new t3d.ShaderPostPass(copyShader);
			this.channel = '';
			this.mask = RenderListMask.ALL;
		}
		render(renderer, composer, outputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 1);
			renderer.clear(true, true, false);
			const buffer = composer.getBuffer('ColorMarkBuffer');
			const attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._mainPass.render(renderer);
		}
	}

	class GBufferDebugger extends Debugger {
		constructor() {
			super();
			this.bufferDependencies = ['GBuffer'];
			this._mainPass = new t3d.ShaderPostPass(shader);
			this.debugType = DebugTypes.Normal;
		}
		render(renderer, composer, outputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 1);
			renderer.clear(true, true, false);
			const gBuffer = composer.getBuffer('GBuffer');
			const gBufferRenderStates = gBuffer.getCurrentRenderStates();
			this._mainPass.uniforms['colorTexture0'] = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._mainPass.uniforms['depthTexture'] = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._mainPass.uniforms['debug'] = this.debugType || 0;
			gBufferRenderStates.camera.projectionViewMatrix.toArray(this._mainPass.uniforms['projectionView']);
			this._mainPass.render(renderer);
		}
	}
	const DebugTypes = {
		Normal: 0,
		Depth: 1,
		Position: 2,
		Metalness: 3,
		Roughness: 4
	};
	GBufferDebugger.DebugTypes = DebugTypes;
	const shader = {
		name: 'ec_debug_gbuffer',
		defines: {},
		uniforms: {
			colorTexture0: null,
			depthTexture: null,
			projectionView: new Float32Array(16),
			debug: 0
		},
		vertexShader: defaultVertexShader,
		fragmentShader: `
		uniform sampler2D colorTexture0;
		uniform sampler2D depthTexture;
		uniform int debug;

		uniform mat4 projectionView;

		varying vec2 v_Uv;

		${octahedronToUnitVectorGLSL}

		void main() {
			vec2 texCoord = v_Uv;
			vec4 texel = texture2D(colorTexture0, texCoord);

			if (texel.r < -2.0) {
				discard;
			}

			vec3 normal = octahedronToUnitVector(texel.rg);
			float depth = texture2D(depthTexture, texCoord).r;

			vec2 xy = texCoord * 2.0 - 1.0;
			float z = depth * 2.0 - 1.0;

			vec4 projectedPos = vec4(xy, z, 1.0);
			vec4 p4 = inverse(projectionView) * projectedPos;

			vec3 position = p4.xyz / p4.w;

			if (debug == 0) {
				gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
			} else if (debug == 1) {
				gl_FragColor = vec4(vec3(depth), 1.0);
			} else if (debug == 2) {
				gl_FragColor = vec4(position, 1.0);
			} else if (debug == 3) {
				gl_FragColor = vec4(vec3(texel.b), 1.0);
			} else {
				gl_FragColor = vec4(vec3(texel.a), 1.0);
			}
		}
	`
	};

	class MarkBufferDebugger extends Debugger {
		constructor() {
			super();
			this.bufferDependencies = ['SceneBuffer', 'MarkBuffer'];
			this._mainPass = new t3d.ShaderPostPass(channelShader);
			this.channel = '';
			this.mask = RenderListMask.ALL;
		}
		render(renderer, composer, outputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 1);
			renderer.clear(true, true, false);
			const buffer = composer.getBuffer('MarkBuffer');
			const attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			const channelIndex = buffer.attachManager.getChannelIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (let i = 0; i < 4; i++) {
				this._mainPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._mainPass.render(renderer);
		}
	}

	class NonDepthMarkBufferDebugger extends Debugger {
		constructor() {
			super();
			this.bufferDependencies = ['NonDepthMarkBuffer'];
			this._mainPass = new t3d.ShaderPostPass(channelShader);
			this.channel = '';
			this.mask = RenderListMask.ALL;
		}
		render(renderer, composer, outputRenderTarget) {
			renderer.setRenderTarget(outputRenderTarget);
			renderer.setClearColor(0, 0, 0, 1);
			renderer.clear(true, true, false);
			const buffer = composer.getBuffer('NonDepthMarkBuffer');
			const attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			const channelIndex = buffer.attachManager.getChannelIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (let i = 0; i < 4; i++) {
				this._mainPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._mainPass.render(renderer);
		}
	}

	class SSAODebugger extends Debugger {
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

	class SSRDebugger extends Debugger {
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

	// deprecated since v0.1.3, add warning since v0.3.0, to be removed in v0.4.0
	Object.defineProperties(SSREffect.prototype, {
		mixType: {
			set: function (value) {
				console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
				this.falloff = value;
			},
			get: function () {
				console.warn('SSREffect: mixType has been deprecated, use falloff instead.');
				return this.falloff;
			}
		}
	});

	exports.AccumulationBuffer = AccumulationBuffer;
	exports.BloomEffect = BloomEffect;
	exports.BlurEdgeEffect = BlurEdgeEffect;
	exports.Buffer = Buffer;
	exports.ChromaticAberrationEffect = ChromaticAberrationEffect;
	exports.ColorCorrectionEffect = ColorCorrectionEffect;
	exports.ColorMarkBufferDebugger = ColorMarkBufferDebugger;
	exports.DOFEffect = DOFEffect;
	exports.Debugger = Debugger;
	exports.DefaultEffectComposer = DefaultEffectComposer;
	exports.Effect = Effect;
	exports.EffectComposer = EffectComposer;
	exports.FXAAEffect = FXAAEffect;
	exports.FilmEffect = FilmEffect;
	exports.GBufferDebugger = GBufferDebugger;
	exports.GhostingEffect = GhostingEffect;
	exports.GlowEffect = GlowEffect;
	exports.HDRMode = HDRMode;
	exports.InnerGlowEffect = InnerGlowEffect;
	exports.MarkBufferDebugger = MarkBufferDebugger;
	exports.NonDepthMarkBufferDebugger = NonDepthMarkBufferDebugger;
	exports.OutlineEffect = OutlineEffect;
	exports.RadialTailingEffect = RadialTailingEffect;
	exports.RenderListMask = RenderListMask;
	exports.SSAODebugger = SSAODebugger;
	exports.SSAOEffect = SSAOEffect;
	exports.SSRDebugger = SSRDebugger;
	exports.SSREffect = SSREffect;
	exports.SoftGlowEffect = SoftGlowEffect;
	exports.TAAEffect = TAAEffect;
	exports.TailingEffect = TailingEffect;
	exports.ToneMappingEffect = ToneMappingEffect;
	exports.ToneMappingType = ToneMappingType;
	exports.VignettingEffect = VignettingEffect;
	exports.additiveShader = additiveShader;
	exports.blurShader = blurShader;
	exports.channelShader = channelShader;
	exports.copyShader = copyShader;
	exports.defaultVertexShader = defaultVertexShader;
	exports.fxaaShader = fxaaShader;
	exports.getColorBufferFormat = getColorBufferFormat;
	exports.highlightShader = highlightShader;
	exports.horizontalBlurShader = horizontalBlurShader;
	exports.isDepthStencilAttachment = isDepthStencilAttachment;
	exports.maskShader = maskShader;
	exports.multiplyShader = multiplyShader;
	exports.octahedronToUnitVectorGLSL = octahedronToUnitVectorGLSL;
	exports.seperableBlurShader = seperableBlurShader;
	exports.setupColorTexture = setupColorTexture;
	exports.setupDepthTexture = setupDepthTexture;
	exports.unitVectorToOctahedronGLSL = unitVectorToOctahedronGLSL;
	exports.verticalBlurShader = verticalBlurShader;

}));
