// Motor da carteira: custo médio, proventos, resultado de vendas e consolidação (RF-60c, RF-63, RF-64, RF-68).
// Quantidade oficial = arquivo de Posição da B3. O histórico (negociações + eventos) dá o custo;
// quando o histórico não explica a quantidade atual (IPO, oferta, conversões), o ativo fica "custo incompleto"
// e o preço médio vem do ajuste manual ou da planilha antiga (RF-69).
import type { Classe, Movimentacao, Negociacao, Posicao } from './b3';

const c2 = (v: number) => Math.round(v * 100) / 100;
const q6 = (v: number) => Math.round(v * 1e6) / 1e6;

export interface Venda { data: string; codigo: string; quantidade: number; valor: number; custo: number; resultado: number; dayTrade: boolean }
export interface CustoAtivo { codigo: string; quantidade: number; custo: number; pm: number | null; eventosSemCusto: string[]; vendas: Venda[] }

/** Eventos que mudam a quantidade (as demais movimentações são caixa ou espelho de negociação). */
export const EVENTOS_QTD = ['Desdobro', 'Grupamento', 'Bonificação em Ativos', 'Atualização', 'Incorporação', 'Recibo de Subscrição', 'Fração em Ativos'];

export function calcularCustos(negs: Negociacao[], movs: Movimentacao[]): Map<string, CustoAtivo> {
  type Ev = { data: string; ordem: number; aplicar: (a: CustoAtivo) => void; codigo: string };
  const evs: Ev[] = [];
  const comprasDoDia = new Set(negs.filter((n) => n.tipo === 'Compra').map((n) => `${n.data}|${n.codigo}`));
  for (const n of negs) {
    evs.push({
      data: n.data, ordem: n.tipo === 'Compra' ? 1 : 2, codigo: n.codigo,
      aplicar: (a) => {
        if (n.tipo === 'Compra') { a.quantidade = q6(a.quantidade + n.quantidade); a.custo = c2(a.custo + n.valor); return; }
        const pm = a.quantidade > 0 ? a.custo / a.quantidade : 0;
        const custo = c2(pm * Math.min(n.quantidade, Math.max(a.quantidade, 0)));
        a.vendas.push({ data: n.data, codigo: n.codigo, quantidade: n.quantidade, valor: n.valor, custo, resultado: c2(n.valor - custo), dayTrade: comprasDoDia.has(`${n.data}|${n.codigo}`) });
        a.quantidade = q6(a.quantidade - n.quantidade);
        a.custo = a.quantidade > 0 ? c2(a.custo - custo) : 0;
      },
    });
  }
  for (const m of movs) {
    if (!EVENTOS_QTD.includes(m.tipo)) continue;
    evs.push({
      data: m.data, ordem: 0, codigo: m.codigo,
      aplicar: (a) => {
        switch (m.tipo) {
          case 'Desdobro': a.quantidade = q6(a.quantidade + m.quantidade); break;
          case 'Grupamento': a.quantidade = q6(m.quantidade); break; // B3 informa a quantidade resultante
          case 'Bonificação em Ativos':
            a.quantidade = q6(a.quantidade + m.quantidade);
            if (m.valor) a.custo = c2(a.custo + m.valor); else a.eventosSemCusto.push(`${m.data} bonificação`);
            break;
          case 'Fração em Ativos': {
            const pm = a.quantidade > 0 ? a.custo / a.quantidade : 0;
            a.custo = c2(a.custo - pm * m.quantidade);
            a.quantidade = q6(a.quantidade - m.quantidade);
            break;
          }
          default: // Atualização, Incorporação, Recibo de Subscrição: entram sem custo informado
            if (!m.entrada) { a.quantidade = q6(a.quantidade - m.quantidade); break; }
            a.quantidade = q6(a.quantidade + m.quantidade);
            if (m.valor) a.custo = c2(a.custo + m.valor);
            else a.eventosSemCusto.push(`${m.data} ${m.tipo.toLowerCase()}`);
        }
      },
    });
  }
  evs.sort((x, y) => x.data.localeCompare(y.data) || x.ordem - y.ordem);
  const out = new Map<string, CustoAtivo>();
  for (const e of evs) {
    if (!out.has(e.codigo)) out.set(e.codigo, { codigo: e.codigo, quantidade: 0, custo: 0, pm: null, eventosSemCusto: [], vendas: [] });
    e.aplicar(out.get(e.codigo)!);
  }
  for (const a of out.values()) a.pm = a.quantidade > 0 ? a.custo / a.quantidade : null;
  return out;
}

// ---------------------------------------------------------------------------
// Proventos (RF-64)
// ---------------------------------------------------------------------------
export type TipoProvento = 'dividendo' | 'jcp' | 'rendimento' | 'juros';
export interface Provento { data: string; codigo: string; tipo: TipoProvento; valor: number; instituicao: string }

const TIPOS_PROVENTO: [RegExp, TipoProvento][] = [
  [/^Dividendo$/i, 'dividendo'],
  [/^Juros Sobre Capital Próprio$/i, 'jcp'],
  [/^Rendimento$/i, 'rendimento'],
  [/^(Juros|PAGAMENTO DE JUROS|PAGAMENTO DE RENDIMENTOS?)$/i, 'juros'],
];

export function extrairProventos(movs: Movimentacao[]): Provento[] {
  const out: Provento[] = [];
  for (const m of movs) {
    if (m.valor == null) continue;
    if (/cancelado/i.test(m.tipo)) {
      const base = m.tipo.replace(/\s*-\s*cancelado/i, '');
      const t = TIPOS_PROVENTO.find(([r]) => r.test(base));
      if (t) out.push({ data: m.data, codigo: m.codigo, tipo: t[1], valor: -Math.abs(m.valor), instituicao: m.instituicao });
      continue;
    }
    if (!m.entrada) continue;
    const t = TIPOS_PROVENTO.find(([r]) => r.test(m.tipo));
    if (t) out.push({ data: m.data, codigo: m.codigo, tipo: t[1], valor: m.valor, instituicao: m.instituicao });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Consolidação (RF-63, RF-68)
// ---------------------------------------------------------------------------
export interface Ajuste { codigo: string; preco_medio: number | null; preco_alvo: number | null; origem?: string | null }
export interface Ativo {
  codigo: string; classe: Classe; nome: string; instituicoes: string[]; quantidade: number;
  pm: number | null; origemPm: 'histórico B3' | 'ajuste manual' | 'planilha antiga' | null; custoCompleto: boolean;
  investido: number | null; preco: number | null; dataPreco: string | null; mercado: number; resultado: number | null; resultadoPct: number | null;
  proventos: number; retornoTotal: number | null; alvo: number | null; atingiuAlvo: boolean; cnpj: string | null;
  /** Onde o ativo está custodiado: quantidade e valor em cada instituição (nomes já agrupados). */
  porInstituicao: { instituicao: string; quantidade: number; valor: number }[];
}

export function consolidar(p: {
  posicoes: Posicao[]; custos: Map<string, CustoAtivo>; ajustes: Ajuste[]; proventos: Provento[];
  cotacoes: Map<string, { preco: number; data: string }>; dataPosicao: string | null; agrupar: (inst: string) => string;
}): Ativo[] {
  const porCodigo = new Map<string, Posicao[]>();
  for (const x of p.posicoes) porCodigo.set(x.codigo, [...(porCodigo.get(x.codigo) ?? []), x]);
  const prov = new Map<string, number>();
  for (const x of p.proventos) prov.set(x.codigo, c2((prov.get(x.codigo) ?? 0) + x.valor));
  const negociavel = (c: Classe) => ['acao', 'bdr', 'etf', 'fii'].includes(c);
  return [...porCodigo.entries()].map(([codigo, ps]) => {
    const classe = ps[0].classe;
    const quantidade = q6(ps.reduce((a, x) => a + x.quantidade, 0));
    const valorPos = c2(ps.reduce((a, x) => a + (x.valor ?? 0), 0));
    const aplicado = ps.every((x) => x.valorAplicado != null) ? c2(ps.reduce((a, x) => a + (x.valorAplicado ?? 0), 0)) : null;
    const hist = p.custos.get(codigo);
    const aj = p.ajustes.find((a) => a.codigo === codigo);
    const custoCompleto = Boolean(hist && Math.abs(hist.quantidade - quantidade) < 1e-6 && !hist.eventosSemCusto.length);
    let pm: number | null = null;
    let origemPm: Ativo['origemPm'] = null;
    if (aj?.preco_medio != null) { pm = aj.preco_medio; origemPm = aj.origem === 'planilha' ? 'planilha antiga' : 'ajuste manual'; }
    else if (custoCompleto && hist?.pm != null) { pm = hist.pm; origemPm = 'histórico B3'; }
    const cot = p.cotacoes.get(codigo);
    const preco = negociavel(classe) ? (cot?.preco ?? ps[0].preco) : null;
    const mercado = negociavel(classe) && preco != null ? c2(preco * quantidade) : valorPos;
    const investido = pm != null ? c2(pm * quantidade) : aplicado;
    const resultado = investido != null ? c2(mercado - investido) : null;
    const proventos = prov.get(codigo) ?? 0;
    const alvo = aj?.preco_alvo ?? null;
    return {
      codigo, classe, nome: ps[0].produto.replace(/^[A-Z0-9]+ - /, ''), instituicoes: [...new Set(ps.map((x) => p.agrupar(x.instituicao)))],
      quantidade, pm, origemPm, custoCompleto, investido, preco, dataPreco: negociavel(classe) ? (cot?.data ?? p.dataPosicao) : p.dataPosicao,
      mercado, resultado, resultadoPct: investido ? resultado! / investido : null, proventos,
      retornoTotal: investido != null ? c2(mercado - investido + proventos) : null,
      alvo, atingiuAlvo: alvo != null && preco != null && preco >= alvo, cnpj: ps[0].cnpj,
      porInstituicao: [...ps.reduce((m, x) => {
        const k = p.agrupar(x.instituicao);
        const v = m.get(k) ?? { instituicao: k, quantidade: 0, valor: 0 };
        v.quantidade = q6(v.quantidade + x.quantidade);
        v.valor = c2(v.valor + (negociavel(classe) && preco != null ? preco * x.quantidade : (x.valor ?? 0)));
        return m.set(k, v);
      }, new Map<string, { instituicao: string; quantidade: number; valor: number }>()).values()].sort((a, b) => b.valor - a.valor),
    };
  }).sort((a, b) => b.mercado - a.mercado);
}

export const NOME_CLASSE: Record<Classe, string> = {
  acao: 'Ações', bdr: 'BDRs', etf: 'ETFs', fii: 'Fundos imobiliários', fundo: 'Fundos', renda_fixa: 'Renda fixa',
  tesouro: 'Tesouro Direto', coe: 'COE', previdencia: 'Previdência', outro: 'Outros',
};

/** Agrupa nomes diferentes da mesma instituição (RF-60d). Regras padrão + tabela editável. */
export function criarAgrupador(tabela: { nome_original: string; grupo: string }[]) {
  const padrao: [RegExp, string][] = [
    [/\bINTER\b/i, 'Inter'], [/\bNU (INVEST|INVESTIMENTOS)\b|NUBANK|\bNU PAGAMENTOS/i, 'Nubank'], [/\bC6\b/i, 'C6'],
    [/\bXP\b/i, 'XP'], [/\bGENIAL\b/i, 'Genial'], [/\bBTG\b/i, 'BTG'], [/\bITA[UÚ]\b/i, 'Itaú'], [/\bBRADESCO\b/i, 'Bradesco'],
    [/\bRICO\b/i, 'Rico'], [/\bCLEAR\b/i, 'Clear'], [/\bSANTANDER\b/i, 'Santander'], [/\bCAIXA\b/i, 'Caixa'], [/\bBANCO DO BRASIL\b|\bBB\b/i, 'Banco do Brasil'],
  ];
  return (inst: string) => {
    const t = tabela.find((x) => x.nome_original.toLowerCase() === inst.toLowerCase());
    if (t) return t.grupo;
    const p = padrao.find(([r]) => r.test(inst));
    return p ? p[1] : inst;
  };
}

/** Recorte de um ativo numa instituição: quantidade, valor, custo e resultado só da parte custodiada lá.
 *  O preço médio é o da carteira inteira (a B3 não informa custo por corretora). */
export function recortar(a: Ativo, instituicao: string): Ativo | null {
  const parte = a.porInstituicao.find((x) => x.instituicao === instituicao);
  if (!parte) return null;
  const f = a.quantidade ? parte.quantidade / a.quantidade : 0;
  const investido = a.pm != null ? c2(a.pm * parte.quantidade) : a.investido != null ? c2(a.investido * f) : null;
  const resultado = investido != null ? c2(parte.valor - investido) : null;
  return { ...a, quantidade: parte.quantidade, mercado: parte.valor, investido, resultado, resultadoPct: investido ? resultado! / investido : null, instituicoes: [instituicao], porInstituicao: [parte], retornoTotal: null };
}
