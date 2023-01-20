import { default as EffectComposer } from './EffectComposer.js';
import BloomEffect from './effects/BloomEffect.js';
import ChromaticAberrationEffect from './effects/ChromaticAberrationEffect.js';
import ColorCorrectionEffect from './effects/ColorCorrectionEffect.js';
import DOFEffect from './effects/DOFEffect.js';
import FilmEffect from './effects/FilmEffect.js';
import FXAAEffect from './effects/FXAAEffect.js';
import SSAOEffect from './effects/SSAOEffect.js';
import SSREffect from './effects/SSREffect.js';
import VignettingEffect from './effects/VignettingEffect.js';
import BlurEdgeEffect from './effects/BlurEdgeEffect.js';

import InnerGlowEffect from './effects/InnerGlowEffect.js';
import GlowEffect from './effects/GlowEffect.js';
import SoftGlowEffect from './effects/SoftGlowEffect.js';
import TailingEffect from './effects/TailingEffect.js';
import RadialTailingEffect from './effects/RadialTailingEffect.js';
import GhostingEffect from './effects/GhostingEffect.js';

export default class DefaultEffectComposer extends EffectComposer {

	constructor(width, height, options) {
		super(width, height, options);

		this.addEffect('SSAO', new SSAOEffect(), 0);
		this.addEffect('SSR', new SSREffect(), 1);
		this.addEffect('ColorCorrection', new ColorCorrectionEffect(), 2);
		this.addEffect('DOF', new DOFEffect(), 3);
		this.addEffect('Bloom', new BloomEffect(), 4);

		this.addEffect('InnerGlow', new InnerGlowEffect(), 10);
		this.addEffect('Glow', new GlowEffect(), 11);
		this.addEffect('SoftGlow', new SoftGlowEffect(), 12);
		this.addEffect('Tailing', new TailingEffect(), 13);
		this.addEffect('RadialTailing', new RadialTailingEffect(), 14);
		this.addEffect('Ghosting', new GhostingEffect(), 15);

		// Insert outline effects here.

		this.addEffect('FXAA', new FXAAEffect(), 101);
		this.addEffect('ChromaticAberration', new ChromaticAberrationEffect(), 102);
		this.addEffect('Vignetting', new VignettingEffect(), 103);
		this.addEffect('BlurEdge', new BlurEdgeEffect(), 104);
		this.addEffect('Film', new FilmEffect(), 105);

		this._effectList.forEach(item => item.effect.active = false); // auto close
	}

}