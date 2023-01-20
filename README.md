t3d-effect-composer
===================

EffectComposer for t3d.js.

### Dependencies

[t3d.js](https://git.uino.com/thingjs_base/t3d/t3d.js)

### Features

* SSAO
* SSR
* ColorCorrection
* DOF
* Bloom
* FXAA
* ChromaticAberration
* Vignetting
* BlurEdge
* Film

* InnerGlow
* Glow
* SoftGlow
* Tailing
* RadialTailing
* Ghosting
* Outline

### Usage

Documents: [English](./docs/doc-en.md) | [中文](./docs/doc-zh.md)

Getting started：

````javascript
let width = window.innerWidth || 2;
let height = window.innerHeight || 2;

const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
document.body.appendChild(canvas);

const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    stencil: true
});
const renderer = new t3d.Renderer(gl);
renderer.renderPass.state.colorBuffer.setClear(0.1, 0.1, 0.1, 1);
const backRenderTarget = new t3d.RenderTargetBack(canvas);

const effectComposer = new t3d.DefaultEffectComposer(width, height, {});

const scene = new t3d.Scene();

const geometry = new t3d.CubeGeometry(8, 8, 8);
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