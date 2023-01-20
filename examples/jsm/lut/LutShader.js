/**
 * LUT Shader
 */

export const LUTShader = {
	name: 'ec_lut',

	defines: {
		USE_3DTEXTURE: 1
	},

	uniforms: {
		lut3d: null,
		lut: null,
		lutSize: 0,
		tDiffuse: null,
		intensity: 1.0
	},

	vertexShader: `
		attribute vec3 a_Position;
		attribute vec2 a_Uv;

		uniform mat4 u_ProjectionView;
		uniform mat4 u_Model;

		varying vec2 vUv;

		void main() {
			vUv = a_Uv;
			gl_Position = u_ProjectionView * u_Model * vec4( a_Position, 1.0 );
		}
    `,
	fragmentShader: `
        uniform float lutSize;

		#if USE_3DTEXTURE
			precision highp sampler3D;
			uniform sampler3D lut3d;
		#else
			uniform sampler2D lut;

			vec3 lutLookup(sampler2D tex, float size, vec3 rgb) {
				float sliceHeight = 1.0 / size;
				float yPixelHeight = 1.0 / ( size * size );

				// Get the slices on either side of the sample
				float slice = rgb.b * size;
				float interp = fract( slice );
				float slice0 = slice - interp;
				float centeredInterp = interp - 0.5;

				float slice1 = slice0 + sign( centeredInterp );

				// Pull y sample in by half a pixel in each direction to avoid color
				// bleeding from adjacent slices.
				float greenOffset = clamp( rgb.g * sliceHeight, yPixelHeight * 0.5, sliceHeight - yPixelHeight * 0.5 );

				vec2 uv0 = vec2(
					rgb.r,
					slice0 * sliceHeight + greenOffset
				);
				vec2 uv1 = vec2(
					rgb.r,
					slice1 * sliceHeight + greenOffset
				);

				vec3 sample0 = texture2D( tex, uv0 ).rgb;
				vec3 sample1 = texture2D( tex, uv1 ).rgb;

				return mix( sample0, sample1, abs( centeredInterp ) );
			}
		#endif

		uniform float intensity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {
			vec4 val = texture2D(tDiffuse, vUv);
			vec4 lutVal;

			// pull the sample in by half a pixel so the sample begins
			// at the center of the edge pixels.
			float pixelWidth = 1.0 / lutSize;
			float halfPixelWidth = 0.5 / lutSize;
			vec3 uvw = vec3(halfPixelWidth) + val.rgb * (1.0 - pixelWidth);

			#if USE_3DTEXTURE
				lutVal = vec4(texture(lut3d, uvw).rgb, val.a);
			#else
				lutVal = vec4(lutLookup(lut, lutSize, uvw), val.a);
			#endif

			gl_FragColor = vec4(mix(val, lutVal, intensity));
		}
    `
};