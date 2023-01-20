// t3d-effect-composer
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('t3d')) :
	typeof define === 'function' && define.amd ? define(['exports', 't3d'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.t3d = global.t3d || {}, global.t3d));
})(this, (function (exports, t3d) { 'use strict';

	var Buffer = /*#__PURE__*/function () {
		function Buffer(width, height, options) {
			this.autoUpdate = true;
			this.needsUpdate = true;
		}
		var _proto = Buffer.prototype;
		_proto.needRender = function needRender() {
			if (this.autoUpdate) return true;
			if (this.needsUpdate) {
				this.needsUpdate = false;
				return true;
			}
			return false;
		};
		_proto.setGeometryReplaceFunction = function setGeometryReplaceFunction(func) {}

		// SceneBuffer does not have this method
		// setMaterialReplaceFunction(func) {}
		;
		_proto.render = function render(renderer, composer, scene, camera) {};
		_proto.output = function output(attachIndex) {};
		_proto.resize = function resize(width, height) {
			this.needsUpdate = true;
		};
		_proto.dispose = function dispose() {
			this.needsUpdate = true;
		};
		return Buffer;
	}();

	function _defineProperties(target, props) {
		for (var i = 0; i < props.length; i++) {
			var descriptor = props[i];
			descriptor.enumerable = descriptor.enumerable || false;
			descriptor.configurable = true;
			if ("value" in descriptor) descriptor.writable = true;
			Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
		}
	}
	function _createClass(Constructor, protoProps, staticProps) {
		if (protoProps) _defineProperties(Constructor.prototype, protoProps);
		if (staticProps) _defineProperties(Constructor, staticProps);
		Object.defineProperty(Constructor, "prototype", {
			writable: false
		});
		return Constructor;
	}
	function _inheritsLoose(subClass, superClass) {
		subClass.prototype = Object.create(superClass.prototype);
		subClass.prototype.constructor = subClass;
		_setPrototypeOf(subClass, superClass);
	}
	function _setPrototypeOf(o, p) {
		_setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
			o.__proto__ = p;
			return o;
		};
		return _setPrototypeOf(o, p);
	}
	function _unsupportedIterableToArray(o, minLen) {
		if (!o) return;
		if (typeof o === "string") return _arrayLikeToArray(o, minLen);
		var n = Object.prototype.toString.call(o).slice(8, -1);
		if (n === "Object" && o.constructor) n = o.constructor.name;
		if (n === "Map" || n === "Set") return Array.from(o);
		if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
	}
	function _arrayLikeToArray(arr, len) {
		if (len == null || len > arr.length) len = arr.length;
		for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
		return arr2;
	}
	function _createForOfIteratorHelperLoose(o, allowArrayLike) {
		var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];
		if (it) return (it = it.call(o)).next.bind(it);
		if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
			if (it) o = it;
			var i = 0;
			return function () {
				if (i >= o.length) return {
					done: true
				};
				return {
					done: false,
					value: o[i++]
				};
			};
		}
		throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}
	function _toPrimitive(input, hint) {
		if (typeof input !== "object" || input === null) return input;
		var prim = input[Symbol.toPrimitive];
		if (prim !== undefined) {
			var res = prim.call(input, hint || "default");
			if (typeof res !== "object") return res;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return (hint === "string" ? String : Number)(input);
	}
	function _toPropertyKey(arg) {
		var key = _toPrimitive(arg, "string");
		return typeof key === "symbol" ? key : String(key);
	}

	var Effect = /*#__PURE__*/function () {
		function Effect() {
			this.name = '';
			this.bufferDependencies = [];
			this.active = true;
		}
		var _proto = Effect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			console.error('Effect: .render() must be implemented in subclass.');
		};
		_proto.resize = function resize(width, height) {};
		_proto.dispose = function dispose() {};
		return Effect;
	}();

	var defaultVertexShader = "\n		attribute vec3 a_Position;\n		attribute vec2 a_Uv;\n\n		uniform mat4 u_ProjectionView;\n		uniform mat4 u_Model;\n\n		varying vec2 v_Uv;\n\n		void main() {\n				v_Uv = a_Uv;\n				gl_Position = u_ProjectionView * u_Model * vec4(a_Position, 1.0);\n		}\n";
	var blurShader = {
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
		fragmentShader: "\n				uniform vec2 textureSize;\n				uniform int direction;\n				uniform float blurSize;\n				uniform float kernel[KERNEL_SIZE_INT];\n\n				#if NORMALTEX_ENABLED == 1\n						uniform sampler2D normalTex;\n						uniform mat4 viewInverseTranspose;\n						vec3 getViewNormal(const in vec2 screenPosition) {\n								vec3 normal = texture2D(normalTex, screenPosition).xyz * 2.0 - 1.0;\n								// Convert to view space\n								return (viewInverseTranspose * vec4(normal, 0.0)).xyz;\n						}\n				#endif\n\n				#if DEPTHTEX_ENABLED == 1\n\t\t\t#if DEPTH_PACKING == 1\n\t\t\t\t#include <packing>\n\t\t\t#endif\n\t\t\tuniform sampler2D depthTex;\n\t\t\tuniform mat4 projection;\n\t\t\tuniform float depthRange;\n\t\t\tfloat getDepth( const in vec2 screenPosition ) {\n\t\t\t\t#if DEPTH_PACKING == 1\n\t\t\t\t\treturn unpackRGBAToDepth( texture2D( depthTex, screenPosition ) );\n\t\t\t\t#else\n\t\t\t\t\treturn texture2D( depthTex, screenPosition ).r;\n\t\t\t\t#endif\n\t\t\t}\n\t\t\tfloat getLinearDepth(vec2 coord) {\n\t\t\t\tfloat depth = getDepth(coord) * 2.0 - 1.0;\n\t\t\t\treturn projection[3][2] / (depth * projection[2][3] - projection[2][2]);\n\t\t\t}\n\t\t#endif\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec2 off = vec2(0.0);\n						if (direction == 0) {\n								off[0] = blurSize / textureSize.x;\n						} else {\n								off[1] = blurSize / textureSize.y;\n						}\n\n						vec4 sum = vec4(0.0);\n						float weightAll = 0.0;\n\n						#if NORMALTEX_ENABLED == 1\n								vec3 centerNormal = getViewNormal(v_Uv);\n						#endif\n						#if DEPTHTEX_ENABLED == 1\n								float centerDepth = getLinearDepth(v_Uv);\n						#endif\n\n						for (int i = 0; i < KERNEL_SIZE_INT; i++) {\n\t\t\t\tvec2 coord = clamp(v_Uv + vec2(float(i) - (KERNEL_SIZE_FLOAT - 1.) / 2.) * off, vec2(0.0), vec2(1.0));\n\t\t\t\tfloat w = kernel[i];\n\n\t\t\t\t#if NORMALTEX_ENABLED == 1\n\t\t\t\t\tvec3 normal = getViewNormal(coord);\n\t\t\t\t\tw *= clamp(dot(normal, centerNormal), 0.0, 1.0);\n\t\t\t\t#endif\n\t\t\t\t#if DEPTHTEX_ENABLED == 1\n\t\t\t\t\tfloat d = getLinearDepth(coord);\n\t\t						// PENDING Better equation?\n\t\t						// w *= (1.0 - smoothstep(abs(centerDepth - d) / depthRange, 0.0, 1.0));\n\t\t\t\t\tw *= (1.0 - smoothstep(0.0, 1.0, abs(centerDepth - d) / depthRange));\n\t\t\t\t#endif\n\n\t\t\t\tweightAll += w;\n\t\t\t\tsum += w * texture2D(tDiffuse, coord);\n\t\t\t}\n\n\t\t\tgl_FragColor = sum / weightAll;\n				}\n		"
	};
	var additiveShader = {
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
		fragmentShader: "\n				uniform sampler2D texture1;\n				uniform float colorWeight1;\n				uniform float alphaWeight1;\n\n				uniform sampler2D texture2;\n				uniform float colorWeight2;\n				uniform float alphaWeight2;\n\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 texel1 = texture2D(texture1, v_Uv);\n						vec4 texel2 = texture2D(texture2, v_Uv);\n						vec3 color = texel1.rgb * colorWeight1 + texel2.rgb * colorWeight2;\n						float alpha = texel1.a * alphaWeight1 + texel2.a * alphaWeight2;\n						gl_FragColor = vec4(color, alpha);\n				}\n		"
	};
	var multiplyShader = {
		name: 'ec_multiply',
		defines: {},
		uniforms: {
			texture1: null,
			texture2: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D texture1;\n				uniform sampler2D texture2;\n\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 texel1 = texture2D(texture1, v_Uv);\n						vec4 texel2 = texture2D(texture2, v_Uv);\n						gl_FragColor = texel1 * texel2;\n				}\n		"
	};
	var copyShader = {
		name: 'ec_copy',
		defines: {},
		uniforms: {
			tDiffuse: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D tDiffuse;\n\n				varying vec2 v_Uv;\n\n				void main() {\n						gl_FragColor = texture2D(tDiffuse, v_Uv);\n				}\n		"
	};
	var channelShader = {
		name: 'ec_channel',
		defines: {},
		uniforms: {
			tDiffuse: null,
			channelMask: [1, 0, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D tDiffuse;\n\t\tuniform vec4 channelMask;\n\n				varying vec2 v_Uv;\n\n				void main() {\n\t\t\tfloat value = dot(texture2D(tDiffuse, v_Uv), channelMask);\n						gl_FragColor = vec4(vec3(value), 1.0);\n				}\n		"
	};
	var maskShader = {
		name: 'ec_mask',
		defines: {},
		uniforms: {
			colorTexture: null,
			maskTexture: null,
			additiveTexture: null,
			channel: [1, 0, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D colorTexture;\n\t\tuniform sampler2D maskTexture;\n\n\t\tuniform sampler2D additiveTexture;\n\n\t\tuniform vec4 channel;\n\n				varying vec2 v_Uv;\n\n				void main() {\n\t\t\tvec4 colorTex = texture2D(colorTexture, v_Uv);\n\t\t\tvec4 maskTex = texture2D(maskTexture, v_Uv);\n\t\t\tvec4 addTex = texture2D(additiveTexture, v_Uv);\n						gl_FragColor = colorTex * dot(maskTex, channel) + addTex;\n				}\n		"
	};
	var highlightShader = {
		name: 'ec_highlight',
		defines: {},
		uniforms: {
			tDiffuse: null,
			threshold: 1.0,
			smoothWidth: 0.01
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform float threshold;\n\t\tuniform float smoothWidth;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 texel = texture2D(tDiffuse, v_Uv);\n						vec3 luma = vec3(0.299, 0.587, 0.114);\n						float v = dot(texel.xyz, luma);\n						gl_FragColor = smoothstep(threshold, threshold + smoothWidth, v) * texel;\n				}\n		"
	};
	var seperableBlurShader = {
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
		fragmentShader: "\n				uniform vec2 texSize;\n				uniform vec2 direction;\n				uniform float kernelRadius;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				float gaussianPdf(in float x, in float sigma) {\n\t\t\treturn 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;\n\t\t}\n\n				void main() {\n						vec2 invSize = 1.0 / texSize;\n\t\t\tfloat weightSum = gaussianPdf(0.0, kernelRadius);\n\t\t\tvec4 diffuseColor = texture2D(tDiffuse, v_Uv);\n\t\t\tvec4 diffuseSum = diffuseColor * weightSum;\n\t\t\tvec2 delta = direction * invSize * kernelRadius / float(MAX_RADIUS);\n\t\t\tvec2 uvOffset = delta;\n\t\t\tfor( int i = 1; i <= MAX_RADIUS; i ++ ) {\n\t\t\t\tfloat w = gaussianPdf(uvOffset.x, kernelRadius);\n\t\t\t\tvec4 sample1 = texture2D(tDiffuse, v_Uv + uvOffset);\n\t\t\t\tvec4 sample2 = texture2D(tDiffuse, v_Uv - uvOffset);\n\t\t\t\tdiffuseSum += ((sample1 + sample2) * w);\n\t\t\t\tweightSum += (2.0 * w);\n\t\t\t\tuvOffset += delta;\n\t\t\t}\n\t\t\tvec4 color = diffuseSum / weightSum;\n\t\t\tgl_FragColor = color;\n				}\n		"
	};
	var horizontalBlurShader = {
		name: 'ec_h_blur',
		uniforms: {
			tDiffuse: null,
			h: 1 / 512
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tuniform float h;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 sum = vec4(0.0);\n					 \n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * h, v_Uv.y)) * 0.051;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * h, v_Uv.y)) * 0.0918;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * h, v_Uv.y)) * 0.12245;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * h, v_Uv.y)) * 0.1531;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)) * 0.1633;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x + 1.0 * h, v_Uv.y)) * 0.1531;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * h, v_Uv.y)) * 0.12245;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * h, v_Uv.y)) * 0.0918;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * h, v_Uv.y)) * 0.051;\n\n\t\t\tgl_FragColor = sum;\n				}\n		"
	};
	var verticalBlurShader = {
		name: 'ec_v_blur',
		uniforms: {
			tDiffuse: null,
			v: 1 / 512
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tuniform float v;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 sum = vec4(0.0);\n					 \n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 4.0 * v)) * 0.051;\n						sum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 3.0 * v)) * 0.0918;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 2.0 * v)) * 0.12245;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y - 1.0 * v)) * 0.1531;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)) * 0.1633;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 1.0 * v)) * 0.1531;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 2.0 * v)) * 0.12245;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 3.0 * v)) * 0.0918;\n\t\t\tsum += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y + 4.0 * v)) * 0.051;\n\n\t\t\tgl_FragColor = sum;\n				}\n		"
	};
	function isDepthStencilAttachment(attachment) {
		return attachment.format === t3d.PIXEL_FORMAT.DEPTH_STENCIL || attachment.format === t3d.PIXEL_FORMAT.DEPTH24_STENCIL8;
	}
	var RenderListMask = {
		OPAQUE: 1,
		// 0001
		TRANSPARENT: 2,
		// 0010
		ALL: 15 // 1111
	};

	var BloomEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(BloomEffect, _Effect);
		function BloomEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.threshold = 0.7;
			_this.smoothWidth = 0.01;
			_this.blurSize = 2;
			_this.strength = 1;
			_this._highlightPass = new t3d.ShaderPostPass(highlightShader);
			_this._blurPass = new t3d.ShaderPostPass(blurShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = BloomEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._blurPass.uniforms.textureSize[0] = width;
			this._blurPass.uniforms.textureSize[1] = height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(1);
			var tempRT3 = composer._renderTargetCache.allocate(1);
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._highlightPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this._highlightPass.uniforms.threshold = this.threshold;
			this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
			this._highlightPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.uniforms.direction = 0;
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT3);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.blurSize = this.blurSize;
			this._blurPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return BloomEffect;
	}(Effect);

	var ChromaticAberrationEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(ChromaticAberrationEffect, _Effect);
		function ChromaticAberrationEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.chromaFactor = 0.025;
			_this._mainPass = new t3d.ShaderPostPass(shader$4);
			_this._mainPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = ChromaticAberrationEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
			}
			var mainPass = this._mainPass;
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
		};
		return ChromaticAberrationEffect;
	}(Effect);
	var shader$4 = {
		name: 'ec_chromatic_aberration',
		defines: {},
		uniforms: {
			tDiffuse: null,
			uChromaFactor: 0.025,
			uResolutionRatio: [1, 1],
			resolution: [1 / 1024, 1 / 512]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform float uChromaFactor;\n				uniform vec2 uResolutionRatio;\n				uniform vec2 resolution;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec2 uv = v_Uv;\n						vec2 dist = uv - 0.5;\n						vec2 offset = uChromaFactor * dist * length(dist);\n						vec4 col = texture2D(tDiffuse, min(uv, 1.0 - resolution) * uResolutionRatio);\n						col.r = texture2D(tDiffuse, min(uv - offset, 1.0 - resolution) * uResolutionRatio).r;\n						col.b = texture2D(tDiffuse, min(uv + offset, 1.0 - resolution) * uResolutionRatio).b;\n						gl_FragColor = col;\n				}\n		"
	};

	var ColorCorrectionEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(ColorCorrectionEffect, _Effect);
		function ColorCorrectionEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.brightness = 0;
			_this.contrast = 1.02;
			_this.exposure = 0;
			_this.gamma = 1;
			_this.saturation = 1.02;
			_this._mainPass = new t3d.ShaderPostPass(shader$3);
			_this._mainPass.material.premultipliedAlpha = true;
			_this._mainPass.uniforms.contrast = 1.02;
			_this._mainPass.uniforms.saturation = 1.02;
			return _this;
		}
		var _proto = ColorCorrectionEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
			}
			var mainPass = this._mainPass;
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
		};
		return ColorCorrectionEffect;
	}(Effect);
	var shader$3 = {
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
		fragmentShader: "\n				uniform float brightness;\n				uniform float contrast;\n				uniform float exposure;\n				uniform float gamma;\n				uniform float saturation;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				// Values from \"Graphics Shaders: Theory and Practice\" by Bailey and Cunningham\n				const vec3 w = vec3(0.2125, 0.7154, 0.0721);\n\n				void main() {\n						vec4 tex = texture2D(tDiffuse, v_Uv);\n						// brightness\n						vec3 color = clamp(tex.rgb + vec3(brightness), 0.0, 1.0);\n						// contrast\n						color = clamp((color - vec3(0.5)) * contrast + vec3(0.5), 0.0, 1.0);\n						// exposure\n						color = clamp(color * pow(2.0, exposure), 0.0, 1.0);\n						// gamma\n						color = clamp(pow(color, vec3(gamma)), 0.0, 1.0);\n						float luminance = dot(color, w);\n						color = mix(vec3(luminance), color, saturation);\n						gl_FragColor = vec4(color, tex.a);\n				}\n		"
	};

	var DOFEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(DOFEffect, _Effect);
		function DOFEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.bufferDependencies = [{
				key: 'GBuffer'
			}];
			_this.focalDepth = 1;
			_this.focalLength = 24;
			_this.fstop = 0.9;
			_this.maxblur = 1.0;
			_this.threshold = 0.9;
			_this.gain = 1.0;
			_this.bias = 0.5;
			_this.dithering = 0.0001;
			_this._mainPass = new t3d.ShaderPostPass(bokehShader);
			_this._mainPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = DOFEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
			}
			var gBuffer = composer.getBuffer('GBuffer');
			var gBufferRenderStates = gBuffer.getCurrentRenderStates();
			this._mainPass.uniforms.tColor = inputRenderTarget.texture;
			this._mainPass.uniforms.tDepth = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			var cameraNear = 0,
				cameraFar = 0;
			var projectionMatrix = gBufferRenderStates.camera.projectionMatrix;
			if (_isPerspectiveMatrix(projectionMatrix)) {
				cameraNear = projectionMatrix.elements[14] / (projectionMatrix.elements[10] - 1);
				cameraFar = projectionMatrix.elements[14] / (projectionMatrix.elements[10] + 1);
			} else {
				cameraNear = (projectionMatrix.elements[14] + 1) / projectionMatrix.elements[10];
				cameraFar = (projectionMatrix.elements[14] - 1) / projectionMatrix.elements[10];
			}
			this._mainPass.uniforms.znear = cameraNear;
			this._mainPass.uniforms.zfar = cameraFar;
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
		};
		return DOFEffect;
	}(Effect);
	function _isPerspectiveMatrix(m) {
		return m.elements[11] === -1.0;
	}
	var bokehShader = {
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
		fragmentShader: "\n				varying vec2 v_Uv;\n\n				uniform sampler2D tColor;\n				uniform sampler2D tDepth;\n				\n				uniform vec2 resolution;	\n				\n				uniform float znear;\n				uniform float zfar;\n\n				uniform float focalDepth;\n				uniform float focalLength;\n				uniform float fstop;\n\n				uniform float maxblur; // clamp value of max blur (0.0 = no blur, 1.0 default)\n				uniform float threshold; // highlight threshold\n				uniform float gain; // highlight gain\n				uniform float bias; // bokeh edge bias\n				uniform float dithering;\n\n				const int samples = SAMPLES;\n				const int rings = RINGS;\n				const int maxringsamples = rings * samples;\n\n				float CoC = 0.03; // circle of confusion size in mm (35mm film = 0.03mm)\n\n				vec4 color(vec2 coords, float blur) {\n						vec4 col = texture2D(tColor, coords);\n						vec3 lumcoeff = vec3(0.299, 0.587, 0.114);\n						float lum = dot(col.rgb, lumcoeff);\n						float thresh = max((lum - threshold) * gain, 0.0);\n						return vec4(col.rgb + mix(vec3(0.0), col.rgb, thresh * blur), col.a);\n				}\n\n				float linearize(float depth) {\n						return -zfar * znear / (depth * (zfar - znear) - zfar);\n				}\n\n				float gather(float i, float j, int ringsamples, inout vec3 colorSum, float w, float h, float blur) {\n						float rings2 = float(rings);\n						float step = PI * 2.0 / float(ringsamples);\n						float pw = cos(j * step) * i;\n						float ph = sin(j * step) * i;\n\t\t\tvec4 sampleColor = color(v_Uv + vec2(pw * w, ph * h), blur);\n\t\t\tfloat weight = mix(1.0, i / rings2, bias) * sampleColor.a;\n						colorSum += sampleColor.rgb	* weight;\n						return weight;\n				}\n\n				void main() {\n						float depth = linearize(texture2D(tDepth,	v_Uv).x);\n						float fDepth = focalDepth;\n\n						// dof blur factor calculation\n\n						float f = focalLength; // focal length in mm\n						float d = fDepth * 1000.; // focal plane in mm\n						float o = depth * 1000.; // depth in mm\n\n						float a = (o * f) / (o - f);\n						float b = (d * f) / (d - f);\n						float c = (d - f) / (d * fstop * CoC);\n\n						float blur = abs(a - b) * c;\n						blur = clamp(blur, 0.0, 1.0);\n\n						// calculation of pattern for dithering\n\n						vec2 noise = vec2(rand( v_Uv), rand( v_Uv + vec2(0.4, 0.6))) * dithering * blur;\n\n						// getting blur x and y step factor\n\n						float w = resolution.x * blur * maxblur + noise.x;\n						float h = resolution.y * blur * maxblur + noise.y;\n\n						// calculation of final color\n\n						vec3 col = vec3(0.0);\n\t\t\tvec4 centerColor = texture2D(tColor,	v_Uv);\n\n						if (blur < 0.05) {\n								col = centerColor.rgb;\n						} else {\n								col = centerColor.rgb;\n\n								float s = 1.0;\n								int ringsamples;\n\n								for(int i = 1; i <= rings; i++) {\n										ringsamples = i * samples;\n\n										for (int j = 0; j < maxringsamples; j++) {\n												if (j >= ringsamples) break;\n												s += gather(float(i), float(j), ringsamples, col, w, h, blur);\n										}\n								}\n\n								col /= s; // divide by sample count\n						}\n\n						gl_FragColor = vec4(col, centerColor.a);\n				}\n		"
	};

	var FilmEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(FilmEffect, _Effect);
		function FilmEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.noiseIntensity = 0.35;
			_this.scanlinesIntensity = 0.5;
			_this.scanlinesCount = 2048;
			_this.grayscale = true;
			_this._time = 0;
			_this._mainPass = new t3d.ShaderPostPass(shader$2);
			_this._mainPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = FilmEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
			}
			var mainPass = this._mainPass;
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
		};
		return FilmEffect;
	}(Effect);
	var shader$2 = {
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
		fragmentShader: "\n				uniform float time;\n				uniform float nIntensity;\n				uniform float sIntensity;\n				uniform float sCount;\n				uniform bool grayscale;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						// sample the source\n						vec4 cTextureScreen = texture2D(tDiffuse, v_Uv);\n						// make some noise\n						float dx = rand(v_Uv + time);\n						// add noise\n						vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp(0.1 + dx, 0.0, 1.0);\n						// get us a sine and cosine\n						vec2 sc = vec2(sin(v_Uv.y * sCount), cos(v_Uv.y * sCount));\n						// add scanlines\n						cResult += cTextureScreen.rgb * vec3(sc.x, sc.y, sc.x) * sIntensity;\n						// interpolate between source and result by intensity\n						cResult = cTextureScreen.rgb + clamp(nIntensity, 0.0, 1.0) * (cResult - cTextureScreen.rgb);\n						// convert to grayscale if desired\n						if(grayscale) {\n								cResult = vec3(cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11);\n						}\n						gl_FragColor = vec4(cResult, cTextureScreen.a);\n				}\n		"
	};

	var FXAAEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(FXAAEffect, _Effect);
		function FXAAEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this._mainPass = new t3d.ShaderPostPass(shader$1);
			_this._mainPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = FXAAEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._mainPass.uniforms.resolution[0] = 1 / width;
			this._mainPass.uniforms.resolution[1] = 1 / height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return FXAAEffect;
	}(Effect);
	var shader$1 = {
		name: 'ec_fxaa',
		defines: {},
		uniforms: {
			tDiffuse: null,
			resolution: [1 / 1024, 1 / 512]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n				\n				uniform vec2 resolution;	\n				\n				// FXAA 3.11 implementation by NVIDIA, ported to WebGL by Agost Biro (biro@archilogic.com)\n				\n				//----------------------------------------------------------------------------------\n				// File:				es3-keplerFXAAassetsshaders/FXAA_DefaultES.frag\n				// SDK Version: v3.00\n				// Email:			 gameworks@nvidia.com\n				// Site:				http://developer.nvidia.com/\n				//\n				// Copyright (c) 2014-2015, NVIDIA CORPORATION. All rights reserved.\n				//\n				// Redistribution and use in source and binary forms, with or without\n				// modification, are permitted provided that the following conditions\n				// are met:\n				//	* Redistributions of source code must retain the above copyright\n				//		notice, this list of conditions and the following disclaimer.\n				//	* Redistributions in binary form must reproduce the above copyright\n				//		notice, this list of conditions and the following disclaimer in the\n				//		documentation and/or other materials provided with the distribution.\n				//	* Neither the name of NVIDIA CORPORATION nor the names of its\n				//		contributors may be used to endorse or promote products derived\n				//		from this software without specific prior written permission.\n				//\n				// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS \"AS IS\" AND ANY\n				// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n				// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR\n				// PURPOSE ARE DISCLAIMED.	IN NO EVENT SHALL THE COPYRIGHT OWNER OR\n				// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,\n				// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,\n				// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR\n				// PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY\n				// OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n				// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\n				// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n				//\n				//----------------------------------------------------------------------------------\n				\n				#define FXAA_PC 1\n				#define FXAA_GLSL_100 1\n				#define FXAA_QUALITY_PRESET 39\n				\n				#define FXAA_GREEN_AS_LUMA 1\n				\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_PC_CONSOLE\n						//\n						// The console algorithm for PC is included\n						// for developers targeting really low spec machines.\n						// Likely better to just run FXAA_PC, and use a really low preset.\n						//\n						#define FXAA_PC_CONSOLE 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_GLSL_120\n						#define FXAA_GLSL_120 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_GLSL_130\n						#define FXAA_GLSL_130 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_HLSL_3\n						#define FXAA_HLSL_3 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_HLSL_4\n						#define FXAA_HLSL_4 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_HLSL_5\n						#define FXAA_HLSL_5 0\n				#endif\n				/*==========================================================================*/\n				#ifndef FXAA_GREEN_AS_LUMA\n						//\n						// For those using non-linear color,\n						// and either not able to get luma in alpha, or not wanting to,\n						// this enables FXAA to run using green as a proxy for luma.\n						// So with this enabled, no need to pack luma in alpha.\n						//\n						// This will turn off AA on anything which lacks some amount of green.\n						// Pure red and blue or combination of only R and B, will get no AA.\n						//\n						// Might want to lower the settings for both,\n						//		fxaaConsoleEdgeThresholdMin\n						//		fxaaQualityEdgeThresholdMin\n						// In order to insure AA does not get turned off on colors\n						// which contain a minor amount of green.\n						//\n						// 1 = On.\n						// 0 = Off.\n						//\n						#define FXAA_GREEN_AS_LUMA 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_EARLY_EXIT\n						//\n						// Controls algorithm's early exit path.\n						// On PS3 turning this ON adds 2 cycles to the shader.\n						// On 360 turning this OFF adds 10ths of a millisecond to the shader.\n						// Turning this off on console will result in a more blurry image.\n						// So this defaults to on.\n						//\n						// 1 = On.\n						// 0 = Off.\n						//\n						#define FXAA_EARLY_EXIT 1\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_DISCARD\n						//\n						// Only valid for PC OpenGL currently.\n						// Probably will not work when FXAA_GREEN_AS_LUMA = 1.\n						//\n						// 1 = Use discard on pixels which don't need AA.\n						//		 For APIs which enable concurrent TEX+ROP from same surface.\n						// 0 = Return unchanged color on pixels which don't need AA.\n						//\n						#define FXAA_DISCARD 0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_FAST_PIXEL_OFFSET\n						//\n						// Used for GLSL 120 only.\n						//\n						// 1 = GL API supports fast pixel offsets\n						// 0 = do not use fast pixel offsets\n						//\n						#ifdef GL_EXT_gpu_shader4\n								#define FXAA_FAST_PIXEL_OFFSET 1\n						#endif\n						#ifdef GL_NV_gpu_shader5\n								#define FXAA_FAST_PIXEL_OFFSET 1\n						#endif\n						#ifdef GL_ARB_gpu_shader5\n								#define FXAA_FAST_PIXEL_OFFSET 1\n						#endif\n						#ifndef FXAA_FAST_PIXEL_OFFSET\n								#define FXAA_FAST_PIXEL_OFFSET 0\n						#endif\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#ifndef FXAA_GATHER4_ALPHA\n						//\n						// 1 = API supports gather4 on alpha channel.\n						// 0 = API does not support gather4 on alpha channel.\n						//\n						#if (FXAA_HLSL_5 == 1)\n								#define FXAA_GATHER4_ALPHA 1\n						#endif\n						#ifdef GL_ARB_gpu_shader5\n								#define FXAA_GATHER4_ALPHA 1\n						#endif\n						#ifdef GL_NV_gpu_shader5\n								#define FXAA_GATHER4_ALPHA 1\n						#endif\n						#ifndef FXAA_GATHER4_ALPHA\n								#define FXAA_GATHER4_ALPHA 0\n						#endif\n				#endif\n				\n				\n				/*============================================================================\n																FXAA QUALITY - TUNING KNOBS\n				------------------------------------------------------------------------------\n				NOTE the other tuning knobs are now in the shader function inputs!\n				============================================================================*/\n				#ifndef FXAA_QUALITY_PRESET\n						//\n						// Choose the quality preset.\n						// This needs to be compiled into the shader as it effects code.\n						// Best option to include multiple presets is to\n						// in each shader define the preset, then include this file.\n						//\n						// OPTIONS\n						// -----------------------------------------------------------------------\n						// 10 to 15 - default medium dither (10=fastest, 15=highest quality)\n						// 20 to 29 - less dither, more expensive (20=fastest, 29=highest quality)\n						// 39			 - no dither, very expensive\n						//\n						// NOTES\n						// -----------------------------------------------------------------------\n						// 12 = slightly faster then FXAA 3.9 and higher edge quality (default)\n						// 13 = about same speed as FXAA 3.9 and better than 12\n						// 23 = closest to FXAA 3.9 visually and performance wise\n						//	_ = the lowest digit is directly related to performance\n						// _	= the highest digit is directly related to style\n						//\n						#define FXAA_QUALITY_PRESET 12\n				#endif\n				\n				\n				/*============================================================================\n				\n																FXAA QUALITY - PRESETS\n				\n				============================================================================*/\n				\n				/*============================================================================\n														FXAA QUALITY - MEDIUM DITHER PRESETS\n				============================================================================*/\n				#if (FXAA_QUALITY_PRESET == 10)\n						#define FXAA_QUALITY_PS 3\n						#define FXAA_QUALITY_P0 1.5\n						#define FXAA_QUALITY_P1 3.0\n						#define FXAA_QUALITY_P2 12.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 11)\n						#define FXAA_QUALITY_PS 4\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 3.0\n						#define FXAA_QUALITY_P3 12.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 12)\n						#define FXAA_QUALITY_PS 5\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 4.0\n						#define FXAA_QUALITY_P4 12.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 13)\n						#define FXAA_QUALITY_PS 6\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 4.0\n						#define FXAA_QUALITY_P5 12.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 14)\n						#define FXAA_QUALITY_PS 7\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 4.0\n						#define FXAA_QUALITY_P6 12.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 15)\n						#define FXAA_QUALITY_PS 8\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 4.0\n						#define FXAA_QUALITY_P7 12.0\n				#endif\n				\n				/*============================================================================\n														FXAA QUALITY - LOW DITHER PRESETS\n				============================================================================*/\n				#if (FXAA_QUALITY_PRESET == 20)\n						#define FXAA_QUALITY_PS 3\n						#define FXAA_QUALITY_P0 1.5\n						#define FXAA_QUALITY_P1 2.0\n						#define FXAA_QUALITY_P2 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 21)\n						#define FXAA_QUALITY_PS 4\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 22)\n						#define FXAA_QUALITY_PS 5\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 23)\n						#define FXAA_QUALITY_PS 6\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 24)\n						#define FXAA_QUALITY_PS 7\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 3.0\n						#define FXAA_QUALITY_P6 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 25)\n						#define FXAA_QUALITY_PS 8\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 4.0\n						#define FXAA_QUALITY_P7 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 26)\n						#define FXAA_QUALITY_PS 9\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 2.0\n						#define FXAA_QUALITY_P7 4.0\n						#define FXAA_QUALITY_P8 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 27)\n						#define FXAA_QUALITY_PS 10\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 2.0\n						#define FXAA_QUALITY_P7 2.0\n						#define FXAA_QUALITY_P8 4.0\n						#define FXAA_QUALITY_P9 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 28)\n						#define FXAA_QUALITY_PS 11\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 2.0\n						#define FXAA_QUALITY_P7 2.0\n						#define FXAA_QUALITY_P8 2.0\n						#define FXAA_QUALITY_P9 4.0\n						#define FXAA_QUALITY_P10 8.0\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_QUALITY_PRESET == 29)\n						#define FXAA_QUALITY_PS 12\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.5\n						#define FXAA_QUALITY_P2 2.0\n						#define FXAA_QUALITY_P3 2.0\n						#define FXAA_QUALITY_P4 2.0\n						#define FXAA_QUALITY_P5 2.0\n						#define FXAA_QUALITY_P6 2.0\n						#define FXAA_QUALITY_P7 2.0\n						#define FXAA_QUALITY_P8 2.0\n						#define FXAA_QUALITY_P9 2.0\n						#define FXAA_QUALITY_P10 4.0\n						#define FXAA_QUALITY_P11 8.0\n				#endif\n				\n				/*============================================================================\n														FXAA QUALITY - EXTREME QUALITY\n				============================================================================*/\n				#if (FXAA_QUALITY_PRESET == 39)\n						#define FXAA_QUALITY_PS 12\n						#define FXAA_QUALITY_P0 1.0\n						#define FXAA_QUALITY_P1 1.0\n						#define FXAA_QUALITY_P2 1.0\n						#define FXAA_QUALITY_P3 1.0\n						#define FXAA_QUALITY_P4 1.0\n						#define FXAA_QUALITY_P5 1.5\n						#define FXAA_QUALITY_P6 2.0\n						#define FXAA_QUALITY_P7 2.0\n						#define FXAA_QUALITY_P8 2.0\n						#define FXAA_QUALITY_P9 2.0\n						#define FXAA_QUALITY_P10 4.0\n						#define FXAA_QUALITY_P11 8.0\n				#endif\n				\n				\n				\n				/*============================================================================\n				\n																				API PORTING\n				\n				============================================================================*/\n				#if (FXAA_GLSL_100 == 1) || (FXAA_GLSL_120 == 1) || (FXAA_GLSL_130 == 1)\n						#define FxaaBool bool\n						#define FxaaDiscard discard\n						#define FxaaFloat float\n						#define FxaaFloat2 vec2\n						#define FxaaFloat3 vec3\n						#define FxaaFloat4 vec4\n						#define FxaaHalf float\n						#define FxaaHalf2 vec2\n						#define FxaaHalf3 vec3\n						#define FxaaHalf4 vec4\n						#define FxaaInt2 ivec2\n						#define FxaaSat(x) clamp(x, 0.0, 1.0)\n						#define FxaaTex sampler2D\n				#else\n						#define FxaaBool bool\n						#define FxaaDiscard clip(-1)\n						#define FxaaFloat float\n						#define FxaaFloat2 float2\n						#define FxaaFloat3 float3\n						#define FxaaFloat4 float4\n						#define FxaaHalf half\n						#define FxaaHalf2 half2\n						#define FxaaHalf3 half3\n						#define FxaaHalf4 half4\n						#define FxaaSat(x) saturate(x)\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_GLSL_100 == 1)\n				#define FxaaTexTop(t, p) texture2D(t, p, 0.0)\n				#define FxaaTexOff(t, p, o, r) texture2D(t, p + (o * r), 0.0)\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_GLSL_120 == 1)\n						// Requires,\n						//	#version 120\n						// And at least,\n						//	#extension GL_EXT_gpu_shader4 : enable\n						//	(or set FXAA_FAST_PIXEL_OFFSET 1 to work like DX9)\n						#define FxaaTexTop(t, p) texture2DLod(t, p, 0.0)\n						#if (FXAA_FAST_PIXEL_OFFSET == 1)\n								#define FxaaTexOff(t, p, o, r) texture2DLodOffset(t, p, 0.0, o)\n						#else\n								#define FxaaTexOff(t, p, o, r) texture2DLod(t, p + (o * r), 0.0)\n						#endif\n						#if (FXAA_GATHER4_ALPHA == 1)\n								// use #extension GL_ARB_gpu_shader5 : enable\n								#define FxaaTexAlpha4(t, p) textureGather(t, p, 3)\n								#define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)\n								#define FxaaTexGreen4(t, p) textureGather(t, p, 1)\n								#define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)\n						#endif\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_GLSL_130 == 1)\n						// Requires '#version 130' or better\n						#define FxaaTexTop(t, p) textureLod(t, p, 0.0)\n						#define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)\n						#if (FXAA_GATHER4_ALPHA == 1)\n								// use #extension GL_ARB_gpu_shader5 : enable\n								#define FxaaTexAlpha4(t, p) textureGather(t, p, 3)\n								#define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)\n								#define FxaaTexGreen4(t, p) textureGather(t, p, 1)\n								#define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)\n						#endif\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_HLSL_3 == 1)\n						#define FxaaInt2 float2\n						#define FxaaTex sampler2D\n						#define FxaaTexTop(t, p) tex2Dlod(t, float4(p, 0.0, 0.0))\n						#define FxaaTexOff(t, p, o, r) tex2Dlod(t, float4(p + (o * r), 0, 0))\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_HLSL_4 == 1)\n						#define FxaaInt2 int2\n						struct FxaaTex { SamplerState smpl; Texture2D tex; };\n						#define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)\n						#define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)\n				#endif\n				/*--------------------------------------------------------------------------*/\n				#if (FXAA_HLSL_5 == 1)\n						#define FxaaInt2 int2\n						struct FxaaTex { SamplerState smpl; Texture2D tex; };\n						#define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)\n						#define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)\n						#define FxaaTexAlpha4(t, p) t.tex.GatherAlpha(t.smpl, p)\n						#define FxaaTexOffAlpha4(t, p, o) t.tex.GatherAlpha(t.smpl, p, o)\n						#define FxaaTexGreen4(t, p) t.tex.GatherGreen(t.smpl, p)\n						#define FxaaTexOffGreen4(t, p, o) t.tex.GatherGreen(t.smpl, p, o)\n				#endif\n				\n				\n				/*============================================================================\n												GREEN AS LUMA OPTION SUPPORT FUNCTION\n				============================================================================*/\n				#if (FXAA_GREEN_AS_LUMA == 0)\n						FxaaFloat FxaaLuma(FxaaFloat4 rgba) { return rgba.w; }\n				#else\n						FxaaFloat FxaaLuma(FxaaFloat4 rgba) { return rgba.y; }\n				#endif\n				\n				\n				\n				\n				/*============================================================================\n				\n																		FXAA3 QUALITY - PC\n				\n				============================================================================*/\n				#if (FXAA_PC == 1)\n				/*--------------------------------------------------------------------------*/\n				FxaaFloat4 FxaaPixelShader(\n						//\n						// Use noperspective interpolation here (turn off perspective interpolation).\n						// {xy} = center of pixel\n						FxaaFloat2 pos,\n						//\n						// Used only for FXAA Console, and not used on the 360 version.\n						// Use noperspective interpolation here (turn off perspective interpolation).\n						// {xy_} = upper left of pixel\n						// {_zw} = lower right of pixel\n						FxaaFloat4 fxaaConsolePosPos,\n						//\n						// Input color texture.\n						// {rgb_} = color in linear or perceptual color space\n						// if (FXAA_GREEN_AS_LUMA == 0)\n						//		 {__a} = luma in perceptual color space (not linear)\n						FxaaTex tex,\n						//\n						// Only used on the optimized 360 version of FXAA Console.\n						// For everything but 360, just use the same input here as for 'tex'.\n						// For 360, same diffuseMap, just alias with a 2nd sampler.\n						// This sampler needs to have an exponent bias of -1.\n						FxaaTex fxaaConsole360TexExpBiasNegOne,\n						//\n						// Only used on the optimized 360 version of FXAA Console.\n						// For everything but 360, just use the same input here as for 'tex'.\n						// For 360, same diffuseMap, just alias with a 3nd sampler.\n						// This sampler needs to have an exponent bias of -2.\n						FxaaTex fxaaConsole360TexExpBiasNegTwo,\n						//\n						// Only used on FXAA Quality.\n						// This must be from a constant/uniform.\n						// {x_} = 1.0/screenWidthInPixels\n						// {_y} = 1.0/screenHeightInPixels\n						FxaaFloat2 fxaaQualityRcpFrame,\n						//\n						// Only used on FXAA Console.\n						// This must be from a constant/uniform.\n						// This effects sub-pixel AA quality and inversely sharpness.\n						//	 Where N ranges between,\n						//		 N = 0.50 (default)\n						//		 N = 0.33 (sharper)\n						// {x__} = -N/screenWidthInPixels\n						// {_y_} = -N/screenHeightInPixels\n						// {_z_} =	N/screenWidthInPixels\n						// {__w} =	N/screenHeightInPixels\n						FxaaFloat4 fxaaConsoleRcpFrameOpt,\n						//\n						// Only used on FXAA Console.\n						// Not used on 360, but used on PS3 and PC.\n						// This must be from a constant/uniform.\n						// {x__} = -2.0/screenWidthInPixels\n						// {_y_} = -2.0/screenHeightInPixels\n						// {_z_} =	2.0/screenWidthInPixels\n						// {__w} =	2.0/screenHeightInPixels\n						FxaaFloat4 fxaaConsoleRcpFrameOpt2,\n						//\n						// Only used on FXAA Console.\n						// Only used on 360 in place of fxaaConsoleRcpFrameOpt2.\n						// This must be from a constant/uniform.\n						// {x__} =	8.0/screenWidthInPixels\n						// {_y_} =	8.0/screenHeightInPixels\n						// {_z_} = -4.0/screenWidthInPixels\n						// {__w} = -4.0/screenHeightInPixels\n						FxaaFloat4 fxaaConsole360RcpFrameOpt2,\n						//\n						// Only used on FXAA Quality.\n						// This used to be the FXAA_QUALITY_SUBPIX define.\n						// It is here now to allow easier tuning.\n						// Choose the amount of sub-pixel aliasing removal.\n						// This can effect sharpness.\n						//	 1.00 - upper limit (softer)\n						//	 0.75 - default amount of filtering\n						//	 0.50 - lower limit (sharper, less sub-pixel aliasing removal)\n						//	 0.25 - almost off\n						//	 0.00 - completely off\n						FxaaFloat fxaaQualitySubpix,\n						//\n						// Only used on FXAA Quality.\n						// This used to be the FXAA_QUALITY_EDGE_THRESHOLD define.\n						// It is here now to allow easier tuning.\n						// The minimum amount of local contrast required to apply algorithm.\n						//	 0.333 - too little (faster)\n						//	 0.250 - low quality\n						//	 0.166 - default\n						//	 0.125 - high quality\n						//	 0.063 - overkill (slower)\n						FxaaFloat fxaaQualityEdgeThreshold,\n						//\n						// Only used on FXAA Quality.\n						// This used to be the FXAA_QUALITY_EDGE_THRESHOLD_MIN define.\n						// It is here now to allow easier tuning.\n						// Trims the algorithm from processing darks.\n						//	 0.0833 - upper limit (default, the start of visible unfiltered edges)\n						//	 0.0625 - high quality (faster)\n						//	 0.0312 - visible limit (slower)\n						// Special notes when using FXAA_GREEN_AS_LUMA,\n						//	 Likely want to set this to zero.\n						//	 As colors that are mostly not-green\n						//	 will appear very dark in the green channel!\n						//	 Tune by looking at mostly non-green content,\n						//	 then start at zero and increase until aliasing is a problem.\n						FxaaFloat fxaaQualityEdgeThresholdMin,\n						//\n						// Only used on FXAA Console.\n						// This used to be the FXAA_CONSOLE_EDGE_SHARPNESS define.\n						// It is here now to allow easier tuning.\n						// This does not effect PS3, as this needs to be compiled in.\n						//	 Use FXAA_CONSOLE_PS3_EDGE_SHARPNESS for PS3.\n						//	 Due to the PS3 being ALU bound,\n						//	 there are only three safe values here: 2 and 4 and 8.\n						//	 These options use the shaders ability to a free *|/ by 2|4|8.\n						// For all other platforms can be a non-power of two.\n						//	 8.0 is sharper (default!!!)\n						//	 4.0 is softer\n						//	 2.0 is really soft (good only for vector graphics inputs)\n						FxaaFloat fxaaConsoleEdgeSharpness,\n						//\n						// Only used on FXAA Console.\n						// This used to be the FXAA_CONSOLE_EDGE_THRESHOLD define.\n						// It is here now to allow easier tuning.\n						// This does not effect PS3, as this needs to be compiled in.\n						//	 Use FXAA_CONSOLE_PS3_EDGE_THRESHOLD for PS3.\n						//	 Due to the PS3 being ALU bound,\n						//	 there are only two safe values here: 1/4 and 1/8.\n						//	 These options use the shaders ability to a free *|/ by 2|4|8.\n						// The console setting has a different mapping than the quality setting.\n						// Other platforms can use other values.\n						//	 0.125 leaves less aliasing, but is softer (default!!!)\n						//	 0.25 leaves more aliasing, and is sharper\n						FxaaFloat fxaaConsoleEdgeThreshold,\n						//\n						// Only used on FXAA Console.\n						// This used to be the FXAA_CONSOLE_EDGE_THRESHOLD_MIN define.\n						// It is here now to allow easier tuning.\n						// Trims the algorithm from processing darks.\n						// The console setting has a different mapping than the quality setting.\n						// This only applies when FXAA_EARLY_EXIT is 1.\n						// This does not apply to PS3,\n						// PS3 was simplified to avoid more shader instructions.\n						//	 0.06 - faster but more aliasing in darks\n						//	 0.05 - default\n						//	 0.04 - slower and less aliasing in darks\n						// Special notes when using FXAA_GREEN_AS_LUMA,\n						//	 Likely want to set this to zero.\n						//	 As colors that are mostly not-green\n						//	 will appear very dark in the green channel!\n						//	 Tune by looking at mostly non-green content,\n						//	 then start at zero and increase until aliasing is a problem.\n						FxaaFloat fxaaConsoleEdgeThresholdMin,\n						//\n						// Extra constants for 360 FXAA Console only.\n						// Use zeros or anything else for other platforms.\n						// These must be in physical constant registers and NOT immedates.\n						// Immedates will result in compiler un-optimizing.\n						// {xyzw} = float4(1.0, -1.0, 0.25, -0.25)\n						FxaaFloat4 fxaaConsole360ConstDir\n				) {\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat2 posM;\n						posM.x = pos.x;\n						posM.y = pos.y;\n						#if (FXAA_GATHER4_ALPHA == 1)\n								#if (FXAA_DISCARD == 0)\n										FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);\n										#if (FXAA_GREEN_AS_LUMA == 0)\n												#define lumaM rgbyM.w\n										#else\n												#define lumaM rgbyM.y\n										#endif\n								#endif\n								#if (FXAA_GREEN_AS_LUMA == 0)\n										FxaaFloat4 luma4A = FxaaTexAlpha4(tex, posM);\n										FxaaFloat4 luma4B = FxaaTexOffAlpha4(tex, posM, FxaaInt2(-1, -1));\n								#else\n										FxaaFloat4 luma4A = FxaaTexGreen4(tex, posM);\n										FxaaFloat4 luma4B = FxaaTexOffGreen4(tex, posM, FxaaInt2(-1, -1));\n								#endif\n								#if (FXAA_DISCARD == 1)\n										#define lumaM luma4A.w\n								#endif\n								#define lumaE luma4A.z\n								#define lumaS luma4A.x\n								#define lumaSE luma4A.y\n								#define lumaNW luma4B.w\n								#define lumaN luma4B.z\n								#define lumaW luma4B.x\n						#else\n								FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);\n								#if (FXAA_GREEN_AS_LUMA == 0)\n										#define lumaM rgbyM.w\n								#else\n										#define lumaM rgbyM.y\n								#endif\n								#if (FXAA_GLSL_100 == 1)\n								FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 0.0, 1.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0, 0.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 0.0,-1.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 0.0), fxaaQualityRcpFrame.xy));\n								#else\n								FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 0, 1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1, 0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 0,-1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 0), fxaaQualityRcpFrame.xy));\n								#endif\n						#endif\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat maxSM = max(lumaS, lumaM);\n						FxaaFloat minSM = min(lumaS, lumaM);\n						FxaaFloat maxESM = max(lumaE, maxSM);\n						FxaaFloat minESM = min(lumaE, minSM);\n						FxaaFloat maxWN = max(lumaN, lumaW);\n						FxaaFloat minWN = min(lumaN, lumaW);\n						FxaaFloat rangeMax = max(maxWN, maxESM);\n						FxaaFloat rangeMin = min(minWN, minESM);\n						FxaaFloat rangeMaxScaled = rangeMax * fxaaQualityEdgeThreshold;\n						FxaaFloat range = rangeMax - rangeMin;\n						FxaaFloat rangeMaxClamped = max(fxaaQualityEdgeThresholdMin, rangeMaxScaled);\n						FxaaBool earlyExit = range < rangeMaxClamped;\n				/*--------------------------------------------------------------------------*/\n						if(earlyExit)\n								#if (FXAA_DISCARD == 1)\n										FxaaDiscard;\n								#else\n										return rgbyM;\n								#endif\n				/*--------------------------------------------------------------------------*/\n						#if (FXAA_GATHER4_ALPHA == 0)\n								#if (FXAA_GLSL_100 == 1)\n								FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0,-1.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0, 1.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2( 1.0,-1.0), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 1.0), fxaaQualityRcpFrame.xy));\n								#else\n								FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1,-1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1, 1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2( 1,-1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));\n								#endif\n						#else\n								FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, -1), fxaaQualityRcpFrame.xy));\n								FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));\n						#endif\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat lumaNS = lumaN + lumaS;\n						FxaaFloat lumaWE = lumaW + lumaE;\n						FxaaFloat subpixRcpRange = 1.0/range;\n						FxaaFloat subpixNSWE = lumaNS + lumaWE;\n						FxaaFloat edgeHorz1 = (-2.0 * lumaM) + lumaNS;\n						FxaaFloat edgeVert1 = (-2.0 * lumaM) + lumaWE;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat lumaNESE = lumaNE + lumaSE;\n						FxaaFloat lumaNWNE = lumaNW + lumaNE;\n						FxaaFloat edgeHorz2 = (-2.0 * lumaE) + lumaNESE;\n						FxaaFloat edgeVert2 = (-2.0 * lumaN) + lumaNWNE;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat lumaNWSW = lumaNW + lumaSW;\n						FxaaFloat lumaSWSE = lumaSW + lumaSE;\n						FxaaFloat edgeHorz4 = (abs(edgeHorz1) * 2.0) + abs(edgeHorz2);\n						FxaaFloat edgeVert4 = (abs(edgeVert1) * 2.0) + abs(edgeVert2);\n						FxaaFloat edgeHorz3 = (-2.0 * lumaW) + lumaNWSW;\n						FxaaFloat edgeVert3 = (-2.0 * lumaS) + lumaSWSE;\n						FxaaFloat edgeHorz = abs(edgeHorz3) + edgeHorz4;\n						FxaaFloat edgeVert = abs(edgeVert3) + edgeVert4;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat subpixNWSWNESE = lumaNWSW + lumaNESE;\n						FxaaFloat lengthSign = fxaaQualityRcpFrame.x;\n						FxaaBool horzSpan = edgeHorz >= edgeVert;\n						FxaaFloat subpixA = subpixNSWE * 2.0 + subpixNWSWNESE;\n				/*--------------------------------------------------------------------------*/\n						if(!horzSpan) lumaN = lumaW;\n						if(!horzSpan) lumaS = lumaE;\n						if(horzSpan) lengthSign = fxaaQualityRcpFrame.y;\n						FxaaFloat subpixB = (subpixA * (1.0/12.0)) - lumaM;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat gradientN = lumaN - lumaM;\n						FxaaFloat gradientS = lumaS - lumaM;\n						FxaaFloat lumaNN = lumaN + lumaM;\n						FxaaFloat lumaSS = lumaS + lumaM;\n						FxaaBool pairN = abs(gradientN) >= abs(gradientS);\n						FxaaFloat gradient = max(abs(gradientN), abs(gradientS));\n						if(pairN) lengthSign = -lengthSign;\n						FxaaFloat subpixC = FxaaSat(abs(subpixB) * subpixRcpRange);\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat2 posB;\n						posB.x = posM.x;\n						posB.y = posM.y;\n						FxaaFloat2 offNP;\n						offNP.x = (!horzSpan) ? 0.0 : fxaaQualityRcpFrame.x;\n						offNP.y = ( horzSpan) ? 0.0 : fxaaQualityRcpFrame.y;\n						if(!horzSpan) posB.x += lengthSign * 0.5;\n						if( horzSpan) posB.y += lengthSign * 0.5;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat2 posN;\n						posN.x = posB.x - offNP.x * FXAA_QUALITY_P0;\n						posN.y = posB.y - offNP.y * FXAA_QUALITY_P0;\n						FxaaFloat2 posP;\n						posP.x = posB.x + offNP.x * FXAA_QUALITY_P0;\n						posP.y = posB.y + offNP.y * FXAA_QUALITY_P0;\n						FxaaFloat subpixD = ((-2.0)*subpixC) + 3.0;\n						FxaaFloat lumaEndN = FxaaLuma(FxaaTexTop(tex, posN));\n						FxaaFloat subpixE = subpixC * subpixC;\n						FxaaFloat lumaEndP = FxaaLuma(FxaaTexTop(tex, posP));\n				/*--------------------------------------------------------------------------*/\n						if(!pairN) lumaNN = lumaSS;\n						FxaaFloat gradientScaled = gradient * 1.0/4.0;\n						FxaaFloat lumaMM = lumaM - lumaNN * 0.5;\n						FxaaFloat subpixF = subpixD * subpixE;\n						FxaaBool lumaMLTZero = lumaMM < 0.0;\n				/*--------------------------------------------------------------------------*/\n						lumaEndN -= lumaNN * 0.5;\n						lumaEndP -= lumaNN * 0.5;\n						FxaaBool doneN = abs(lumaEndN) >= gradientScaled;\n						FxaaBool doneP = abs(lumaEndP) >= gradientScaled;\n						if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P1;\n						if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P1;\n						FxaaBool doneNP = (!doneN) || (!doneP);\n						if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P1;\n						if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P1;\n				/*--------------------------------------------------------------------------*/\n						if(doneNP) {\n								if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n								if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n								if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n								if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n								doneN = abs(lumaEndN) >= gradientScaled;\n								doneP = abs(lumaEndP) >= gradientScaled;\n								if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P2;\n								if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P2;\n								doneNP = (!doneN) || (!doneP);\n								if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P2;\n								if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P2;\n				/*--------------------------------------------------------------------------*/\n								#if (FXAA_QUALITY_PS > 3)\n								if(doneNP) {\n										if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n										if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n										if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n										if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n										doneN = abs(lumaEndN) >= gradientScaled;\n										doneP = abs(lumaEndP) >= gradientScaled;\n										if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P3;\n										if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P3;\n										doneNP = (!doneN) || (!doneP);\n										if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P3;\n										if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P3;\n				/*--------------------------------------------------------------------------*/\n										#if (FXAA_QUALITY_PS > 4)\n										if(doneNP) {\n												if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n												if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n												if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n												if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n												doneN = abs(lumaEndN) >= gradientScaled;\n												doneP = abs(lumaEndP) >= gradientScaled;\n												if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P4;\n												if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P4;\n												doneNP = (!doneN) || (!doneP);\n												if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P4;\n												if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P4;\n				/*--------------------------------------------------------------------------*/\n												#if (FXAA_QUALITY_PS > 5)\n												if(doneNP) {\n														if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n														if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n														if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n														if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n														doneN = abs(lumaEndN) >= gradientScaled;\n														doneP = abs(lumaEndP) >= gradientScaled;\n														if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P5;\n														if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P5;\n														doneNP = (!doneN) || (!doneP);\n														if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P5;\n														if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P5;\n				/*--------------------------------------------------------------------------*/\n														#if (FXAA_QUALITY_PS > 6)\n														if(doneNP) {\n																if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n																if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n																if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n																if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n																doneN = abs(lumaEndN) >= gradientScaled;\n																doneP = abs(lumaEndP) >= gradientScaled;\n																if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P6;\n																if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P6;\n																doneNP = (!doneN) || (!doneP);\n																if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P6;\n																if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P6;\n				/*--------------------------------------------------------------------------*/\n																#if (FXAA_QUALITY_PS > 7)\n																if(doneNP) {\n																		if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n																		if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n																		if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n																		if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n																		doneN = abs(lumaEndN) >= gradientScaled;\n																		doneP = abs(lumaEndP) >= gradientScaled;\n																		if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P7;\n																		if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P7;\n																		doneNP = (!doneN) || (!doneP);\n																		if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P7;\n																		if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P7;\n				/*--------------------------------------------------------------------------*/\n						#if (FXAA_QUALITY_PS > 8)\n						if(doneNP) {\n								if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n								if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n								if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n								if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n								doneN = abs(lumaEndN) >= gradientScaled;\n								doneP = abs(lumaEndP) >= gradientScaled;\n								if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P8;\n								if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P8;\n								doneNP = (!doneN) || (!doneP);\n								if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P8;\n								if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P8;\n				/*--------------------------------------------------------------------------*/\n								#if (FXAA_QUALITY_PS > 9)\n								if(doneNP) {\n										if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n										if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n										if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n										if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n										doneN = abs(lumaEndN) >= gradientScaled;\n										doneP = abs(lumaEndP) >= gradientScaled;\n										if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P9;\n										if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P9;\n										doneNP = (!doneN) || (!doneP);\n										if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P9;\n										if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P9;\n				/*--------------------------------------------------------------------------*/\n										#if (FXAA_QUALITY_PS > 10)\n										if(doneNP) {\n												if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n												if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n												if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n												if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n												doneN = abs(lumaEndN) >= gradientScaled;\n												doneP = abs(lumaEndP) >= gradientScaled;\n												if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P10;\n												if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P10;\n												doneNP = (!doneN) || (!doneP);\n												if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P10;\n												if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P10;\n				/*--------------------------------------------------------------------------*/\n												#if (FXAA_QUALITY_PS > 11)\n												if(doneNP) {\n														if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n														if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n														if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n														if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n														doneN = abs(lumaEndN) >= gradientScaled;\n														doneP = abs(lumaEndP) >= gradientScaled;\n														if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P11;\n														if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P11;\n														doneNP = (!doneN) || (!doneP);\n														if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P11;\n														if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P11;\n				/*--------------------------------------------------------------------------*/\n														#if (FXAA_QUALITY_PS > 12)\n														if(doneNP) {\n																if(!doneN) lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));\n																if(!doneP) lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));\n																if(!doneN) lumaEndN = lumaEndN - lumaNN * 0.5;\n																if(!doneP) lumaEndP = lumaEndP - lumaNN * 0.5;\n																doneN = abs(lumaEndN) >= gradientScaled;\n																doneP = abs(lumaEndP) >= gradientScaled;\n																if(!doneN) posN.x -= offNP.x * FXAA_QUALITY_P12;\n																if(!doneN) posN.y -= offNP.y * FXAA_QUALITY_P12;\n																doneNP = (!doneN) || (!doneP);\n																if(!doneP) posP.x += offNP.x * FXAA_QUALITY_P12;\n																if(!doneP) posP.y += offNP.y * FXAA_QUALITY_P12;\n				/*--------------------------------------------------------------------------*/\n														}\n														#endif\n				/*--------------------------------------------------------------------------*/\n												}\n												#endif\n				/*--------------------------------------------------------------------------*/\n										}\n										#endif\n				/*--------------------------------------------------------------------------*/\n								}\n								#endif\n				/*--------------------------------------------------------------------------*/\n						}\n						#endif\n				/*--------------------------------------------------------------------------*/\n																}\n																#endif\n				/*--------------------------------------------------------------------------*/\n														}\n														#endif\n				/*--------------------------------------------------------------------------*/\n												}\n												#endif\n				/*--------------------------------------------------------------------------*/\n										}\n										#endif\n				/*--------------------------------------------------------------------------*/\n								}\n								#endif\n				/*--------------------------------------------------------------------------*/\n						}\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat dstN = posM.x - posN.x;\n						FxaaFloat dstP = posP.x - posM.x;\n						if(!horzSpan) dstN = posM.y - posN.y;\n						if(!horzSpan) dstP = posP.y - posM.y;\n				/*--------------------------------------------------------------------------*/\n						FxaaBool goodSpanN = (lumaEndN < 0.0) != lumaMLTZero;\n						FxaaFloat spanLength = (dstP + dstN);\n						FxaaBool goodSpanP = (lumaEndP < 0.0) != lumaMLTZero;\n						FxaaFloat spanLengthRcp = 1.0/spanLength;\n				/*--------------------------------------------------------------------------*/\n						FxaaBool directionN = dstN < dstP;\n						FxaaFloat dst = min(dstN, dstP);\n						FxaaBool goodSpan = directionN ? goodSpanN : goodSpanP;\n						FxaaFloat subpixG = subpixF * subpixF;\n						FxaaFloat pixelOffset = (dst * (-spanLengthRcp)) + 0.5;\n						FxaaFloat subpixH = subpixG * fxaaQualitySubpix;\n				/*--------------------------------------------------------------------------*/\n						FxaaFloat pixelOffsetGood = goodSpan ? pixelOffset : 0.0;\n						FxaaFloat pixelOffsetSubpix = max(pixelOffsetGood, subpixH);\n						if(!horzSpan) posM.x += pixelOffsetSubpix * lengthSign;\n						if( horzSpan) posM.y += pixelOffsetSubpix * lengthSign;\n						#if (FXAA_DISCARD == 1)\n								return FxaaTexTop(tex, posM);\n						#else\n								return FxaaFloat4(FxaaTexTop(tex, posM).xyz, lumaM);\n						#endif\n				}\n				/*==========================================================================*/\n				#endif\n				\n				void main() {\n				gl_FragColor = FxaaPixelShader(\n						v_Uv,\n						vec4(0.0),\n						tDiffuse,\n						tDiffuse,\n						tDiffuse,\n						resolution,\n						vec4(0.0),\n						vec4(0.0),\n						vec4(0.0),\n						0.75,\n						0.166,\n						0.0833,\n						0.0,\n						0.0,\n						0.0,\n						vec4(0.0)\n				);\n				\n				// TODO avoid querying texture twice for same texel\n				gl_FragColor.a = texture2D(tDiffuse, v_Uv).a;\n				}\n		"
	};

	var SSAOEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(SSAOEffect, _Effect);
		function SSAOEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.bufferDependencies = [{
				key: 'GBuffer'
			}];
			_this._ssaoPass = new t3d.ShaderPostPass(ssaoShader);

			// Sampling radius in work space.
			// Larger will produce more soft concat shadow.
			// But also needs higher quality or it will have more obvious artifacts
			_this.radius = 0.5;
			_this.power = 1;
			_this.bias = 0.1;
			_this.intensity = 1;

			// Quality of SSAO. 'Low'|'Medium'|'High'|'Ultra'
			_this.quality = 'Medium';
			_this._kernelCode = '';
			_this._kernelSize = -1;
			_this._setNoiseSize(64);
			_this._setKernelSize(16);
			_this._blurPass = new t3d.ShaderPostPass(blurShader);
			_this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
			_this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;
			_this.blurSize = 1;
			_this.depthRange = 1;
			_this._blendPass = new t3d.ShaderPostPass(multiplyShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = SSAOEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var gBuffer = composer.getBuffer('GBuffer');
			var gBufferRenderStates = gBuffer.getCurrentRenderStates();
			projection$1.copy(gBufferRenderStates.camera.projectionMatrix);
			projectionInv$1.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
			viewInverseTranspose$1.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

			// Step 1: ssao pass

			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(1, 1, 1, 1);
			renderer.renderPass.clear(true, true, false);
			this._ssaoPass.uniforms.normalTex = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssaoPass.uniforms.depthTex = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._ssaoPass.uniforms.texSize[0] = gBuffer.output().width;
			this._ssaoPass.uniforms.texSize[1] = gBuffer.output().height;
			projection$1.toArray(this._ssaoPass.uniforms.projection);
			projectionInv$1.toArray(this._ssaoPass.uniforms.projectionInv);
			viewInverseTranspose$1.toArray(this._ssaoPass.uniforms.viewInverseTranspose);
			this._setKernelSize(_qualityMap[this.quality]);
			this._ssaoPass.uniforms.radius = this.radius;
			this._ssaoPass.uniforms.power = this.power;
			this._ssaoPass.uniforms.bias = this.bias;
			this._ssaoPass.uniforms.intensity = this.intensity;
			this._ssaoPass.render(renderer);

			// Step 2: blurX pass

			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
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

			renderer.renderPass.setRenderTarget(!!inputRenderTarget ? tempRT1 : outputRenderTarget);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.render(renderer);

			// Step 4: blend pass

			if (!!inputRenderTarget) {
				renderer.renderPass.setRenderTarget(outputRenderTarget);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				if (finish) {
					renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
				} else {
					renderer.renderPass.clear(true, true, false);
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
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
		};
		_proto._setKernelSize = function _setKernelSize(size, offset) {
			if (offset === void 0) {
				offset = 0;
			}
			var code = size + '_' + offset;
			if (this._kernelCode === code) return;
			this._kernelCode = code;
			if (!_kernels[code]) {
				_kernels[code] = generateKernel(size, offset * size);
			}
			this._ssaoPass.uniforms.kernel = _kernels[code];
			this._ssaoPass.material.defines.KERNEL_SIZE = size;
			this._ssaoPass.material.needsUpdate = true;
		};
		_proto._setNoiseSize = function _setNoiseSize(size) {
			if (this._noiseSize === size) return;
			this._noiseSize = size;
			var uniforms = this._ssaoPass.uniforms;
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
		};
		return SSAOEffect;
	}(Effect);
	var projection$1 = new t3d.Matrix4();
	var projectionInv$1 = new t3d.Matrix4();
	var viewInverseTranspose$1 = new t3d.Matrix4();
	var _qualityMap = {
		Low: 6,
		Medium: 12,
		High: 32,
		Ultra: 64
	};

	// https://en.wikipedia.org/wiki/Halton_sequence halton sequence.
	function halton(index, base) {
		var result = 0;
		var f = 1 / base;
		var i = index;
		while (i > 0) {
			result = result + f * (i % base);
			i = Math.floor(i / base);
			f = f / base;
		}
		return result;
	}
	var _kernels = {};

	// hemisphere sample kernel
	function generateKernel(size, offset) {
		if (offset === void 0) {
			offset = 0;
		}
		var kernel = new Float32Array(size * 3);
		for (var i = 0; i < size; i++) {
			var phi = halton(i + offset, 2) * Math.PI * 2;

			// rejecting samples that are close to tangent plane to avoid z-fighting artifacts
			var cosTheta = 1.0 - (halton(i + offset, 3) * 0.85 + 0.15);
			var sinTheta = Math.sqrt(1.0 - cosTheta * cosTheta);
			var r = Math.random();

			// for tbn space
			var x = Math.cos(phi) * sinTheta * r;
			var y = Math.sin(phi) * sinTheta * r;
			var z = cosTheta * r;
			kernel[i * 3] = x;
			kernel[i * 3 + 1] = y;
			kernel[i * 3 + 2] = z;
		}
		return kernel;
	}
	function generateNoiseTexture(size) {
		var texture = new t3d.Texture2D();
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
		var data = new Uint8Array(size * size * 4);
		var n = 0;
		var v3 = new t3d.Vector3();
		for (var i = 0; i < size; i++) {
			for (var j = 0; j < size; j++) {
				v3.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0).normalize();
				data[n++] = (v3.x * 0.5 + 0.5) * 255;
				data[n++] = (v3.y * 0.5 + 0.5) * 255;
				data[n++] = 0;
				data[n++] = 255;
			}
		}
		return data;
	}
	var ssaoShader = {
		name: 'ec_ssao',
		defines: {
			ALCHEMY: false,
			DEPTH_PACKING: 0,
			KERNEL_SIZE: 64
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
		fragmentShader: "\n				#include <packing>\n\n				varying vec2 v_Uv;\n\n				uniform sampler2D normalTex;\n				uniform sampler2D depthTex;\n				uniform vec2 texSize;\n\n				uniform sampler2D noiseTex;\n				uniform vec2 noiseTexSize;\n\n				uniform mat4 projection;\n				uniform mat4 projectionInv;\n				uniform mat4 viewInverseTranspose;\n\n				uniform vec3 kernel[KERNEL_SIZE];\n\n				uniform float radius;\n				uniform float power;\n				uniform float bias;\n				uniform float intensity;\n\n				float getDepth(const in vec2 screenPosition) {\n						#if DEPTH_PACKING == 1\n								return unpackRGBAToDepth(texture2D(depthTex, screenPosition));\n						#else\n								return texture2D(depthTex, screenPosition).r;\n						#endif\n				}\n\n				vec3 getViewNormal(const in vec2 screenPosition) {\n						vec3 normal = texture2D(normalTex, screenPosition).xyz * 2.0 - 1.0;\n						// Convert to view space\n						return (viewInverseTranspose * vec4(normal, 0.0)).xyz;\n				}\n\n				float ssaoEstimator(in mat3 kernelBasis, in vec3 originPos, in vec3 N) {\n						float occlusion = 0.0;\n\n						for (int i = 0; i < KERNEL_SIZE; i++) {\n								vec3 samplePos = kernel[i];\n								samplePos = kernelBasis * samplePos;\n								samplePos = samplePos * radius + originPos;\n\n								vec4 texCoord = projection * vec4(samplePos, 1.0);\n								texCoord.xy /= texCoord.w;\n								texCoord.xy = texCoord.xy * 0.5 + 0.5;\n\n								float sampleDepth = getDepth(texCoord.xy);\n								float z = sampleDepth * 2.0 - 1.0;\n\n								#ifdef ALCHEMY\n										vec4 projectedPos = vec4(texCoord.xy * 2.0 - 1.0, z, 1.0);\n										vec4 p4 = projectionInv * projectedPos;\n										p4.xyz /= p4.w;\n\n										vec3 cDir = p4.xyz - originPos;\n\n										float vv = dot(cDir, cDir);\n										float vn = dot(cDir, N);\n\n										float radius2 = radius * radius;\n										vn = max(vn + p4.z * bias, 0.0);\n										float f = max(radius2 - vv, 0.0) / radius2;\n										occlusion += f * f * f * max(vn / (0.01 + vv), 0.0);\n								#else\n										if (projection[3][3] == 0.0) {\n												z = projection[3][2] / (z * projection[2][3] - projection[2][2]);\n										} else {\n												z = (z - projection[3][2]) / projection[2][2];\n										}\n\n										float factor = step(samplePos.z, z - bias);\n										float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - z));\n										occlusion += rangeCheck * factor;\n								#endif\n						}\n\n						occlusion = 1.0 - occlusion / float(KERNEL_SIZE);\n\n						return pow(occlusion, power);\n				}\n\n				void main() {\n						float centerDepth = getDepth(v_Uv);\n						if(centerDepth >= (1.0 - EPSILON)) {\n								discard;\n						}\n\n						vec3 N = getViewNormal(v_Uv);\n\n						vec2 noiseTexCoord = texSize / vec2(noiseTexSize) * v_Uv;\n						vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;\n\n						// Tangent\n						vec3 T = normalize(rvec - N * dot(rvec, N));\n						// Bitangent\n						vec3 BT = normalize(cross(N, T));\n\n						mat3 kernelBasis = mat3(T, BT, N);\n\n						// view position\n						float z = centerDepth * 2.0 - 1.0;\n						vec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, z, 1.0);\n						vec4 p4 = projectionInv * projectedPos;\n						vec3 position = p4.xyz / p4.w;\n\n						float ao = ssaoEstimator(kernelBasis, position, N);\n						ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);\n\n						gl_FragColor = vec4(vec3(ao), 1.0);\n				}\n		"
	};

	var SSREffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(SSREffect, _Effect);
		function SSREffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'GBuffer'
			}];
			_this._ssrPass = new t3d.ShaderPostPass(ssrShader);
			_this.maxRayDistance = 200;
			_this.pixelStride = 16;
			_this.pixelStrideZCutoff = 50;
			_this.screenEdgeFadeStart = 0.9;
			_this.eyeFadeStart = 0.4;
			_this.eyeFadeEnd = 0.8;
			_this.minGlossiness = 0.2;
			_this._blurPass = new t3d.ShaderPostPass(blurShader);
			_this._blurPass.material.defines.NORMALTEX_ENABLED = 1;
			_this._blurPass.material.defines.DEPTHTEX_ENABLED = 1;
			_this.blurSize = 2;
			_this.depthRange = 1;
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = SSREffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var gBuffer = composer.getBuffer('GBuffer');
			var gBufferRenderStates = gBuffer.getCurrentRenderStates();
			projection.copy(gBufferRenderStates.camera.projectionMatrix);
			projectionInv.copy(gBufferRenderStates.camera.projectionMatrix).inverse();
			viewInverseTranspose.copy(gBufferRenderStates.camera.viewMatrix).inverse().transpose();

			// Step 1: ssr pass

			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 1);
			renderer.renderPass.clear(true, true, false);
			this._ssrPass.uniforms.colorTex = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssrPass.uniforms.gBufferTexture1 = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._ssrPass.uniforms.gBufferTexture2 = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._ssrPass.uniforms.viewportSize[0] = gBuffer.output().width;
			this._ssrPass.uniforms.viewportSize[1] = gBuffer.output().height;
			projection.toArray(this._ssrPass.uniforms.projection);
			projectionInv.toArray(this._ssrPass.uniforms.projectionInv);
			viewInverseTranspose.toArray(this._ssrPass.uniforms.viewInverseTranspose);
			this._ssrPass.uniforms.maxRayDistance = this.maxRayDistance;
			this._ssrPass.uniforms.pixelStride = this.pixelStride;
			this._ssrPass.uniforms.pixelStrideZCutoff = this.pixelStrideZCutoff;
			this._ssrPass.uniforms.screenEdgeFadeStart = this.screenEdgeFadeStart;
			this._ssrPass.uniforms.eyeFadeStart = this.eyeFadeStart;
			this._ssrPass.uniforms.eyeFadeEnd = this.eyeFadeEnd;
			this._ssrPass.uniforms.minGlossiness = this.minGlossiness;
			this._ssrPass.render(renderer);

			// Step 2: blurX pass

			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
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

			renderer.renderPass.setRenderTarget(!!inputRenderTarget ? tempRT1 : outputRenderTarget);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.direction = 1;
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.render(renderer);

			// Step 4: blend pass

			if (!!inputRenderTarget) {
				renderer.renderPass.setRenderTarget(outputRenderTarget);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				if (finish) {
					renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
				} else {
					renderer.renderPass.clear(true, true, false);
				}
				this._blendPass.uniforms.texture1 = inputRenderTarget.texture;
				this._blendPass.uniforms.texture2 = tempRT1.texture;
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
			}
			composer._renderTargetCache.release(tempRT1, 0);
			composer._renderTargetCache.release(tempRT2, 0);
		};
		return SSREffect;
	}(Effect);
	var projection = new t3d.Matrix4();
	var projectionInv = new t3d.Matrix4();
	var viewInverseTranspose = new t3d.Matrix4();
	var ssrShader = {
		name: 'ec_ssr',
		defines: {},
		uniforms: {
			colorTex: null,
			gBufferTexture1: null,
			gBufferTexture2: null,
			projection: new Float32Array(16),
			projectionInv: new Float32Array(16),
			viewInverseTranspose: new Float32Array(16),
			maxRayDistance: 4,
			pixelStride: 16,
			pixelStrideZCutoff: 10,
			screenEdgeFadeStart: 0.9,
			eyeFadeStart: 0.4,
			eyeFadeEnd: 0.8,
			minGlossiness: 0.2,
			zThicknessThreshold: 0.1,
			jitterOffset: 0,
			nearZ: 0,
			viewportSize: [512, 512],
			maxMipmapLevel: 5
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\t#define MAX_ITERATION 20;\n\t\t#define MAX_BINARY_SEARCH_ITERATION 5;\n\n\t\tvarying vec2 v_Uv;\n\n\t\tuniform sampler2D colorTex;\n\t\tuniform sampler2D gBufferTexture1;\n\t\tuniform sampler2D gBufferTexture2;\n\n\t\tuniform mat4 projection;\n\t\tuniform mat4 projectionInv;\n\t\tuniform mat4 viewInverseTranspose;\n\n\t\tuniform float maxRayDistance;\n\n\t\tuniform float pixelStride;\n\t\t// ray origin Z at this distance will have a pixel stride of 1.0\n\t\tuniform float pixelStrideZCutoff;\n\n\t\t// distance to screen edge that ray hits will start to fade (0.0 -> 1.0)\n\t\tuniform float screenEdgeFadeStart;\n\n\t\t// ray direction's Z that ray hits will start to fade (0.0 -> 1.0)\n\t\tuniform float eyeFadeStart;\n\t\t// ray direction's Z that ray hits will be cut (0.0 -> 1.0)\n\t\tuniform float eyeFadeEnd;\n\n\t\t// Object larger than minGlossiness will have ssr effect\n\t\tuniform float minGlossiness;\n\t\tuniform float zThicknessThreshold;\n\t\tuniform float jitterOffset;\n\n\t\tuniform float nearZ;\n\t\tuniform vec2 viewportSize;\n\n\t\tuniform float maxMipmapLevel;\n\n\t\tfloat fetchDepth(sampler2D depthTexture, vec2 uv) {\n\t\t\tvec4 depthTexel = texture2D(depthTexture, uv);\n\t\t\treturn depthTexel.r * 2.0 - 1.0;\n\t\t}\n\n\t\tfloat linearDepth(float depth) {\n\t\t\treturn projection[3][2] / (depth * projection[2][3] - projection[2][2]);\n\t\t}\n\n\t\tbool rayIntersectDepth(float rayZNear, float rayZFar, vec2 hitPixel) {\n\t\t\t// Swap if bigger\n\t\t\tif (rayZFar > rayZNear) {\n\t\t\t\tfloat t = rayZFar; rayZFar = rayZNear; rayZNear = t;\n\t\t\t}\n\t\t\tfloat cameraZ = linearDepth(fetchDepth(gBufferTexture2, hitPixel));\n\t\t\t// float cameraBackZ = linearDepth(fetchDepth(backDepthTex, hitPixel));\n\t\t\t// Cross z\n\t\t\treturn rayZFar <= cameraZ && rayZNear >= cameraZ - zThicknessThreshold;\n\t\t}\n\n\t\t// Trace a ray in screenspace from rayOrigin (in camera space) pointing in rayDir (in camera space)\n\t\t//\n\t\t// With perspective correct interpolation\n\t\t//\n\t\t// Returns true if the ray hits a pixel in the depth buffer\n\t\t// and outputs the hitPixel (in UV space), the hitPoint (in camera space) and the number\n\t\t// of iterations it took to get there.\n\t\t//\n\t\t// Based on Morgan McGuire & Mike Mara's GLSL implementation:\n\t\t// http://casual-effects.blogspot.com/2014/08/screen-space-ray-tracing.html\n\t\tbool traceScreenSpaceRay(vec3 rayOrigin, vec3 rayDir, float jitter, out vec2 hitPixel, out vec3 hitPoint, out float iterationCount) {\n\t\t\t// Clip to the near plane\n\t\t\tfloat rayLength = ((rayOrigin.z + rayDir.z * maxRayDistance) > -nearZ) ? (-nearZ - rayOrigin.z) / rayDir.z : maxRayDistance;\n\n\t\t\tvec3 rayEnd = rayOrigin + rayDir * rayLength;\n\n\t\t\t// Project into homogeneous clip space\n\t\t\tvec4 H0 = projection * vec4(rayOrigin, 1.0);\n\t\t\tvec4 H1 = projection * vec4(rayEnd, 1.0);\n\n\t\t\tfloat k0 = 1.0 / H0.w, k1 = 1.0 / H1.w;\n\n\t\t\t// The interpolated homogeneous version of the camera space points\n\t\t\tvec3 Q0 = rayOrigin * k0, Q1 = rayEnd * k1;\n\n\t\t\t// Screen space endpoints\n\t\t\t// PENDING viewportSize ?\n\t\t\tvec2 P0 = (H0.xy * k0 * 0.5 + 0.5) * viewportSize;\n\t\t\tvec2 P1 = (H1.xy * k1 * 0.5 + 0.5) * viewportSize;\n\n\t\t\t// If the line is degenerate, make it cover at least one pixel to avoid handling\n\t\t\t// zero-pixel extent as a special case later\n\t\t\tP1 += dot(P1 - P0, P1 - P0) < 0.0001 ? 0.01 : 0.0;\n\t\t\tvec2 delta = P1 - P0;\n\n\t\t\t// Permute so that the primary iteration is in x to collapse\n\t\t\t// all quadrant-specific DDA case later\n\t\t\tbool permute = false;\n\t\t\tif (abs(delta.x) < abs(delta.y)) {\n\t\t\t\t// More vertical line\n\t\t\t\tpermute = true;\n\t\t\t\tdelta = delta.yx;\n\t\t\t\tP0 = P0.yx;\n\t\t\t\tP1 = P1.yx;\n\t\t\t}\n\t\t\tfloat stepDir = sign(delta.x);\n\t\t\tfloat invdx = stepDir / delta.x;\n\n\t\t\t// Track the derivatives of Q and K\n\t\t\tvec3 dQ = (Q1 - Q0) * invdx;\n\t\t\tfloat dk = (k1 - k0) * invdx;\n\n\t\t\tvec2 dP = vec2(stepDir, delta.y * invdx);\n\n\t\t\t// Calculate pixel stride based on distance of ray origin from camera.\n\t\t\t// Since perspective means distant objects will be smaller in screen space\n\t\t\t// we can use this to have higher quality reflections for far away objects\n\t\t\t// while still using a large pixel stride for near objects (and increase performance)\n\t\t\t// this also helps mitigate artifacts on distant reflections when we use a large\n\t\t\t// pixel stride.\n\t\t\tfloat strideScaler = 1.0 - min(1.0, -rayOrigin.z / pixelStrideZCutoff);\n\t\t\tfloat pixStride = 1.0 + strideScaler * pixelStride;\n\n\t\t\t// Scale derivatives by the desired pixel stride and the offset the starting values by the jitter fraction\n\t\t\tdP *= pixStride; dQ *= pixStride; dk *= pixStride;\n\n\t\t\t// Track ray step and derivatives in a vec4 to parallelize\n\t\t\tvec4 pqk = vec4(P0, Q0.z, k0);\n\t\t\tvec4 dPQK = vec4(dP, dQ.z, dk);\n\n\t\t\tpqk += dPQK * jitter;\n\t\t\tfloat rayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);\n\t\t\tfloat rayZNear;\n\n\t\t\tbool intersect = false;\n\n\t\t\tvec2 texelSize = 1.0 / viewportSize;\n\n\t\t\titerationCount = 0.0;\n\n\t\t\tfor (int i = 0; i < 20; i++) {\n\t\t\t\tpqk += dPQK;\n\n\t\t\t\trayZNear = rayZFar;\n\t\t\t\trayZFar = (dPQK.z * 0.5 + pqk.z) / (dPQK.w * 0.5 + pqk.w);\n\n\t\t\t\thitPixel = permute ? pqk.yx : pqk.xy;\n\t\t\t\thitPixel *= texelSize;\n\n\t\t\t\tintersect = rayIntersectDepth(rayZNear, rayZFar, hitPixel);\n\n\t\t\t\titerationCount += 1.0;\n\n\t\t\t\t// PENDING Right on all platforms?\n\t\t\t\tif (intersect) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\t// Binary search refinement\n\t\t\t// FIXME If intersect in first iteration binary search may easily lead to the pixel of reflect object it self\n\t\t\tif (pixStride > 1.0 && intersect && iterationCount > 1.0) {\n\t\t\t\t// Roll back\n\t\t\t\tpqk -= dPQK;\n\t\t\t\tdPQK /= pixStride;\n\n\t\t\t\tfloat originalStride = pixStride * 0.5;\n\t\t\t\tfloat stride = originalStride;\n\n\t\t\t\trayZNear = pqk.z / pqk.w;\n\t\t\t\trayZFar = rayZNear;\n\n\t\t\t\tfor (int j = 0; j < 5; j++) {\n\t\t\t\t\tpqk += dPQK * stride;\n\t\t\t\t\trayZNear = rayZFar;\n\t\t\t\t\trayZFar = (dPQK.z * -0.5 + pqk.z) / (dPQK.w * -0.5 + pqk.w);\n\t\t\t\t\thitPixel = permute ? pqk.yx : pqk.xy;\n\t\t\t\t\thitPixel *= texelSize;\n\n\t\t\t\t\toriginalStride *= 0.5;\n\t\t\t\t\tstride = rayIntersectDepth(rayZNear, rayZFar, hitPixel) ? -originalStride : originalStride;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tQ0.xy += dQ.xy * iterationCount;\n\t\t\tQ0.z = pqk.z;\n\t\t\thitPoint = Q0 / pqk.w;\n\n\t\t\treturn intersect;\n\t\t}\n\n\t\tfloat calculateAlpha(float iterationCount, float reflectivity, vec2 hitPixel, vec3 hitPoint, float dist, vec3 rayDir) {\n\t\t\tfloat alpha = clamp(reflectivity, 0.0, 1.0);\n\t\t\t// Fade ray hits that approach the maximum iterations\n\t\t\talpha *= 1.0 - (iterationCount / float(20));\n\t\t\t// Fade ray hits that approach the screen edge\n\t\t\tvec2 hitPixelNDC = hitPixel * 2.0 - 1.0;\n\t\t\tfloat maxDimension = min(1.0, max(abs(hitPixelNDC.x), abs(hitPixelNDC.y)));\n\t\t\talpha *= 1.0 - max(0.0, maxDimension - screenEdgeFadeStart) / (1.0 - screenEdgeFadeStart);\n\n\t\t\t// Fade ray hits base on how much they face the camera\n\t\t\tfloat _eyeFadeStart = eyeFadeStart;\n\t\t\tfloat _eyeFadeEnd = eyeFadeEnd;\n\t\t\tif (_eyeFadeStart > _eyeFadeEnd) {\n\t\t\t\tfloat tmp = _eyeFadeEnd;\n\t\t\t\t_eyeFadeEnd = _eyeFadeStart;\n\t\t\t\t_eyeFadeStart = tmp;\n\t\t\t}\n\n\t\t\tfloat eyeDir = clamp(rayDir.z, _eyeFadeStart, _eyeFadeEnd);\n\t\t\talpha *= 1.0 - (eyeDir - _eyeFadeStart) / (_eyeFadeEnd - _eyeFadeStart);\n\n\t\t\t// Fade ray hits based on distance from ray origin\n\t\t\talpha *= 1.0 - clamp(dist / maxRayDistance, 0.0, 1.0);\n\n\t\t\treturn alpha;\n\t\t}\n\n\t\tvoid main() {\n\t\t\tvec4 normalAndGloss = texture2D(gBufferTexture1, v_Uv);\n\n\t\t\t// Is empty\n\t\t\tif (dot(normalAndGloss.rgb, vec3(1.0)) == 0.0) {\n\t\t\t\tdiscard;\n\t\t\t}\n\n\t\t\tfloat g = normalAndGloss.a;\n\t\t\tif (g <= minGlossiness) {\n\t\t\t\tdiscard;\n\t\t\t}\n\n\t\t\tfloat reflectivity = (g - minGlossiness) / (1.0 - minGlossiness);\n\n\t\t\tvec3 N = normalAndGloss.rgb * 2.0 - 1.0;\n\t\t\tN = normalize((viewInverseTranspose * vec4(N, 0.0)).xyz);\n\n\t\t\t// Position in view\n\t\t\tvec4 projectedPos = vec4(v_Uv * 2.0 - 1.0, fetchDepth(gBufferTexture2, v_Uv), 1.0);\n\t\t\tvec4 pos = projectionInv * projectedPos;\n\t\t\tvec3 rayOrigin = pos.xyz / pos.w;\n\n\t\t\tvec3 rayDir = normalize(reflect(normalize(rayOrigin), N));\n\t\t\tvec2 hitPixel;\n\t\t\tvec3 hitPoint;\n\t\t\tfloat iterationCount;\n\n\t\t\t// Get jitter\n\t\t\tvec2 uv2 = v_Uv * viewportSize;\n\t\t\tfloat jitter = fract((uv2.x + uv2.y) * 0.25);\n\n\t\t\tbool intersect = traceScreenSpaceRay(rayOrigin, rayDir, jitter, hitPixel, hitPoint, iterationCount);\n\n\t\t\tfloat dist = distance(rayOrigin, hitPoint);\n\n\t\t\tfloat alpha = calculateAlpha(iterationCount, reflectivity, hitPixel, hitPoint, dist, rayDir) * float(intersect);\n\n\t\t\tvec3 hitNormal = texture2D(gBufferTexture1, hitPixel).rgb * 2.0 - 1.0;\n\t\t\thitNormal = normalize((viewInverseTranspose * vec4(hitNormal, 0.0)).xyz);\n\n\t\t\t// Ignore the pixel not face the ray\n\t\t\t// TODO fadeout ?\n\t\t\t// PENDING Can be configured?\n\t\t\tif (dot(hitNormal, rayDir) >= 0.0) {\n\t\t\t\tdiscard;\n\t\t\t}\n\n\t\t\t// vec4 color = decodeHDR(texture2DLodEXT(colorTex, hitPixel, clamp(dist / maxRayDistance, 0.0, 1.0) * maxMipmapLevel));\n\n\t\t\tif (!intersect) {\n\t\t\t\tdiscard;\n\t\t\t}\n\n\t\t\tvec4 color = texture2D(colorTex, hitPixel);\n\t\t\tgl_FragColor = vec4(color.rgb * alpha, color.a);\n\n\t\t\t// gl_FragColor = vec4(vec3(iterationCount / 2.0), 1.0);\n\n\t\t}\n		"
	};

	var VignettingEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(VignettingEffect, _Effect);
		function VignettingEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.color = new t3d.Color3(0, 0, 0);
			_this.offset = 1.0;
			_this._vignettingPass = new t3d.ShaderPostPass(vignettingShader);
			_this._vignettingPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = VignettingEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var vignettingPass = this._vignettingPass;
			vignettingPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this.color.toArray(vignettingPass.uniforms.vignettingColor);
			vignettingPass.uniforms.vignettingOffset = this.offset;
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return VignettingEffect;
	}(Effect);
	var vignettingShader = {
		name: 'ec_vignetting_blend',
		defines: {},
		uniforms: {
			tDiffuse: null,
			vignettingColor: [0, 0, 0],
			vignettingOffset: 1.0
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tuniform vec3 vignettingColor;\n\t\tuniform float vignettingOffset;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 color = texture2D(tDiffuse, v_Uv);\n						vec2 uv = (v_Uv - vec2(0.5)) * vec2(vignettingOffset);\n\t\t\tcolor.rgb = mix(color.rgb, vignettingColor, clamp(dot(uv, uv), 0.0, 1.0));\n\t\t\tgl_FragColor = color;\n				}\n		"
	};

	var BlurEdgeEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(BlurEdgeEffect, _Effect);
		function BlurEdgeEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.offset = 1.0;
			_this._hBlurPass = new t3d.ShaderPostPass(horizontalBlurShader);
			_this._vBlurPass = new t3d.ShaderPostPass(verticalBlurShader);
			_this._blendPass = new t3d.ShaderPostPass(blurBlendShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = BlurEdgeEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._hBlurPass.uniforms.h = 4 / width;
			this._vBlurPass.uniforms.v = 4 / height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(1);
			var tempRT2 = composer._renderTargetCache.allocate(1);
			var blendPass = this._blendPass;

			// Step 1: blur x
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._hBlurPass.uniforms.tDiffuse = inputRenderTarget.texture;
			this._hBlurPass.render(renderer);
			// Step 2: blur y
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._vBlurPass.uniforms.tDiffuse = tempRT1.texture;
			this._vBlurPass.render(renderer);
			// Step 3: blend
			blendPass.uniforms.tDiffuse = inputRenderTarget.texture;
			blendPass.uniforms.blurOffset = this.offset;
			blendPass.uniforms.blurTexture = tempRT2.texture;
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return BlurEdgeEffect;
	}(Effect);
	var blurBlendShader = {
		name: 'ec_blur_blend',
		defines: {},
		uniforms: {
			tDiffuse: null,
			blurOffset: 1.0,
			blurTexture: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tuniform float blurOffset;\n\n				uniform sampler2D blurTexture;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 color = texture2D(tDiffuse, v_Uv);\n						vec2 uv = (v_Uv - vec2(0.5)) * vec2(blurOffset);\n\n						vec3 color2 = texture2D(blurTexture, v_Uv).rgb;\n\n\t\t\tcolor.rgb = mix(color.rgb, color2, clamp(dot(uv, uv), 0.0, 1.0));\n\t\t\tgl_FragColor = color;\n				}\n		"
	};

	var OutlineEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(OutlineEffect, _Effect);
		function OutlineEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.bufferDependencies = [{
				key: 'NonDepthMarkBuffer'
			}];
			_this.color = new t3d.Color3(1, 1, 1);
			_this.thickness = 1.0;
			_this.strength = 1.5;
			_this._downsamplerPass = new t3d.ShaderPostPass(copyShader);
			_this._edgeDetectionPass = new t3d.ShaderPostPass(edgeDetectionShader);
			_this._blurPass = new t3d.ShaderPostPass(seperableBlurShader);
			_this._blendPass = new t3d.ShaderPostPass(blendShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = OutlineEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(1);
			var tempRT2 = composer._renderTargetCache.allocate(1);
			var markBuffer = composer.getBuffer('NonDepthMarkBuffer');
			var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._downsamplerPass.uniforms.tDiffuse = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._downsamplerPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._edgeDetectionPass.uniforms.tDiffuse = tempRT1.texture;
			this._edgeDetectionPass.uniforms.texSize[0] = tempRT1.width;
			this._edgeDetectionPass.uniforms.texSize[1] = tempRT1.height;
			for (var i = 0; i < 4; i++) {
				this._edgeDetectionPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this.color.toArray(this._edgeDetectionPass.uniforms.edgeColor);
			this._edgeDetectionPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT2.texture;
			this._blurPass.uniforms.texSize[0] = tempRT2.width;
			this._blurPass.uniforms.texSize[1] = tempRT2.height;
			this._blurPass.uniforms.direction[0] = 1;
			this._blurPass.uniforms.direction[1] = 0;
			this._blurPass.uniforms.kernelRadius = this.thickness;
			this._blurPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurPass.uniforms.direction[0] = 0;
			this._blurPass.uniforms.direction[1] = 1;
			this._blurPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
			}
			this._blendPass.uniforms.colorTexture = inputRenderTarget.texture;
			this._blendPass.uniforms.edgeTexture = tempRT2.texture;
			this._blendPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._blendPass.uniforms.strength = this.strength;
			for (var _i = 0; _i < 4; _i++) {
				this._blendPass.uniforms.channelMask[_i] = _i === channelIndex ? 1 : 0;
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
		};
		return OutlineEffect;
	}(Effect);
	var edgeDetectionShader = {
		name: 'ec_outline_edge',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [0.5, 0.5],
			edgeColor: [1, 1, 1],
			channelMask: [1, 0, 0, 0]
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform vec2 texSize;\n				uniform vec3 edgeColor;\n\n\t\tuniform vec4 channelMask;\n\n				uniform sampler2D tDiffuse;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec2 invSize = 1.0 / texSize;\n\t\t\tvec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);\n\t\t\tfloat c1 = dot(texture2D(tDiffuse, v_Uv + uvOffset.xy), channelMask);\n\t\t\tfloat c2 = dot(texture2D(tDiffuse, v_Uv - uvOffset.xy), channelMask);\n\t\t\tfloat c3 = dot(texture2D(tDiffuse, v_Uv + uvOffset.yw), channelMask);\n\t\t\tfloat c4 = dot(texture2D(tDiffuse, v_Uv - uvOffset.yw), channelMask);\n\t\t\tfloat b1 = max(c1, c2);\n\t\t\tfloat b2 = max(c3, c4);\n\t\t\tfloat a = max(b1, b2);\n\t\t\tgl_FragColor = vec4(edgeColor, a);\n				}\n		"
	};
	var blendShader = {
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
		fragmentShader: "\n				uniform sampler2D maskTexture;\n				uniform sampler2D edgeTexture;\n				uniform float strength;\n\n\t\tuniform vec4 channelMask;\n\n				uniform sampler2D colorTexture;\n				varying vec2 v_Uv;\n\n				void main() {\n						vec4 edgeColor = texture2D(edgeTexture, v_Uv);\n						vec4 maskColor = texture2D(maskTexture, v_Uv);\n\n						vec4 outlineColor = edgeColor * strength;\n\t\t\toutlineColor.a *= (1.0 - dot(maskColor, channelMask));\n\n						vec4 color = texture2D(colorTexture, v_Uv);\n\t\t\t\n						color.rgb = outlineColor.rgb * outlineColor.a + color.rgb * (1. - outlineColor.a);\n\t\t\tcolor.a = outlineColor.a + color.a * (1. - outlineColor.a);\n\n						gl_FragColor = color;\n				}\n		"
	};

	var InnerGlowEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(InnerGlowEffect, _Effect);
		function InnerGlowEffect() {
			var _this;
			_this = _Effect.call(this) || this;
			_this.bufferDependencies = [{
				key: 'MarkBuffer'
			}];
			_this.color = new t3d.Color3(1, 1, 1);
			_this.strength = 1.5;
			_this.stride = 5;
			_this._channelPass = new t3d.ShaderPostPass(channelShader);
			_this._blurXPass = new t3d.ShaderPostPass(innerGlowXShader);
			_this._blurYPass = new t3d.ShaderPostPass(innerGlowYShader);
			// this._blendPass = new ShaderPostPass(additiveShader);
			_this._blendPass = new t3d.ShaderPostPass(tintShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = InnerGlowEffect.prototype;
		_proto.resize = function resize(width, height) {
			this._blurXPass.uniforms.texSize[0] = width;
			this._blurXPass.uniforms.texSize[1] = height;
			this._blurYPass.uniforms.texSize[0] = width;
			this._blurYPass.uniforms.texSize[1] = height;
		};
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var tempRT3 = composer._renderTargetCache.allocate(0);
			var markBuffer = composer.getBuffer('MarkBuffer');
			var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
			var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._channelPass.uniforms['tDiffuse'] = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (var i = 0; i < 4; i++) {
				this._channelPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._channelPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurXPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurXPass.uniforms.stride = this.stride;
			this._blurXPass.render(renderer);
			renderer.renderPass.setRenderTarget(tempRT3);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._blurYPass.uniforms.tDiffuse = tempRT1.texture;
			this._blurYPass.uniforms.blurX = tempRT2.texture;
			this._blurYPass.uniforms.stride = this.stride;
			this._blurYPass.uniforms.glowness = this.strength;
			this.color.toArray(this._blurYPass.uniforms.glowColor);
			this._blurYPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return InnerGlowEffect;
	}(Effect);
	var innerGlowXShader = {
		name: 'ec_innerglow_x',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [1, 1],
			stride: 10
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\t#define WT9_0 1.0\n\t\t#define WT9_1 0.8\n\t\t#define WT9_2 0.6\n\t\t#define WT9_3 0.4\n\t\t#define WT9_4 0.2\n\t\t#define WT9_NORMALIZE 5.2\n\n\t\tvarying vec2 v_Uv;\n\t\tuniform sampler2D tDiffuse;\n\t\tuniform vec2 texSize;\n\t\tuniform float stride;\n\n\t\tvoid main() {\n\t\t\tfloat texelIncrement = 0.25 * stride / texSize.x;\n\n\t\t\tfloat colour = texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = 0.5 * stride / texSize.x;\n\t\t\tcolour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = 0.75 * stride / texSize.x;\n\t\t\tcolour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = stride / texSize.x;\n\t\t\tcolour += texture2D(tDiffuse,vec2(v_Uv.x + texelIncrement, v_Uv.y)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x + 4.0 * texelIncrement, v_Uv.y)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 1.0 * texelIncrement, v_Uv.y)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 2.0 * texelIncrement, v_Uv.y)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 3.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(tDiffuse, vec2(v_Uv.x - 4.0 * texelIncrement, v_Uv.y)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\tfloat col = 1.0 - colour * 0.25;\n\n\t\t\tgl_FragColor = vec4(col,col,col,col);\n\t\t}\n		"
	};
	var innerGlowYShader = {
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
		fragmentShader: "\n\t\t#define WT9_0 1.0\n\t\t#define WT9_1 0.8\n\t\t#define WT9_2 0.6\n\t\t#define WT9_3 0.4\n\t\t#define WT9_4 0.2\n\t\t#define WT9_NORMALIZE 5.2\n\n\t\tvarying vec2 v_Uv;\n\t\tuniform vec2 texSize;\n\t\tuniform float stride;\n\t\tuniform float glowness;\n\t\tuniform vec3 glowColor;\n\t\tuniform sampler2D blurX;\n\t\tuniform sampler2D tDiffuse;\n\n\t\tvoid main() {\n\t\t\tfloat texelIncrement = 0.25 * stride / texSize.y;\n\n\t\t\tfloat colour = texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = 0.5 * stride / texSize.y;\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = 0.75 * stride / texSize.y;\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\ttexelIncrement = stride / texSize.y;\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + texelIncrement)).x * (0.8 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y + 2.0 * texelIncrement)).x* (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 3.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y + 4.0 * texelIncrement)).x * (WT9_4 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y)).x * (WT9_0 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y - 1.0 * texelIncrement)).x * (WT9_1 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 2.0 * texelIncrement)).x * (WT9_2 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x, v_Uv.y - 3.0 * texelIncrement)).x* (WT9_3 / WT9_NORMALIZE);\n\t\t\tcolour += texture2D(blurX, vec2(v_Uv.x , v_Uv.y- 4.0 * texelIncrement)).x * (WT9_3 / WT9_NORMALIZE);\n\n\t\t\tvec3 glo = (0.25 * glowness * colour) * glowColor;\n\t\t\tvec4 maskTexel = texture2D(tDiffuse, v_Uv);\n\t\t\t\n\t\t\tgl_FragColor = vec4(maskTexel.x * glo, 1.);\n\t\t}\n		"
	};
	var tintShader = {
		name: 'ec_tint',
		defines: {},
		uniforms: {
			texture1: null,
			texture2: null
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n				uniform sampler2D texture1;\n				uniform sampler2D texture2;\n				varying vec2 v_Uv;\n				void main() {\n						vec4 texel1 = texture2D(texture1, v_Uv);\n						vec4 texel2 = texture2D(texture2, v_Uv);\n\n						float v = max(max(texel2.x, texel2.y), texel2.z);\n\n						vec4 color = mix(texel1, vec4(texel2.rgb, texel1.a), v);\n						gl_FragColor = color;\n				}\n		"
	};

	var GlowEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(GlowEffect, _Effect);
		function GlowEffect() {
			var _this;
			_this = _Effect.call(this) || this;

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			_this.strength = 1;
			_this.radius = 0.4;
			_this.threshold = 0.01;
			_this.smoothWidth = 0.1;
			_this._maskPass = new t3d.ShaderPostPass(maskShader);
			_this._highlightPass = new t3d.ShaderPostPass(highlightShader);
			_this._blurPass = new t3d.ShaderPostPass(seperableBlurShader);
			_this._compositePass = new t3d.ShaderPostPass(bloomCompositeShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			_this._compositePass.uniforms.bloomFactors = new Float32Array([1.0, 0.8, 0.6, 0.4, 0.2]);
			_this._compositePass.uniforms.bloomTintColors = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
			_this._tempRTList = [];
			return _this;
		}
		var _proto = GlowEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(1);
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var markBuffer = composer.getBuffer('MarkBuffer');
			var colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			var usedMarkBuffer = markBuffer.attachManager.has(this.name);
			var colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			var colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.renderPass.setRenderTarget(tempRT2);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (var i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(tempRT1);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._highlightPass.uniforms.tDiffuse = usedMarkBuffer ? tempRT2.texture : colorBufferTexture;
			this._highlightPass.uniforms.threshold = this.threshold;
			this._highlightPass.uniforms.smoothWidth = this.smoothWidth;
			this._highlightPass.render(renderer);
			var inputRT = tempRT1;
			for (var _i = 0; _i < kernelSizeArray.length; _i++) {
				var _tempRT1 = composer._renderTargetCache.allocate(_i + 1);
				renderer.renderPass.setRenderTarget(_tempRT1);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._blurPass.uniforms.tDiffuse = inputRT.texture;
				this._blurPass.uniforms.texSize[0] = inputRT.width;
				this._blurPass.uniforms.texSize[1] = inputRT.height;
				this._blurPass.uniforms.direction[0] = 1;
				this._blurPass.uniforms.direction[1] = 0;
				this._blurPass.uniforms.kernelRadius = kernelSizeArray[_i];
				this._blurPass.render(renderer);
				var _tempRT2 = composer._renderTargetCache.allocate(_i + 1);
				renderer.renderPass.setRenderTarget(_tempRT2);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._blurPass.uniforms.tDiffuse = _tempRT1.texture;
				this._blurPass.uniforms.direction[0] = 0;
				this._blurPass.uniforms.direction[1] = 1;
				this._blurPass.render(renderer);
				composer._renderTargetCache.release(_tempRT1, _i + 1);
				inputRT = _tempRT2;
				this._tempRTList[_i] = _tempRT2;
			}
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._compositePass.uniforms.blurTexture1 = this._tempRTList[0].texture;
			this._compositePass.uniforms.blurTexture2 = this._tempRTList[1].texture;
			this._compositePass.uniforms.blurTexture3 = this._tempRTList[2].texture;
			this._compositePass.uniforms.blurTexture4 = this._tempRTList[3].texture;
			this._compositePass.uniforms.blurTexture5 = this._tempRTList[4].texture;
			this._compositePass.uniforms.bloomRadius = this.radius;
			this._compositePass.uniforms.bloomStrength = this.strength;
			this._compositePass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
			this._tempRTList.forEach(function (rt, i) {
				return composer._renderTargetCache.release(rt, i + 1);
			});
		};
		return GlowEffect;
	}(Effect);
	var kernelSizeArray = [3, 5, 7, 9, 11];
	var bloomCompositeShader = {
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
		fragmentShader: "\n\t\tuniform sampler2D blurTexture1;\n\t\tuniform sampler2D blurTexture2;\n\t\tuniform sampler2D blurTexture3;\n\t\tuniform sampler2D blurTexture4;\n\t\tuniform sampler2D blurTexture5;\n\t\tuniform float bloomStrength;\n\t\tuniform float bloomRadius;\n\t\tuniform float bloomFactors[NUM_MIPS];\n\t\tuniform vec3 bloomTintColors[NUM_MIPS];\n\n				varying vec2 v_Uv;\n\n				float lerpBloomFactor(const in float factor) {\n						float mirrorFactor = 1.2 - factor;\n						return mix(factor, mirrorFactor, bloomRadius);\n				}\n\n				void main() {\n						gl_FragColor = bloomStrength * (\n\t\t\t\tlerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, v_Uv) +\n\t\t\t\tlerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, v_Uv) +\n\t\t\t\tlerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, v_Uv) +\n\t\t\t\tlerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, v_Uv) +\n\t\t\t\tlerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, v_Uv)\n\t\t\t);\n				}\n		"
	};

	var SoftGlowEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(SoftGlowEffect, _Effect);
		function SoftGlowEffect() {
			var _this;
			_this = _Effect.call(this) || this;

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			_this.strength = 0.5;
			_this.blendRate = 0.4;
			_this.blurSize = 1;
			_this._maskPass = new t3d.ShaderPostPass(maskShader);
			_this._downSamplerPass = new t3d.ShaderPostPass(downSampleShader);
			_this._hBlurPass = new t3d.ShaderPostPass(horizontalBlurShader);
			_this._vBlurPass = new t3d.ShaderPostPass(verticalBlurShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			_this._tempRTList = [];
			_this._tempRTList2 = [];
			return _this;
		}
		var _proto = SoftGlowEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			for (var i = 0; i < 6; i++) {
				this._tempRTList[i] = composer._renderTargetCache.allocate(i);
				this._tempRTList2[i] = composer._renderTargetCache.allocate(i);
			}
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var markBuffer = composer.getBuffer('MarkBuffer');
			var colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			var usedMarkBuffer = markBuffer.attachManager.has(this.name);
			var colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			var colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.renderPass.setRenderTarget(this._tempRTList[0]);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (var _i = 0; _i < 4; _i++) {
					this._maskPass.uniforms.channel[_i] = _i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(this._tempRTList[1]);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._downSamplerPass.uniforms.tDiffuse = usedMarkBuffer ? this._tempRTList[0].texture : colorBufferTexture;
			this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[0].width;
			this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[0].height;
			this._downSamplerPass.uniforms.bright = 4; // make this brighter
			this._downSamplerPass.render(renderer);

			// down sampler
			for (var _i2 = 2; _i2 < 6; _i2++) {
				renderer.renderPass.setRenderTarget(this._tempRTList[_i2]);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._downSamplerPass.uniforms.tDiffuse = this._tempRTList[_i2 - 1].texture;
				this._downSamplerPass.uniforms.texSize[0] = this._tempRTList[_i2 - 1].width;
				this._downSamplerPass.uniforms.texSize[1] = this._tempRTList[_i2 - 1].height;
				this._downSamplerPass.uniforms.bright = 1;
				this._downSamplerPass.render(renderer);
			}

			// up sampler and blur h
			for (var _i3 = 0; _i3 < 5; _i3++) {
				renderer.renderPass.setRenderTarget(this._tempRTList[_i3]);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._hBlurPass.uniforms.tDiffuse = this._tempRTList[_i3 + 1].texture;
				this._hBlurPass.uniforms.h = 2 * this.blurSize / this._tempRTList[_i3].width;
				this._hBlurPass.render(renderer);
			}

			// blur v
			for (var _i4 = 0; _i4 < 5; _i4++) {
				renderer.renderPass.setRenderTarget(this._tempRTList2[_i4]);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._vBlurPass.uniforms.tDiffuse = this._tempRTList[_i4].texture;
				this._vBlurPass.uniforms.v = 2 * this.blurSize / this._tempRTList[_i4].height;
				this._vBlurPass.render(renderer);
			}

			// blend glow
			for (var _i5 = 3; _i5 >= 0; _i5--) {
				renderer.renderPass.setRenderTarget(this._tempRTList[_i5]);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._blendPass.uniforms.texture1 = this._tempRTList2[_i5].texture;
				this._blendPass.uniforms.texture2 = _i5 < 3 ? this._tempRTList[_i5 + 1].texture : this._tempRTList2[_i5 + 1].texture;
				this._blendPass.uniforms.colorWeight1 = (1 - this.blendRate) * this.strength;
				this._blendPass.uniforms.alphaWeight1 = (1 - this.blendRate) * this.strength;
				this._blendPass.uniforms.colorWeight2 = this.blendRate * this.strength;
				this._blendPass.uniforms.alphaWeight2 = this.blendRate * this.strength;
				this._blendPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
			this._tempRTList.forEach(function (rt, i) {
				return composer._renderTargetCache.release(rt, i);
			});
			this._tempRTList2.forEach(function (rt, i) {
				return composer._renderTargetCache.release(rt, i);
			});
		};
		return SoftGlowEffect;
	}(Effect);
	var downSampleShader = {
		name: 'ec_sg_downsample',
		defines: {},
		uniforms: {
			tDiffuse: null,
			texSize: [512, 512],
			bright: 1
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tvarying vec2 v_Uv;\n\n\t\tuniform sampler2D tDiffuse;\n\t\tuniform vec2 texSize;\n\t\n\t\tuniform float bright;\n\t\t\n\t\tvoid main() {\n		\t\tvec4 d = vec4(-1.0, -1.0, 1.0, 1.0) / texSize.xyxy;\n\t\t\tgl_FragColor = (texture2D(tDiffuse, v_Uv + d.xy) +\n\t\t\t\ttexture2D(tDiffuse, v_Uv + d.zy) +\n\t\t\t\ttexture2D(tDiffuse, v_Uv + d.xw) +\n\t\t\t\ttexture2D(tDiffuse, v_Uv + d.zw)) * bright * 0.25;\n\t\t}\n\t"
	};

	var TailingEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(TailingEffect, _Effect);
		function TailingEffect() {
			var _this;
			_this = _Effect.call(this) || this;

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			_this.center = new t3d.Vector2(0.5, 0.5);
			_this.direction = new t3d.Vector2(0.0, 1.0);
			_this.strength = 1;
			_this._maskPass = new t3d.ShaderPostPass(maskShader);
			_this._tailingPass = new t3d.ShaderPostPass(tailingShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = TailingEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var markBuffer = composer.getBuffer('MarkBuffer');
			var colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			var usedMarkBuffer = markBuffer.attachManager.has(this.name);
			var colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			var colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.renderPass.setRenderTarget(tempRT1);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (var i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._tailingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._tailingPass.uniforms.center[0] = this.center.x;
			this._tailingPass.uniforms.center[1] = this.center.y;
			this._tailingPass.uniforms.direction[0] = this.direction.x;
			this._tailingPass.uniforms.direction[1] = this.direction.y;
			// this.center.toArray(this._tailingPass.uniforms.center);
			// this.direction.toArray(this._tailingPass.uniforms.direction);
			this._tailingPass.uniforms.intensity = 10 * this.strength;
			this._tailingPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return TailingEffect;
	}(Effect);
	var tailingShader = {
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
		fragmentShader: "\n\t\tvarying vec2 v_Uv;\n\t\tuniform sampler2D blurMap;\n\t\tuniform float blurStart;\n\t\tuniform float blurWidth;\n\t\tuniform vec2 direction;\n\t\tuniform float intensity;\n\t\tuniform float glowGamma;\n\t\tuniform vec2 center;\n\n\t\tvoid main() {\n\t\t\tvec2 texCoord = v_Uv;\n\t\t\tvec4 blurred = texture2D(blurMap, texCoord);\n\t\t\tvec2 resCoord = vec2(0.0);\n\n\t\t\tfor(float i = 0.0; i < 31.0; i++) {\n\t\t\t\tfloat scale = blurStart + blurWidth * ((31.0 - i) / (31.0 - 1.0));\n\t\t\t\tvec2 tmp = texCoord * scale;\n\t\t\t\tresCoord = mix(texCoord, tmp, direction);\n\t\t\t\tvec4 tmpc = texture2D(blurMap, resCoord) * (i / 31.0) * (i / 31.0);\n\t\t\t\tblurred += tmpc / 31.0;\n\t\t\t}\n\n\t\t\tblurred.r = pow(blurred.r, glowGamma);\n\t\t\tblurred.g = pow(blurred.g, glowGamma);\n\t\t\tblurred.b = pow(blurred.b, glowGamma);\n\t\t\tblurred.rgb *= intensity;\n\t\t\tblurred.rgb = clamp(blurred.rgb, 0.0, 1.0);\n\n\t\t\tvec4 origTex = texture2D(blurMap, texCoord);\n\t\t\tvec4 blurResult = origTex + blurred;\n\t\t\t// blurResult *= 2;\n\n\t\t\tvec2 dir = texCoord - center;\n\t\t\tfloat dist = sqrt(dir.x * dir.x + dir.y * dir.y);\n\t\t\tfloat t = dist * 1.0;\n\t\t\tt = clamp(t, 0.0, 1.0); // We need 0 <= t <= 1\n\n\t\t\tgl_FragColor = blurResult * t;\n\t\t}\n		"
	};

	var RadialTailingEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(RadialTailingEffect, _Effect);
		function RadialTailingEffect() {
			var _this;
			_this = _Effect.call(this) || this;

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			_this.center = new t3d.Vector2(0.5, 0.5);
			_this.strength = 1;
			_this._maskPass = new t3d.ShaderPostPass(maskShader);
			_this._radialTailingPass = new t3d.ShaderPostPass(radialTailingShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = RadialTailingEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var markBuffer = composer.getBuffer('MarkBuffer');
			var colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			var usedMarkBuffer = markBuffer.attachManager.has(this.name);
			var colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			var colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.renderPass.setRenderTarget(tempRT1);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (var i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._radialTailingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._radialTailingPass.uniforms.center[0] = this.center.x;
			this._radialTailingPass.uniforms.center[1] = this.center.y;
			// this.center.toArray(this._radialTailingPass.uniforms.center);
			this._radialTailingPass.uniforms.intensity = 10 * this.strength;
			this._radialTailingPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return RadialTailingEffect;
	}(Effect);
	var radialTailingShader = {
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
		fragmentShader: "\n\t\tvarying vec2 v_Uv;\n\t\tuniform sampler2D blurMap;\n\t\tuniform float blurStart;\n\t\tuniform float blurWidth;\n\t\tuniform float intensity;\n\t\tuniform float glowGamma;\n\t\tuniform vec2 center;\n\t\t\n\t\tvoid main() {\n\t\t\tvec2 texCoord = v_Uv;\n\t\t\tvec2 ctrPt = center;\n\t\t\tvec4 blurred = texture2D(blurMap, texCoord);\n\t\t\n\t\t\tfor(float i = 0.0; i < 31.0; i++) {\n\t\t\t\tfloat scale = blurStart + blurWidth * ((31.0 - i) / (31.0 - 1.0));\n\t\t\t\tvec2 tmp = (texCoord - ctrPt) * scale + ctrPt;\n\t\t\t\tvec4 tmpc = texture2D(blurMap, tmp) * (i / 31.0) * (i / 31.0);\n\t\t\n\t\t\t\tblurred += tmpc / 31.0;\n\t\t\t}\n\t\t\n\t\t\tblurred.r = pow(blurred.r, glowGamma);\n\t\t\tblurred.g = pow(blurred.g, glowGamma);\n\t\t\tblurred.b = pow(blurred.b, glowGamma);\n\t\t\tblurred.rgb *= intensity;\n\t\t\tblurred.rgb = clamp(blurred.rgb, 0.0, 1.0);\n\t\t\n\t\t\tvec4 origTex = texture2D(blurMap, texCoord);\n\t\t\tvec4 blurResult = origTex + blurred;\n\t\t\t// blurResult *= 2;\n\t\t\n\t\t\tvec2 dir = texCoord - ctrPt;\n\t\t\tfloat dist = sqrt(dir.x * dir.x + dir.y * dir.y);\n\t\t\tfloat t = dist * 1.0;\n\t\t\tt = clamp(t, 0.0, 1.0); // We need 0 <= t <= 1\n\t\t\n\t\t\tgl_FragColor = blurResult * t;\n\t\t}\n		"
	};

	var GhostingEffect = /*#__PURE__*/function (_Effect) {
		_inheritsLoose(GhostingEffect, _Effect);
		function GhostingEffect() {
			var _this;
			_this = _Effect.call(this) || this;

			// this.bufferDependencies = [
			// 	{ key: 'SceneBuffer' },
			// 	{ key: 'ColorMarkBuffer', mask: RenderListMask.ALL }
			// ];

			_this.bufferDependencies = [{
				key: 'SceneBuffer'
			}, {
				key: 'MarkBuffer',
				mask: RenderListMask.OPAQUE
			}, {
				key: 'ColorMarkBuffer',
				mask: RenderListMask.TRANSPARENT
			}];
			_this.center = new t3d.Vector2(0.5, 0.5);
			_this.strength = 1;
			_this._maskPass = new t3d.ShaderPostPass(maskShader);
			_this._ghostingPass = new t3d.ShaderPostPass(ghostingShader);
			_this._blendPass = new t3d.ShaderPostPass(additiveShader);
			_this._blendPass.material.premultipliedAlpha = true;
			return _this;
		}
		var _proto = GhostingEffect.prototype;
		_proto.render = function render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
			var tempRT1 = composer._renderTargetCache.allocate(0);
			var tempRT2 = composer._renderTargetCache.allocate(0);
			var sceneBuffer = composer.getBuffer('SceneBuffer');
			var markBuffer = composer.getBuffer('MarkBuffer');
			var colorMarkBuffer = composer.getBuffer('ColorMarkBuffer');
			var usedMarkBuffer = markBuffer.attachManager.has(this.name);
			var colorAttachIndex = colorMarkBuffer.attachManager.getAttachIndex(this.name);
			var colorBufferTexture = colorMarkBuffer.output(colorAttachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			if (usedMarkBuffer) {
				var attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
				var channelIndex = markBuffer.attachManager.getChannelIndex(this.name);
				renderer.renderPass.setRenderTarget(tempRT1);
				renderer.renderPass.setClearColor(0, 0, 0, 0);
				renderer.renderPass.clear(true, true, false);
				this._maskPass.uniforms.colorTexture = sceneBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.maskTexture = markBuffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				this._maskPass.uniforms.additiveTexture = colorBufferTexture;
				for (var i = 0; i < 4; i++) {
					this._maskPass.uniforms.channel[i] = i === channelIndex ? 1 : 0;
				}
				this._maskPass.render(renderer);
			}
			renderer.renderPass.setRenderTarget(tempRT2);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			this._ghostingPass.uniforms.blurMap = usedMarkBuffer ? tempRT1.texture : colorBufferTexture;
			this._ghostingPass.uniforms.center[0] = this.center.x;
			this._ghostingPass.uniforms.center[1] = this.center.y;
			// this.center.toArray(this._ghostingPass.uniforms.center);
			this._ghostingPass.uniforms.intensity = 3 * this.strength;
			this._ghostingPass.render(renderer);
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			if (finish) {
				renderer.renderPass.clear(composer.clearColor, composer.clearDepth, composer.clearStencil);
			} else {
				renderer.renderPass.clear(true, true, false);
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
		};
		return GhostingEffect;
	}(Effect);
	var ghostingShader = {
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
		fragmentShader: "\n\t\tvarying vec2 v_Uv;\n\t\tuniform sampler2D blurMap;\n\t\tuniform float blurStart;\n\t\tuniform float blurWidth;\n\t\tuniform float intensity;\n\t\tuniform float glowGamma;\n\t\tuniform vec2 center;\n\t\t\n\t\tvoid main() {\n\t\t\tvec2 uv = v_Uv;\n\t\t\tvec2 ctrPt = center;\n\t\t\n\t\t\tfloat scale = blurStart + blurWidth * 1.0;\n\t\t\tvec2 tmp = (uv - ctrPt) * scale + ctrPt;\n\n\t\t\tvec4 blurred = texture2D(blurMap, tmp);\n\t\t\tblurred.rgb = pow(blurred.rgb, vec3(glowGamma));\n\t\t\tblurred.rgb *= intensity;\n\t\t\tblurred.rgb = clamp(blurred.rgb, 0.0, 1.0);\n\t\t\t\n\t\t\tvec2 dir = uv - ctrPt;\n\t\t\tfloat dist = sqrt(dir.x * dir.x + dir.y * dir.y);\n\t\t\n\t\t\tgl_FragColor = blurred * clamp(dist, 0.0, 1.0);\n\t\t}\n		"
	};

	var GBuffer = /*#__PURE__*/function (_Buffer) {
		_inheritsLoose(GBuffer, _Buffer);
		function GBuffer(width, height, options) {
			var _this;
			_this = _Buffer.call(this, width, height, options) || this;
			_this._rt = new t3d.RenderTarget2D(width, height);
			_this._rt.texture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
			_this._rt.texture.magFilter = t3d.TEXTURE_FILTER.NEAREST;
			_this._rt.texture.generateMipmaps = false;
			if (options.floatColorBuffer) {
				_this._rt.texture.type = t3d.PIXEL_TYPE.FLOAT;
			} else {
				_this._rt.texture.type = t3d.PIXEL_TYPE.HALF_FLOAT;
			}
			var depthTexture = new t3d.Texture2D();
			depthTexture.image = {
				data: null,
				width: width,
				height: height
			};
			depthTexture.type = t3d.PIXEL_TYPE.UNSIGNED_INT_24_8;
			depthTexture.format = t3d.PIXEL_FORMAT.DEPTH_STENCIL;
			depthTexture.magFilter = t3d.TEXTURE_FILTER.NEAREST;
			depthTexture.minFilter = t3d.TEXTURE_FILTER.NEAREST;
			depthTexture.generateMipmaps = false;
			depthTexture.flipY = false;
			_this._rt.attach(depthTexture, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			_this._renderOptions = {
				getMaterial: createGetMaterialFunction$2(),
				ifRender: function ifRender(renderable) {
					return !!renderable.geometry.getAttribute('a_Normal');
				}
			};
			_this._renderStates = null;
			_this.layers = [0];
			return _this;
		}
		var _proto = GBuffer.prototype;
		_proto.setGeometryReplaceFunction = function setGeometryReplaceFunction(func) {
			if (!!func) {
				this._renderOptions.getGeometry = func;
			} else {
				delete this._renderOptions.getGeometry;
			}
		};
		_proto.setMaterialReplaceFunction = function setMaterialReplaceFunction(func) {
			if (!!func) {
				this._renderOptions.getMaterial = createGetMaterialFunction$2(func);
			} else {
				this._renderOptions.getMaterial = createGetMaterialFunction$2();
			}
		};
		_proto.render = function render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			renderer.renderPass.setRenderTarget(this._rt);
			renderer.renderPass.setClearColor(0, 0, 0, 0);
			renderer.renderPass.clear(true, true, false);
			var renderOptions = this._renderOptions;
			var renderStates = scene.getRenderStates(camera);
			var renderQueue = scene.getRenderQueue(camera);
			this._renderStates = renderStates;
			var layers = this.layers;
			for (var i = 0, l = layers.length; i < l; i++) {
				var renderQueueLayer = renderQueue.getLayer(layers[i]);
				renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, renderOptions);
				renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, renderOptions);
			}
		};
		_proto.output = function output() {
			return this._rt;
		};
		_proto.getCurrentRenderStates = function getCurrentRenderStates() {
			return this._renderStates;
		};
		_proto.resize = function resize(width, height) {
			_Buffer.prototype.resize.call(this, width, height);
			this._rt.resize(width, height);
		};
		_proto.dispose = function dispose() {
			_Buffer.prototype.dispose.call(this);
			this._rt.dispose();
		};
		return GBuffer;
	}(Buffer);
	function createGetMaterialFunction$2(func) {
		if (func === void 0) {
			func = defaultMaterialReplaceFunction$2;
		}
		return function (renderable) {
			var material = func(renderable);
			material.diffuseMap = renderable.material.diffuseMap;
			material.uniforms['roughness'] = renderable.material.roughness !== undefined ? renderable.material.roughness : 0.5;
			material.roughnessMap = renderable.material.roughnessMap;
			material.side = renderable.material.side;
			return material;
		};
	}
	var materialMap$2 = new Map();
	var materialWeakMap = new WeakMap();
	function defaultMaterialReplaceFunction$2(renderable) {
		var materialRef = materialWeakMap.get(renderable.material);
		if (!materialRef) {
			var onDispose = function onDispose() {
				renderable.material.removeEventListener('dispose', onDispose);
				materialWeakMap.delete(renderable.material);
				materialRef.refCount--;
				if (materialRef.refCount <= 0) {
					materialMap$2.delete(code);
				}
			};
			var useFlatShading = !renderable.geometry.attributes['a_Normal'] || renderable.material.shading === t3d.SHADING_TYPE.FLAT_SHADING;
			var useDiffuseMap = !!renderable.material.diffuseMap;
			var useRoughnessMap = !!renderable.material.roughnessMap;
			var useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
			var morphTargets = !!renderable.object.morphTargetInfluences;
			var morphNormals = !!renderable.object.morphTargetInfluences && renderable.object.geometry.morphAttributes.normal;
			var side = renderable.material.side;
			var maxBones = 0;
			if (useSkinning) {
				if (renderable.object.skeleton.boneTexture) {
					maxBones = 1024;
				} else {
					maxBones = renderable.object.skeleton.bones.length;
				}
			}
			var code = useFlatShading + '_' + useDiffuseMap + '_' + useRoughnessMap + '_' + useSkinning + '_' + maxBones + '_' + morphTargets + '_' + morphNormals + '_' + side;
			materialRef = materialMap$2.get(code);
			if (!materialRef) {
				var material = new t3d.ShaderMaterial(normalGlossinessShader);
				material.shading = useFlatShading ? t3d.SHADING_TYPE.FLAT_SHADING : t3d.SHADING_TYPE.SMOOTH_SHADING;
				material.alphaTest = useDiffuseMap ? 0.999 : 0; // ignore if alpha < 0.99
				material.side = side;
				materialRef = {
					refCount: 0,
					material: material
				};
				materialMap$2.set(code, materialRef);
			}
			materialWeakMap.set(renderable.material, materialRef);
			materialRef.refCount++;
			renderable.material.addEventListener('dispose', onDispose);
		}
		return materialRef.material;
	}
	var normalGlossinessShader = {
		name: 'ec_gbuffer_ng',
		defines: {
			G_USE_ROUGHNESSMAP: false
		},
		uniforms: {
			roughness: 0.5,
			roughnessMap: null
		},
		vertexShader: "\n				#include <common_vert>\n				#include <morphtarget_pars_vert>\n				#include <skinning_pars_vert>\n				#include <normal_pars_vert>\n				#include <uv_pars_vert>\n\t\t#include <logdepthbuf_pars_vert>\n				void main() {\n				\t#include <uv_vert>\n				\t#include <begin_vert>\n				\t#include <morphtarget_vert>\n				\t#include <morphnormal_vert>\n				\t#include <skinning_vert>\n				\t#include <skinnormal_vert>\n				\t#include <normal_vert>\n				\t#include <pvm_vert>\n\t\t\t#include <logdepthbuf_vert>\n				}\n		",
		fragmentShader: "\n				#include <common_frag>\n				#include <diffuseMap_pars_frag>\n\n				#include <uv_pars_frag>\n\n				#include <packing>\n				#include <normal_pars_frag>\n\n				uniform float roughness;\n\n				#ifdef USE_ROUGHNESSMAP\n						uniform sampler2D roughnessMap;\n				#endif\n\n\t\t#include <logdepthbuf_pars_frag>\n\n				void main() {\n						#if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)\n								vec4 texelColor = texture2D(diffuseMap, v_Uv);\n								float alpha = texelColor.a * u_Opacity;\n								if(alpha < ALPHATEST) discard;\n						#endif\n\n\t\t\t#include <logdepthbuf_frag>\n\n						vec3 normal = normalize(v_Normal);\n\n\t\t\t#ifdef DOUBLE_SIDED\n\t\t\t\tnormal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);\n\t\t\t#endif \n\n						float roughnessFactor = roughness;\n						#ifdef USE_ROUGHNESSMAP\n								roughnessFactor *= texture2D(roughnessMap, v_Uv).g;\n						#endif\n\n						vec4 packedNormalGlossiness;\n						packedNormalGlossiness.xyz = normal * 0.5 + 0.5;\n						packedNormalGlossiness.w = clamp(1. - roughnessFactor, 0., 1.);\n						\n						gl_FragColor = packedNormalGlossiness;\n				}\n		"
	};

	var BufferAttachManager = /*#__PURE__*/function () {
		function BufferAttachManager(attachChannelSize) {
			this.keys = new Array();
			this.masks = new Array();
			this.attachChannelSize = attachChannelSize;
		}
		var _proto = BufferAttachManager.prototype;
		_proto.allocate = function allocate(key, mask) {
			if (mask === void 0) {
				mask = RenderListMask.ALL;
			}
			this.keys.push(key);
			this.masks.push(mask);
			return this.keys.length - 1;
		};
		_proto.getAttachIndex = function getAttachIndex(key) {
			var index = this.keys.indexOf(key);
			return Math.max(0, Math.floor(index / this.attachChannelSize));
		};
		_proto.getChannelIndex = function getChannelIndex(key) {
			var index = this.keys.indexOf(key);
			return Math.max(0, index % this.attachChannelSize);
		};
		_proto.has = function has(key) {
			var index = this.keys.indexOf(key);
			return index > -1;
		};
		_proto.count = function count() {
			return this.keys.length;
		};
		_proto.attachCount = function attachCount() {
			return Math.ceil(this.keys.length / this.attachChannelSize);
		};
		_proto.getKey = function getKey(attachIndex, channelIndex) {
			return this.keys[attachIndex * this.attachChannelSize + channelIndex];
		};
		_proto.getMask = function getMask(attachIndex, channelIndex) {
			return this.masks[attachIndex * this.attachChannelSize + channelIndex];
		};
		_proto.getAttachInfo = function getAttachInfo(attachIndex, result) {
			if (result === void 0) {
				result = {
					count: 0,
					keys: [],
					masks: []
				};
			}
			result.count = 0;
			for (var i = 0; i < this.attachChannelSize; i++) {
				var key = this.getKey(attachIndex, i);
				var mask = this.getMask(attachIndex, i);
				if (key !== undefined && mask !== undefined) {
					result.keys[result.count] = key;
					result.masks[result.count] = mask;
					result.count++;
				}
			}
			return result;
		};
		_proto.reset = function reset() {
			this.keys.length = 0;
			this.masks.length = 0;
		};
		return BufferAttachManager;
	}();

	var NonDepthMarkBuffer = /*#__PURE__*/function (_Buffer) {
		_inheritsLoose(NonDepthMarkBuffer, _Buffer);
		function NonDepthMarkBuffer(width, height, options) {
			var _this;
			_this = _Buffer.call(this, width, height, options) || this;
			_this._rts = [];
			for (var i = 0; i < options.maxMarkAttachment; i++) {
				var rt = new t3d.RenderTarget2D(width, height);
				rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				_this._rts.push(rt);
			}
			_this._mrts = [];
			for (var _i = 0; _i < options.maxMarkAttachment; _i++) {
				var mrt = new t3d.RenderTarget2D(width, height);
				mrt.attach(new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.RGBA8, options.samplerNumber), t3d.ATTACHMENT.COLOR_ATTACHMENT0);
				mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				_this._mrts.push(mrt);
			}
			_this._state = {
				attachIndex: 0,
				attachInfo: {
					count: 0,
					keys: [],
					masks: []
				}
			};
			var attachManager = new BufferAttachManager(4);
			_this._opacityRenderOptions = {
				getMaterial: createGetMaterialFunction$1(undefined, _this._state, attachManager, RenderListMask.OPAQUE),
				ifRender: createIfRenderFunction(_this._state, RenderListMask.OPAQUE)
			};
			_this._transparentRenderOptions = {
				getMaterial: createGetMaterialFunction$1(undefined, _this._state, attachManager, RenderListMask.TRANSPARENT),
				ifRender: createIfRenderFunction(_this._state, RenderListMask.TRANSPARENT)
			};
			_this.attachManager = attachManager;
			_this.layers = [0];
			return _this;
		}
		var _proto = NonDepthMarkBuffer.prototype;
		_proto.setGeometryReplaceFunction = function setGeometryReplaceFunction(func) {
			if (!!func) {
				this._opacityRenderOptions.getGeometry = func;
				this._transparentRenderOptions.getGeometry = func;
			} else {
				delete this._opacityRenderOptions.getGeometry;
				delete this._transparentRenderOptions.getGeometry;
			}
		};
		_proto.setMaterialReplaceFunction = function setMaterialReplaceFunction(func) {
			if (!!func) {
				this._opacityRenderOptions.getMaterial = createGetMaterialFunction$1(func, this._state, this.attachManager, RenderListMask.OPAQUE);
				this._transparentRenderOptions.getMaterial = createGetMaterialFunction$1(func, this._state, this.attachManager, RenderListMask.TRANSPARENT);
			} else {
				this._opacityRenderOptions.getMaterial = createGetMaterialFunction$1(undefined, this._state, this.attachManager, RenderListMask.OPAQUE);
				this._transparentRenderOptions.getMaterial = createGetMaterialFunction$1(undefined, this._state, this.attachManager, RenderListMask.TRANSPARENT);
			}
		};
		_proto.render = function render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			var attachCount = this.attachManager.attachCount();
			if (attachCount > this._rts.length) {
				console.error('XXMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxMarkAttachment<' + this._rts.length + '>.');
			}
			for (var attachIndex = 0; attachIndex < attachCount; attachIndex++) {
				var rt = this._rts[attachIndex];
				var mrt = this._mrts[attachIndex];
				if (composer.$useMSAA) {
					renderer.renderPass.setRenderTarget(mrt);
					renderer.renderPass.setClearColor(0, 0, 0, 0);
					renderer.renderPass.clear(true, false, false);
				} else {
					renderer.renderPass.setRenderTarget(rt);
					renderer.renderPass.setClearColor(0, 0, 0, 0);
					renderer.renderPass.clear(true, false, false);
				}
				var renderStates = scene.getRenderStates(camera);
				var renderQueue = scene.getRenderQueue(camera);
				this._state.attachIndex = attachIndex;
				this.attachManager.getAttachInfo(attachIndex, this._state.attachInfo);
				var attachMask = 0,
					attachMasks = this._state.attachInfo.masks,
					maskLength = this._state.attachInfo.count;
				for (var i = 0; i < maskLength; i++) {
					attachMask |= attachMasks[i];
				}
				var layers = this.layers;
				for (var _i2 = 0, l = layers.length; _i2 < l; _i2++) {
					var renderQueueLayer = renderQueue.getLayer(layers[_i2]);
					if (attachMask & RenderListMask.OPAQUE) {
						renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, this._opacityRenderOptions);
					}
					if (attachMask & RenderListMask.TRANSPARENT) {
						renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, this._transparentRenderOptions);
					}
				}
				if (composer.$useMSAA) {
					renderer.renderPass.setRenderTarget(rt);
					renderer.renderPass.blitRenderTarget(mrt, rt, true, false, false);
				}

				// generate mipmaps for down sampler
				renderer.renderPass.updateRenderTargetMipmap(rt);
			}
		};
		_proto.output = function output(attachIndex) {
			if (attachIndex === void 0) {
				attachIndex = 0;
			}
			return this._rts[attachIndex];
		};
		_proto.resize = function resize(width, height) {
			_Buffer.prototype.resize.call(this, width, height);
			this._rts.forEach(function (rt) {
				return rt.resize(width, height);
			});
			this._mrts.forEach(function (mrt) {
				return mrt.resize(width, height);
			});
		};
		_proto.dispose = function dispose() {
			_Buffer.prototype.dispose.call(this);
			this._rts.forEach(function (rt) {
				return rt.dispose();
			});
			this._mrts.forEach(function (mrt) {
				return mrt.dispose();
			});
		};
		return NonDepthMarkBuffer;
	}(Buffer);
	function createGetMaterialFunction$1(func, state, attachManager, renderMask) {
		if (func === void 0) {
			func = defaultMaterialReplaceFunction$1;
		}
		return function (renderable) {
			var material = func(renderable);
			// material.side = renderable.material.side; TODO
			material.side = t3d.DRAW_SIDE.DOUBLE;
			for (var channelIndex = 0; channelIndex < 4; channelIndex++) {
				var key = attachManager.getKey(state.attachIndex, channelIndex);
				var mask = attachManager.getMask(state.attachIndex, channelIndex);
				if (mask & renderMask) {
					material.uniforms.mColor[channelIndex] = renderable.object.effects[key] || 0;
				} else {
					material.uniforms.mColor[channelIndex] = 0;
				}
			}
			return material;
		};
	}
	function createIfRenderFunction(state, renderMask) {
		return function (renderable) {
			if (!renderable.object.effects) {
				return false;
			}
			var mask = 0;
			for (var i = 0; i < state.attachInfo.count; i++) {
				var key = state.attachInfo.keys[i];
				if (!!renderable.object.effects[key]) {
					mask |= state.attachInfo.masks[i];
				}
			}
			return mask & renderMask;
		};
	}
	var materialMap$1 = new Map();

	// TODO dispose
	function defaultMaterialReplaceFunction$1(renderable) {
		var useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
		var morphTargets = !!renderable.object.morphTargetInfluences;
		var drawMode = renderable.material.drawMode;
		var key = useSkinning + '_' + morphTargets + '_' + drawMode;
		var result;
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
	var markShader = {
		name: 'ec_mark',
		defines: {},
		uniforms: {
			mColor: [1, 1, 1, 1]
		},
		vertexShader: "\n				#include <common_vert>\n				#include <morphtarget_pars_vert>\n				#include <skinning_pars_vert>\n				#include <uv_pars_vert>\n\t\t#include <logdepthbuf_pars_vert>\n				void main() {\n				\t#include <uv_vert>\n				\t#include <begin_vert>\n				\t#include <morphtarget_vert>\n				\t#include <skinning_vert>\n				\t#include <pvm_vert>\n\t\t\t#include <logdepthbuf_vert>\n				}\n		",
		fragmentShader: "\n				#include <common_frag>\n				#include <diffuseMap_pars_frag>\n\n				#include <uv_pars_frag>\n\n\t\t#include <logdepthbuf_pars_frag>\n\n\t\tuniform vec4 mColor;\n\n				void main() {\n\t\t\t#include <logdepthbuf_frag>\n\t\t\t\n						#if defined(USE_DIFFUSE_MAP) && defined(ALPHATEST)\n								vec4 texelColor = texture2D(diffuseMap, v_Uv);\n								float alpha = texelColor.a * u_Opacity;\n								if(alpha < ALPHATEST) discard;\n						#endif\n\n						gl_FragColor = mColor;\n				}\n		"
	};

	var MarkBuffer = /*#__PURE__*/function (_NonDepthMarkBuffer) {
		_inheritsLoose(MarkBuffer, _NonDepthMarkBuffer);
		function MarkBuffer(width, height, options) {
			return _NonDepthMarkBuffer.call(this, width, height, options) || this;
		}
		var _proto = MarkBuffer.prototype;
		_proto.syncDepthAttachments = function syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
			this._rts.forEach(function (rt) {
				return rt.dispose();
			});
			this._mrts.forEach(function (mrt) {
				return mrt.dispose();
			});
			if (isDepthStencilAttachment(depthAttachment)) {
				this._rts.forEach(function (rt) {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._rts.forEach(function (rt) {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			if (isDepthStencilAttachment(msDepthRenderBuffer)) {
				this._mrts.forEach(function (mrt) {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._mrts.forEach(function (mrt) {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			this.needsUpdate = true;
		};
		return MarkBuffer;
	}(NonDepthMarkBuffer);

	var ColorMarkBuffer = /*#__PURE__*/function (_Buffer) {
		_inheritsLoose(ColorMarkBuffer, _Buffer);
		function ColorMarkBuffer(width, height, options) {
			var _this;
			_this = _Buffer.call(this, width, height, options) || this;
			_this._rts = [];
			for (var i = 0; i < options.maxColorAttachment; i++) {
				var rt = new t3d.RenderTarget2D(width, height);
				rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				_this._rts.push(rt);
			}
			_this._mrts = [];
			for (var _i = 0; _i < options.maxColorAttachment; _i++) {
				var mrt = new t3d.RenderTarget2D(width, height);
				mrt.attach(new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.RGBA8, options.samplerNumber), t3d.ATTACHMENT.COLOR_ATTACHMENT0);
				mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				_this._mrts.push(mrt);
			}
			var state = {
				key: null
			};
			_this._state = state;
			var attachManager = new BufferAttachManager(1);
			_this._renderOptions = {
				getMaterial: createGetMaterialFunction(undefined, state),
				ifRender: function ifRender(renderable) {
					if (!renderable.object.effects) {
						return false;
					}
					if (!!renderable.object.effects[state.key]) {
						return true;
					}
					return false;
				}
			};
			_this.attachManager = attachManager;
			_this.layers = [0];
			return _this;
		}
		var _proto = ColorMarkBuffer.prototype;
		_proto.setGeometryReplaceFunction = function setGeometryReplaceFunction(func) {
			if (!!func) {
				this._renderOptions.getGeometry = func;
			} else {
				delete this._renderOptions.getGeometry;
			}
		};
		_proto.setMaterialReplaceFunction = function setMaterialReplaceFunction(func) {
			if (!!func) {
				this._renderOptions.getMaterial = createGetMaterialFunction(func, this._state);
			} else {
				this._renderOptions.getMaterial = createGetMaterialFunction(undefined, this._state);
			}
		};
		_proto.syncDepthAttachments = function syncDepthAttachments(depthAttachment, msDepthRenderBuffer) {
			this._rts.forEach(function (rt) {
				return rt.dispose();
			});
			this._mrts.forEach(function (mrt) {
				return mrt.dispose();
			});
			if (isDepthStencilAttachment(depthAttachment)) {
				this._rts.forEach(function (rt) {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._rts.forEach(function (rt) {
					rt.attach(depthAttachment, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			if (isDepthStencilAttachment(msDepthRenderBuffer)) {
				this._mrts.forEach(function (mrt) {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_ATTACHMENT);
				});
			} else {
				this._mrts.forEach(function (mrt) {
					mrt.attach(msDepthRenderBuffer, t3d.ATTACHMENT.DEPTH_ATTACHMENT);
					mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				});
			}
			this.needsUpdate = true;
		};
		_proto.render = function render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			var attachCount = this.attachManager.attachCount();
			if (attachCount > this._rts.length) {
				console.error('ColorMarkBuffer: attachCount<' + attachCount + '> bigger then options.maxColorAttachment<' + this._rts.length + '>.');
			}
			for (var attachIndex = 0; attachIndex < attachCount; attachIndex++) {
				var rt = this._rts[attachIndex];
				var mrt = this._mrts[attachIndex];
				if (composer.$useMSAA) {
					renderer.renderPass.setRenderTarget(mrt);
					renderer.renderPass.setClearColor(0, 0, 0, 0);
					renderer.renderPass.clear(true, false, false);
				} else {
					renderer.renderPass.setRenderTarget(rt);
					renderer.renderPass.setClearColor(0, 0, 0, 0);
					renderer.renderPass.clear(true, false, false);
				}
				var renderOptions = this._renderOptions;
				var attachManager = this.attachManager;
				var renderStates = scene.getRenderStates(camera);
				var renderQueue = scene.getRenderQueue(camera);
				this._state.key = attachManager.getKey(attachIndex, 0);
				var mask = attachManager.getMask(attachIndex, 0);
				var layers = this.layers;
				for (var i = 0, l = layers.length; i < l; i++) {
					var renderQueueLayer = renderQueue.getLayer(layers[i]);
					if (mask & RenderListMask.OPAQUE) {
						renderer.renderRenderableList(renderQueueLayer.opaque, renderStates, renderOptions);
					}
					if (mask & RenderListMask.TRANSPARENT) {
						renderer.renderRenderableList(renderQueueLayer.transparent, renderStates, renderOptions);
					}
				}
				if (composer.$useMSAA) {
					renderer.renderPass.setRenderTarget(rt);
					renderer.renderPass.blitRenderTarget(mrt, rt, true, false, false);
				}

				// generate mipmaps for down sampler
				renderer.renderPass.updateRenderTargetMipmap(rt);
			}
		};
		_proto.output = function output(attachIndex) {
			if (attachIndex === void 0) {
				attachIndex = 0;
			}
			return this._rts[attachIndex];
		};
		_proto.resize = function resize(width, height) {
			_Buffer.prototype.resize.call(this, width, height);
			this._rts.forEach(function (rt) {
				return rt.resize(width, height);
			});
			this._mrts.forEach(function (mrt) {
				return mrt.resize(width, height);
			});
		};
		_proto.dispose = function dispose() {
			_Buffer.prototype.dispose.call(this);
			this._rts.forEach(function (rt) {
				return rt.dispose();
			});
			this._mrts.forEach(function (mrt) {
				return mrt.dispose();
			});
		};
		return ColorMarkBuffer;
	}(Buffer);
	function createGetMaterialFunction(func, state) {
		if (func === void 0) {
			func = defaultMaterialReplaceFunction;
		}
		return function (renderable) {
			var material = func(renderable);
			// material.side = renderable.material.side;
			material.side = t3d.DRAW_SIDE.DOUBLE;
			material.uniforms.strength = renderable.object.effects[state.key] || 0;
			return material;
		};
	}
	var materialMap = new Map();

	// TODO dispose
	function defaultMaterialReplaceFunction(renderable) {
		var useSkinning = renderable.object.isSkinnedMesh && renderable.object.skeleton;
		var morphTargets = !!renderable.object.morphTargetInfluences;
		var drawMode = renderable.material.drawMode;
		var useDiffuseMap = !!renderable.material.diffuseMap;
		var key = useSkinning + '_' + morphTargets + '_' + drawMode + '' + useDiffuseMap;
		var result;
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
	var colorShader = {
		name: 'ec_color',
		defines: {},
		uniforms: {
			strength: 1
		},
		vertexShader: "\n				#include <common_vert>\n				#include <morphtarget_pars_vert>\n				#include <skinning_pars_vert>\n				#include <uv_pars_vert>\n\t\t#include <logdepthbuf_pars_vert>\n				void main() {\n				\t#include <uv_vert>\n				\t#include <begin_vert>\n				\t#include <morphtarget_vert>\n				\t#include <skinning_vert>\n				\t#include <pvm_vert>\n\t\t\t#include <logdepthbuf_vert>\n				}\n		",
		fragmentShader: "\n				#include <common_frag>\n				#include <diffuseMap_pars_frag>\n\n				#include <uv_pars_frag>\n\n\t\t#include <logdepthbuf_pars_frag>\n\n\t\tuniform float strength;\n\n				void main() {\n\t\t\t#include <logdepthbuf_frag>\n\n\t\t\tvec4 outColor = vec4(u_Color, u_Opacity);\n\n\t\t\t#ifdef USE_DIFFUSE_MAP\n\t\t\t\toutColor *= texture2D(diffuseMap, v_Uv);\n\t\t\t#endif\n\n\t\t\t#ifdef ALPHATEST\n\t\t\t\tif(outColor.a < ALPHATEST) discard;\n\t\t\t#endif\n\n\t\t\toutColor.a *= strength;\n\n						gl_FragColor = outColor;\n				}\n		"
	};

	var SceneBuffer = /*#__PURE__*/function (_Buffer) {
		_inheritsLoose(SceneBuffer, _Buffer);
		function SceneBuffer(width, height, options) {
			var _this;
			_this = _Buffer.call(this, width, height, options) || this;
			_this._rt = new t3d.RenderTarget2D(width, height);
			_this._rt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			_this._mrt = new t3d.RenderTarget2D(width, height);
			_this._mrt.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
			_this.clearColor = true;
			_this.clearDepth = true;
			_this.clearStencil = true;

			// Allow append custom layer render
			// element type: { id: 0, mask: RenderListMask.ALL, options: {} }
			_this.renderLayers = [{
				id: 0,
				mask: RenderListMask.ALL
			}];
			_this._sceneRenderOptions = {};
			return _this;
		}
		var _proto = SceneBuffer.prototype;
		_proto.syncAttachments = function syncAttachments(colorAttachment, depthAttachment, msColorRenderBuffer, msDepthRenderBuffer) {
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
		};
		_proto.setGeometryReplaceFunction = function setGeometryReplaceFunction(func) {
			if (!!func) {
				this._sceneRenderOptions.getGeometry = func;
			} else {
				delete this._sceneRenderOptions.getGeometry;
			}
		};
		_proto.setOutputEncoding = function setOutputEncoding(encoding) {
			this._rt.texture.encoding = encoding;
		};
		_proto.getOutputEncoding = function getOutputEncoding() {
			return this._rt.texture.encoding;
		};
		_proto.render = function render(renderer, composer, scene, camera) {
			if (!this.needRender()) return;
			var useMSAA = composer.$useMSAA;
			var renderTarget = useMSAA ? this._mrt : this._rt;
			var hasStencil = !!renderTarget._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			renderer.renderPass.setRenderTarget(renderTarget);
			if (composer.clearColor) {
				var _renderer$renderPass;
				(_renderer$renderPass = renderer.renderPass).setClearColor.apply(_renderer$renderPass, composer._tempClearColor);
			} else {
				renderer.renderPass.setClearColor(0, 0, 0, 0);
			}
			renderer.renderPass.clear(this.clearColor, this.clearDepth, this.clearStencil && hasStencil);
			var renderStates = scene.getRenderStates(camera);
			var renderQueue = scene.getRenderQueue(camera);
			this.$renderScene(renderer, renderQueue, renderStates);
			if (useMSAA) {
				renderer.renderPass.setRenderTarget(this._rt);
				renderer.renderPass.blitRenderTarget(this._mrt, this._rt, true, true, hasStencil);
			}

			// generate mipmaps for down sampler
			renderer.renderPass.updateRenderTargetMipmap(this._rt);
		};
		_proto.output = function output() {
			return this._rt;
		};
		_proto.resize = function resize(width, height) {
			_Buffer.prototype.resize.call(this, width, height);
			this._rt.resize(width, height);
			this._mrt.resize(width, height);
		};
		_proto.dispose = function dispose() {
			_Buffer.prototype.dispose.call(this);
			this._rt.dispose();
			this._mrt.dispose();
		};
		_proto.$renderScene = function $renderScene(renderer, renderQueue, renderStates) {
			var sceneRenderOptions = this._sceneRenderOptions;
			var renderLayers = this.renderLayers;
			for (var i = 0, l = renderLayers.length; i < l; i++) {
				var _renderLayers$i = renderLayers[i],
					id = _renderLayers$i.id,
					mask = _renderLayers$i.mask,
					_renderLayers$i$optio = _renderLayers$i.options,
					options = _renderLayers$i$optio === void 0 ? sceneRenderOptions : _renderLayers$i$optio;
				var layer = renderQueue.getLayer(id);
				if (layer) {
					if (layer.opaqueCount > 0 && mask & RenderListMask.OPAQUE) {
						renderer.renderRenderableList(layer.opaque, renderStates, options);
					}
					if (layer.transparentCount > 0 && mask & RenderListMask.TRANSPARENT) {
						renderer.renderRenderableList(layer.transparent, renderStates, options);
					}
				}
			}

			// TODO Overlay layer

			var overlayLayer = renderQueue.getLayer(1);
			if (overlayLayer && overlayLayer.opaqueCount + overlayLayer.transparentCount > 0) {
				renderer.renderPass.clear(false, true, false); // TODO Forcing clear depth may cause bugs

				renderer.renderRenderableList(overlayLayer.opaque, renderStates, sceneRenderOptions);
				renderer.renderRenderableList(overlayLayer.transparent, renderStates, sceneRenderOptions);
			}
		};
		return SceneBuffer;
	}(Buffer);

	var RenderTargetCache = /*#__PURE__*/function () {
		function RenderTargetCache(width, height) {
			this._width = width;
			this._height = height;
			this._map = new Map();
		}
		var _proto = RenderTargetCache.prototype;
		_proto.allocate = function allocate(level) {
			if (level === void 0) {
				level = 0;
			}
			var list = this._map.get(level);
			if (!list) {
				list = [];
				this._map.set(level, list);
			}
			if (list.length > 0) {
				return list.shift();
			} else {
				var divisor = Math.pow(2, level);
				var width = Math.ceil(this._width / divisor);
				var height = Math.ceil(this._height / divisor);
				var renderTarget = new t3d.RenderTarget2D(width, height);
				var texture = renderTarget._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
				texture.minFilter = t3d.TEXTURE_FILTER.LINEAR;
				texture.magFilter = t3d.TEXTURE_FILTER.LINEAR;
				texture.format = t3d.PIXEL_FORMAT.RGBA;
				texture.generateMipmaps = false;
				renderTarget.detach(t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT);
				return renderTarget;
			}
		};
		_proto.release = function release(renderTarget, level) {
			if (level === void 0) {
				level = 0;
			}
			var list = this._map.get(level);
			list.push(renderTarget);
		};
		_proto.resize = function resize(width, height) {
			var _this = this;
			this._width = width;
			this._height = height;
			this._map.forEach(function (list, level) {
				var divisor = Math.pow(2, level);
				var width = Math.ceil(_this._width / divisor);
				var height = Math.ceil(_this._height / divisor);
				list.forEach(function (renderTarget) {
					renderTarget.resize(width, height);
				});
			});
		};
		_proto.updateStats = function updateStats(stats) {
			var count = 0;
			this._map.forEach(function (list, level) {
				var divisor = Math.pow(2, level);
				count += list.length / (divisor * divisor);
			});
			stats.fboCache = count;
		};
		_proto.dispose = function dispose() {
			this._map.forEach(function (list) {
				list.forEach(function (renderTarget) {
					renderTarget.dispose();
				});
			});
			this._map.clear();
		};
		return RenderTargetCache;
	}();

	var EffectComposer = /*#__PURE__*/function () {
		/**
		 * @param {Number} width - The width of the actual rendering size.
		 * @param {Number} height - The height of the actual rendering size.
		 * @param {Object} [options={}]
		 * @param {Boolean} [options.webgl2=false] - Whether to support WebGL2 features. Turning on will improve the storage accuracy of GBuffer.
		 * @param {Boolean} [options.floatColorBuffer=false] - Whether to support the EXT_color_buffer_float feature. Turning on will improve the storage accuracy of GBuffer.
		 * @param {Number} [options.samplerNumber=8] - MSAA sampling multiple.
		 * @param {Number} [options.maxMarkAttachment=5] - Maximum number of mark attachments. Means that it supports up to N*4 effects that need to be marked.
		 * @param {Number} [options.maxColorAttachment=5] - Maximum number of color buffer attachments.
		 */
		function EffectComposer(width, height, options) {
			if (options === void 0) {
				options = {};
			}
			this._size = new t3d.Vector2(width, height);
			options.webgl2 = options.webgl2 || false;
			options.floatColorBuffer = options.floatColorBuffer || false;
			options.samplerNumber = options.samplerNumber || 8;
			options.maxMarkAttachment = options.maxMarkAttachment || 5;
			options.maxColorAttachment = options.maxColorAttachment || 5;

			// Create buffers

			var sceneBuffer = new SceneBuffer(width, height, options);
			var gBuffer = new GBuffer(width, height, options);
			var nonDepthMarkBuffer = new NonDepthMarkBuffer(width, height, options);
			var markBuffer = new MarkBuffer(width, height, options);
			var colorMarkBuffer = new ColorMarkBuffer(width, height, options);
			this._bufferMap = new Map([['SceneBuffer', sceneBuffer], ['GBuffer', gBuffer], ['NonDepthMarkBuffer', nonDepthMarkBuffer], ['MarkBuffer', markBuffer], ['ColorMarkBuffer', colorMarkBuffer]]);

			// Create default attachments.
			// In order to blending with external rendering results, Users may switch the attachments of sceneBuffer and markBuffer through the setExternalAttachment() method.
			// Default ColorTexture and MSColorRenderBuffer are prepared for color attachment of sceneBuffer.
			// Default DepthRenderBuffer and MSDepthRenderBuffer are prepared for depth attachements of sceneBuffer and markBuffer.
			// Noticed that sceneBuffer and markBuffer are sharing the same DepthRenderBuffer MSDepthRenderBuffer.

			this._defaultColorTexture = new t3d.Texture2D();
			this._defaultMSColorRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.RGBA8, options.samplerNumber);
			this._defaultDepthRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH_COMPONENT16);
			this._defaultMSDepthRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH_COMPONENT16, options.samplerNumber);
			this._defaultDepthStencilRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH_STENCIL);
			this._defaultMSDepthStencilRenderBuffer = new t3d.RenderBuffer(width, height, t3d.PIXEL_FORMAT.DEPTH24_STENCIL8, options.samplerNumber);
			this._externalColorAttachment = null;
			this._externalDepthAttachment = null;
			this._samplerNumber = options.samplerNumber;
			this._externalMSAA = null;
			this._stencilBuffer = false;
			this._syncAttachments();

			//

			this._renderTargetCache = new RenderTargetCache(width, height);
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
		var _proto = EffectComposer.prototype;
		_proto.getSize = function getSize() {
			return this._size;
		};
		_proto._syncAttachments = function _syncAttachments() {
			var externalColorAttachment = this._externalColorAttachment;
			var externalDepthAttachment = this._externalDepthAttachment;
			var external = !!externalColorAttachment && !!externalDepthAttachment;
			var externalMSAA = this._externalMSAA;
			var stencilBuffer = this._stencilBuffer;
			if (external) {
				stencilBuffer = isDepthStencilAttachment(externalDepthAttachment);
			}
			var defaultDepthRenderBuffer = stencilBuffer ? this._defaultDepthStencilRenderBuffer : this._defaultDepthRenderBuffer;
			var defaultMSDepthRenderBuffer = stencilBuffer ? this._defaultMSDepthStencilRenderBuffer : this._defaultMSDepthRenderBuffer;
			var sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment, depthAttachment, mDepthAttachment;
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
			this._bufferMap.forEach(function (buffer) {
				if (!!buffer.syncAttachments) {
					buffer.syncAttachments(sceneColorAttachment, sceneDepthAttachment, sceneMColorAttachment, sceneMDepthAttachment);
				} else if (!!buffer.syncDepthAttachments) {
					buffer.syncDepthAttachments(depthAttachment, mDepthAttachment);
				}
			});
		};
		/**
		 * Set external attachments to blending with other rendering results.
		 * If this is set, the setting of sceneMSAA will be invalid, whether to use msaa depends on the external input attachments.
		 * @param {t3d.TextureBase|t3d.RenderBuffer} colorAttachment - The color attachment for scene buffer. Non-multisampled RenderBuffer is not supported for now.
		 * @param {t3d.RenderBuffer} depthAttachment - The depth attachment for scene buffer and mark buffer (They are sharing the same depth attachments).
		 */
		_proto.setExternalAttachment = function setExternalAttachment(colorAttachment, depthAttachment) {
			var colorMultipleSampling = getMultipleSampling(colorAttachment);
			var depthMultipleSampling = getMultipleSampling(depthAttachment);
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
		 */;
		_proto.clearExternalAttachment = function clearExternalAttachment() {
			this._externalColorAttachment = null;
			this._externalDepthAttachment = null;
			this._externalMSAA = null;
			this._syncAttachments();
		};
		_proto.addBuffer = function addBuffer(name, buffer) {
			this._bufferMap.set(name, buffer);
		};
		_proto.removeBuffer = function removeBuffer(name) {
			this._bufferMap.delete(name);
		};
		_proto.getBuffer = function getBuffer(name) {
			return this._bufferMap.get(name);
		};
		_proto.addEffect = function addEffect(name, effect, order) {
			if (order === void 0) {
				order = 0;
			}
			if (this.getEffect(name)) {
				console.warn('');
				return;
			}
			effect.name = name;
			this._effectList.push({
				name: name,
				effect: effect,
				order: order
			});
			effect.resize(this._size.x, this._size.y);
		};
		_proto.removeEffect = function removeEffect(name) {
			var index = this._effectList.findIndex(function (item) {
				return item.name === name;
			});
			if (index > -1) {
				this._effectList.splice(index, 1);
			}
		};
		_proto.getEffect = function getEffect(name) {
			var target = this._effectList.find(function (item) {
				return item.name === name;
			});
			if (target) {
				return target.effect;
			} else {
				return null;
			}
		};
		_proto.render = function render(renderer, scene, camera, target) {
			var _this = this,
				_renderer$renderPass3;
			var renderStates = scene.getRenderStates(camera);
			renderer.renderPass.getClearColor().toArray(this._tempClearColor); // save clear color
			camera.rect.toArray(this._tempViewport);
			camera.rect.set(0, 0, 1, 1);
			renderStates.camera.rect.set(0, 0, 1, 1);
			this._bufferMap.forEach(function (buffer) {
				if (!!buffer.attachManager) {
					buffer.attachManager.reset();
				}
			});
			if (this.debugger) {
				var _renderer$renderPass;
				this.debugger.bufferDependencies.forEach(function (name) {
					var buffer = _this._bufferMap.get(name);
					if (_this.debugger.channel && !!buffer.attachManager) {
						buffer.attachManager.allocate(_this.debugger.channel, _this.debugger.mask);
					}
					buffer.render(renderer, _this, scene, camera);
				});
				this.debugger.render(renderer, this, target);
				(_renderer$renderPass = renderer.renderPass).setClearColor.apply(_renderer$renderPass, this._tempClearColor); // restore clear color

				return;
			}
			this._effectList.sort(sortByReverseOrder);
			var lastActiveIndex = this._effectList.findIndex(function (item) {
				return item.effect.active;
			});
			var postEffectEnable = lastActiveIndex > -1;
			this._tempBufferNames.clear();
			if (postEffectEnable) {
				this._tempBufferNames.add('SceneBuffer'); // Insert SceneBuffer first

				this._effectList.forEach(function (item) {
					if (item.effect.active) {
						item.effect.bufferDependencies.forEach(function (_ref) {
							var key = _ref.key,
								mask = _ref.mask;
							_this._tempBufferNames.add(key);
							if (!!_this._bufferMap.get(key).attachManager) {
								_this._bufferMap.get(key).attachManager.allocate(item.name, mask);
							}
						});
					}
				});
				this._tempBufferNames.forEach(function (name) {
					_this._bufferMap.get(name).render(renderer, _this, scene, camera);
				});
				var inputRT = this._renderTargetCache.allocate();
				var outputRT = this._renderTargetCache.allocate();
				var tempRT;
				this._effectList.sort(sortByOrder);
				var len = this._effectList.length;
				var firstActiveIndex = this._effectList.findIndex(function (item) {
					return item.effect.active;
				});
				lastActiveIndex = len - 1 - lastActiveIndex;
				this._effectList.forEach(function (item, index) {
					if (!item.effect.active) return;
					var notLast = index < lastActiveIndex;
					item.effect.render(renderer, _this, index === firstActiveIndex ? _this._bufferMap.get('SceneBuffer').output() : inputRT, notLast ? outputRT : target, !notLast);

					// swap render target
					tempRT = inputRT;
					inputRT = outputRT;
					outputRT = tempRT;
				});
				this._renderTargetCache.release(inputRT);
				this._renderTargetCache.release(outputRT);
			} else {
				var _renderer$renderPass2;
				renderer.renderPass.setRenderTarget(target);
				(_renderer$renderPass2 = renderer.renderPass).setClearColor.apply(_renderer$renderPass2, this._tempClearColor);
				renderer.renderPass.clear(this.clearColor, this.clearDepth, this.clearStencil);
				renderStates.camera.rect.fromArray(this._tempViewport);
				var renderQueue = scene.getRenderQueue(camera);
				var sceneBuffer = this._bufferMap.get('SceneBuffer');
				sceneBuffer.$renderScene(renderer, renderQueue, renderStates);
			}
			(_renderer$renderPass3 = renderer.renderPass).setClearColor.apply(_renderer$renderPass3, this._tempClearColor); // restore clear color
			camera.rect.fromArray(this._tempViewport);
			renderStates.camera.rect.fromArray(this._tempViewport);
		};
		_proto.getStats = function getStats() {
			this._renderTargetCache.updateStats(this._stats);
			var count1 = this.getBuffer('MarkBuffer').attachManager.attachCount();
			var count2 = this.getBuffer('NonDepthMarkBuffer').attachManager.attachCount();
			var count3 = this.getBuffer('ColorMarkBuffer').attachManager.attachCount();
			this._stats.markBuffers = count1 + count2;
			this._stats.colorMarkBuffers = count3;
			for (var _iterator = _createForOfIteratorHelperLoose(this._bufferMap), _step; !(_step = _iterator()).done;) {
				var _step$value = _step.value,
					key = _step$value[0],
					value = _step$value[1];
				if (value.attachManager) {
					continue;
				}
				this._stats.currentBufferUsage[key] = this._tempBufferNames.has(key) ? 1 : 0;
			}
			return this._stats;
		};
		_proto.resize = function resize(width, height) {
			this._size.set(width, height);
			this._bufferMap.forEach(function (buffer) {
				return buffer.resize(width, height);
			});
			this._renderTargetCache.resize(width, height);
			this._effectList.forEach(function (item) {
				return item.effect.resize(width, height);
			});
		};
		_proto.dispose = function dispose() {
			this._bufferMap.forEach(function (buffer) {
				return buffer.dispose();
			});
			this._renderTargetCache.dispose();
			this._effectList.forEach(function (item) {
				return item.effect.dispose();
			});
		}

		// Protected methods
		;
		_createClass(EffectComposer, [{
			key: "stencilBuffer",
			get: function get() {
				return this._stencilBuffer;
			},
			set: function set(value) {
				this._stencilBuffer = value;
				this._syncAttachments();
			}
		}, {
			key: "$useMSAA",
			get: function get() {
				return (this._externalMSAA !== null ? this._externalMSAA : this.sceneMSAA) && this._samplerNumber > 1;
			}
		}]);
		return EffectComposer;
	}();
	function sortByOrder(a, b) {
		return a.order - b.order;
	}
	function sortByReverseOrder(a, b) {
		return b.order - a.order;
	}
	function getMultipleSampling(attachment) {
		return attachment.isTexture ? 0 : attachment.multipleSampling;
	}

	var DefaultEffectComposer = /*#__PURE__*/function (_EffectComposer) {
		_inheritsLoose(DefaultEffectComposer, _EffectComposer);
		function DefaultEffectComposer(width, height, options) {
			var _this;
			_this = _EffectComposer.call(this, width, height, options) || this;
			_this.addEffect('SSAO', new SSAOEffect(), 0);
			_this.addEffect('SSR', new SSREffect(), 1);
			_this.addEffect('ColorCorrection', new ColorCorrectionEffect(), 2);
			_this.addEffect('DOF', new DOFEffect(), 3);
			_this.addEffect('Bloom', new BloomEffect(), 4);
			_this.addEffect('InnerGlow', new InnerGlowEffect(), 10);
			_this.addEffect('Glow', new GlowEffect(), 11);
			_this.addEffect('SoftGlow', new SoftGlowEffect(), 12);
			_this.addEffect('Tailing', new TailingEffect(), 13);
			_this.addEffect('RadialTailing', new RadialTailingEffect(), 14);
			_this.addEffect('Ghosting', new GhostingEffect(), 15);

			// Insert outline effects here.

			_this.addEffect('FXAA', new FXAAEffect(), 101);
			_this.addEffect('ChromaticAberration', new ChromaticAberrationEffect(), 102);
			_this.addEffect('Vignetting', new VignettingEffect(), 103);
			_this.addEffect('BlurEdge', new BlurEdgeEffect(), 104);
			_this.addEffect('Film', new FilmEffect(), 105);
			_this._effectList.forEach(function (item) {
				return item.effect.active = false;
			}); // auto close
			return _this;
		}
		return DefaultEffectComposer;
	}(EffectComposer);

	var Debugger = /*#__PURE__*/function () {
		function Debugger() {
			this.bufferDependencies = [];
		}
		var _proto = Debugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			console.error('Debugger: .render() must be implemented in subclass.');
		};
		_proto.resize = function resize(width, height) {};
		_proto.dispose = function dispose() {};
		return Debugger;
	}();

	var ColorMarkBufferDebugger = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(ColorMarkBufferDebugger, _Debugger);
		function ColorMarkBufferDebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['SceneBuffer', 'ColorMarkBuffer'];
			_this._mainPass = new t3d.ShaderPostPass(copyShader);
			_this.channel = '';
			_this.mask = RenderListMask.ALL;
			return _this;
		}
		var _proto = ColorMarkBufferDebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 1);
			renderer.renderPass.clear(true, true, false);
			var buffer = composer.getBuffer('ColorMarkBuffer');
			var attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._mainPass.render(renderer);
		};
		return ColorMarkBufferDebugger;
	}(Debugger);

	var GBufferDebugger = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(GBufferDebugger, _Debugger);
		function GBufferDebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['GBuffer'];
			_this._mainPass = new t3d.ShaderPostPass(shader);
			_this.debugType = DebugTypes.Normal;
			return _this;
		}
		var _proto = GBufferDebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 1);
			renderer.renderPass.clear(true, true, false);
			var gBuffer = composer.getBuffer('GBuffer');
			var gBufferRenderStates = gBuffer.getCurrentRenderStates();
			this._mainPass.uniforms['normalGlossinessTexture'] = gBuffer.output()._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			this._mainPass.uniforms['depthTexture'] = gBuffer.output()._attachments[t3d.ATTACHMENT.DEPTH_STENCIL_ATTACHMENT];
			this._mainPass.uniforms['debug'] = this.debugType || 0;
			gBufferRenderStates.camera.projectionViewMatrix.toArray(this._mainPass.uniforms['projectionView']);
			this._mainPass.render(renderer);
		};
		return GBufferDebugger;
	}(Debugger);
	var DebugTypes = {
		Normal: 0,
		Depth: 1,
		Position: 2,
		Glossiness: 3
	};
	GBufferDebugger.DebugTypes = DebugTypes;
	var shader = {
		name: 'ec_debug_gbuffer',
		defines: {},
		uniforms: {
			normalGlossinessTexture: null,
			depthTexture: null,
			projectionView: new Float32Array(16),
			// DEBUG
			// - 0: normal
			// - 1: depth
			// - 2: position
			// - 3: glossiness
			debug: 0
		},
		vertexShader: defaultVertexShader,
		fragmentShader: "\n\t\tuniform sampler2D normalGlossinessTexture;\n\t\tuniform sampler2D depthTexture;\n\t\tuniform int debug;\n\n\t\tuniform mat4 projectionView;\n\n\t\tvarying vec2 v_Uv;\n\n\t\tvoid main() {\n\t\t\tvec2 texCoord = v_Uv;\n\t\t\tvec4 texel = texture2D(normalGlossinessTexture, texCoord);\n\n\t\t\tif (dot(texel.rgb, vec3(1.0)) == 0.0) {\n\t\t\t\tdiscard;\n\t\t\t}\n\n\t\t\tfloat depth = texture2D(depthTexture, texCoord).r;\n\n\t\t\tvec2 xy = texCoord * 2.0 - 1.0;\n\t\t\tfloat z = depth * 2.0 - 1.0;\n\n\t\t\tvec4 projectedPos = vec4(xy, z, 1.0);\n\t\t\tvec4 p4 = inverse(projectionView) * projectedPos;\n\n\t\t\tvec3 position = p4.xyz / p4.w;\n\n\t\t\tif (debug == 0) {\n\t\t\t\tgl_FragColor = vec4(texel.rgb, 1.0);\n\t\t\t} else if (debug == 1) {\n\t\t\t\tgl_FragColor = vec4(vec3(depth), 1.0);\n\t\t\t} else if (debug == 2) {\n\t\t\t\tgl_FragColor = vec4(position, 1.0);\n\t\t\t} else {\n\t\t\t\tgl_FragColor = vec4(vec3(texel.a), 1.0);\n\t\t\t}\n\t\t}\n\t"
	};

	var MarkBufferDebugger = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(MarkBufferDebugger, _Debugger);
		function MarkBufferDebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['SceneBuffer', 'MarkBuffer'];
			_this._mainPass = new t3d.ShaderPostPass(channelShader);
			_this.channel = '';
			_this.mask = RenderListMask.ALL;
			return _this;
		}
		var _proto = MarkBufferDebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 1);
			renderer.renderPass.clear(true, true, false);
			var buffer = composer.getBuffer('MarkBuffer');
			var attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			var channelIndex = buffer.attachManager.getChannelIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (var i = 0; i < 4; i++) {
				this._mainPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._mainPass.render(renderer);
		};
		return MarkBufferDebugger;
	}(Debugger);

	var NonDepthMarkBufferDebugger = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(NonDepthMarkBufferDebugger, _Debugger);
		function NonDepthMarkBufferDebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['NonDepthMarkBuffer'];
			_this._mainPass = new t3d.ShaderPostPass(channelShader);
			_this.channel = '';
			_this.mask = RenderListMask.ALL;
			return _this;
		}
		var _proto = NonDepthMarkBufferDebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			renderer.renderPass.setRenderTarget(outputRenderTarget);
			renderer.renderPass.setClearColor(0, 0, 0, 1);
			renderer.renderPass.clear(true, true, false);
			var buffer = composer.getBuffer('NonDepthMarkBuffer');
			var attachIndex = buffer.attachManager.getAttachIndex(this.channel);
			var channelIndex = buffer.attachManager.getChannelIndex(this.channel);
			this._mainPass.uniforms['tDiffuse'] = buffer.output(attachIndex)._attachments[t3d.ATTACHMENT.COLOR_ATTACHMENT0];
			for (var i = 0; i < 4; i++) {
				this._mainPass.uniforms.channelMask[i] = i === channelIndex ? 1 : 0;
			}
			this._mainPass.render(renderer);
		};
		return NonDepthMarkBufferDebugger;
	}(Debugger);

	var SSAODebugger$1 = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(SSAODebugger, _Debugger);
		function SSAODebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['GBuffer'];
			_this.defaultEffect = new SSAOEffect();
			return _this;
		}
		var _proto = SSAODebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			var ssaoEffect = composer.getEffect('SSAO') || this.defaultEffect;
			ssaoEffect.render(renderer, composer, null, outputRenderTarget);
		};
		_proto.resize = function resize(width, height) {
			this.defaultEffect.resize(width, height);
		};
		_proto.dispose = function dispose() {
			this.defaultEffect.dispose();
		};
		return SSAODebugger;
	}(Debugger);

	var SSAODebugger = /*#__PURE__*/function (_Debugger) {
		_inheritsLoose(SSAODebugger, _Debugger);
		function SSAODebugger() {
			var _this;
			_this = _Debugger.call(this) || this;
			_this.bufferDependencies = ['SceneBuffer', 'GBuffer'];
			_this.defaultEffect = new SSREffect();
			return _this;
		}
		var _proto = SSAODebugger.prototype;
		_proto.render = function render(renderer, composer, outputRenderTarget) {
			var ssrEffect = composer.getEffect('SSR') || this.defaultEffect;
			ssrEffect.render(renderer, composer, null, outputRenderTarget);
		};
		_proto.resize = function resize(width, height) {
			this.defaultEffect.resize(width, height);
		};
		_proto.dispose = function dispose() {
			this.defaultEffect.dispose();
		};
		return SSAODebugger;
	}(Debugger);

	var RenderLayer = {
		Background: 2,
		Main: 0,
		Overlay: 1
	};
	EffectComposer.prototype.setGeometryReplaceFunction = function (func) {
		console.warn('EffectComposer.setGeometryReplaceFunction has been removed, use SceneBuffer.setGeometryReplaceFunction instead.');
		var sceneBuffer = this._bufferMap.get('SceneBuffer');
		sceneBuffer.setGeometryReplaceFunction(func);
	};
	Object.defineProperties(EffectComposer.prototype, {
		customRenderLayers: {
			set: function set(value) {
				console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
			},
			get: function get() {
				console.error('EffectComposer.customRenderLayers has been removed, use SceneBuffer.renderLayers instead.');
			}
		}
	});

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
	exports.InnerGlowEffect = InnerGlowEffect;
	exports.MarkBufferDebugger = MarkBufferDebugger;
	exports.NonDepthMarkBufferDebugger = NonDepthMarkBufferDebugger;
	exports.OutlineEffect = OutlineEffect;
	exports.RadialTailingEffect = RadialTailingEffect;
	exports.RenderLayer = RenderLayer;
	exports.RenderListMask = RenderListMask;
	exports.SSAODebugger = SSAODebugger$1;
	exports.SSAOEffect = SSAOEffect;
	exports.SSRDebugger = SSAODebugger;
	exports.SSREffect = SSREffect;
	exports.SoftGlowEffect = SoftGlowEffect;
	exports.TailingEffect = TailingEffect;
	exports.VignettingEffect = VignettingEffect;
	exports.additiveShader = additiveShader;
	exports.blurShader = blurShader;
	exports.channelShader = channelShader;
	exports.copyShader = copyShader;
	exports.defaultVertexShader = defaultVertexShader;
	exports.highlightShader = highlightShader;
	exports.horizontalBlurShader = horizontalBlurShader;
	exports.isDepthStencilAttachment = isDepthStencilAttachment;
	exports.maskShader = maskShader;
	exports.multiplyShader = multiplyShader;
	exports.seperableBlurShader = seperableBlurShader;
	exports.verticalBlurShader = verticalBlurShader;

	Object.defineProperty(exports, '__esModule', { value: true });

}));
