/** Detecção síncrona de WebGL sem importar three.js — permite que a UI escolha
 *  a carta plana antes de baixar o pacote do globo. */
export function supportsWebGL(): boolean {
  // jsdom e navegadores muito antigos não definem as classes de contexto.
  if (typeof WebGLRenderingContext === 'undefined' && typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
