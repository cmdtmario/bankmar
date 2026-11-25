// Leitor de faturas Itaú (RF-20/RF-21). Atende todos os cartões com o layout Itaú.
// RF-21a: só extrai vencimento, total, final do cartão e lançamentos — nome, CPF,
// endereço, linha digitável e limites são ignorados.
import { parseValorBR, isoDeBR, somaCentavos } from '../formato';
import { inferirData, separarParcela, mesmaLinha, RE_DDMM, RE_FINAL_CARTAO } from './comum';
import { LeitorError, type FaturaLida, type LinhaFatura, type TextItem } from './tipos';

const SECOES_INCLUIR = [/^Lançamentos: compras e saques/i, /^Lançamentos: produtos e serviços/i, /^Lançamentos internacionais/i, /^Lançamentos no cartão/i];
const SECOES_PULAR = [/^Pagamentos efetuados/i, /^Compras parceladas/i, /^Total dos lançamentos/i, /^Limites de crédito/i, /^Encargos cobrados/i, /^Próxima fatura/i];
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

export function pareceItau(itens: TextItem[]): boolean {
  const txt = itens.slice(0, 400).map((i) => i.s).join(' ');
  return /Ita[uú]/i.test(txt) && itens.some((i) => /^Lançamentos: compras e saques/i.test(i.s));
}

function valorAoLado(itens: TextItem[], rotulo: RegExp): number | null {
  const r = itens.find((i) => rotulo.test(i.s.trim()));
  if (!r) return null;
  const vals = mesmaLinha(itens, r)
    .filter((i) => i.x > r.x)
    .map((i) => parseValorBR(i.s))
    .filter((v): v is number => v != null);
  return vals.length ? vals[vals.length - 1] : null;
}

export function lerItau(itens: TextItem[]): FaturaLida {
  if (!pareceItau(itens)) throw new LeitorError('O leitor do Itaú não reconheceu este PDF.');

  const vencItem = itens.find((i) => /^Vencimento:\s*\d{2}\/\d{2}\/\d{4}/.test(i.s));
  const vencimento = vencItem ? isoDeBR(vencItem.s.replace(/^Vencimento:\s*/, '')) : null;
  if (!vencimento) throw new LeitorError('O leitor do Itaú não encontrou o vencimento neste PDF.');
  const finalItem = itens.find((i) => RE_FINAL_CARTAO.test(i.s));
  const final4 = finalItem ? finalItem.s.match(RE_FINAL_CARTAO)![1] : null;

  const lancAtuais = valorAoLado(itens.filter((i) => i.p === 1), /^Lançamentos atuais$/);
  const totalFatura = valorAoLado(itens.filter((i) => i.p === 1), /^Total desta fatura$/);
  const totalEsperado = lancAtuais ?? totalFatura;

  // Colunas por página: cada cabeçalho "DATA" inicia uma coluna.
  const linhas: LinhaFatura[] = [];
  let incluir = false;
  const paginas = [...new Set(itens.map((i) => i.p))].sort((a, b) => a - b);
  for (const p of paginas) {
    const doc = itens.filter((i) => i.p === p);
    const inicios = [...new Set(doc.filter((i) => i.s.trim() === 'DATA').map((i) => i.x))].sort((a, b) => a - b);
    if (!inicios.length) continue;
    const colunas = inicios.map((x0, k) => {
      const x1 = k + 1 < inicios.length ? inicios[k + 1] - 6 : x0 + 205; // colunas têm ~200pt; à direita há quadros informativos
      return doc.filter((i) => i.x >= x0 - 6 && i.x < x1).sort((a, b) => a.y - b.y || a.x - b.x);
    });
    for (const col of colunas) {
      const usados = new Set<TextItem>();
      for (const it of col) {
        if (usados.has(it)) continue;
        const s = norm(it.s);
        if (SECOES_PULAR.some((r) => r.test(s))) { incluir = false; continue; }
        if (SECOES_INCLUIR.some((r) => r.test(s))) { incluir = true; continue; }
        if (!incluir || !RE_DDMM.test(s)) continue;
        const linha = mesmaLinha(col, it).filter((i) => i !== it && i.x > it.x).sort((a, b) => a.x - b.x);
        const valores = linha.filter((i) => parseValorBR(i.s) != null);
        if (!valores.length) continue;
        const vItem = valores[valores.length - 1];
        const desc = linha.filter((i) => i.x < vItem.x && !valores.includes(i)).map((i) => i.s.trim()).join(' ');
        linha.forEach((i) => usados.add(i));
        const { descricao, atual, total } = separarParcela(desc);
        linhas.push({
          data: inferirData(s, vencimento, atual),
          descricao,
          parcelaAtual: atual,
          parcelasTotal: total,
          valor: parseValorBR(vItem.s)!,
        });
      }
    }
  }
  if (!linhas.length) throw new LeitorError('O leitor do Itaú não encontrou lançamentos neste PDF.');
  return {
    emissor: 'itau',
    final4,
    vencimento,
    totalEsperado,
    origemTotal: lancAtuais != null ? 'Lançamentos atuais (impresso na fatura)' : 'Total desta fatura',
    linhas,
  };
}

export const somaLinhas = (f: FaturaLida) => somaCentavos(f.linhas.map((l) => l.valor));
