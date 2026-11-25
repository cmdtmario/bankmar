// RF-90 / RF-94: importação da planilha "Contabilidade BanKMar - 2026".
// Lê só as abas mensais (1.2026 … 12.2026). Abas COFRE (credenciais), CARTÕES (entrega 2),
// IRRF (entrega 4) e CHURRAS (fora do escopo) são ignoradas e listadas no relatório.
import * as XLSX from 'xlsx';
import { centavos, somaCentavos } from '../formato';
import { contemNumeroCartao } from '../regras';

export const PESSOA_A_REVISAR = 'A revisar (planilha)';

export interface PagamentoImp { data: string; banco: string | null; valor: number }
export interface ContaImp { descricao: string; vencimento: string | null; valor: number; valorMario: number; pessoaOutra: string | null; regra: RegraSimples; pagamentos: PagamentoImp[]; observacao: string | null; linha: number }
export interface LinhaImp { data: string | null; descricao: string; parcelaAtual: number | null; parcelasTotal: number | null; valor: number; valorMario: number; pessoa: string | null; marcador: string | null; regra: RegraSimples; conferido: boolean; linha: number }
export interface FaturaImp { cartao: string; vencimento: string | null; totalPlanilha: number; totalMarioPlanilha: number; pagamentos: PagamentoImp[]; linhas: LinhaImp[]; linha: number }
export interface MesImp { aba: string; competencia: string; renda: number | null; contas: ContaImp[]; faturas: FaturaImp[] }
export interface Ignorada { aba: string; linha: number | null; motivo: string }
export interface Divergencia { aba: string; item: string; planilha: number; somaLinhas: number; diferenca: number }
/** Regra com nomes de pessoa (os ids são resolvidos na gravação). */
export type RegraSimples =
  | { tipo: 'mario' }
  | { tipo: 'pct'; pessoa: string; pct: number; marcador: string | null }
  | { tipo: 'valor'; pessoa: string; valor: number; marcador: string | null }
  | { tipo: 'total'; pessoa: string; marcador: string | null };

export interface ResultadoImportacao {
  meses: MesImp[];
  pessoas: string[];
  cartoes: { nome: string; emissor: 'itau' | 'caixa' | 'outro'; ativo: boolean }[];
  ignoradas: Ignorada[];
  divergencias: Divergencia[];
}

type Celula = string | number | boolean | Date | null | undefined;
const num = (v: Celula): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const num2 = (v: Celula): number | null => { const n = num(v); return n == null ? null : r2(n); };
const str = (v: Celula): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const iso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
/** Arredonda a centavos como o Postgres (meio para longe do zero). */
const r2 = (v: number) => Math.sign(v) * Math.round((Math.abs(v) + 1e-9) * 100) / 100;

function dataCel(v: Celula): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  const s = str(v);
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d.toISOString().slice(0, 10) : null;
}

export function emissorDoNome(nome: string): 'itau' | 'caixa' | 'outro' {
  const n = nome.toUpperCase();
  if (n.includes('ITAU') || n.includes('ITAÚ')) return 'itau';
  if (n.includes('CAIXA')) return 'caixa';
  return 'outro';
}

function regraDe(valor: number, valorMario: number | null, pessoa: string | null, marcador: string | null, avisar: (m: string) => void): RegraSimples {
  if (centavos(valor) === 0) return { tipo: 'mario' };
  if (valorMario != null && centavos(valorMario) === centavos(valor)) return { tipo: 'mario' };
  if (valorMario != null && (Math.abs(valorMario) > Math.abs(valor) + 0.005 || Math.sign(valorMario) * Math.sign(valor) < 0)) {
    avisar(`"Total Mário" (${valorMario}) maior que o valor (${valor}) — importado como 100% Mário`);
    return { tipo: 'mario' };
  }
  const quem = pessoa ?? PESSOA_A_REVISAR;
  if (valorMario == null || centavos(valorMario) === 0) return { tipo: 'total', pessoa: quem, marcador };
  const outra = r2(valor - valorMario);
  if (Math.abs(centavos(outra) - centavos(valor / 2)) <= 1) return { tipo: 'pct', pessoa: quem, pct: 50, marcador };
  return { tipo: 'valor', pessoa: quem, valor: Math.abs(outra), marcador };
}

function pagamentos(row: Celula[], ign: Ignorada[], aba: string, linha: number): { pags: PagamentoImp[]; obs: string | null } {
  const pags: PagamentoImp[] = [];
  let obs: string | null = null;
  for (const [cd, cb, cv] of [[5, 6, 7], [8, 9, 10]]) {
    const d = dataCel(row[cd]);
    const v = num2(row[cv]);
    if (d && v != null && v !== 0) pags.push({ data: d, banco: str(row[cb]), valor: v });
    else if (str(row[cd]) && !d) {
      obs = str(row[cd]);
      ign.push({ aba, linha, motivo: `texto "${obs}" no campo de data de pagamento — guardado como observação` });
    }
  }
  return { pags, obs };
}

/** "DIEGO" / "diego " -> "Diego"; siglas curtas (GEAUD) ficam como estão. */
export function nomePessoa(n: string): string {
  const t = n.trim();
  if (t === t.toUpperCase() && t.length > 5) return t;
  return t.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

const ehCabecalhoLancamentos = (row: Celula[]) => /^data$/i.test(str(row?.[0]) ?? '') && /^descri/i.test(str(row?.[1]) ?? '');

export function importarPlanilha2026(dados: ArrayBuffer | Uint8Array): ResultadoImportacao {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const ignoradas: Ignorada[] = [];
  const divergencias: Divergencia[] = [];
  const meses: MesImp[] = [];
  const pessoas = new Set<string>();
  const cartoes = new Map<string, { emissor: 'itau' | 'caixa' | 'outro'; ultimaComp: string }>();

  for (const aba of wb.SheetNames) {
    const m = aba.match(/^(\d{1,2})\.(\d{4})$/);
    if (!m) {
      const motivo = /COFRE/i.test(aba)
        ? 'aba de credenciais — nunca importada (guarde no Bitwarden)'
        : /CART/i.test(aba)
          ? 'benefícios e isenções de cartões — importados na entrega 2 (colunas de número/validade/código nunca são lidas)'
          : /IRRF/i.test(aba)
            ? 'dados de IR — importados na entrega 4'
            : 'fora do escopo desta importação';
      ignoradas.push({ aba, linha: null, motivo });
      continue;
    }
    const competencia = `${m[2]}-${m[1].padStart(2, '0')}-01`;
    const rows = XLSX.utils.sheet_to_json<Celula[]>(wb.Sheets[aba], { header: 1, raw: true, defval: null, blankrows: true });
    const renda = num(rows[0]?.[2]);
    // cabeçalhos dos blocos de cartão: linha cujo seguinte é "Data | Descrição"
    const blocos: number[] = [];
    for (let i = 2; i < rows.length - 1; i++) if (str(rows[i]?.[0]) && ehCabecalhoLancamentos(rows[i + 1])) blocos.push(i);
    let rodape = rows.findIndex((r, i) => i > (blocos.at(-1) ?? 0) && (str(r?.[1]) === 'VALOR TOTAL' || str(r?.[7]) === 'CHAVE'));
    if (rodape < 0) rodape = rows.length;
    const mes: MesImp = { aba, competencia, renda, contas: [], faturas: [] };
    // Rodapé "VALOR TOTAL | VALOR DIEGO": descrições das contas divididas com o Diego
    const doDiego = new Set<string>();
    for (let i = rodape; i < rows.length; i++) {
      const d = str(rows[i]?.[0]);
      if (d && num(rows[i]?.[2]) != null) doDiego.add(d.trim().toUpperCase());
    }

    // Contas fixas: linhas 4 até o primeiro bloco de cartão
    for (let i = 3; i < (blocos[0] ?? rodape); i++) {
      const row = rows[i] ?? [];
      const desc = str(row[0]);
      const valor = num2(row[2]);
      if (!desc) {
        if (num(row[2]) || num(row[7])) ignoradas.push({ aba, linha: i + 1, motivo: 'valor sem descrição' });
        continue;
      }
      if (contemNumeroCartao(desc)) { ignoradas.push({ aba, linha: i + 1, motivo: 'descrição contém número de cartão' }); continue; }
      const vMario = num(row[3]);
      const { pags, obs } = pagamentos(row, ignoradas, aba, i + 1);
      const v = valor ?? 0;
      // Contas divididas: a planilha lista no rodapé as que são do Diego; as demais ficam "A revisar".
      const outra = doDiego.has(desc.toUpperCase()) || /diego/i.test(desc) ? 'Diego' : null;
      const regra = regraDe(v, vMario, outra, null, (msg) => ignoradas.push({ aba, linha: i + 1, motivo: msg }));
      if (regra.tipo !== 'mario') pessoas.add(regra.pessoa);
      mes.contas.push({ descricao: desc, vencimento: dataCel(row[1]), valor: v, valorMario: vMario ?? 0, pessoaOutra: regra.tipo === 'mario' ? null : regra.pessoa, regra, pagamentos: pags, observacao: obs, linha: i + 1 });
    }

    // Faturas
    blocos.forEach((h, k) => {
      const head = rows[h];
      const nome = str(head[0])!;
      const fim = k + 1 < blocos.length ? blocos[k + 1] : rodape;
      const { pags } = pagamentos(head, ignoradas, aba, h + 1);
      const fat: FaturaImp = { cartao: nome, vencimento: dataCel(head[1]), totalPlanilha: num2(head[2]) ?? 0, totalMarioPlanilha: num(head[3]) ?? 0, pagamentos: pags, linhas: [], linha: h + 1 };
      for (let i = h + 2; i < fim; i++) {
        const row = rows[i] ?? [];
        const desc = str(row[1]);
        const valor = num2(row[5]);
        if (!desc && !valor) continue;
        if (valor == null) { ignoradas.push({ aba, linha: i + 1, motivo: `"${desc}" sem valor` }); continue; }
        if (desc && contemNumeroCartao(desc)) { ignoradas.push({ aba, linha: i + 1, motivo: 'descrição contém número de cartão' }); continue; }
        // linhas só com valor entram no total da planilha (SOMA), então são importadas com descrição padrão
        const descricao = desc ?? '(sem descrição na planilha)';
        let pa = num(row[2]);
        let pt = num(row[3]);
        if (pa === 99 || !pa || !pt || pt <= 1) { pa = null; pt = null; } // 99/99 = recorrente na planilha
        const bruto = str(row[7]) && !/^respons/i.test(str(row[7])!) ? str(row[7])! : null;
        const pessoa = bruto ? nomePessoa(bruto.split(/\s+-\s+/)[0]) : null; // "Diego - PAGOU A VISTA" -> Diego
        if (bruto && bruto !== pessoa) ignoradas.push({ aba, linha: i + 1, motivo: `responsável "${bruto}" importado como "${pessoa}"` });
        const marcador = pessoa && /sal[aã]o/i.test(descricao) ? 'Salão' : null;
        const regra = regraDe(valor, num(row[6]), pessoa, marcador, (msg) => ignoradas.push({ aba, linha: i + 1, motivo: msg }));
        if (regra.tipo !== 'mario') pessoas.add(regra.pessoa);
        fat.linhas.push({
          data: dataCel(row[0]), descricao, parcelaAtual: pa, parcelasTotal: pt, valor,
          valorMario: num(row[6]) ?? 0, pessoa, marcador, regra, conferido: /^(ok|gpt)$/i.test(str(row[4]) ?? ''), linha: i + 1,
        });
      }
      const soma = somaCentavos(fat.linhas.map((l) => l.valor));
      if (centavos(soma) !== centavos(fat.totalPlanilha)) {
        divergencias.push({ aba, item: nome, planilha: fat.totalPlanilha, somaLinhas: soma, diferenca: r2(soma - fat.totalPlanilha) });
      }
      if (fat.linhas.length || fat.totalPlanilha || fat.pagamentos.length) {
        mes.faturas.push(fat);
        const c = cartoes.get(nome);
        if (!c || c.ultimaComp < competencia) cartoes.set(nome, { emissor: emissorDoNome(nome), ultimaComp: competencia });
      }
    });
    if (rodape < rows.length) ignoradas.push({ aba, linha: rodape + 1, motivo: 'rodapé (resumo do Diego e chaves Pix) — recalculado pelo sistema, não importado' });
    meses.push(mes);
  }
  meses.sort((a, b) => a.competencia.localeCompare(b.competencia));
  const ultima = meses.at(-1)?.competencia ?? '';
  return {
    meses,
    pessoas: [...pessoas].sort(),
    cartoes: [...cartoes.entries()].map(([nome, c]) => ({ nome, emissor: c.emissor, ativo: c.ultimaComp === ultima })),
    ignoradas,
    divergencias,
  };
}

/** Totais para o relatório de conferência (DoD: totais de cada mês e fatura iguais aos da planilha). */
export function totaisDoMes(m: MesImp) {
  const contas = somaCentavos(m.contas.map((c) => c.valor));
  const faturas = somaCentavos(m.faturas.map((f) => somaCentavos(f.linhas.map((l) => l.valor))));
  const faturasPlanilha = somaCentavos(m.faturas.map((f) => f.totalPlanilha));
  return { contas, faturas, faturasPlanilha, total: somaCentavos([contas, faturas]) };
}
