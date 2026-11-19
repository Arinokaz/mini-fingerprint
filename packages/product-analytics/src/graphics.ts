import type { GraphicsState } from './types.js';

/** Читает только обобщённую graphics-категорию без сохранения GPU-строки. */
export function readGraphics(canvas: HTMLCanvasElement | null): GraphicsState {
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
