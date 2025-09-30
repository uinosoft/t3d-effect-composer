Documentation
===

`t3d-effect-composer` is a post-processing effect composer based on `t3d.js`.

### Basic Usage

#### Creating a Post-Processing Effect Composer

First, create an `EffectComposer` instance:

````javascript
const effectComposer = new EffectComposer(width, height, {
    samplerNumber: Math.min(renderer.capabilities.maxSamples, 5),
    webgl2: renderer.capabilities.version > 1,
    floatColorBuffer: !!renderer.capabilities.getExtension("EXT_color_buffer_float"),
    maxMarkAttachment: 5,
    maxColorAttachment: 5
});
````

Then, you can add various post-processing effects to the composer. Each post-processing effect is a subclass of `Effect`.

#### Adding Post-Processing Effects

For example, to add a color correction post-processing effect to the EffectComposer:

````javascript
effectComposer.addEffect('ColorCorrection', new ColorCorrectionEffect(), 1);
````

The first parameter of the `addEffect` method is the registration name of the post-processing effect. After successful addition, you can retrieve the corresponding `Effect` instance through `getEffect(name)`. The second parameter is the `Effect` instance passed in, which in this case is the color correction effect. The third parameter represents the processing order weight of this post-processing effect - the smaller the value, the earlier it executes.

`Effect` can expose adjustable parameters for that specific effect. For this example, `ColorCorrectionEffect` can adjust effect parameters like this:

````javascript
const colorCorrectionEffect = effectComposer.getEffect('ColorCorrection');

colorCorrectionEffect.brightness = 0;
colorCorrectionEffect.contrast = 1.02;
colorCorrectionEffect.exposure = 0;
colorCorrectionEffect.gamma = 1;
colorCorrectionEffect.saturation = 1.02;
````

#### Adding Per-Object Effects

`t3d-effect-composer` allows adding per-object effects.

Taking glow effects as an example, you can use marking to make **only certain objects in the scene glow**, and even **set individual glow intensity for each object**.

````javascript
mesh.effects = { 'Glow': 1 };
mesh2.effects = { 'Glow': 0.5 };

effectComposer.addEffect('Glow', new GlowEffect(), 2);
````

This type of per-object effect generally depends on marking meshes. If no objects in the scene are marked, then even if the `Effect` is added to the `EffectComposer`, it will have no effect.

#### Default Post-Processing Composer

`t3d-effect-composer` provides a default post-processing effect composer with built-in common post-processing effects. In execution order, they include:

1. SSAOEffect - 0
2. SSREffect - 1
3. ColorCorrectionEffect - 2
4. DOFEffect - 3
5. BloomEffect - 4
6. InnerGlowEffect - 10
7. GlowEffect - 11
8. SoftGlowEffect - 12
9. TailingEffect - 13
10. RadialTailingEffect 14
11. GhostingEffect - 15
12. FXAAEffect - 101
13. ChromaticAberrationEffect - 102
14. VignettingEffect - 103
15. BlurEdgeEffect - 104
16. FilmEffect - 105

### Advanced Usage

#### Custom Post-Processing Effects

Currently, there are three ways to extend post-processing effects: extending Effect, extending Buffer, and extending RenderLayers. The implementation of a specific effect may depend on one or more extension methods.

* **Extending Effect**. Extensions implemented by inheriting the Effect class. Effect subclasses can be added to the post-processing pipeline through `effectComposer.addEffect`, enabling a screen-level Buffer swap. Many simple post-processing effects can be implemented by just adding an Effect. Additionally, Effects can define dependent Buffers (such as GBuffer, marking buffers for certain object effects, etc.) through the `bufferDependencies` property configuration, allowing access to rendering results in the Buffer during processing.

* **Extending Buffer**. Users can add their own extended Buffers to the effect composer through `effectComposer.addBuffer`. If there are active Effects that depend on a certain Buffer, that Buffer will execute drawing in this frame's rendering. Buffer drawing often means performing a render of the scene (or a part of it) to output intermediate results needed for subsequent image processing. If multiple Effects depend on the same Buffer, the Buffer will only execute rendering once.

* **Extending RenderLayers**. Users can add their own extended RenderLayers to the `sceneBuffer.renderLayers` array. RenderLayer will execute one render in this frame, and the rendering result will be directly output to SceneBuffer or the screen. This is equivalent to performing a secondary draw of certain objects in the scene. Effects that need to repeatedly draw certain objects can be implemented through this mechanism (such as certain decal solutions).

#### Material Replacement Strategy Modification for Buffers

Buffer subclasses like `GBuffer` and `MarkBuffer` sometimes provide `setMaterialReplaceFunction` methods to modify material replacement strategies. Rendering in Buffers essentially involves drawing objects that need to be rendered with specific materials. Since objects in actual scenes may have various materials, the built-in material replacement strategy in the post-processor cannot meet all material replacement needs. Therefore, developers can rewrite material replacement strategies through the `setMaterialReplaceFunction` interface, adding necessary material replacement logic.

#### Geometry Replacement Strategy Modification for Rendered Meshes

In some cases, you may need to replace an object's Geometry during rendering (such as wireframe rendering). Users can insert geometry replacement strategies through `XXBuffer.setGeometryReplaceFunction`.

For specific usage, please refer to `examples/advanced_wireframe`.

#### External Rendering Compatibility

Developers can insert colorAttachment and depthAttachment through the `effectComposer.setExternalAttachment` interface. In this case, the post-processing composer can continue drawing based on previous rendering results. With this functionality, combined with the ability of t3d.Texture and t3d.RenderBuffer to insert external gl objects, you can even achieve joint rendering with other rendering engines (such as Cesium).