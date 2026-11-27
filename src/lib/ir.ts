// Imposto de Renda: resumo anual, renda variável, relatório por ficha e importação da aba IRRF 2026 (RF-75 a RF-78d, RF-93).
// Os códigos e alíquotas abaixo são o ponto de partida; cada ano precisa ser revisado contra o manual da Receita (RF-78a).
import * as XLSX from 'xlsx';
import type { Movimentacao, Negociacao, Posicao, Classe } from './investimentos/b3';
import { calcularCustos, extrairProventos, type Ajuste, type Provento } from './investimentos/carteira';

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Tabela de códigos (RF-78a)
// ---------------------------------------------------------------------------
export interface Codigo { ficha: string; grupo: string; codigo: string; nome: string }
export type ChaveCodigo =
  | 'bem_acao' | 'bem_fii' | 'bem_etf' | 'bem_bdr' | 'bem_fundo' | 'bem_renda_fixa' | 'bem_tesouro' | 'bem_coe' | 'bem_vgbl'
  | 'isento_dividendo' | 'isento_fii' | 'isento_juros' | 'exclusivo_jcp' | 'exclusivo_juros'
  | 'pag_pgbl' | 'pag_saude' | 'pag_dentista' | 'pag_medico' | 'pag_educacao';

export const FICHAS = ['Bens e Direitos', 'Rendimentos Isentos e Não Tributáveis', 'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva', 'Pagamentos Efetuados', 'Renda Variável'] as const;

export const CODIGOS_PADRAO: Record<ChaveCodigo, Codigo> = {
  bem_acao: { ficha: 'Bens e Direitos', grupo: '03', codigo: '01', nome: 'Ações (inclusive as listadas em bolsa)' },
  bem_fii: { ficha: 'Bens e Direitos', grupo: '07', codigo: '03', nome: 'Fundos de Investimento Imobiliário (FII)' },
  bem_etf: { ficha: 'Bens e Direitos', grupo: '07', codigo: '09', nome: 'Fundos de índice (ETF)' },
  bem_bdr: { ficha: 'Bens e Direitos', grupo: '04', codigo: '04', nome: 'Ativos negociados em bolsa no Brasil (BDR)' },
  bem_fundo: { ficha: 'Bens e Direitos', grupo: '07', codigo: '99', nome: 'Outros fundos' },
  bem_renda_fixa: { ficha: 'Bens e Direitos', grupo: '04', codigo: '02', nome: 'Títulos sujeitos à tributação (CDB, RDB e outros)' },
  bem_tesouro: { ficha: 'Bens e Direitos', grupo: '04', codigo: '02', nome: 'Títulos públicos sujeitos à tributação (Tesouro Direto)' },
  bem_coe: { ficha: 'Bens e Direitos', grupo: '04', codigo: '99', nome: 'Outras aplicações e investimentos (COE)' },
  bem_vgbl: { ficha: 'Bens e Direitos', grupo: '99', codigo: '06', nome: 'VGBL - Vida Gerador de Benefício Livre' },
  isento_dividendo: { ficha: 'Rendimentos Isentos e Não Tributáveis', grupo: '', codigo: '09', nome: 'Lucros e dividendos recebidos' },
  isento_fii: { ficha: 'Rendimentos Isentos e Não Tributáveis', grupo: '', codigo: '26', nome: 'Rendimentos de FII / Fiagro' },
  isento_juros: { ficha: 'Rendimentos Isentos e Não Tributáveis', grupo: '', codigo: '12', nome: 'Rendimentos de LCI, LCA, CRI, CRA e poupança' },
  exclusivo_jcp: { ficha: 'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva', grupo: '', codigo: '10', nome: 'Juros sobre capital próprio' },
  exclusivo_juros: { ficha: 'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva', grupo: '', codigo: '06', nome: 'Rendimentos de aplicações financeiras' },
  pag_pgbl: { ficha: 'Pagamentos Efetuados', grupo: '', codigo: '36', nome: 'Previdência complementar (PGBL)' },
  pag_saude: { ficha: 'Pagamentos Efetuados', grupo: '', codigo: '26', nome: 'Planos de saúde no Brasil' },
  pag_dentista: { ficha: 'Pagamentos Efetuados', grupo: '', codigo: '10', nome: 'Dentistas no Brasil' },
  pag_medico: { ficha: 'Pagamentos Efetuados', grupo: '', codigo: '21', nome: 'Médicos no Brasil' },
  pag_educacao: { ficha: 'Pagamentos Efetuados', grupo: '', codigo: '01', nome: 'Instrução no Brasil' },
};

export interface Parametros { isencao_acoes: number; aliquota_comum: number; aliquota_day_trade: number; aliquota_fii: number; darf_minimo: number; limite_pgbl_pct: number }
export const PARAMETROS_PADRAO: Parametros = { isencao_acoes: 20000, aliquota_comum: 15, aliquota_day_trade: 20, aliquota_fii: 20, darf_minimo: 10, limite_pgbl_pct: 12 };

// ---------------------------------------------------------------------------
// RF-75 / RF-76: resumo anual
// ---------------------------------------------------------------------------
export interface Mensal {
  competencia: string; recebido_em: string | null; salario_liquido: number | null; ferias_terco: number | null; inss_folha: number | null; inss_ferias: number | null;
  ir_folha: number | null; ir_ferias: number | null; ir_vinculo_unico: number | null; plano_saude: number | null; odontologico: number | null; ensino: number | null;
  medico_fora: number | null; obs_medico: string | null; decimo_terceiro?: number | null;
}
export interface Previdencia { competencia: string; plano: string; tipo: 'PGBL' | 'VGBL'; valor: number; origem?: 'manual' | 'conta'; bill_id?: string | null }

export function resumoAnual(mensal: Mensal[], prev: Previdencia[], rendaTributavel: number | null, p: Parametros = PARAMETROS_PADRAO) {
  const s = (k: keyof Mensal) => r2(mensal.reduce((a, m) => a + (Number(m[k]) || 0), 0));
  const pgbl = r2(prev.filter((x) => x.tipo === 'PGBL').reduce((a, x) => a + x.valor, 0));
  const vgbl = r2(prev.filter((x) => x.tipo === 'VGBL').reduce((a, x) => a + x.valor, 0));
  const porPlano = [...prev.reduce((m, x) => m.set(`${x.plano}|${x.tipo}`, r2((m.get(`${x.plano}|${x.tipo}`) ?? 0) + x.valor)), new Map<string, number>())].map(([k, v]) => ({ plano: k.split('|')[0], tipo: k.split('|')[1], valor: v }));
  const inss = r2(s('inss_folha') + s('inss_ferias'));
  const ir = r2(s('ir_folha') + s('ir_ferias') + s('ir_vinculo_unico'));
  // Estimativa de renda tributável quando não informada: líquido + férias + INSS + IR retido (não inclui descontos não tributáveis).
  const estimada = r2(s('salario_liquido') + s('decimo_terceiro') + s('ferias_terco') + inss + ir);
  const base = rendaTributavel ?? null;
  const limite = base != null ? r2(base * p.limite_pgbl_pct / 100) : null;
  return {
    liquido: r2(s('salario_liquido') + s('decimo_terceiro')), ferias: s('ferias_terco'), inss, ir, saude: s('plano_saude'), odonto: s('odontologico'), ensino: s('ensino'), medicoFora: s('medico_fora'),
    pgbl, vgbl, porPlano, rendaEstimada: estimada, limitePgbl: limite, faltaPgbl: limite != null ? r2(limite - pgbl) : null,
  };
}

// ---------------------------------------------------------------------------
// RF-78c: renda variável mês a mês
// ---------------------------------------------------------------------------
export type CategoriaRV = 'acao' | 'etf' | 'bdr' | 'fii';
export interface MesRV {
  mes: string; vendasAcoes: number; isento: boolean;
  comum: { resultado: number; compensado: number; base: number; imposto: number };
  day: { resultado: number; compensado: number; base: number; imposto: number };
  fii: { resultado: number; compensado: number; base: number; imposto: number };
  prejuizo: { comum: number; day: number; fii: number }; darf: number; acumuladoDarf: number;
  vendas: { codigo: string; categoria: CategoriaRV; quantidade: number; valor: number; resultado: number; dayTrade: boolean }[];
}

/** Classe de um código para fins de IR: posição conhecida > texto do produto > final do código. */
export function categoriaDe(codigo: string, classes: Map<string, Classe>, produto = ''): CategoriaRV {
  const c = classes.get(codigo);
  if (c === 'acao' || c === 'etf' || c === 'bdr' || c === 'fii') return c;
  if (c === 'fundo') return 'fii';
  if (/ETF|FDO INDICE|ÍNDICE/i.test(produto)) return 'etf';
  if (/FII|IMOB|FIAGRO/i.test(produto)) return 'fii';
  if (/3[2-5]$/.test(codigo)) return 'bdr';
  if (/11$/.test(codigo)) return 'fii';
  return 'acao';
}

export function rendaVariavel(vendas: { data: string; codigo: string; quantidade: number; valor: number; resultado: number; dayTrade: boolean }[], categoria: (codigo: string) => CategoriaRV, ano: number, p: Parametros = PARAMETROS_PADRAO, prejuizoInicial = { comum: 0, day: 0, fii: 0 }): MesRV[] {
  const pre = { ...prejuizoInicial };
  let acumuladoDarf = 0;
  const meses: MesRV[] = [];
  // Prejuízos de anos anteriores entram corridos desde a primeira venda do histórico.
  const todas = [...vendas].sort((a, b) => a.data.localeCompare(b.data));
  const porMes = new Map<string, typeof todas>();
  for (const v of todas) porMes.set(v.data.slice(0, 7), [...(porMes.get(v.data.slice(0, 7)) ?? []), v]);
  for (const [mes, vs] of [...porMes.entries()].sort()) {
    const comVenda = vs.map((v) => ({ ...v, categoria: categoria(v.codigo) }));
    const vendasAcoes = r2(comVenda.filter((v) => v.categoria === 'acao' && !v.dayTrade).reduce((s, v) => s + v.valor, 0));
    const isento = vendasAcoes <= p.isencao_acoes;
    const soma = (f: (v: (typeof comVenda)[number]) => boolean) => r2(comVenda.filter(f).reduce((s, v) => s + v.resultado, 0));
    // Ganho de ações em mês isento não é tributado nem consome prejuízo; perdas continuam compensáveis.
    const acoes = soma((v) => v.categoria === 'acao' && !v.dayTrade);
    const outrosComuns = soma((v) => (v.categoria === 'etf' || v.categoria === 'bdr') && !v.dayTrade);
    const comumTrib = r2((isento && acoes > 0 ? 0 : acoes) + outrosComuns);
    const apurar = (resultado: number, chave: 'comum' | 'day' | 'fii', aliquota: number) => {
      if (resultado <= 0) { pre[chave] = r2(pre[chave] + -resultado); return { resultado, compensado: 0, base: 0, imposto: 0 }; }
      const compensado = Math.min(pre[chave], resultado);
      pre[chave] = r2(pre[chave] - compensado);
      const base = r2(resultado - compensado);
      return { resultado, compensado, base, imposto: r2(base * aliquota / 100) };
    };
    const comum = apurar(comumTrib, 'comum', p.aliquota_comum);
    const day = apurar(soma((v) => v.dayTrade && v.categoria !== 'fii'), 'day', p.aliquota_day_trade);
    const fii = apurar(soma((v) => v.categoria === 'fii'), 'fii', p.aliquota_fii);
    const devido = r2(comum.imposto + day.imposto + fii.imposto + acumuladoDarf);
    const darf = devido >= p.darf_minimo ? devido : 0;
    acumuladoDarf = devido >= p.darf_minimo ? 0 : devido;
    if (Number(mes.slice(0, 4)) === ano) meses.push({ mes, vendasAcoes, isento, comum, day, fii, prejuizo: { ...pre }, darf, acumuladoDarf, vendas: comVenda.map(({ codigo, categoria: c, quantidade, valor, resultado, dayTrade }) => ({ codigo, categoria: c, quantidade, valor, resultado, dayTrade })) });
  }
  return meses;
}

// ---------------------------------------------------------------------------
// RF-77 / RF-78: relatório por ficha
// ---------------------------------------------------------------------------
export interface ItemIR {
  chave: string; ficha: string; grupo: string; codigo: string; classificar: boolean; nomeCodigo: string;
  cnpj: string | null; discriminacao: string; anterior: number | null; atual: number | null; rendimento: number | null; observacao?: string;
}

const fmtQ = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cnpjFmt = (c: string | null) => { const d = (c ?? '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null; };

export interface EntradaRelatorio {
  ano: number;
  negs: Negociacao[]; movs: Movimentacao[];
  posicoes: Posicao[];            // posição mais recente da B3
  dataPosicao: string | null;
  ajustes: Ajuste[];
  manuais: { instituicao: string; produto: string; classe: Classe; competencia: string; saldo: number }[];
  mensal: Mensal[]; previdencia: Previdencia[];
  codigos?: Partial<Record<ChaveCodigo, Codigo>>;
  agrupar: (i: string) => string;
}

export function montarRelatorio(e: EntradaRelatorio): { itens: ItemIR[]; proventos: Provento[]; avisos: string[] } {
  const cod = { ...CODIGOS_PADRAO, ...(e.codigos ?? {}) };
  const ate = (d: string) => calcularCustos(e.negs.filter((n) => n.data <= d), e.movs.filter((m) => m.data <= d));
  const fimAnterior = `${e.ano - 1}-12-31`; const fimAno = `${e.ano}-12-31`;
  const custoAnt = ate(fimAnterior); const custoAtual = ate(fimAno);
  const avisos: string[] = [];
  const itens: ItemIR[] = [];
  const porCodigo = new Map<string, Posicao[]>();
  for (const p of e.posicoes) porCodigo.set(p.codigo, [...(porCodigo.get(p.codigo) ?? []), p]);
  const classes = new Map(e.posicoes.map((p) => [p.codigo, p.classe]));
  const ajuste = new Map(e.ajustes.map((a) => [a.codigo, a]));
  const posicaoValeParaFim = e.dataPosicao != null && e.dataPosicao.slice(0, 4) === String(e.ano);
  const item = (k: ChaveCodigo, extra: Omit<ItemIR, 'ficha' | 'grupo' | 'codigo' | 'classificar' | 'nomeCodigo'>): ItemIR => {
    const c = cod[k];
    return { ...extra, ficha: c?.ficha ?? 'Bens e Direitos', grupo: c?.grupo ?? '', codigo: c?.codigo ?? '', classificar: !c?.codigo, nomeCodigo: c?.nome ?? '' };
  };

  // Bens: renda variável (custo de aquisição)
  const negociaveis = new Set<string>([...custoAnt.keys(), ...custoAtual.keys(), ...e.posicoes.filter((p) => ['acao', 'fii', 'etf', 'bdr', 'fundo'].includes(p.classe)).map((p) => p.codigo)]);
  for (const codigo of [...negociaveis].sort()) {
    const ps = porCodigo.get(codigo) ?? [];
    const cat = categoriaDe(codigo, classes, ps[0]?.produto ?? e.movs.find((m) => m.codigo === codigo)?.produto ?? '');
    const chave: ChaveCodigo = cat === 'acao' ? 'bem_acao' : cat === 'fii' ? 'bem_fii' : cat === 'etf' ? 'bem_etf' : 'bem_bdr';
    const a = custoAnt.get(codigo); const b = custoAtual.get(codigo);
    const pmManual = ajuste.get(codigo)?.preco_medio ?? null;
    // Quantidade no fim do ano: posição da B3 se for do próprio ano (mais confiável), senão o histórico.
    const qPos = ps.reduce((s, p) => s + p.quantidade, 0);
    const qFim = posicaoValeParaFim && ps.length ? qPos : (b?.quantidade ?? 0);
    const histOk = b != null && Math.abs(b.quantidade - qFim) < 1e-6;
    const pmFim = histOk ? b!.pm : pmManual ?? b?.pm ?? null;
    const atual = qFim > 0 && pmFim != null ? r2(qFim * pmFim) : qFim > 0 ? null : 0;
    const anterior = a && a.quantidade > 0 ? r2(a.custo) : 0;
    if (!anterior && !atual && !qFim) continue;
    const insts = [...new Set(ps.map((p) => e.agrupar(p.instituicao)))];
    const nome = ps[0]?.produto?.split(' - ').slice(1).join(' - ') || codigo;
    const obs = atual == null ? 'Sem preço médio: informe em Investimentos.' : !histOk && pmManual != null ? 'Custo pelo preço médio informado por você.' : !histOk ? 'Histórico da B3 incompleto: confira o custo.' : undefined;
    itens.push(item(chave, {
      chave: `bem:${codigo}`, cnpj: cnpjFmt(ps[0]?.cnpj ?? null),
      discriminacao: `${fmtQ(qFim)} ${cat === 'acao' ? 'ações' : 'cotas'} de ${codigo} (${nome})${insts.length ? `, custodiadas em ${insts.join(' e ')}` : ''}. Custo médio de ${pmFim != null ? fmtR(pmFim) : '—'}.`,
      anterior, atual, rendimento: null, observacao: obs,
    }));
  }

  // Bens: renda fixa, Tesouro e COE (saldo aplicado na posição; o ano anterior não vem da B3)
  for (const p of e.posicoes.filter((x) => ['renda_fixa', 'tesouro', 'coe'].includes(x.classe))) {
    const isento = /LCI|LCA|CRI|CRA|LIG|DEB.*INCENT/i.test(p.produto);
    const k: ChaveCodigo = p.classe === 'tesouro' ? 'bem_tesouro' : p.classe === 'coe' ? 'bem_coe' : 'bem_renda_fixa';
    const c = isento ? { ...cod[k], codigo: '03', nome: 'Títulos isentos de tributação (LCI, LCA, CRI, CRA e outros)' } : cod[k];
    itens.push({
      chave: `bem:${p.codigo}:${e.agrupar(p.instituicao)}`, ficha: c.ficha, grupo: c.grupo, codigo: c.codigo, classificar: !c.codigo, nomeCodigo: c.nome, cnpj: cnpjFmt(p.cnpj),
      discriminacao: `${p.produto}${p.emissor ? `, emissor ${p.emissor}` : ''}${p.vencimento ? `, vencimento ${p.vencimento.split('-').reverse().join('/')}` : ''}, custodiado em ${e.agrupar(p.instituicao)}.`,
      anterior: null, atual: posicaoValeParaFim ? (p.valorAplicado ?? null) : null, rendimento: null,
      observacao: p.valorAplicado == null ? 'A posição não traz o valor aplicado: use o informe da instituição.' : 'Saldo de 31/12 do ano anterior: copie da declaração passada.',
    });
  }

  // Bens: previdência (VGBL entra em bens; PGBL não, vai em pagamentos)
  const ultimoSaldo = (fim: string) => { const m = new Map<string, (typeof e.manuais)[number]>(); for (const s of e.manuais.filter((x) => x.competencia <= fim).sort((a, b) => b.competencia.localeCompare(a.competencia))) { const k = `${s.instituicao}|${s.produto}`; if (!m.has(k)) m.set(k, s); } return m; };
  const antM = ultimoSaldo(fimAnterior); const atM = ultimoSaldo(fimAno);
  for (const k of new Set([...antM.keys(), ...atM.keys()])) {
    const s = atM.get(k) ?? antM.get(k)!;
    if (/PGBL/i.test(s.produto)) continue;
    const vgbl = /VGBL/i.test(s.produto);
    const c = vgbl ? cod.bem_vgbl : null;
    itens.push({
      chave: `bem:manual:${k}`, ficha: 'Bens e Direitos', grupo: c?.grupo ?? '', codigo: c?.codigo ?? '', classificar: !c, nomeCodigo: c?.nome ?? '',
      cnpj: null, discriminacao: `${s.produto} — ${s.instituicao}.`, anterior: antM.get(k)?.saldo ?? null, atual: atM.get(k)?.saldo ?? null, rendimento: null,
      observacao: vgbl ? 'VGBL: informe o valor aplicado (prêmios pagos), conforme o informe da seguradora.' : 'Classifique: é VGBL, fundo ou outra aplicação?',
    });
  }

  // Rendimentos (RF-77): proventos do ano por ativo e tipo
  const provs = extrairProventos(e.movs).filter((p) => p.data.startsWith(String(e.ano)));
  const grupos = new Map<string, { codigo: string; tipo: Provento['tipo']; valor: number }>();
  for (const p of provs) { const k = `${p.codigo}|${p.tipo}`; const g = grupos.get(k) ?? { codigo: p.codigo, tipo: p.tipo, valor: 0 }; g.valor = r2(g.valor + p.valor); grupos.set(k, g); }
  for (const g of [...grupos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    if (g.valor <= 0) continue;
    const ps = porCodigo.get(g.codigo) ?? [];
    const cat = categoriaDe(g.codigo, classes, ps[0]?.produto ?? '');
    const k: ChaveCodigo = g.tipo === 'jcp' ? 'exclusivo_jcp' : g.tipo === 'dividendo' ? (cat === 'fii' ? 'isento_fii' : 'isento_dividendo') : g.tipo === 'rendimento' ? 'isento_fii' : 'exclusivo_juros';
    itens.push(item(k, {
      chave: `rend:${g.codigo}:${g.tipo}`, cnpj: cnpjFmt(ps[0]?.cnpj ?? null),
      discriminacao: `${g.tipo === 'jcp' ? 'Juros sobre capital próprio' : g.tipo === 'juros' ? 'Juros' : g.tipo === 'dividendo' ? 'Dividendos' : 'Rendimentos'} de ${g.codigo}${ps[0] ? ` (${ps[0].produto.split(' - ').slice(1).join(' - ')})` : ''}.`,
      anterior: null, atual: null, rendimento: g.valor,
      observacao: ps.length ? undefined : 'Ativo fora da posição atual: confira o CNPJ no informe.',
    }));
  }

  // Pagamentos efetuados (RF-78)
  const soma = (f: (m: Mensal) => number | null) => r2(e.mensal.filter((m) => m.competencia.startsWith(String(e.ano))).reduce((s, m) => s + (Number(f(m)) || 0), 0));
  const prevAno = e.previdencia.filter((p) => p.competencia.startsWith(String(e.ano)));
  for (const plano of [...new Set(prevAno.filter((p) => p.tipo === 'PGBL').map((p) => p.plano))]) {
    itens.push(item('pag_pgbl', { chave: `pag:pgbl:${plano}`, cnpj: null, discriminacao: `Contribuições ao PGBL ${plano}.`, anterior: null, atual: null, rendimento: r2(prevAno.filter((p) => p.plano === plano && p.tipo === 'PGBL').reduce((s, p) => s + p.valor, 0)), observacao: 'CNPJ da entidade: veja o informe do plano.' }));
  }
  const saude = soma((m) => m.plano_saude); const odonto = soma((m) => m.odontologico); const medico = soma((m) => m.medico_fora); const ensino = soma((m) => m.ensino);
  if (saude) itens.push(item('pag_saude', { chave: 'pag:saude', cnpj: null, discriminacao: 'Plano de saúde (titular e dependentes).', anterior: null, atual: null, rendimento: saude }));
  if (odonto) itens.push(item('pag_dentista', { chave: 'pag:odonto', cnpj: null, discriminacao: 'Plano odontológico.', anterior: null, atual: null, rendimento: odonto, observacao: 'Plano odontológico costuma ir no código de planos de saúde: confira no informe.' }));
  if (medico) itens.push(item('pag_medico', { chave: 'pag:medico', cnpj: null, discriminacao: `Despesas médicas fora do plano. ${e.mensal.filter((m) => m.obs_medico).map((m) => m.obs_medico).join('; ')}`.trim(), anterior: null, atual: null, rendimento: medico, observacao: 'Separe por profissional (CPF/CNPJ de cada um).' }));
  if (ensino) itens.push(item('pag_educacao', { chave: 'pag:ensino', cnpj: null, discriminacao: 'Despesas com instrução.', anterior: null, atual: null, rendimento: ensino }));

  if (!e.dataPosicao) avisos.push('Sem arquivo de Posição da B3: importe em Investimentos para os bens do fim do ano.');
  else if (!posicaoValeParaFim) avisos.push(`A posição da B3 é de ${e.dataPosicao.split('-').reverse().join('/')}: para 31/12/${e.ano}, importe a posição do fim do ano.`);
  return { itens, proventos: provs, avisos };
}

// ---------------------------------------------------------------------------
// RF-93: aba IRRF 2026
// ---------------------------------------------------------------------------
export function lerAbaIrrf(dados: ArrayBuffer | Uint8Array): { mensal: Mensal[]; previdencia: Previdencia[]; ano: number } {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const nome = wb.SheetNames.find((n) => /^IRRF/i.test(n.trim()));
  if (!nome) throw new Error('A planilha não tem a aba IRRF.');
  const ano = Number(nome.match(/(\d{4})/)?.[1] ?? new Date().getFullYear());
  const linhas = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null });
  const cab = linhas.findIndex((l) => String(l[0] ?? '').trim().toUpperCase() === 'FOLHA');
  if (cab < 0) throw new Error('A aba IRRF não tem a linha de cabeçalho com "FOLHA".');
  const titulos = linhas[cab].map((v) => String(v ?? '').trim().toUpperCase());
  const col = (re: RegExp) => titulos.findIndex((t) => re.test(t));
  const c = {
    recebido: col(/RECEBIDO/), liquido: col(/SALARIO L/), ferias: col(/FERIAS \+/), odonto: col(/ODONTO/), saude: col(/PLANO SAUDE/), medico: col(/MEDICO FORA/), obs: col(/OBS MEDICO/),
    inssF: col(/^INSS FOLHA/), inssFe: col(/^INSS FERIAS/), irF: col(/^IR FOLHA/), irFe: col(/^IR FERIAS/), irV: col(/VINCULO/), ensino: linhas[cab - 1]?.findIndex((v) => /ENSINO/i.test(String(v ?? ''))) ?? -1,
  };
  const planos = titulos.map((t, i) => ({ t, i })).filter(({ t, i }) => i > c.irV && t && t !== 'TOTAL');
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? r2(v) : null);
  const mes = (v: unknown) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-01` : null);
  const mensal: Mensal[] = []; const previdencia: Previdencia[] = [];
  const contagem = new Map<string, number>();
  for (const l of linhas.slice(cab + 1)) {
    const comp = mes(l[0]);
    if (!comp) { if (String(l[0] ?? '').toUpperCase().startsWith('TOTAL')) break; continue; }
    const g = (i: number) => (i >= 0 ? num(l[i]) : null);
    mensal.push({
      competencia: comp, recebido_em: l[c.recebido] instanceof Date ? (l[c.recebido] as Date).toISOString().slice(0, 10) : null,
      salario_liquido: g(c.liquido), ferias_terco: g(c.ferias), inss_folha: g(c.inssF), inss_ferias: g(c.inssFe), ir_folha: g(c.irF), ir_ferias: g(c.irFe), ir_vinculo_unico: g(c.irV),
      plano_saude: g(c.saude), odontologico: g(c.odonto), ensino: g(c.ensino), medico_fora: g(c.medico), obs_medico: c.obs >= 0 && l[c.obs] != null ? String(l[c.obs]).slice(0, 200) : null,
    });
    contagem.clear();
    for (const { t, i } of planos) {
      const v = num(l[i]);
      if (!v) continue;
      // Planos com o mesmo nome em duas colunas (ex.: BRASIL PREV duas vezes) viram "BRASIL PREV 2".
      const n = (contagem.get(t) ?? 0) + 1; contagem.set(t, n);
      const repetido = planos.filter((p) => p.t === t).length > 1;
      const idx = planos.filter((p) => p.t === t).findIndex((p) => p.i === i) + 1;
      previdencia.push({ competencia: comp, plano: repetido ? `${t} ${idx}` : t, tipo: /VGBL/i.test(t) ? 'VGBL' : 'PGBL', valor: v });
    }
  }
  return { mensal, previdencia, ano };
}

/** Mesmo critério do banco: sem acento, maiúsculas e sem a palavra "Previdência". */
export const normPlano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\s*previdencia(\s+privada)?\s*[-:]?\s*/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
