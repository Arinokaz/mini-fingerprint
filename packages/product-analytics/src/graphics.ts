import type { GraphicsState } from './types.js';

/** Читает только обобщённую graphics-категорию без сохранения GPU-строки. */
export function readGraphics(canvas: HTMLCanvasElement | null): GraphicsState {
  canvas = probeCanvas(canvas);
  if (canvas === null) {
    return 3;
  }
  let context: WebGLRenderingContext | null;
  try {
    context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  } catch {
    return 3;
  }
  if (context === null) {
    return 3;
  }
  try {
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    if (extension === null) {
      return 0;
    }
    const renderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    if (typeof renderer !== 'string' || renderer.trim() === '' || isGenericRenderer(renderer)) {
      return 0;
    }
    return /swiftshader|llvmpipe|softpipe|software/i.test(renderer) ? 2 : 1;
  } catch {
    return 0;
  }
}

/** Не позволяет принять стандартную masked-строку за сведения об устройстве. */
function isGenericRenderer(renderer: string): boolean {
  return /^(?:webkit webgl|mozilla|apple|generic|unknown|masked|webgl)$/i.test(renderer.trim());
}

/** Возвращает существующий canvas либо временный canvas в текущем document. */
function probeCanvas(canvas: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (canvas !== null) return canvas;
  try {
    return globalThis.document?.createElement('canvas') ?? null;
  } catch {
    return null;
  }
}

/** Проверяет WebGL и Canvas2D независимо, не переключая тип одного context. */
export function readCanvasCapabilities(canvas: HTMLCanvasElement | null): {
  webgl: boolean;
  canvas2d: boolean;
} {
  const source = probeCanvas(canvas);
  let webgl = false;
  let canvas2d = false;
  try {
    webgl = (source?.getContext('webgl2') ?? source?.getContext('webgl')) !== null && source !== null;
  } catch {
    webgl = false;
  }

  try {
    const document = source?.ownerDocument ?? globalThis.document;
    const separate = document?.createElement('canvas') ?? source;
    canvas2d = separate?.getContext('2d') !== null && separate !== null;
  } catch {
    canvas2d = false;
  }
  return { webgl, canvas2d };
}
