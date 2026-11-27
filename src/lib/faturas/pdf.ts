// Extrai os textos posicionados do PDF no próprio navegador: o arquivo não sai do aparelho.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from './tipos';
import { LeitorError } from './tipos';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Caso 2 (revisto em 27/11/2026): PDF protegido — tenta primeiro as senhas guardadas neste aparelho;
 * se nenhuma servir, pede ao usuário. `pedirSenha` devolve null se ele desistir.
 * `senhaDigitada` recebe a senha que o usuário digitou e abriu o arquivo (para oferecer guardar).
 */
export async function extrairItens(arquivo: File, pedirSenha: (tentativaErrada: boolean) => Promise<string | null>, senhasSalvas: string[] = [], senhaDigitada?: (s: string) => void): Promise<TextItem[]> {
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const tarefa = pdfjs.getDocument({ data: dados });
  const fila = [...senhasSalvas];
  let ultimaDigitada: string | null = null;
  let errouDigitada = false;
  tarefa.onPassword = async (responder: (s: string) => void, motivo: number) => {
    if (fila.length) { responder(fila.shift()!); return; }
    errouDigitada = ultimaDigitada != null && motivo === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    const senha = await pedirSenha(errouDigitada);
    if (senha == null) tarefa.destroy();
    else { ultimaDigitada = senha; responder(senha); }
  };
  let doc;
  try {
    doc = await tarefa.promise;
  } catch (e) {
    throw new LeitorError(`Não foi possível abrir o PDF${e instanceof Error && /password/i.test(e.message) ? ' (senha não informada)' : ''}. Use "Colar texto".`);
  }
  if (ultimaDigitada) senhaDigitada?.(ultimaDigitada);
  const itens: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      itens.push({ p, x: Math.round(it.transform[4]), y: Math.round(vp.height - it.transform[5]), s: it.str });
    }
  }
  await tarefa.destroy();
  if (!itens.length) throw new LeitorError('O PDF não tem texto (parece imagem escaneada). Use "Colar texto".');
  return itens;
}
