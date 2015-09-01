
var _ = require('underscore');
var fs = require('fs');


var RGB = {
	fromRGB: function(c) { return c.slice(); },
	toRGB: function(c) { return c.slice(); }
};


var HSV = {
	fromRGB: function(c) {
		var r = 255*c[0];
		var g = 255*c[1];
		var b = 255*c[2];
		var max = Math.max(r, Math.max(g, b));
		var min = Math.min(r, Math.min(g, b));
		var chroma = max - min;

		var huep = 0;
		if (chroma === 0) huep = 0; else
		if (max === r) huep = (g - b) / chroma % 6; else
		if (max === g) huep = (b - r) / chroma + 2; else
		if (max === b) huep = (r - g) / chroma + 4;

		var hue = 60 * huep;
		if (hue < 0)
			hue = hue + 360;
		var saturation = max === 0 ? 0 : 1 - min/max;
		var value = max / 255;

		return [hue, saturation, value];
	},
	toRGB: function(c) {
		var hue = c[0];
		var saturation = c[1];
		var value = c[2];

		var hi = Math.floor(hue / 60) % 6;
		var f = hue / 60 - Math.floor(hue / 60);
		var v = value;
		var p = (value * (1 - saturation));
		var q = (value * (1 - f * saturation));
		var t = (value * (1 - (1 - f) * saturation));

		if (hi === 0)
			return [v, t, p];
		else if (hi === 1)
			return [q, v, p];
		else if (hi === 2)
			return [p, v, t];
		else if (hi === 3)
			return [p, q, v];
		else if (hi === 4)
			return [t, p, v];
		else
			return [v, p, q];
	}
};


//sRGB to xyz using the D65 illuminant
//transformation from http://www.brucelindbloom.com
var LAB_from_M = [
	[0.4124564, 0.3575761, 0.1804375],
	[0.2126729, 0.7151522, 0.0721750],
	[0.0193339, 0.1191920, 0.9503041]
];
var LAB_to_M = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.9692660, 1.8760108, 0.0415560],
	[0.0556434, -0.2040259, 1.0572252]
];
var LAB_gamma = 2.2;
var clamp = function(x) { return Math.min(Math.max(x, 0), 1); };
var LAB = {
	fromRGB: function(c) {
        var red = Math.pow(c[0], LAB_gamma);
        var green = Math.pow(c[1], LAB_gamma);
        var blue = Math.pow(c[2], LAB_gamma);

        var x = LAB_from_M[0][0] * red + LAB_from_M[0][1] * green + LAB_from_M[0][2] * blue;
        var y = LAB_from_M[1][0] * red + LAB_from_M[1][1] * green + LAB_from_M[1][2] * blue;
        var z = LAB_from_M[2][0] * red + LAB_from_M[2][1] * green + LAB_from_M[2][2] * blue;

        var XR = 0.95047;
        var YR = 1.00000;
        var ZR = 1.08883;

        var e = 216 / 24389.0;
        var k = 24389 / 27.0;

        var xR = x / XR;
        var yR = y / YR;
        var zR = z / ZR;

        var fx = xR > e ? Math.pow(xR, 1 / 3.0) : (k * xR + 16) / 116.0;
        var fy = yR > e ? Math.pow(yR, 1 / 3.0) : (k * yR + 16) / 116.0;
        var fz = zR > e ? Math.pow(zR, 1 / 3.0) : (k * zR + 16) / 116.0;

        var cieL = 116 * fy - 16;
        var cieA = 500 * (fx - fy);
        var cieB = 200 * (fy - fz);

        return [cieL, cieA, cieB];
	},
	toRGB: function(c) {
		var e = 216 / 24389.0;
		var k = 24389 / 27.0;
		var XR = 0.95047;
		var YR = 1.0;
		var ZR = 1.08883;

		var cieL = c[0];
		var cieA = c[1];
		var cieB = c[2];

		var fy = (cieL + 16) / 116.0;
        var fx = (cieA / 500.0) + fy;
        var fz = fy - cieB / 200.0;

        var xR = Math.pow(fx, 3.0);
        var zR = Math.pow(fz, 3.0);

        xR = (xR > e) ? xR : (116 * fx - 16) / k;
        var yR = (cieL > (k * e)) ? Math.pow((cieL + 16) / 116.0, 3.0) : cieL / k;
        zR = (zR > e) ? zR : (116 * fz - 16) / k;

        var x = xR * XR;
        var y = yR * YR;
        var z = zR * ZR;

        var r = LAB_to_M[0][0] * x + LAB_to_M[0][1] * y + LAB_to_M[0][2] * z;
        var g = LAB_to_M[1][0] * x + LAB_to_M[1][1] * y + LAB_to_M[1][2] * z;
        var b = LAB_to_M[2][0] * x + LAB_to_M[2][1] * y + LAB_to_M[2][2] * z;

        var red = Math.pow(clamp(r), 1.0 / LAB_gamma);
        var green = Math.pow(clamp(g), 1.0 / LAB_gamma);
        var blue = Math.pow(clamp(b), 1.0 / LAB_gamma);

        return [red, green, blue];
	}
};


function PiecewisePolynomial(filename) {
	// First line are the breaks
	// Next lines are the coefficients
	var lines = fs.readFileSync(filename).toString().split('\n');
	if (lines[lines.length-1] === '')
		lines.splice(lines.length-1, 1);
	var order = parseInt(lines[0]);
	var breaks = lines[1].split(',').map(parseFloat);
	lines = lines.slice(2);
	var coefficients = lines.map(function(line) {
		return line.split(',').map(parseFloat);
	});

	this.breaks = breaks;
	this.coefficients = coefficients;
	this.order = order;
};
PiecewisePolynomial.prototype = {
	constructor: PiecewisePolynomial,
	evalAt: function(x) {
		var idx = _.sortedIndex(this.breaks, x) - 1;
		var delta = x - this.breaks[idx];
		var result = 0;
		for (var i = 0; i <= this.order; i++)
			result += this.coefficients[idx][i] * Math.pow(delta, this.order - i);
		return result;
	}
};


var hueRemap = new PiecewisePolynomial(__dirname + '/data/hueRemap.txt');
function deg2rad(x) { return x * Math.PI / 180; }
function rad2deg(x) { return x * 180 / Math.PI; }
var CHSV = {
	fromRGB: function(c) {
		var hsv = HSV.fromRGB(c);
		var remap = deg2rad(360*hueRemap.evalAt(hsv[0]/360));
		return [hsv[1]*Math.cos(remap), -hsv[1]*Math.sin(remap), hsv[2]];
	},
	toRGB: function(c) {
		throw 'toRGB not (yet?) implemented for CHSV color space.';
	}
};

module.exports = {
	RGB: RGB,
	HSV: HSV,
	LAB: LAB,
	CHSV: CHSV
};


