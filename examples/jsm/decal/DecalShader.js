export const DecalShader = {
	name: 'decal',
	defines: {
		SPHERE_SPACE: false,
		FISHEYE: false,
		BARREL_CORRECTION: false,
		OCCLUSION: true,
		OCCLUSION_PACKING: true
	},
	uniforms: {
		decalPMatrix: new Array(16),
		decalVMatrix: new Array(16),
		barrelF: [0, 0],
		barrelS: 1,
		occlusionTexture: null,
		occlusionBias: -0.0004
	},
	vertexShader: `
        attribute vec3 a_Position;

        uniform mat4 decalPMatrix;
        uniform mat4 decalVMatrix;

        uniform mat4 u_Model;
        uniform mat4 u_ProjectionView;

        varying vec4 vDecalProjectPosition;

        #ifdef SPHERE_SPACE
            varying vec3 vDecalVPosition;
            varying vec2 vSphereChecker;
        #endif

        #include <logdepthbuf_pars_vert>

        void main() {
            vec4 worldPosition = u_Model * vec4(a_Position, 1.0);
            gl_Position = u_ProjectionView * worldPosition;

            vec4 decalVPosition = decalVMatrix * worldPosition;
            vDecalProjectPosition = decalPMatrix * decalVPosition;

            #ifdef SPHERE_SPACE
                vDecalVPosition = decalVPosition.xyz;
                vSphereChecker.x = decalPMatrix[3][2] / (decalPMatrix[2][2] - 1.0);
                vSphereChecker.y = decalPMatrix[3][2] / (decalPMatrix[2][2] + 1.0);
            #endif

            #include <logdepthbuf_vert>
        }
    `,
	fragmentShader: `
        uniform vec3 u_Color;
        uniform float u_Opacity;

        #ifdef USE_DIFFUSE_MAP
            uniform sampler2D diffuseMap;
        #endif

        varying vec4 vDecalProjectPosition;

        #ifdef SPHERE_SPACE
            varying vec3 vDecalVPosition;
            varying vec2 vSphereChecker;
        #endif

        #ifdef BARREL_CORRECTION
            uniform vec2 barrelF;
            uniform float barrelS;

            // github.com/jywarren/fisheyegl
            vec2 barrelCorrection(vec2 uv) {
                vec2 h = uv.xy - vec2(0.5, 0.5);
                vec2 fh = h - h.yx * h.yx * h.xy * barrelF;
                return fh * barrelS + 0.5;
            }
        #endif

        #ifdef FISHEYE
            #if (FISHEYE == 1)
                void fishEyeUV(float u, float v, out vec2 uv) {
                    float theta = PI / 2.0 * u - PI / 4.0;
                    float radius = 0.5 + v;

                    uv.x = sin(theta) * radius * 0.5 + 0.5;
                    uv.y = cos(theta) * radius * 0.5 + 0.5;
                }
            #elif (FISHEYE == 2)
                void fishEyeUV(float u, float v, out vec2 uv) {
                    float theta = PI / 2.0 * u + PI * 3.0 / 4.0;
                    float radius = 0.5 + v;

                    uv.x = sin(theta) * radius * 0.5 + 0.5;
                    uv.y = cos(theta) * radius * 0.5 + 0.5;
                }
            #elif (FISHEYE == 3)
                void fishEyeUV(float u, float v, out vec2 uv) {
                    float theta = PI / 2.0 * u - PI * 3.0 / 4.0;
                    float radius = 0.5 + v;

                    uv.x = sin(theta) * radius * 0.5 + 0.5;
                    uv.y = cos(theta) * radius * 0.5 + 0.5;
                }
            #elif (FISHEYE == 4)
                void fishEyeUV(float u, float v, out vec2 uv) {
                    float theta = PI / 2.0 * u + PI * 1.0 / 4.0;
                    float radius = 0.5 + v;

                    uv.x = sin(theta) * radius * 0.5 + 0.5;
                    uv.y = cos(theta) * radius * 0.5 + 0.5;
                }
            #elif (FISHEYE == 5)
                void fishEyeUV(float u, float v, out vec2 uv) {
                    float rx = u - 0.5;
                    float ry = v - 0.5;

                    float l = 1.0;
                    float rate = abs(rx / ry);
                    float theta = 0.0;
                    if (rate > 1.0) {
                        l = sqrt(0.5 * 0.5 + (0.5 / rate) * (0.5 / rate));
                        theta = sign(rx) * PI * (1.0 / 2.0 - sign(ry) / 4.0 * (1.0 / rate));
                    } else {
                        l = sqrt(0.5 * 0.5 + 0.5 * rate * 0.5 * rate);
                        theta = PI / 2. * (1. - sign(ry)) + sign(ry * rx) * PI / 4.0 * rate;
                    }

                    float d = sqrt(rx * rx + ry * ry);
                    float s = d / l;

                    float radius = 0.5 * s;

                    uv.x = sin(theta) * radius * 0.5 + 0.5;
                    uv.y = cos(theta) * radius * 0.5 + 0.5;
                }
            #endif
        #else
            float edgeAntialiasing(vec2 uv) {
                float r = 0.005;
                float a = abs(uv.x - 0.5) - (0.5 - r);
                float b = abs(uv.y - 0.5) - (0.5 - r);
                // it must be small if you donnot want to see the hackly texture
                float sum = 0.0;
                float count = 0.0000000000001;
                sum += a * a * a * (sign(a) + 1.0);
                count += 1.0 * a * a* (sign(a) + 1.0) ;
                sum += b * b * b * (sign(b) + 1.0);
                count += 1.0 * b * b * (sign(b) + 1.0);
                return sum / count <= 1.0 ? (r - sum / count) / r : 1.0;
            }
        #endif

        #ifdef OCCLUSION
            #ifdef OCCLUSION_PACKING
                #include <packing>
            #endif
            uniform sampler2D occlusionTexture;
            uniform float occlusionBias;
        #endif

        #include <logdepthbuf_pars_frag>

        void main() {
            vec3 uvz = (vDecalProjectPosition.xyz / vDecalProjectPosition.w) * 0.5 + 0.5;

            float u = uvz.x;
            float v = uvz.y;
            float z = uvz.z;

            #ifdef SPHERE_SPACE
                if (vDecalVPosition.z > 0.) discard;
                float decalVPositionLen = length(vDecalVPosition);
                if (decalVPositionLen > vSphereChecker.y || decalVPositionLen < vSphereChecker.x) discard;
            #else
                if (z > 1. || z < 0.) discard;
            #endif

            if (max(u, v) > 1. || min(u, v) < 0.) discard;

            #ifdef OCCLUSION
                #ifdef OCCLUSION_PACKING
                    float sampleDepth = unpackRGBAToDepth(texture2D(occlusionTexture, vec2(u, v)));
                #else
                    float sampleDepth = 1.0 - texture2D(occlusionTexture, vec2(u, v)).r;
                #endif
                if ((z + occlusionBias) > sampleDepth) discard;
            #endif

            #include <logdepthbuf_frag>

            gl_FragColor = vec4(u_Color, 1.0);

            #ifdef USE_DIFFUSE_MAP
                vec2 uv = vec2(0.5, 0.5);

                #ifdef FISHEYE
                    #if (FISHEYE < 5)
                        if (v > 0.5) discard;
                    #endif
                    fishEyeUV(u, v, uv);
                #else
                    uv.x = u;
                    uv.y = v;
                    gl_FragColor.a = edgeAntialiasing(uv);
                #endif

                #ifdef BARREL_CORRECTION
                    uv = barrelCorrection(uv);
                    if (max(uv.x, uv.y) > 1. || min(uv.x, uv.y) < 0.) discard;
                #endif

                gl_FragColor.rgb *= texture2D(diffuseMap, uv).rgb;
            #endif

            gl_FragColor.a *= u_Opacity;
        }
    `
};