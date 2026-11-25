// RF-39: PDF do resumo por pessoa, nomeado resumo-<pessoa>-<aaaa-mm>.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { agruparPorMarcador, rotuloParcela, type ItemPessoa } from './resumo';
import { brl, dataBR, somaCentavos } from './formato';

export function gerarPdfResumo(p: { pessoa: string; periodo: string; competencia: string; itens: ItemPessoa[]; recebido: number; pix: string | null }) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Resumo — ${p.pessoa}`, 14, 18);
  doc.setFontSize(10);
  doc.text(p.periodo, 14, 25);
  let y = 30;
  for (const g of agruparPorMarcador(p.itens)) {
    autoTable(doc, {
      startY: y,
      head: [[g.marcador ?? 'Pessoal', '', '', '']],
      body: g.itens.map((i) => [dataBR(i.data), i.descricao + rotuloParcela(i), i.cartao ?? 'conta', brl(i.valor)]),
      foot: [['', 'Subtotal', '', brl(g.subtotal)]],
      styles: { fontSize: 9 },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  const total = somaCentavos(p.itens.map((i) => i.valor));
  doc.setFontSize(11);
  doc.text(`Total: ${brl(total)}`, 14, y + 4);
  if (p.recebido) {
    doc.text(`Já recebido: ${brl(p.recebido)}`, 14, y + 10);
    doc.text(`A pagar: ${brl(somaCentavos([total, -p.recebido]))}`, 14, y + 16);
  }
  if (p.pix) doc.text(`Pix: ${p.pix}`, 14, y + 24);
  const slug = p.pessoa.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`resumo-${slug}-${p.competencia.slice(0, 7)}.pdf`);
}
