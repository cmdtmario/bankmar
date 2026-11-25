// Gera fixture anonimizada (itens de texto posicionados) a partir de um PDF de fatura.
// Uso: node scripts/anonimizar-fixture.mjs fatura.pdf saida.json
// Remove nome, CPF, endereço, linha digitável e códigos de boleto (RNF-09).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

const [, , entrada, saida] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(entrada)), verbosity: 0 }).promise;
const itens = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  for (const it of (await page.getTextContent()).items) {
    if (!it.str || !it.str.trim()) continue;
    itens.push({ p, x: Math.round(it.transform[4]), y: Math.round(vp.height - it.transform[5]), s: it.str });
  }
}
const ENDERECO = /(SQN|SQS|ASA NORTE|BRASILIA DF|BLOCO|BL G|\bAPT\b|MAIORCA|708\d{2}-?\d{3}|^BRASILIA$)/i;
const anon = itens.map((i) => {
  let s = i.s;
  if (/MARIO|ESTEVES/i.test(s)) s = 'TITULAR TESTE';
  else if (ENDERECO.test(s) && !/\d+,\d{2}/.test(s) && !(i.p >= 2 && i.x >= 130)) s = 'ENDERECO REMOVIDO'; // não mexe em lançamentos
  s = s.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '000.000.000-00').replace(/\b\d{11}\b/g, '00000000000');
  s = s.replace(/\d{5}\.\d{5}\s\d{5}\.\d{6}\s\d{5}\.\d{6}\s\d\s\d{14}/g, 'LINHA DIGITAVEL REMOVIDA');
  s = s.replace(/\b\d{40,48}\b/g, 'LINHA DIGITAVEL REMOVIDA');
  s = s.replace(/\b\d{8,}(\/\d+)?\b/g, (m) => '0'.repeat(m.length));
  return { ...i, s };
});
fs.writeFileSync(saida, JSON.stringify(anon));
console.log(`${anon.length} itens -> ${saida}`);
