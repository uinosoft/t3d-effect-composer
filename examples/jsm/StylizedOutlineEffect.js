import { ShaderPostPass, ATTACHMENT, Color3 } from 't3d';
import { Effect, defaultVertexShader, channelShader } from 't3d-effect-composer';

// Stylized Outline Effect which uses Jump Flood Algorithm.
// reference to: https://github.com/gkjohnson/three-jumpflood-demo
export class StylizedOutlineEffect extends Effect {

	constructor() {
		super();

		this.bufferDependencies = [
			{ key: 'NonDepthMarkBuffer' }
		];

		this.thickness = 10;
		this.mode = 2;
		this.inside = false;
		this.color = new Color3(1, 1, 1);

		this.channelPass = new ShaderPostPass(channelShader);
		this.areaMaskPass = new ShaderPostPass(areaMaskShader);
		this.jumpfloodPass = new ShaderPostPass(jumpfloodShader);
		this.resultPass = new ShaderPostPass(mixShader);
	}

	render(renderer, composer, inputRenderTarget, outputRenderTarget, finish) {
		const _rt1 = composer._renderTargetCache.allocate(0);
		const _rt2 = composer._renderTargetCache.allocate(0);
		const _rt3 = composer._renderTargetCache.allocate(4);
		const _rt4 = composer._renderTargetCache.allocate(4);

		const markBuffer = composer.getBuffer('NonDepthMarkBuffer');
		const attachIndex = markBuffer.attachManager.getAttachIndex(this.name);
		const channelIndex = markBuffer.attachManager.getChannelIndex(this.name);

		// Step 1: Extract the mark buffer to _rt1

		this.channelPass.uniforms.tDiffuse = markBuffer.output(attachIndex)._attachments[ATTACHMENT.COLOR_ATTACHMENT0];
		for (let i = 0; i < 4; i++) {
			this.channelPass.uniforms.channelMask[i] = (i === channelIndex) ? 1 : 0;
		}
		_rt1.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
		this.channelPass.render(renderer, _rt1);

		// Step 2: Generate the valid area mask to _rt4

		for (let i = 0; i < 4; i++) {
			const source = (i === 0)
				? _rt1.texture
				: (i & 1 ? _rt3.texture : _rt4.texture);
			const target = (i % 2 === 0 ? _rt3 : _rt4);
			this.areaMaskPass.uniforms.source = source;
			target.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this.areaMaskPass.render(renderer, target);
		}

		// Step 3: Jump Flood Algorithm

		this.jumpfloodPass.uniforms.mask = _rt4.texture;
		let step = Math.min(Math.max(_rt1.width, _rt1.height), this.thickness);
		let i = 0;
		while (true) {
			const source = i % 2 === 0 ? _rt1.texture : _rt2.texture;
			const target = i % 2 === 0 ? _rt2 : _rt1;

			this.jumpfloodPass.uniforms.step = step;
			this.jumpfloodPass.uniforms.isFirstStep = (i === 0) ? 1.0 : 0.0;
			this.jumpfloodPass.uniforms.source = source;

			target.setColorClearValue(0, 0, 0, 0).setClear(true, true, false);
			this.jumpfloodPass.render(renderer, target);

			if (step <= 1) {
				break;
			}

			step = Math.ceil(step * 0.5);
			i++;
		}

		// Step 4: Render the result

		composer.$setEffectContextStates(outputRenderTarget, this.resultPass, finish);

		this.resultPass.uniforms.mask = _rt4.texture;
		this.resultPass.uniforms.map = i % 2 === 1 ? _rt1.texture : _rt2.texture;
		this.resultPass.uniforms.diffuseMap = inputRenderTarget.texture;

		this.resultPass.uniforms.mode = this.mode;
		this.resultPass.uniforms.thickness = this.thickness;
		this.resultPass.uniforms.time += 10;
		this.color.toArray(this.resultPass.uniforms.color);
		this.resultPass.uniforms.inside = this.inside ? -1.0 : 1.0;

		this.resultPass.render(renderer, outputRenderTarget);

		composer._renderTargetCache.release(_rt1, 0);
		composer._renderTargetCache.release(_rt2, 0);
		composer._renderTargetCache.release(_rt3, 4);
		composer._renderTargetCache.release(_rt4, 4);
	}

	dispose() {
		this.channelPass.dispose();
		this.areaMaskPass.dispose();
		this.jumpfloodPass.dispose();
		this.resultPass.dispose();
	}

}

const areaMaskShader = {
	name: 'ec_sol_areamask',
	uniforms: {
		source: null
	},
	vertexShader: defaultVertexShader,
	fragmentShader: /* glsl */`
		varying vec2 v_Uv;

		uniform sampler2D source;

		float fwidth2(float v) {
			float vdy = dFdy(v);
			float vdx = dFdx(v);
			return length(vec2(vdy, vdx));
		}

		void main() {
			ivec2 currCoord = ivec2(v_Uv * vec2(textureSize(source, 0)));
			for (int x = -1; x <= 1; x ++) {
				for (int y = -1; y <= 1; y ++) {
					if (x == 0 && y == 0) {
						continue;
					}
					ivec2 coord = currCoord + ivec2(x, y);
					float otherValue = texelFetch(source, coord, 0).r;
					if (otherValue != 0.0) {
						gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
						return;
					}
				}
			}
			gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
		}
	`
};

const jumpfloodLoop = new Array(9).fill().map((e, i) => {
	const x = i % 3 - 1;
	const y = Math.floor(i / 3) - 1;

	if (x == 0 && y === 0) {
		return '';
	}

	return /* glsl */`
		otherCoord = currCoord + ivec2(${x}, ${y}) * step;
		if (
			otherCoord.x < size.x && otherCoord.x >= 0 &&
			otherCoord.y < size.y && otherCoord.y >= 0
		) {
			otherVal = texelFetch(source, otherCoord, 0);

			bool otherValid = (otherVal.r != 0.0) || (otherVal.g != 0.0) || (otherVal.b != 0.0) || (otherVal.a != 0.0);
			if (otherValid) {
				vec2 neighborOffset;
				float neighborSign;

				if(isFirstStep > 0.5) {
					neighborSign = otherVal.r > 0.5 ? 0.0 : 1.0;
					neighborOffset = vec2(MAX_OFFSET);
				} else {
					neighborSign = otherVal.a > 0.5 ? 1.0 : 0.0;
					neighborOffset = unpackOffset(otherVal.rgb);
				}

				vec2 offsetToNeighbor = vec2(ivec2(${x}, ${y}) * step);

				if (mySign != neighborSign) {
					float distSq = dot(offsetToNeighbor, offsetToNeighbor);
					if (distSq < bestDistSq) {
						bestDistSq = distSq;
						bestOffset = offsetToNeighbor;
					}
				} else {
					vec2 candidate = offsetToNeighbor + neighborOffset;
					float distSq = dot(candidate, candidate);
					if (distSq < bestDistSq) {
						bestDistSq = distSq;
						bestOffset = candidate;
					}
				}
			}
		}
	`;
}).join('');

const jumpfloodShader = {
	name: 'ec_sol_jumpflood',
	uniforms: {
		source: null,
		mask: null,
		step: 0.0,
		isFirstStep: 0.0
	},
	vertexShader: defaultVertexShader,
	fragmentShader: /* glsl */`
		varying vec2 v_Uv;

		uniform sampler2D source;
		uniform sampler2D mask;
		uniform int step;
		uniform float isFirstStep;

		const float MAX_OFFSET = 2048.0;

		vec3 packOffset(vec2 offset) {
			float x = clamp(offset.x + MAX_OFFSET, 0.0, 4095.0);
			float y = clamp(offset.y + MAX_OFFSET, 0.0, 4095.0);

			float r = floor(x / 16.0);
			float remX = x - r * 16.0;
			float gHigh = remX * 16.0;

			float yHigh = floor(y / 256.0);
			float remY = y - yHigh * 256.0;
			float gLow = yHigh;

			float g = gHigh + gLow;
			float b = remY;

			return vec3(r, g, b) / 255.0;
		}

		vec2 unpackOffset(vec3 color) {
			vec3 c = color * 255.0;
			float r = round(c.r);
			float g = round(c.g);
			float b = round(c.b);

			float xLow = floor(g / 16.0);
			float yHigh = g - xLow * 16.0;

			float x = r * 16.0 + xLow;
			float y = yHigh * 256.0 + b;

			return vec2(x - MAX_OFFSET, y - MAX_OFFSET);
		}

		void main() {
			ivec2 size = textureSize(source, 0);
			ivec2 currCoord = ivec2(gl_FragCoord.xy);
			vec4 sourceVal = texelFetch(source, currCoord, 0);
			
			float mySign;
			vec2 bestOffset;

			if (texture(mask, v_Uv).r < 0.5) {
				gl_FragColor = sourceVal;
				discard;
			}

			if (isFirstStep > 0.5) {
				mySign = sourceVal.r > 0.5 ? 0.0 : 1.0;
				bestOffset = vec2(MAX_OFFSET);
			} else {
				mySign = sourceVal.a > 0.5 ? 1.0 : 0.0;
				bestOffset = unpackOffset(sourceVal.rgb);
			}

			float bestDistSq = dot(bestOffset, bestOffset);

			ivec2 otherCoord;
			vec4 otherVal;
			
			${jumpfloodLoop}

			gl_FragColor = vec4(packOffset(bestOffset), mySign > 0.5 ? 1.0 : 0.0);
		}
	`
};

const mixShader = {
	name: 'ec_sol_mix',
	uniforms: {
		map: null,
		diffuseMap: null,
		mask: null,
		inside: 1.0,
		thickness: 30.0,
		color: [1, 0, 0],
		time: 0,
		mode: 1 // 0: coordinate, 1: sdf, 2: outline, 3: glow, 4: pulse, 5: halftone, 6: rings
	},
	vertexShader: defaultVertexShader,
	fragmentShader: /* glsl */`
		varying vec2 v_Uv;

		uniform sampler2D map;
		uniform sampler2D diffuseMap;
		uniform sampler2D mask;

		uniform float inside;
		uniform float thickness;
		uniform float time;

		uniform vec3 color;
		uniform int mode;

		const float MAX_OFFSET = 2048.0;

		vec2 unpackOffset(vec3 color) {
			vec3 c = color * 255.0;
			float r = round(c.r);
			float g = round(c.g);
			float b = round(c.b);

			float xLow = floor(g / 16.0);
			float yHigh = g - xLow * 16.0;

			float x = r * 16.0 + xLow;
			float y = yHigh * 256.0 + b;

			return vec2(x - MAX_OFFSET, y - MAX_OFFSET);
		}

		float fwidth2(float v) {
			float vdy = dFdy(v);
			float vdx = dFdx(v);
			return length(vec2(vdy, vdx));
		}

		void main() {
		   	vec2 size = vec2(textureSize(map, 0));
			ivec2 currCoord = ivec2(v_Uv * size);
			vec4 s = texelFetch(map, currCoord, 0);
			
			vec2 offset = unpackOffset(s.rgb);
			float distVal = length(offset);
			if (s.a <= 0.5) {
				distVal = -distVal;
			}

			vec4 diffuse = texelFetch(diffuseMap, currCoord, 0);
			vec4 color1 = vec4(color, 1.0);

			if (texture(mask, v_Uv).r < 0.5) {
				gl_FragColor = diffuse;
				return;
            }

			
			if (mode == 0) { // coordinate(debug)
				color1 = vec4(gl_FragCoord.xy / size, distVal, 1);
			} else if (mode == 1) { // sdf(debug)
				float dist = abs(distVal) / thickness;
				color1 = vec4(dist, dist, dist, 1);
			} else if (mode == 2) { // outline
				float dist = distVal * float(inside);

				// NOTE: for some reason this fwidth call is breaking on Android
				// float w = clamp( fwidth2( dist ), - 1.0, 1.0 ) * 0.5;
				float w = 0.5;

				float val =
					smoothstep(thickness + w, thickness - w, dist) *
					smoothstep(-w - 1.0, w - 1.0, dist);                        

				color1.rgb = vec3(color);
				color1.a = clamp(val, 0.0, 1.0);
			} else if (mode == 3) { // glow
				float dist = distVal * float(inside);

				// NOTE: for some reason this fwidth call is breaking on Android
				// float w = clamp( fwidth2( dist ), - 1.0, 1.0 ) * 0.5;
				float w = 0.5;

				color1.rgb = color;
				color1.a = (1.0 - dist / thickness) * smoothstep(-w - 1.0, w - 1.0, dist);
			} else if (mode == 4) { // pulse
				float dist = distVal * float(inside);
				float w = clamp(fwidth2(dist), -1.0, 1.0) * 0.5;
				float clip =
					smoothstep(thickness + w, thickness - w, dist) *
					smoothstep(-w - 1.0, w - 1.0, dist);

				float norm = dist / thickness;
				float fade = 1.0 - pow(norm, 2.0);
				float pulse = sin(time * -0.01 + 20.0 * pow(norm + 0.2, 4.0));

				color1.rgb = mix(vec3(color), diffuse.rgb, 0.5 * pow(1.0 - norm, 4.0));
				color1.a = clip * fade * smoothstep(0.0, fwidth2(pulse), pulse);
			} else if (mode == 5) { // halftone
				float dotRadius = 13.0 * min(thickness, 40.) * 0.02;
				float dotWidth = dotRadius * 2.0;
				vec2 closestDot = floor(vec2(currCoord) / dotWidth) * dotWidth + vec2(dotRadius);
				float alpha = 0.0;
				for (int x = -1; x <= 1; x++) {
					for (int y = -1; y <= 1; y++) {
						vec2 offset = vec2(x, y) * dotWidth;
						vec2 dotCoord = closestDot + offset;
						vec4 dotSample = texelFetch(map, ivec2(dotCoord), 0);
						vec2 dotOffset = unpackOffset(dotSample.rgb);
						float dotStrength = length(dotOffset);
						if (dotSample.a <= 0.0 && inside == -1.) {
							dotStrength = -dotStrength;
						}
						dotStrength *= float(inside);
						if (dotStrength != 0.0) {
							dotStrength += dotRadius * 1.3;
							dotStrength /= 1.5;
							float strength = clamp(1.0 - dotStrength / thickness, 0.0, 1.0);
							strength = 1.0 - pow(1.0 - strength, 0.75);
							float distToDot = length(vec2(currCoord) - dotCoord);
							float newAlpha = smoothstep(strength * dotWidth, strength * dotWidth - 1.0, distToDot);
							alpha = max(alpha, newAlpha);

						}
					}
				}
				float w = 0.5;
				color1.rgb = color;
				color1.a = alpha * smoothstep(-w - 1.0, w - 1.0, distVal * float(inside));
			} else if (mode == 6) {
				float dist = distVal * float(inside);
				float value = clamp(1.0 - dist / thickness, 0.0, 1.0);
				float stride = 15.0;
				
				// NOTE: for some reason this fwidth call is breaking on Android
				float w = 0.5;
				color1.rgb = color;
				color1.a = smoothstep(0.2 + w / thickness, 0.2 - w / thickness, mod((1.0 - value) * thickness / stride, 1.0)) *
				smoothstep(-w - 1.0, w - 1.0, dist) *
				smoothstep(stride * floor(thickness / stride) + w, stride * floor(thickness / stride) - w, dist + 1.0);
			}

			color1.a = clamp(color1.a, 0.0, 1.0);

			vec4 result = vec4(
				color1.rgb * color1.a + diffuse.rgb * (1. - color1.a),
				color1.a + diffuse.a * (1. - color1.a)
			);

			gl_FragColor = result;
		}
	`
};