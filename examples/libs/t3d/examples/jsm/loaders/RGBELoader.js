import { Loader, FileLoader, PIXEL_TYPE, PIXEL_FORMAT, TEXTURE_FILTER, Texture2D, TextureCube, MathUtils } from 't3d';

class RGBELoader extends Loader {

	constructor(manager) {
		super(manager);

		this.type = PIXEL_TYPE.HALF_FLOAT;
	}

	load(url, onLoad, onProgress, onError) {
		new FileLoader(this.manager)
			.setResponseType('arraybuffer')
			.setRequestHeader(this.requestHeader)
			.setPath(this.path)
			.setWithCredentials(this.withCredentials)
			.load(url, buffer => {
				onLoad && onLoad(this.parse(buffer));
			}, onProgress, onError);
	}

	// adapted from http://www.graphics.cornell.edu/~bjw/rgbe.html

	parse(buffer) {
		const byteArray = new Uint8Array(buffer);
		byteArray.pos = 0;
		const rgbe_header_info = RGBE_ReadHeader(byteArray);

		const w = rgbe_header_info.width,
			h = rgbe_header_info.height,
			image_rgba_data = RGBE_ReadPixels_RLE(byteArray.subarray(byteArray.pos), w, h);

		let data, type;
		let numElements;
		if (this.type === PIXEL_TYPE.FLOAT) {
			numElements = image_rgba_data.length / 4;
			const floatArray = new Float32Array(numElements * 4);

			for (let j = 0; j < numElements; j++) {
				RGBEByteToRGBFloat(image_rgba_data, j * 4, floatArray, j * 4);
			}

			data = floatArray;
			type = PIXEL_TYPE.FLOAT;
		} else if (this.type === PIXEL_TYPE.HALF_FLOAT) {
			numElements = image_rgba_data.length / 4;
			const halfArray = new Uint16Array(numElements * 4);

			for (let j = 0; j < numElements; j++) {
				RGBEByteToRGBHalf(image_rgba_data, j * 4, halfArray, j * 4);
			}

			data = halfArray;
			type = PIXEL_TYPE.HALF_FLOAT;
		} else if (this.type === PIXEL_TYPE.UNSIGNED_BYTE) {
			data = image_rgba_data; // just copy
			type = PIXEL_TYPE.UNSIGNED_BYTE;
		} else {
			console.error('RGBELoader: unsupported type: ', this.type);
		}

		const floatType = (type === PIXEL_TYPE.FLOAT) || (type === PIXEL_TYPE.HALF_FLOAT);

		return {
			header: rgbe_header_info.string,
			gamma: rgbe_header_info.gamma,
			exposure: rgbe_header_info.exposure,

			width: w, height: h, data: data,

			type: type,
			generateMipmaps: !floatType,
			flipY: floatType,
			minFilter: floatType ? TEXTURE_FILTER.LINEAR : TEXTURE_FILTER.LINEAR_MIPMAP_LINEAR,
			magFilter: TEXTURE_FILTER.LINEAR,

			format: PIXEL_FORMAT.RGBA, // deprecated
			internalformat: null // deprecated
		};
	}

}

const
	/* default error routine.  change this to change error handling */
	rgbe_read_error = 1,
	rgbe_write_error = 2,
	rgbe_format_error = 3,
	rgbe_memory_error = 4,
	rgbe_error = function(rgbe_error_code, msg) {
		switch (rgbe_error_code) {
			case rgbe_read_error: throw new Error('RGBELoader: Read Error: ' + (msg || ''));
			case rgbe_write_error: throw new Error('RGBELoader: Write Error: ' + (msg || ''));
			case rgbe_format_error: throw new Error('RGBELoader: Bad File Format: ' + (msg || ''));
			default:
			case rgbe_memory_error: throw new Error('RGBELoader: Memory Error: ' + (msg || ''));
		}
	},

	/* offsets to red, green, and blue components in a data (float) pixel */
	// RGBE_DATA_RED = 0,
	// RGBE_DATA_GREEN = 1,
	// RGBE_DATA_BLUE = 2,

	/* number of floats per pixel, use 4 since stored in rgba image format */
	// RGBE_DATA_SIZE = 4,

	/* flags indicating which fields in an rgbe_header_info are valid */
	RGBE_VALID_PROGRAMTYPE = 1,
	RGBE_VALID_FORMAT = 2,
	RGBE_VALID_DIMENSIONS = 4,

	NEWLINE = '\n',

	fgets = function(buffer, lineLimit, consume) {
		const chunkSize = 128;

		lineLimit = !lineLimit ? 1024 : lineLimit;
		let p = buffer.pos,
			i = -1, len = 0, s = '',
			chunk = String.fromCharCode.apply(null, new Uint16Array(buffer.subarray(p, p + chunkSize)));
		while ((0 > (i = chunk.indexOf(NEWLINE))) && (len < lineLimit) && (p < buffer.byteLength)) {
			s += chunk; len += chunk.length;
			p += chunkSize;
			chunk += String.fromCharCode.apply(null, new Uint16Array(buffer.subarray(p, p + chunkSize)));
		}

		if (-1 < i) {
			/* for (i=l-1; i>=0; i--) {
				byteCode = m.charCodeAt(i);
				if (byteCode > 0x7f && byteCode <= 0x7ff) byteLen++;
				else if (byteCode > 0x7ff && byteCode <= 0xffff) byteLen += 2;
				if (byteCode >= 0xDC00 && byteCode <= 0xDFFF) i--; //trail surrogate
			} */
			if (false !== consume) buffer.pos += len + i + 1;
			return s + chunk.slice(0, i);
		}

		return false;
	},

	/* minimal header reading.  modify if you want to parse more information */
	RGBE_ReadHeader = function(buffer) {
		// regexes to parse header info fields
		const magic_token_re = /^#\?(\S+)$/,
			gamma_re = /^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/,
			exposure_re = /^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/,
			format_re = /^\s*FORMAT=(\S+)\s*$/,
			dimensions_re = /^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/,

			// RGBE format header struct
			header = {
				valid: 0, /* indicate which fields are valid */
				string: '', /* the actual header string */
				comments: '', /* comments found in header */
				programtype: 'RGBE', /* listed at beginning of file to identify it after "#?". defaults to "RGBE" */
				format: '', /* RGBE format, default 32-bit_rle_rgbe */
				gamma: 1.0, /* image has already been gamma corrected with given gamma. defaults to 1.0 (no correction) */
				exposure: 1.0, /* a value of 1.0 in an image corresponds to <exposure> watts/steradian/m^2. defaults to 1.0 */
				width: 0, height: 0 /* image dimensions, width/height */
			};

		let line, match;

		if (buffer.pos >= buffer.byteLength || !(line = fgets(buffer))) {
			return rgbe_error(rgbe_read_error, 'no header found');
		}

		/* if you want to require the magic token then uncomment the next line */
		if (!(match = line.match(magic_token_re))) {
			return rgbe_error(rgbe_format_error, 'bad initial token');
		}

		header.valid |= RGBE_VALID_PROGRAMTYPE;
		header.programtype = match[1];
		header.string += line + '\n';

		while (true) {
			line = fgets(buffer);
			if (false === line) break;
			header.string += line + '\n';

			if ('#' === line.charAt(0)) {
				header.comments += line + '\n';
				continue; // comment line
			}

			match = line.match(gamma_re);
			if (match) {
				header.gamma = parseFloat(match[1]);
			}
			match = line.match(exposure_re);
			if (match) {
				header.exposure = parseFloat(match[1]);
			}
			match = line.match(format_re);
			if (match) {
				header.valid |= RGBE_VALID_FORMAT;
				header.format = match[1];// '32-bit_rle_rgbe';
			}
			match = line.match(dimensions_re);
			if (match) {
				header.valid |= RGBE_VALID_DIMENSIONS;
				header.height = parseInt(match[1], 10);
				header.width = parseInt(match[2], 10);
			}

			if ((header.valid & RGBE_VALID_FORMAT) && (header.valid & RGBE_VALID_DIMENSIONS)) break;
		}

		if (!(header.valid & RGBE_VALID_FORMAT)) {
			return rgbe_error(rgbe_format_error, 'missing format specifier');
		}
		if (!(header.valid & RGBE_VALID_DIMENSIONS)) {
			return rgbe_error(rgbe_format_error, 'missing image size specifier');
		}

		return header;
	},

	RGBE_ReadPixels_RLE = function(buffer, w, h) {
		const scanline_width = w;

		if (
			// run length encoding is not allowed so read flat
			((scanline_width < 8) || (scanline_width > 0x7fff)) ||
			// this file is not run length encoded
			((2 !== buffer[0]) || (2 !== buffer[1]) || (buffer[2] & 0x80))
		) {
			// return the flat buffer
			return new Uint8Array(buffer);
		}

		if (scanline_width !== ((buffer[2] << 8) | buffer[3])) {
			return rgbe_error(rgbe_format_error, 'wrong scanline width');
		}

		const data_rgba = new Uint8Array(4 * w * h);

		if (!data_rgba.length) {
			return rgbe_error(rgbe_memory_error, 'unable to allocate buffer space');
		}

		let offset = 0, pos = 0;

		const ptr_end = 4 * scanline_width;
		const rgbeStart = new Uint8Array(4);
		const scanline_buffer = new Uint8Array(ptr_end);
		let num_scanlines = h;

		// read in each successive scanline
		while ((num_scanlines > 0) && (pos < buffer.byteLength)) {
			if (pos + 4 > buffer.byteLength) {
				return rgbe_error(rgbe_read_error);
			}

			rgbeStart[0] = buffer[pos++];
			rgbeStart[1] = buffer[pos++];
			rgbeStart[2] = buffer[pos++];
			rgbeStart[3] = buffer[pos++];

			if ((2 != rgbeStart[0]) || (2 != rgbeStart[1]) || (((rgbeStart[2] << 8) | rgbeStart[3]) != scanline_width)) {
				return rgbe_error(rgbe_format_error, 'bad rgbe scanline format');
			}

			// read each of the four channels for the scanline into the buffer
			// first red, then green, then blue, then exponent
			let ptr = 0, count;

			while ((ptr < ptr_end) && (pos < buffer.byteLength)) {
				count = buffer[pos++];
				const isEncodedRun = count > 128;
				if (isEncodedRun) count -= 128;

				if ((0 === count) || (ptr + count > ptr_end)) {
					return rgbe_error(rgbe_format_error, 'bad scanline data');
				}

				if (isEncodedRun) {
					// a (encoded) run of the same value
					const byteValue = buffer[pos++];
					for (let i = 0; i < count; i++) {
						scanline_buffer[ptr++] = byteValue;
					}
					// ptr += count;
				} else {
					// a literal-run
					scanline_buffer.set(buffer.subarray(pos, pos + count), ptr);
					ptr += count; pos += count;
				}
			}


			// now convert data from buffer into rgba
			// first red, then green, then blue, then exponent (alpha)
			const l = scanline_width; // scanline_buffer.byteLength;
			for (let i = 0; i < l; i++) {
				let off = 0;
				data_rgba[offset] = scanline_buffer[i + off];
				off += scanline_width; // 1;
				data_rgba[offset + 1] = scanline_buffer[i + off];
				off += scanline_width; // 1;
				data_rgba[offset + 2] = scanline_buffer[i + off];
				off += scanline_width; // 1;
				data_rgba[offset + 3] = scanline_buffer[i + off];
				offset += 4;
			}

			num_scanlines--;
		}

		return data_rgba;
	};

const RGBEByteToRGBFloat = function(sourceArray, sourceOffset, destArray, destOffset) {
	const e = sourceArray[sourceOffset + 3];
	const scale = Math.pow(2.0, e - 128.0) / 255.0;

	destArray[destOffset + 0] = sourceArray[sourceOffset + 0] * scale;
	destArray[destOffset + 1] = sourceArray[sourceOffset + 1] * scale;
	destArray[destOffset + 2] = sourceArray[sourceOffset + 2] * scale;
	destArray[destOffset + 3] = 1;
};

const RGBEByteToRGBHalf = function(sourceArray, sourceOffset, destArray, destOffset) {
	const e = sourceArray[sourceOffset + 3];
	const scale = Math.pow(2.0, e - 128.0) / 255.0;

	// clamping to 65504, the maximum representable value in float16
	destArray[destOffset + 0] = MathUtils.toHalfFloat(Math.min(sourceArray[sourceOffset + 0] * scale, 65504));
	destArray[destOffset + 1] = MathUtils.toHalfFloat(Math.min(sourceArray[sourceOffset + 1] * scale, 65504));
	destArray[destOffset + 2] = MathUtils.toHalfFloat(Math.min(sourceArray[sourceOffset + 2] * scale, 65504));
	destArray[destOffset + 3] = MathUtils.toHalfFloat(1);
};

class RGBETexture2DLoader extends RGBELoader {

	load(url, onLoad, onProgress, onError) {
		const texture = new Texture2D();

		super.load(url, textureData => {
			const {
				header, gamma, exposure,
				data, width, height,
				type, generateMipmaps, flipY, magFilter, minFilter
			} = textureData;

			texture.image = { data, width, height };

			texture.type = type;
			texture.generateMipmaps = generateMipmaps;
			texture.flipY = flipY;
			texture.magFilter = magFilter;
			texture.minFilter = minFilter;

			texture.userData.rgbeInfo = { header, gamma, exposure };

			texture.version++;

			onLoad && onLoad(texture);
		}, onProgress, onError);

		return texture;
	}

}

class RGBETextureCubeLoader extends RGBELoader {

	load(urls, onLoad, _onProgress, onError) {
		const texture = new TextureCube();

		const promiseArray = [];
		for (let i = 0; i < 6; i++) {
			promiseArray.push(new Promise((resolve, reject) => {
				super.load(urls[i], resolve, undefined, reject);
			}));
		}

		Promise.all(promiseArray).then(textureDatas => {
			for (let i = 0; i < 6; i++) {
				texture.images.push({
					data: textureDatas[i].data,
					width: textureDatas[i].width,
					height: textureDatas[i].height
				});
			}

			const { type, generateMipmaps, magFilter, minFilter } = textureDatas[0];

			texture.type = type;
			texture.generateMipmaps = generateMipmaps;
			// texture.flipY = flipY;
			texture.magFilter = magFilter;
			texture.minFilter = minFilter;

			texture.version++;

			onLoad && onLoad(texture);
		}).catch(e => {
			onError && onError(e);
		});

		return texture;
	}

}

export { RGBELoader, RGBETexture2DLoader, RGBETextureCubeLoader };