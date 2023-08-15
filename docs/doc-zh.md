文档
===

`t3d-effect-composer`是一个基于`t3d.js`的后期效果混合器。

### 基础使用

#### 创建后期效果混合器

先创建一个`EffectComposer`实例：

````javascript
const effectComposer = new EffectComposer(width, height, {
    samplerNumber: Math.min(renderer.capabilities.maxSamples, 5),
    webgl2: renderer.capabilities.version > 1,
    floatColorBuffer: !!renderer.capabilities.getExtension("EXT_color_buffer_float"),
    maxMarkAttachment: 5,
    maxColorAttachment: 5
});
````

然后，就可以往混合器中插入各种后期效果，每个后期效果都是`Effect`的子类。

#### 添加后期特效

例如，如果想给EffectCompoer添加一个颜色矫正的后期效果，应该这么做：

````javascript
effectComposer.addEffect('ColorCorrection', new ColorCorrectionEffect(), 1);
````

`addEffect`方法的第一个参数是后期特效的注册名称，添加成功以后，可以通过`getEffect(name)`再取到对应的`Effect`实例；第二个参数即传入的`Effect`实例，这里是颜色矫正的效果；第三个参数表示该后期效果的处理顺序权重，数值越小，则越早执行。

`Effect`上可以暴露该特效的可调节参数。对于本例来说，`ColorCorrectionEffect`可以这样调节效果参数：

````javascript
const colorCorrectionEffect = effectComposer.getEffect('ColorCorrection');

colorCorrectionEffect.brightness = 0;
colorCorrectionEffect.contrast = 1.02;
colorCorrectionEffect.exposure = 0;
colorCorrectionEffect.gamma = 1;
colorCorrectionEffect.saturation = 1.02;
````

#### 添加逐物体特效

`t3d-effect-composer`允许添加逐物体特效。

以发光特效举例，可以通过标记的方式只让场景中的**某些物体发光**，甚至可以**单独设置每个物体发光的强度**。

````javascript
mesh.effects = { 'Glow': 1 };
mesh2.effects = { 'Glow': 0.5 };

effectComposer.addEffect('Glow', new GlowEffect(), 2);
````

这种逐物体特效一般依赖于对mesh的标记，如果场景中没有任何物体被标记，那么即使`Effect`被添加到`EffectComposer`中，也是没有效果的。

#### 默认的后期混合器

`t3d-effect-composer`提供了一个默认的后期效果混合器，内置了常用的后期特效。按照执行顺序来说，包括：

1. SSAOEffect
2. SSREffect
3. ColorCorrectionEffect
4. DOFEffect
5. BloomEffect
6. InnerGlowEffect
7. GlowEffect
8. SoftGlowEffect
9. TailingEffect
10. RadialTailingEffect
11. GhostingEffect
12. FXAAEffect
13. ChromaticAberrationEffect
14. VignettingEffect
15. BlurEdgeEffect
16. FilmEffect

### 进阶使用

#### 自定义后期特效

目前有三种方式对后期特效进行扩展：扩展Effect，扩展Buffer，扩展RenderLayers。某一种特效的实现，可能会依赖一种或多种扩展手段。

* 扩展Effect。通过继承Effect类实现的扩展。Effect的子类可以通过effectComposer.addEffect添加到后期处理流程中，可以实现一次屏幕级的Buffer交换。很多简单的后期处理特效可以只通过添加一个Effect即可实现。另外，Effect还可以通过配置`bufferDependencies`属性定义依赖的Buffer（例如GBuffer，某些物体特效的标记Buffer等），可以在处理过程中取到Buffer中的渲染结果。

* 扩展Buffer。用户可以将自己扩展的Buffer通过effectComposer.addBuffer添加到特效混合器中。如果有激活的Effect依赖某个Buffer，那么这个Buffer将在这一帧渲染中执行绘制。Buffer的绘制往往意味着对场景（或某一部分）进行一次绘制，来输出后续的图像处理中需要用到的中间结果。如果多个Effect依赖同一个Buffer，那么Buffer仅会执行一次渲染。

* 扩展RenderLayers。用户可以将自己扩展的RenderLayer添加到sceneBuffer.renderLayers数组中。RenderLayer将会在这一帧执行一次渲染，渲染的结果将直接输出到SceneBuffer或屏幕中。相当于对场景中的某些物体做了二次绘制。需要重复绘制某些物体的特效可以借由这个机制实现（例如某些贴花方案）。

#### 对于Buffer的材质替换策略改造

像类似`GBuffer`、`MarkBuffer`这种Buffer的子类，有些会提供`setMaterialReplaceFunction`方法，实现对材质替换策略的改造。Buffer中的渲染，本质上是将需要绘制的物体，以某种特定的材质进行渲染。由于实际场景中，物体的材质可能是多种多样的，后期处理器中内置的材质替换策略无法满足所有材质的替换需求。所以，开发者可以通过`setMaterialReplaceFunction`接口重写材质替换策略，加入需要的材质替换逻辑。

#### 对于渲染的网格体替换策略改造

有些情况下，可能需要在渲染时对物体的Geometry进行替换（例如wireframe渲染）。用户可以通过XXBuffer.setGeometryReplaceFunction来插入网格体的替换策略。

具体使用方式可以参考`examples/advanced_wireframe`。

#### 兼容外部渲染

开发者可以通过`effectComposer.setExternalAttachment`接口，插入colorAttachment与depthAttachment。此时，后期混合器可以在之前渲染结果的基础上继续进行绘制。借由这个功能，搭配t3d.Texture与t3d.RenderBuffer可以插入外置gl对象的特性，甚至可以实现和其它渲染引擎的联合渲染（例如cesium）。