// Extrai os textos posicionados do PDF no próprio navegador: o arquivo não sai do aparelho.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from './tipos';
import { LeitorError } from './tipos';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Caso 2: PDF protegido — pede a senha só para abrir o arquivo agora (não é guardada).
 * `pedirSenha` devolve null se o usuário desistir.
 */
export async function extrairItens(arquivo: File, pedirSenha: (tentativaErrada: boolean) => Promise<string | null>): Promise<TextItem[]> {
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const tarefa = pdfjs.getDocument({ data: dados });
  tarefa.onPassword = async (responder: (s: string) => void, motivo: number) => {
    const senha = await pedirSenha(motivo === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    if (senha == null) tarefa.destroy();
    else responder(senha);
  };
  let doc;
  try {
    doc = await tarefa.promise;
  } catch (e) {
    throw new LeitorError(`Não foi possível abrir o PDF${e instanceof Error && /password/i.test(e.message) ? ' (senha não informada)' : ''}. Use "Colar texto".`);
  }
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
  await doc.destroy();
  if (!itens.length) throw new LeitorError('O PDF não tem texto (parece imagem escaneada). Use "Colar texto".');
  return itens;
}
