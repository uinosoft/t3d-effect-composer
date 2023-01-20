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

export function isDepthStencilAttachment(attachment) {
	return attachment.format === PIXEL_FORMAT.DEPTH_STENCIL
		|| attachment.format === PIXEL_FORMAT.DEPTH24_STENCIL8;
}

export const RenderListMask = {
	OPAQUE: 1, // 0001
	TRANSPARENT: 2, // 0010
	ALL: 15 // 1111
};