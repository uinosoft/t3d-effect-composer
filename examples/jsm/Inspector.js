import { GBufferDebugger, NonDepthMarkBufferDebugger, MarkBufferDebugger, SSAODebugger, SSRDebugger, ColorMarkBufferDebugger, RenderListMask } from 't3d-effect-composer';

class Inspector {

	constructor(effectComposer, GUI, options = {}) {
		options.postEffect = (options.postEffect !== undefined) ? options.postEffect : true;

		const gui = new GUI({ title: "Effect Composer Inspector" });

		// Post Effects

		if (options.postEffect) {
			const postEffectFolder = gui.addFolder('Post Effects');

			postEffectFolder.add(effectComposer, "sceneMSAA");

			const ssaoEffect = effectComposer.getEffect('SSAO');
			const ssaoFolder = postEffectFolder.addFolder("SSAO");
			ssaoFolder.close();
			ssaoFolder.add(ssaoEffect, "active");
			ssaoFolder.add(ssaoEffect, "radius").min(0).max(5).step(0.01);
			ssaoFolder.add(ssaoEffect, "power").min(0).max(5).step(1);
			ssaoFolder.add(ssaoEffect, "bias").min(0).max(1).step(0.0001);
			ssaoFolder.add(ssaoEffect, "intensity").min(0).max(2).step(0.1);
			ssaoFolder.add(ssaoEffect, "quality", ['Low', 'Medium', 'High', 'Ultra']);
			ssaoFolder.add(ssaoEffect, "blurSize").min(0).max(3).step(0.01);
			ssaoFolder.add(ssaoEffect, "depthRange").min(0).max(3).step(0.01);

			const ssrEffect = effectComposer.getEffect('SSR');
			const ssrFolder = postEffectFolder.addFolder("SSR");
			ssrFolder.close();
			ssrFolder.add(ssrEffect, "active");
			ssrFolder.add(ssrEffect, "maxRayDistance", 1, 1000, 1);
			ssrFolder.add(ssrEffect, "pixelStride", 1, 100, 1);
			ssrFolder.add(ssrEffect, "pixelStrideZCutoff", 1, 300, 1);
			ssrFolder.add(ssrEffect, "screenEdgeFadeStart", 0, 1, 0.01);
			ssrFolder.add(ssrEffect, "eyeFadeStart", 0, 1, 0.01);
			ssrFolder.add(ssrEffect, "eyeFadeEnd", 0, 1, 0.01);
			ssrFolder.add(ssrEffect, "minGlossiness", 0, 1, 0.01);

			const colorCorrectionEffect = effectComposer.getEffect('ColorCorrection');
			const colorCorrectionFolder = postEffectFolder.addFolder("ColorCorrection");
			colorCorrectionFolder.close();
			colorCorrectionFolder.add(colorCorrectionEffect, "active");
			colorCorrectionFolder.add(colorCorrectionEffect, "brightness").min(0).max(0.5).step(0.01);
			colorCorrectionFolder.add(colorCorrectionEffect, "contrast").min(1).max(1.5).step(0.01);
			colorCorrectionFolder.add(colorCorrectionEffect, "exposure").min(0).max(1).step(0.1);
			colorCorrectionFolder.add(colorCorrectionEffect, "gamma").min(0).max(1).step(0.1);
			colorCorrectionFolder.add(colorCorrectionEffect, "saturation").min(-1).max(5);

			const dofEffect = effectComposer.getEffect('DOF');
			const dofFolder = postEffectFolder.addFolder("DOF");
			dofFolder.close();
			dofFolder.add(dofEffect, "active");
			dofFolder.add(dofEffect, "focalDepth", 0, 100);
			dofFolder.add(dofEffect, "focalLength", 0, 100);
			dofFolder.add(dofEffect, "fstop", 0, 1, 0.1);
			dofFolder.add(dofEffect, "maxblur", 0, 1, 0.1);
			dofFolder.add(dofEffect, "threshold", 0, 1, 0.1);
			dofFolder.add(dofEffect, "gain", 0, 2, 0.1);
			dofFolder.add(dofEffect, "bias", 0, 1, 0.001);
			dofFolder.add(dofEffect, "dithering", 0, 0.001, 0.00001);

			const bloomEffect = effectComposer.getEffect('Bloom');
			const bloomFolder = postEffectFolder.addFolder("Bloom");
			bloomFolder.close();
			bloomFolder.add(bloomEffect, "active");
			bloomFolder.add(bloomEffect, "threshold").min(0).max(1).step(0.01);
			bloomFolder.add(bloomEffect, "smoothWidth").min(0).max(1).step(0.01);
			bloomFolder.add(bloomEffect, "blurSize").min(0).max(5).step(0.01);
			bloomFolder.add(bloomEffect, "strength").min(0).max(2).step(0.01);

			const fxaaEffect = effectComposer.getEffect('FXAA');
			const fxaaFolder = postEffectFolder.addFolder("FXAA");
			fxaaFolder.close();
			fxaaFolder.add(fxaaEffect, "active");

			const chromaticAberrationEffect = effectComposer.getEffect('ChromaticAberration');
			const chromaticAberrationFolder = postEffectFolder.addFolder("chromatic aberration");
			chromaticAberrationFolder.close();
			chromaticAberrationFolder.add(chromaticAberrationEffect, "active");
			chromaticAberrationFolder.add(chromaticAberrationEffect, "chromaFactor").min(0).max(1).step(0.0001);

			const vignettingEffect = effectComposer.getEffect('Vignetting');
			const vignettingFolder = postEffectFolder.addFolder("Vignetting");
			vignettingFolder.close();
			vignettingFolder.add(vignettingEffect, "active");
			vignettingFolder.addColor({ color: [0, 0, 0] }, "color").onChange(value => {
				vignettingEffect.color.fromArray(value);
			});
			vignettingFolder.add(vignettingEffect, "offset").min(0).max(5).step(0.1);

			const blurEdgeEffect = effectComposer.getEffect('BlurEdge');
			const blurEdgeFolder = postEffectFolder.addFolder("BlurEdge");
			blurEdgeFolder.close();
			blurEdgeFolder.add(blurEdgeEffect, "active");
			blurEdgeFolder.add(blurEdgeEffect, "offset").min(0).max(5).step(0.1);

			const filmEffect = effectComposer.getEffect('Film');
			const filmFolder = postEffectFolder.addFolder("Film");
			filmFolder.close();
			filmFolder.add(filmEffect, "active");
			filmFolder.add(filmEffect, "noiseIntensity").min(0).max(1).step(0.01);
			filmFolder.add(filmEffect, "scanlinesIntensity").min(0).max(1).step(0.01);
			filmFolder.add(filmEffect, "scanlinesCount").min(0).max(3000).step(100);
			filmFolder.add(filmEffect, "grayscale");
		}

		// Debuggers

		const gBufferDebugger = new GBufferDebugger();
		const ssaoDebugger = new SSAODebugger();
		const ssrDebugger = new SSRDebugger();
		const debuggerFolder = gui.addFolder("Debugger");
		debuggerFolder.close();

		let debugDetailControl = null, gBufferTypes = ['Normal', 'Depth', 'Position', 'Glossiness'], debugTypes = ['Null', 'GBuffer', 'SSAO', 'SSR'];
		let debugMaskControl = null;
		let nonDepthMarkBufferDebugger = null, markBufferDebugger = null, colorMarkBufferDebugger = null;

		if (options.nonDepthMarkChannels) {
			debugTypes.push('NonDepthMarkBuffer');

			nonDepthMarkBufferDebugger = new NonDepthMarkBufferDebugger();
			nonDepthMarkBufferDebugger.channel = options.nonDepthMarkChannels[0];
		}

		if (options.markChannels) {
			debugTypes.push('MarkBuffer');

			markBufferDebugger = new MarkBufferDebugger();
			markBufferDebugger.channel = options.markChannels[0];
		}

		if (options.colorMarkChannels) {
			debugTypes.push('ColorMarkBuffer');

			colorMarkBufferDebugger = new ColorMarkBufferDebugger();
			colorMarkBufferDebugger.channel = options.colorMarkChannels[0];
		}

		debuggerFolder.add({ type: 'Null' }, 'type', debugTypes).onChange(value => {
			if (debugDetailControl) {
				debugDetailControl.destroy();
				debugDetailControl = null;
			}

			if (debugMaskControl) {
				debugMaskControl.destroy();
				debugMaskControl = null;
			}

			if (value === 'GBuffer') {
				effectComposer.debugger = gBufferDebugger;

				debugDetailControl = debuggerFolder.add({ bufferInfo: gBufferTypes[gBufferDebugger.debugType] }, 'bufferInfo', gBufferTypes).onChange(value => {
					gBufferDebugger.debugType = GBufferDebugger.DebugTypes[value];
				});
			} else if (value === 'NonDepthMarkBuffer') {
				effectComposer.debugger = nonDepthMarkBufferDebugger;
				debugDetailControl = debuggerFolder.add(nonDepthMarkBufferDebugger, 'channel', options.nonDepthMarkChannels);
				debugMaskControl = debuggerFolder.add(nonDepthMarkBufferDebugger, 'mask', RenderListMask);
			} else if (value === 'MarkBuffer') {
				effectComposer.debugger = markBufferDebugger;
				debugDetailControl = debuggerFolder.add(markBufferDebugger, 'channel', options.markChannels);
				debugMaskControl = debuggerFolder.add(markBufferDebugger, 'mask', RenderListMask);
			} else if (value === 'ColorMarkBuffer') {
				effectComposer.debugger = colorMarkBufferDebugger;
				debugDetailControl = debuggerFolder.add(colorMarkBufferDebugger, 'channel', options.colorMarkChannels);
				debugMaskControl = debuggerFolder.add(colorMarkBufferDebugger, 'mask', RenderListMask);
			} else if (value === 'SSAO') {
				effectComposer.debugger = ssaoDebugger;
			} else if (value === 'SSR') {
				effectComposer.debugger = ssrDebugger;
			} else {
				effectComposer.debugger = null;
			}
		});

		// Stats

		const statsFolder = gui.addFolder("Stats");
		statsFolder.close();

		let stats = effectComposer.getStats();
		statsFolder.add(stats, 'fboCache').disable().listen();
		statsFolder.add(stats, 'markBuffers').disable().listen();
		statsFolder.add(stats, 'colorMarkBuffers').disable().listen();

		// buffer usage

		const bufferUsage = stats.currentBufferUsage;

		for (let key in bufferUsage) {
			statsFolder.add(bufferUsage, key).disable().listen();
		}

		statsFolder.add({ dispose: () => {
			effectComposer.dispose();
		} }, 'dispose');

		this.statsTimer = setInterval(() => {
			effectComposer.getStats();
		}, 300);

		this.gui = gui;
	}

	destroy() {
		clearInterval(this.statsTimer);
		this.gui.destroy();
	}

}

export { Inspector }