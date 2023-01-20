import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';

const babelrc = {
	presets: [
		[
			'@babel/preset-env',
			{
				modules: false,
				targets: '>0.3%, not dead',
				loose: true,
				bugfixes: true,
			},
		],
	]
};

function babelCleanup() {
	const doubleSpaces = / {2}/g;
	return {
		transform(code) {
			code = code.replace(doubleSpaces, '\t');
			return {
				code: code,
				map: null
			};
		}
	};
}

function header() {
	return {
		renderChunk(code) {
			return '// t3d-effect-composer\n' + code;
		}
	};
}

export default [
	{
		input: 'src/main.js',
		plugins: [
			babel({
				babelHelpers: 'bundled',
				compact: false,
				babelrc: false,
				...babelrc
			}),
			babelCleanup(),
			header()
		],
		external: ['t3d'],
		output: [
			{
				format: 'umd',
				name: 't3d',
				extend: true,
				file: 'build/t3d.effectcomposer.js',
				indent: '\t',
				globals: { 't3d': 't3d' }
			}
		]
	},
	{
		input: 'src/main.js',
		plugins: [
			babel({
				babelHelpers: 'bundled',
				babelrc: false,
				...babelrc
			}),
			babelCleanup(),
			terser(),
			header()
		],
		external: ['t3d'],
		output: [
			{
				format: 'umd',
				name: 't3d',
				extend: true,
				file: 'build/t3d.effectcomposer.min.js',
				globals: { 't3d': 't3d' },
			}
		]
	},
	{
		input: 'src/main.js',
		plugins: [
			header()
		],
		external: ['t3d'],
		output: [
			{
				format: 'esm',
				file: 'build/t3d.effectcomposer.module.js'
			}
		]
	}
];