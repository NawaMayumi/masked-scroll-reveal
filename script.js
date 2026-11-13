(() => {
  const shell = document.getElementById('shell');
  const hole = document.getElementById('hole');
  const wordmark = document.getElementById('wordmark');
  const ribbon = document.getElementById('ribbon');
  const maskFrame = document.getElementById('maskFrame');

  // reference proportions, measured directly off the 1440x900 source
  // video (pixel bounding boxes of the logo / capsule)
  const LINE_W = 925 / 1440;
  const LINE_H = 12 / 900;
  const CAP_W = 1390 / 1440;
  const CAP_H = 475 / 900;
  // the wordmark's own glyph ink, measured off the same reference frame
  // (NOT the same as its CSS font-size — cap-height is only part of that)
  const GLYPH_H_OF_HOLE = 385 / 475;
  const GLYPH_W_OF_HOLE = 1200 / 1390;

  // the ribbon is 3x the mask-frame's own height (one "zone's worth"
  // per colour, roughly) — a ratio, not a fixed vh, so it stays
  // correct no matter what aspect-ratio the mask-frame itself uses
  const RIBBON_TO_FRAME = 3;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (p, start, end) => clamp01((p - start) / (end - start));

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let frameH = 0;

  // --- measure the wordmark font's actual ink metrics once (canvas),
  // so we can hit a real target glyph size instead of guessing a
  // font-size and hoping the rendered letters come out that tall ---
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const WORDMARK_FONT = "800 100px 'Helvetica Neue', Arial, 'Hiragino Sans', sans-serif";
  let glyphWidthPer100, glyphHeightPer100;
  function measureWordmarkFont() {
    mctx.font = WORDMARK_FONT;
    const m = mctx.measureText(wordmark.textContent);
    glyphWidthPer100 = m.width;
    glyphHeightPer100 =
      (m.actualBoundingBoxAscent || 72) + (m.actualBoundingBoxDescent || 2);
  }
  measureWordmarkFont();

  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    frameH = maskFrame.getBoundingClientRect().height;
    ribbon.style.height = (frameH * RIBBON_TO_FRAME) + 'px';
  }
  window.addEventListener('resize', resize);

  // the mask's own filter does two separate jobs, both driven by the
  // real face data, and both absent from the content itself (which
  // stays flat — see .ribbon-zone):
  //   1. feDisplacementMap bends whatever is passing by where it
  //      crosses a bump (brow/nose/cheek/mouth) — geometry only.
  //   2. feDiffuseLighting + feSpecularLighting computes REAL light
  //      and shadow from the height map (via luminanceToAlpha, since
  //      the lighting primitives read surface height from the alpha
  //      channel) and multiplies/screens it onto the bent content.
  // applied to .mask-frame, which never moves — so both the warp and
  // the lighting sit at fixed screen positions; it's the scrolling
  // content underneath that keeps changing.
  const svgNS = 'http://www.w3.org/2000/svg';
  const xlinkNS = 'http://www.w3.org/1999/xlink';
  const filter = document.getElementById('faceRelief');

  function setHref(el, href) {
    el.setAttributeNS(xlinkNS, 'xlink:href', href);
    el.setAttribute('href', href);
  }

  // same pixel-aligned crop box, two derived maps: a slope map (for
  // the geometric bend) and the plain height map (for lighting)
  const slopeHref = 'assets/face-gradient-normal-aligned.jpg';
  const heightHref = 'assets/face-height-aligned.jpg';

  // --- 1. geometric bend ---
  const feSlope = document.createElementNS(svgNS, 'feImage');
  feSlope.setAttribute('result', 'slope');
  feSlope.setAttribute('preserveAspectRatio', 'none');
  feSlope.setAttribute('x', '-0.03');
  feSlope.setAttribute('y', '-0.03');
  feSlope.setAttribute('width', '1.06');
  feSlope.setAttribute('height', '1.06');
  setHref(feSlope, slopeHref);
  filter.appendChild(feSlope);

  const feSlopeBlur = document.createElementNS(svgNS, 'feGaussianBlur');
  feSlopeBlur.setAttribute('in', 'slope');
  feSlopeBlur.setAttribute('stdDeviation', '0.006');
  feSlopeBlur.setAttribute('result', 'slopeBlur');
  filter.appendChild(feSlopeBlur);

  const feDisplace = document.createElementNS(svgNS, 'feDisplacementMap');
  feDisplace.setAttribute('in', 'SourceGraphic');
  feDisplace.setAttribute('in2', 'slopeBlur');
  feDisplace.setAttribute('scale', '0.11');
  feDisplace.setAttribute('xChannelSelector', 'R');
  feDisplace.setAttribute('yChannelSelector', 'G');
  feDisplace.setAttribute('result', 'displaced');
  filter.appendChild(feDisplace);

  // --- 2. real lighting from the height map ---
  const feHeight = document.createElementNS(svgNS, 'feImage');
  feHeight.setAttribute('result', 'heightImg');
  feHeight.setAttribute('preserveAspectRatio', 'none');
  feHeight.setAttribute('x', '-0.03');
  feHeight.setAttribute('y', '-0.03');
  feHeight.setAttribute('width', '1.06');
  feHeight.setAttribute('height', '1.06');
  setHref(feHeight, heightHref);
  filter.appendChild(feHeight);

  const feHeightBlur = document.createElementNS(svgNS, 'feGaussianBlur');
  feHeightBlur.setAttribute('in', 'heightImg');
  feHeightBlur.setAttribute('stdDeviation', '0.003');
  feHeightBlur.setAttribute('result', 'heightBlur');
  filter.appendChild(feHeightBlur);

  // feDiffuseLighting/feSpecularLighting read surface height from the
  // ALPHA channel, not RGB — luminanceToAlpha moves the grayscale
  // height value there (this is the standard SVG bump-map technique)
  const feLumAlpha = document.createElementNS(svgNS, 'feColorMatrix');
  feLumAlpha.setAttribute('in', 'heightBlur');
  feLumAlpha.setAttribute('type', 'luminanceToAlpha');
  feLumAlpha.setAttribute('result', 'heightAlpha');
  filter.appendChild(feLumAlpha);

  const SURFACE_SCALE = 18;

  const feDiffuse = document.createElementNS(svgNS, 'feDiffuseLighting');
  feDiffuse.setAttribute('in', 'heightAlpha');
  feDiffuse.setAttribute('surfaceScale', String(SURFACE_SCALE));
  feDiffuse.setAttribute('diffuseConstant', '1.15');
  feDiffuse.setAttribute('lighting-color', '#ffffff');
  feDiffuse.setAttribute('result', 'diffuse');
  const feDiffuseLight = document.createElementNS(svgNS, 'feDistantLight');
  feDiffuseLight.setAttribute('azimuth', '235');
  feDiffuseLight.setAttribute('elevation', '48');
  feDiffuse.appendChild(feDiffuseLight);
  filter.appendChild(feDiffuse);

  const feSpecular = document.createElementNS(svgNS, 'feSpecularLighting');
  feSpecular.setAttribute('in', 'heightAlpha');
  feSpecular.setAttribute('surfaceScale', String(SURFACE_SCALE));
  feSpecular.setAttribute('specularConstant', '0.55');
  feSpecular.setAttribute('specularExponent', '14');
  feSpecular.setAttribute('lighting-color', '#ffffff');
  feSpecular.setAttribute('result', 'specular');
  const feSpecularLight = document.createElementNS(svgNS, 'feDistantLight');
  feSpecularLight.setAttribute('azimuth', '235');
  feSpecularLight.setAttribute('elevation', '48');
  feSpecular.appendChild(feSpecularLight);
  filter.appendChild(feSpecular);

  // multiply the diffuse light/shadow onto the bent content, then add
  // the specular highlight on top (screen) — the content supplies
  // only colour, the mask supplies all of the light. feComposite
  // operator="arithmetic" is used instead of feBlend: feBlend's
  // multiply/screen modes produced near-transparent, washed-out
  // output with these lighting-primitive inputs in testing, while the
  // arithmetic formula (k1*i1*i2 + k2*i1 + k3*i2 + k4) reproduces the
  // same math reliably.
  const feShade = document.createElementNS(svgNS, 'feComposite');
  feShade.setAttribute('in', 'displaced');
  feShade.setAttribute('in2', 'diffuse');
  feShade.setAttribute('operator', 'arithmetic');
  feShade.setAttribute('k1', '1'); feShade.setAttribute('k2', '0');
  feShade.setAttribute('k3', '0'); feShade.setAttribute('k4', '0');
  feShade.setAttribute('result', 'shaded');
  filter.appendChild(feShade);

  const feFinal = document.createElementNS(svgNS, 'feComposite');
  feFinal.setAttribute('in', 'shaded');
  feFinal.setAttribute('in2', 'specular');
  feFinal.setAttribute('operator', 'arithmetic');
  // screen(a,b) = a + b - a*b
  feFinal.setAttribute('k1', '-1'); feFinal.setAttribute('k2', '1');
  feFinal.setAttribute('k3', '1'); feFinal.setAttribute('k4', '0');
  feFinal.setAttribute('result', 'lit');
  filter.appendChild(feFinal);

  // the lighting/specular layers are opaque everywhere, including
  // where the ribbon hasn't scrolled into view yet — without this,
  // a faint "ghost" of the lit face shows over the bare logo even
  // before any content is behind the mask. operator="in" clips the
  // lit result back down to wherever the actual content has alpha.
  const feMask = document.createElementNS(svgNS, 'feComposite');
  feMask.setAttribute('in', 'lit');
  feMask.setAttribute('in2', 'displaced');
  feMask.setAttribute('operator', 'in');
  filter.appendChild(feMask);

  function render() {
    const doc = document.documentElement;
    const maxScroll = doc.scrollHeight - window.innerHeight;
    const p = maxScroll > 0 ? clamp01(window.scrollY / maxScroll) : 0;

    // --- 1. the line unrolls into the capsule, then the inside opens,
    // revealing the (already full-size) wordmark sitting inside it ---
    const shellT = ease(p, 0.0, 0.14);
    const holeT = ease(p, 0.035, 0.19);

    const shellW = lerp(LINE_W, CAP_W, shellT) * vw;
    const shellH = lerp(LINE_H, CAP_H, shellT) * vh;
    shell.style.width = shellW + 'px';
    shell.style.height = shellH + 'px';
    shell.style.borderRadius = (shellH / 2) + 'px';

    const outline = Math.max(3, vw * 0.0035);
    const holeWsize = holeT * Math.max(0, shellW - outline * 2);
    const holeHsize = holeT * Math.max(0, shellH - outline * 2);
    hole.style.width = holeWsize + 'px';
    hole.style.height = holeHsize + 'px';
    hole.style.borderRadius = (holeHsize / 2) + 'px';

    // size the wordmark so its actual glyph ink (measured via canvas,
    // not assumed from font-size) fills the target fraction of the
    // FINAL capsule — it's revealed by the growing clip, not scaled in
    const finalHoleH = CAP_H * vh - outline * 2;
    const finalHoleW = CAP_W * vw - outline * 2;
    const targetGlyphH = finalHoleH * GLYPH_H_OF_HOLE;
    const targetGlyphW = finalHoleW * GLYPH_W_OF_HOLE;
    const fontSizeForHeight = (targetGlyphH / glyphHeightPer100) * 100;
    const fontSizeForWidth = (targetGlyphW / glyphWidthPer100) * 100;
    wordmark.style.fontSize = Math.min(fontSizeForHeight, fontSizeForWidth) + 'px';

    // --- 2. the mask never moves. the ribbon (the image/text) scrolls
    // straight up behind it as you scroll down, entering from below
    // the mask's fixed window and exiting above it ---
    const stripStart = 0.08;
    const stripEnd = 0.95;
    const stripT = ease(p, stripStart, stripEnd);
    const ribbonH = frameH * RIBBON_TO_FRAME;
    const travel = frameH + ribbonH; // px: fully below the mask -> fully above it
    const translatePx = frameH - stripT * travel;
    ribbon.style.transform = `translateY(${translatePx}px)`;
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  resize();
  render();
  requestAnimationFrame(loop);
})();
