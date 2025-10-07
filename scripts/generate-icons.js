// scripts/generate-icons.js  (ESM)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Tunables ----------
const PADDING_TOUCH = 0.12;     // generous safe area for touch/PWA
const PADDING_MASKABLE = 0.16;  // extra safe area for maskable (Android circle/squircle)
const PADDING_FAVICON = 0.04;   // minimal padding for tiny favicons
// Base DPI for SVG rasterization. We will still resize to the target to avoid giant bitmaps.
const BASE_DENSITY = 512;

// Solid background for touch/PWA icons (set to null for transparent)
const APP_BG = { r: 255, g: 255, b: 255, alpha: 1 };

// ---------- Helpers ----------
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function clampPad(p) {
  // keep in [0, 0.49] so inner size stays positive
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 0.49) return 0.49;
  return p;
}

// Parse width/height units to px (96 dpi CSS pixels)
function toPx(value) {
  if (value == null) return null;
  const m = String(value).trim().match(/^(-?\d*\.?\d+)\s*(px|pt|pc|mm|cm|in)?$/i);
  if (!m) return Number(value) || null;
  const num = parseFloat(m[1]);
  const unit = (m[2] || 'px').toLowerCase();
  const DPI = 96;
  switch (unit) {
    case 'px': return num;
    case 'pt': return (num / 72) * DPI;
    case 'pc': return (num * 12 / 72) * DPI;
    case 'mm': return (num / 25.4) * DPI;
    case 'cm': return (num / 2.54) * DPI;
    case 'in': return num * DPI;
    default: return num;
  }
}

function parseSvgMetrics(svgText) {
  const openRe = /<([A-Za-z0-9:_-]+:)?svg\b([^>]*)>/i;
  const m = svgText.match(openRe);
  let width = null, height = null, vb = null;
  if (m) {
    const attrs = m[2] || '';
    const viewBoxMatch = attrs.match(/\bviewBox\s*=\s*"([^"]+)"/i) || attrs.match(/\bviewBox\s*=\s*'([^']+)'/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/\s+|,/).map(parseFloat);
      if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
        vb = { minX: parts[0], minY: parts[1], w: parts[2], h: parts[3] };
      }
    }
    const widthMatch = attrs.match(/\bwidth\s*=\s*"([^"]+)"/i) || attrs.match(/\bwidth\s*=\s*'([^']+)'/i);
    const heightMatch = attrs.match(/\bheight\s*=\s*"([^"]+)"/i) || attrs.match(/\bheight\s*=\s*'([^']+)'/i);
    if (widthMatch) width = toPx(widthMatch[1]);
    if (heightMatch) height = toPx(heightMatch[1]);
  }
  // If width/height missing but viewBox present, use vbox
  if ((!width || !height) && vb) {
    width = width || vb.w;
    height = height || vb.h;
  }
  return { width: Number(width) || null, height: Number(height) || null, viewBox: vb };
}

// Convert namespaced SVG like <ns0:svg>…</ns0:svg> into plain <svg>…</svg>
// Also removes prefixes from element tag names (<ns:rect> → <rect>), keeps attributes as-is.
// Ensures the root <svg> has xmlns="http://www.w3.org/2000/svg".
function descopeSvgNamespaces(svgBuf) {
  let txt = Buffer.isBuffer(svgBuf) ? svgBuf.toString('utf8') : String(svgBuf);

  // Strip XML declaration & doctype (libvips/rsvg can be picky about external entities)
  txt = txt.replace(/^\s*<\?xml[^>]*>\s*/i, '');
  txt = txt.replace(/<!DOCTYPE[^>]*>/gi, '');

  // Force the root tag name to plain "svg" while preserving its attributes.
  // 1) Find opening <...svg ...>
  const rootOpen = /<([A-Za-z0-9._:-]+:)?svg\b([^>]*)>/i;
  const m = rootOpen.exec(txt);
  if (!m) return Buffer.from(txt, 'utf8'); // best effort; upstream slicer may still help
  const rootAttrs = m[2] || '';
  const startIdx = m.index;
  // 2) Find matching closing </...svg>
  const prefix = m[1] || '';
  const closeTag = new RegExp(`<\\/${prefix ? prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : ''}svg\\s*>`, 'i');
  const lower = txt.toLowerCase();
  const closeMatchIndex = lower.search(closeTag);
  const endIdx = closeMatchIndex >= 0 ? (closeMatchIndex + lower.slice(closeMatchIndex).match(closeTag)[0].length) : txt.length;
  // 3) Slice the SVG region and de-scope all element tag prefixes (but keep attributes)
  let svgRegion = txt.slice(startIdx, endIdx);
  // Replace start tag name
  svgRegion = svgRegion.replace(rootOpen, (_all, _pfx, attrs) => `<svg${attrs || ''}>`);
  // De-scope closing root tag
  svgRegion = svgRegion.replace(closeTag, `</svg>`);
  // De-scope *element* tag prefixes: <ns:tag ...> → <tag ...> and </ns:tag> → </tag>
  svgRegion = svgRegion
    .replace(/<\s*([A-Za-z0-9._:-]+):([A-Za-z0-9._:-]+)(\s|>)/g, '<$2$3')
    .replace(/<\s*\/\s*([A-Za-z0-9._:-]+):([A-Za-z0-9._:-]+)\s*>/g, '</$2>');
  // Ensure default SVG namespace on root
  if (!/\sxmlns\s*=/.test(svgRegion)) {
    svgRegion = svgRegion.replace(/<svg\b(?![^>]*\sxmlns=)/i, '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  return Buffer.from(svgRegion, 'utf8');
}

// Aggressive SVG sanitizer for librsvg/libvips compatibility
function sanitizeSvg(svgBuf) {
  let svg = Buffer.isBuffer(svgBuf) ? svgBuf.toString('utf8') : String(svgBuf);
  // Drop XML decl/doctype again (belt & suspenders)
  svg = svg.replace(/^\s*<\?xml[^>]*>\s*/i, '');
  svg = svg.replace(/<!DOCTYPE[^>]*>/gi, '');
  // Remove known noisy/foreign blocks (inkscape/CC/RDF/etc.)
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  svg = svg.replace(/<defs>\s*<\/defs>/gi, '<defs/>');
  svg = svg.replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '');
  svg = svg.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, '');
  svg = svg.replace(/<cc:[^>]*>[\s\S]*?<\/cc:[^>]*>/gi, '');
  svg = svg.replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/gi, '');
  // Ensure root <svg ...> has xmlns
  if (!/\sxmlns\s*=/.test(svg)) {
    svg = svg.replace(/<svg\b(?![^>]*\sxmlns=)/i, '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  // Ensure xlink namespace if xlink is used; convert to href where possible
  if (/\bxlink:href=/.test(svg) && !/\sxmlns:xlink=/.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  svg = svg.replace(/\bxlink:href=/g, 'href=');
  // Drop external <image href="http://…"> or file refs; allow only data: or internal
  svg = svg.replace(
    /<image\b([^>]*?)>/gi,
    (m, attrs) => /\bhref\s*=\s*"(data:|#)/i.test(attrs) ? `<image${attrs}>` : '<!-- image removed -->'
  );
  // Replace context-fill/stroke with currentColor, then set color=black on root
  svg = svg.replace(/\bcontext-(fill|stroke)\b/gi, 'currentColor');
  if (!/\bcolor\s*=/.test(svg)) {
    svg = svg.replace(/<svg\b([^>]*)>/i, (_a, attrs) => `<svg${attrs} color="#000">`);
  }
  // Remove url(#filter) / complex filters (keeps simple fills/strokes). This is conservative:
  svg = svg.replace(/\bfilter\s*=\s*"url\(#.+?\)"/gi, '');
  // Remove CSS @import; inline styles remain
  svg = svg.replace(/@import\s+url\([^)]*\)\s*;?/gi, '');
  // Normalize self-closing tags spacing
  svg = svg.replace(/\s+\/>/g, '/>');
  return Buffer.from(svg, 'utf8');
}

function normalizeSvgBuffer(buf, { debugLabel = '' } = {}) {
  let raw = buf;
  // If gzipped (SVGZ), gunzip it
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (isGzip) {
    raw = zlib.gunzipSync(buf);
  }
  // Detect UTF-16 (lots of NUL bytes) and transcode; otherwise assume UTF-8
  const looksUtf16le = raw.length > 2 && raw[0] === 0xFF && raw[1] === 0xFE;
  const looksUtf16be = raw.length > 2 && raw[0] === 0xFE && raw[1] === 0xFF;
  const hasManyNulls = !looksUtf16le && !looksUtf16be && raw.slice(0, 64).includes(0x00);
  let txt = looksUtf16le
    ? raw.toString('utf16le')
    : looksUtf16be
      ? raw.swap16().toString('utf16le') // convert BE → LE
      : raw.toString('utf8');
  txt = txt.replace(/^\uFEFF/, ''); // strip BOM char if present
  /// Extract the <svg>…</svg> slice (namespaced roots supported) using matched prefix
  const openRe = /<([A-Za-z0-9._:-]+:)?svg\b[^>]*>/i;
  const openMatch = openRe.exec(txt);
  if (openMatch) {
    const prefix = openMatch[1] || '';
    const closeTag = `</${prefix || ''}svg>`;
    const lower = txt.toLowerCase();
    const end = lower.lastIndexOf(closeTag.toLowerCase());
    const sliceEnd = end >= 0 ? end + closeTag.length : txt.length;
    const sliced = txt.slice(openMatch.index, sliceEnd);
    return Buffer.from(sliced, 'utf8');
  }
  // No <svg> tag found — return raw and let sharp attempt to parse
  if (debugLabel) {
    const head = txt.slice(0, 200).replace(/\s+/g, ' ');
    console.warn(`[normalizeSvgBuffer] No <svg> found for ${debugLabel}. Head: ${head}`);
  }
  return raw;
}

// Simple magic-number sniffing for common raster/container types
function sniffFormat(buf) {
  if (buf.length < 12) return 'unknown';
  const b = buf;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
  // GIF87a/GIF89a
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  // RIFF WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  // ISO BMFF (AVIF/HEIF) – 'ftyp' at byte 4; heuristic only
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'aviflike';
  // PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  // XML-ish
  if (String.fromCharCode(b[0], b[1], b[2], b[3]).includes('<?xm')) return 'xml';
  return 'unknown';
}

async function safeRasterizeSvg(svgBuf, targetPx, { debugBase = null } = {}) {
  // Keep original raw around for raster fallback
  const raw = svgBuf;
  const cleaned = normalizeSvgBuffer(svgBuf, { debugLabel: debugBase ?? 'svg' });
  // Optional debug: write normalized/sliced svg
  if (debugBase) {
    await fs.writeFile(`${debugBase}__cleaned.svg`, cleaned);
  }
  // Prepare descoped & sanitized variants UP FRONT so we always have artifacts
  const descoped = descopeSvgNamespaces(cleaned);
  const sanitized = sanitizeSvg(descoped);
  if (debugBase) {
    await fs.writeFile(`${debugBase}__cleaned_descoped.svg`, descoped);
    await fs.writeFile(`${debugBase}__cleaned_descoped_sanitized.svg`, sanitized);
  }

  // Extract metrics for logging (best-effort; not required) from the best candidate we’ll try first
  const txt = sanitized.toString('utf8');
  const metrics = parseSvgMetrics(txt);

  let raster;
  try {
    // Try sanitized first (most compatible), then fallback to descoped, then raw cleaned
    let vector = sharp(sanitized, { density: BASE_DENSITY, limitInputPixels: false });
    raster = await vector
      .resize(Math.max(1, Math.round(targetPx)), Math.max(1, Math.round(targetPx)), {
        fit: 'inside',
        withoutEnlargement: true
      })
      .ensureAlpha()
      .toColorspace('srgb')
      .png()
      .toBuffer();
  } catch (e) {
    // Second-chance vector attempt after de-scoping namespaces
    try {
      const descoped = descopeSvgNamespaces(cleaned);
      if (debugBase) await fs.writeFile(`${debugBase}__cleaned_descoped.svg`, descoped);
      const vector2 = sharp(descoped, { density: BASE_DENSITY, limitInputPixels: false });
      raster = await vector2
        .resize(Math.max(1, Math.round(targetPx)), Math.max(1, Math.round(targetPx)), {
          fit: 'inside',
          withoutEnlargement: true
        })
        .ensureAlpha()
        .toColorspace('srgb')
        .png()
        .toBuffer();
    } catch (e2) {
      // Third-chance: aggressive sanitize on top of descoped
      try {
        const descoped = descopeSvgNamespaces(cleaned);
        const sanitized = sanitizeSvg(descoped);
        if (debugBase) await fs.writeFile(`${debugBase}__cleaned_descoped_sanitized.svg`, sanitized);
        const vector3 = sharp(sanitized, { density: BASE_DENSITY, limitInputPixels: false });
        raster = await vector3
          .resize(Math.max(1, Math.round(targetPx)), Math.max(1, Math.round(targetPx)), {
            fit: 'inside',
            withoutEnlargement: true
          })
          .ensureAlpha()
          .toColorspace('srgb')
          .png()
          .toBuffer();
      } catch (e3) {
      // Fallback: treat input as a raster image already (PNG/JPEG/etc.)
      console.warn('[safeRasterizeSvg] Vector render failed, attempting raster fallback:', e1?.message || e1);
      console.warn('[safeRasterizeSvg] Second-chance (descoped) failed:', e2?.message || e2);
      console.warn('[safeRasterizeSvg] Third-chance (sanitized) failed:', e3?.message || e3);
      // Use RAW bytes for sniff & fallback, not the cleaned XML text.
      const fmt = sniffFormat(raw);
      if (debugBase) {
        await fs.writeFile(`${debugBase}__fallback_input.bin`, raw);
        console.log(`[debug] raster-fallback input format ~ ${fmt}`);
      }
      if (fmt === 'pdf') {
        throw new Error('Source appears to be PDF; libvips may lack PDF support on this platform. Convert to SVG/PNG first.');
      }
      raster = await sharp(raw, { limitInputPixels: false })
        .resize(Math.max(1, Math.round(targetPx)), Math.max(1, Math.round(targetPx)), {
          fit: 'inside',
          withoutEnlargement: true
        })
        .ensureAlpha()
        .toColorspace('srgb')
        .png()
        .toBuffer();
      }
    }
    // Use RAW bytes for sniff & fallback, not the cleaned XML text.
    const fmt = sniffFormat(raw);
    if (debugBase) {
      await fs.writeFile(`${debugBase}__fallback_input.bin`, raw);
      console.log(`[debug] raster-fallback input format ~ ${fmt}`);
    }
    if (fmt === 'pdf') {
      throw new Error('Source appears to be PDF; libvips may lack PDF support on this platform. Convert to SVG/PNG first.');
    }
    raster = await sharp(raw, { limitInputPixels: false })
      .resize(Math.max(1, Math.round(targetPx)), Math.max(1, Math.round(targetPx)), {
        fit: 'inside',
        withoutEnlargement: true
      })
      .ensureAlpha()
      .toColorspace('srgb')
      .png()
      .toBuffer();
  }

  if (!raster || !raster.length) {
    throw new Error('Rasterization produced an empty buffer');
  }
  if (debugBase) {
    const rMeta = await sharp(raster).metadata().catch(() => ({}));
    console.log(
      `[debug] viewBox=%s | width=%s height=%s | raster=%sx%s (BASE_DENSITY=%d, targetPx=%d)`,
      metrics.viewBox ? `${metrics.viewBox.minX},${metrics.viewBox.minY},${metrics.viewBox.w},${metrics.viewBox.h}` : 'n/a',
      metrics.width ?? 'n/a',
      metrics.height ?? 'n/a',
      rMeta.width ?? '?',
      rMeta.height ?? '?',
      BASE_DENSITY,
      targetPx
    );
    await fs.writeFile(`${debugBase}__raster.png`, raster);
  }
  return raster;
}

/**
 * Rasterize SVG → auto-crop transparent margins → apply explicit padding → export PNG.
 */
async function svgToPngPadded(svgPath, outPath, size, { pad = 0, bg = null, debug = false } = {}) {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`Invalid target size: ${size}`);
  }
  const padClamped = clampPad(pad);

  /// 0) Load SVG
  const svgBuf = await fs.readFile(svgPath);
  const debugBase = debug ? path.join(path.dirname(outPath), `__debug_${path.basename(outPath, path.extname(outPath))}`) : null;

  // Determine inner target pixels (content box before padding) and render vector close to that.
  const innerTarget = Math.max(1, Math.round(size * (1 - clampPad(pad) * 2)));

  // 1) Rasterize vector → pixel at (≈) inner target to avoid enormous intermediates.
  const raster = await safeRasterizeSvg(svgBuf, innerTarget, { debugBase });

  // 2) Trim transparent borders on the raster buffer; if it fails, keep raster
  let trimmed;
  try {
    trimmed = await sharp(raster).trim({ threshold: 10 }).ensureAlpha().toColorspace('srgb').png().toBuffer();
  } catch {
    trimmed = raster;
  }
  if (debugBase) {
    await fs.writeFile(`${debugBase}__trimmed.png`, trimmed);
  }

  // 3) Compute inner box and compose into a square canvas with optional bg
  let inner = Math.round(size * (1 - padClamped * 2));
  if (!Number.isFinite(inner) || inner < 1) inner = 1;
  const inset = Math.round(size * padClamped);

  let glyph = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', withoutEnlargement: false })
    .ensureAlpha()
    .toColorspace('srgb')
    .png({ compressionLevel: 9 }) // avoid palette at this stage for max compatibility
    .toBuffer();
  if (!glyph || !glyph.length) glyph = trimmed; // safety fallback

  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const outBuf = await canvas
    .composite([{ input: glyph, top: inset, left: inset }])
    .png({ compressionLevel: 9 }) // final encode; palette optional
    .toBuffer();

  await fs.writeFile(outPath, outBuf);
  return outPath;
}

/**
 * generateIcons
 * @param {string} svgSource - full logo/mark SVG
 * @param {string} outDir - output directory (typically "public")
 * @param {string|null} microSource - optional simplified SVG for tiny .ico sizes
 */
async function generateIcons(svgSource, outDir, microSource = null, { debug = false } = {}) {
  const src = path.resolve(svgSource);
  const micro = microSource ? path.resolve(microSource) : src;
  const out = path.resolve(outDir);
  await ensureDir(out);

  // Touch + PWA (background + padding)
  await svgToPngPadded(src, path.join(out, 'apple-touch-icon.png'), 180, { pad: PADDING_TOUCH, bg: APP_BG, debug });
  await svgToPngPadded(src, path.join(out, 'icon-192.png'), 192, { pad: PADDING_TOUCH, bg: APP_BG, debug });
  await svgToPngPadded(src, path.join(out, 'icon-512.png'), 512, { pad: PADDING_TOUCH, bg: APP_BG, debug });

  // Maskable icons (Android)
  await svgToPngPadded(src, path.join(out, 'maskable-icon-192.png'), 192, { pad: PADDING_MASKABLE, bg: APP_BG, debug });
  await svgToPngPadded(src, path.join(out, 'maskable-icon-512.png'), 512, { pad: PADDING_MASKABLE, bg: APP_BG, debug });

  // favicon.ico (transparent, tiny padding; use micro mark if provided)
  const fav16 = path.join(out, 'favicon-16.png');
  const fav32 = path.join(out, 'favicon-32.png');
  const fav48 = path.join(out, 'favicon-48.png');
  await svgToPngPadded(micro, fav16, 16, { pad: PADDING_FAVICON, bg: null, debug });
  await svgToPngPadded(micro, fav32, 32, { pad: PADDING_FAVICON, bg: null, debug });
  await svgToPngPadded(micro, fav48, 48, { pad: PADDING_FAVICON, bg: null, debug });
  const icoBuf = await pngToIco([fav16, fav32, fav48]);
  await fs.writeFile(path.join(out, 'favicon.ico'), icoBuf);

  // Modern SVG favicon (crisp in most browsers)
  await fs.copyFile(src, path.join(out, 'favicon.svg'));

  return [
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'maskable-icon-192.png',
    'maskable-icon-512.png',
    'favicon.ico',
    'favicon.svg',
  ].map(f => path.join(out, f));
}

async function main() {
  // Usage: node scripts/generate-icons.js <mark.svg> <outDir> [micro.svg]
  const args = process.argv.slice(2);
  const debug = args.includes('--debug');
  const filtered = args.filter(a => a !== '--debug');
  const [svgSource, outDir, microSource] = filtered;
  if (!svgSource || !outDir) {
    console.error('Usage: node scripts/generate-icons.js <path-to-logo-mark.svg> <outDir> [micro.svg]');
    process.exit(1);
  }
  try {
    const created = await generateIcons(svgSource, outDir, microSource ?? null, { debug });
    console.log('Generated:\n' + created.map(p => '  • ' + p).join('\n'));

    if (debug) {
      console.log('\n[debug] Rasterization BASE_DENSITY=%d (resize-to-target enabled; limitInputPixels: false)', BASE_DENSITY);
    }
  } catch (err) {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  }
}

main();
