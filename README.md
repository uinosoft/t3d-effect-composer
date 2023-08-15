t3d-effect-composer
===================

[![NPM Package][npm]][npm-url]

Post Effects extension for [t3d.js](https://github.com/uinosoft/t3d.js).

[Examples](https://uinosoft.github.io/t3d-effect-composer/examples/) &mdash;
Documents<[English](./docs/doc-en.md)/[中文](./docs/doc-zh.md)>

### Features

* Post-processing effect: SSAO, SSR, ColorCorrection, DOF, Bloom, FXAA, ChromaticAberration, Vignetting, BlurEdge, Film.
* Mesh effects: InnerGlow, Glow, SoftGlow, Tailing, RadialTailing, Ghosting, Outline.
* Extended rendering features: Decal, lensflare, lut, overlay, sketch, uv debug ...

### Usage

Getting started：

````javascript
let width = window.innerWidth || 2;
let height = window.innerHeight || 2;

const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
document.body.appendChild(canvas);

const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    stencil: true
});
const renderer = new t3d.WebGLRenderer(gl);
renderer.setClearColor(0.1, 0.1, 0.1, 1);
const backRenderTarget = new t3d.RenderTargetBack(canvas);

const effectComposer = new t3d.DefaultEffectComposer(width, height, {});

const scene = new t3d.Scene();

const geometry = new t3d.BoxGeometry(8, 8, 8);
const material = new t3d.PBRMaterial();
const mesh = new t3d.Mesh(geometry, material);
scene.add(mesh);

const ambientLight = new t3d.AmbientLight(0xffffff);
scene.add(ambientLight);

const directionalLight = new t3d.DirectionalLight(0xffffff);
directionalLight.position.set(-5, 5, 5);
directionalLight.lookAt(new t3d.Vector3(), new t3d.Vector3(0, 1, 0));
scene.add(directionalLight);

const camera = new t3d.Camera();
camera.position.set(0, 10, 30);
camera.lookAt(new t3d.Vector3(0, 0, 0), new t3d.Vector3(0, 1, 0));
camera.setPerspective(45 / 180 * Math.PI, width / height, 1, 1000);
scene.add(camera);

function loop(count) {
    requestAnimationFrame(loop);
    
    mesh.euler.y = count / 1000 * .5; // rotate cube

    scene.updateMatrix();
    scene.updateRenderStates(camera);
    scene.updateRenderQueue(camera);

    effectComposer.render(renderer, scene, camera, backRenderTarget);
}
requestAnimationFrame(loop);

function onWindowResize() {
    width = window.innerWidth || 2;
    height = window.innerHeight || 2;

    camera.setPerspective(45 / 180 * Math.PI, width / height, 1, 1000);

    backRenderTarget.resize(width, height);
    effectComposer.resize(width, height);
}
window.addEventListener("resize", onWindowResize, false);
````

[npm]: https://img.shields.io/npm/v/t3d-effect-composer
[npm-url]: https://www.npmjs.com/package/t3d-effect-composer