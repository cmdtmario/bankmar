// Entrega 3 — Investimentos (RF-60 a RF-69).
import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, FileUp, RefreshCw, Target } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { carregarCarteira, importarArquivoB3, salvarAjuste, atualizarCotacoes, type Carteira } from '../lib/investimentos/dados';
import { lerArquivoB3, ArquivoB3Error, type Classe } from '../lib/investimentos/b3';
import { NOME_CLASSE, type Ativo } from '../lib/investimentos/carteira';
import { lerPlanilhaAntiga, conciliar, type Divergencia } from '../lib/investimentos/planilhaAntiga';
import { brl, dataBR, pctBR, somaCentavos, competenciaDe, hojeBrasilia, somaMeses, nomeMes } from '../lib/formato';
import { Contador, Esqueleto } from '../ui/animacao';
import { Erro, Modal, numeroDe, useAcao } from '../ui/comum';
import { TEMA } from '../ui/tema';

type Aba = 'resumo' | 'ativos' | 'proventos' | 'importar';
const ABAS: [Aba, string][] = [['resumo', 'Resumo'], ['ativos', 'Ativos'], ['proventos', 'Proventos'], ['importar', 'Importar']];
const brlCurto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));

function Dica({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dica">
      {label && <div className="sub">{/^\d{4}-\d{2}/.test(label) ? nomeMes(label.slice(0, 7) + '-01') : label}</div>}
      {payload.map((p) => <div key={p.name}><span style={{ color: p.color }}>●</span> {p.name}: <strong>{brl(Number(p.value))}</strong></div>)}
    </div>
  );
}

export function Investimentos() {
  const [aba, setAba] = useState<Aba>('resumo');
  const [c, setC] = useState<Carteira | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { erro, ocupado, rodar } = useAcao();
  const carregar = () => rodar(async () => setC(await carregarCarteira()));
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (c && !c.temDados) setAba('importar'); }, [c]);

  return (
    <main>
      <div className="linha entre">
        <h1 style={{ margin: '8px 0' }}>Investimentos</h1>
        {c?.temDados && (
          <button disabled={ocupado} onClick={() => rodar(async () => { const r = await atualizarCotacoes(); setMsg(`${r.atualizadas} cotações atualizadas${r.falhas.length ? `; sem cotação: ${r.falhas.join(', ')}` : ''}.`); await carregar(); })}>
            <RefreshCw size={16} aria-hidden="true" /> Cotações
          </button>
        )}
      </div>
      {c?.dataPosicao && <p className="sub" style={{ marginTop: 0 }}>Posição da B3 de {dataBR(c.dataPosicao)}</p>}
      <div className="segmentos" role="tablist">
        {ABAS.map(([k, t]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}
      {!c ? <Esqueleto altura={320} /> : aba === 'resumo' ? <Resumo c={c} /> : aba === 'ativos' ? <Ativos c={c} onSalvo={carregar} /> : aba === 'proventos' ? <Proventos c={c} /> : <Importar c={c} onImportado={carregar} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
function Resumo({ c }: { c: Carteira }) {
  const reduzir = useReducedMotion();
  const total = somaCentavos([c.totalB3, c.totalManual]);
  const comCusto = c.ativos.filter((a) => a.investido != null);
  const resultado = somaCentavos(comCusto.map((a) => a.resultado ?? 0));
  const ini12 = somaMeses(competenciaDe(hojeBrasilia()), -11);
  const prov12 = somaCentavos(c.proventos.filter((p) => p.data >= ini12).map((p) => p.valor));
  const porClasse = new Map<string, number>();
  for (const a of c.ativos) porClasse.set(NOME_CLASSE[a.classe], somaCentavos([porClasse.get(NOME_CLASSE[a.classe]) ?? 0, a.mercado]));
  for (const m of c.manuais) porClasse.set(NOME_CLASSE[m.classe], somaCentavos([porClasse.get(NOME_CLASSE[m.classe]) ?? 0, m.saldo]));
  const classes = [...porClasse.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  const porInst = new Map<string, number>();
  for (const a of c.ativos) { const i = a.instituicoes[0] ?? '—'; porInst.set(i, somaCentavos([porInst.get(i) ?? 0, a.mercado])); }
  for (const m of c.manuais) porInst.set(c.agrupar(m.instituicao), somaCentavos([porInst.get(c.agrupar(m.instituicao)) ?? 0, m.saldo]));
  const instituicoes = [...porInst.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  const top10 = c.ativos.slice(0, 10).map((a) => ({ nome: a.codigo, valor: a.mercado, pct: total ? a.mercado / total : 0 }));
  const pesoTop10 = total ? somaCentavos(top10.map((t) => t.valor)) / total : 0;
  const evolucao = [...c.fotos, { competencia: competenciaDe(hojeBrasilia()), valor: total }];

  return (
    <>
      <section className="card destaque">
        <div className="sub">Patrimônio total</div>
        <div className="valor-grande" style={{ fontSize: 'clamp(1.6rem, 7vw, 2.2rem)' }}><Contador valor={total} /></div>
        <dl className="resumo-numeros" style={{ marginTop: 10 }}>
          <div><dt>Na B3</dt><dd><Contador valor={c.totalB3} /></dd></div>
          <div><dt>Fora da B3 (previdência etc.)</dt><dd><Contador valor={c.totalManual} /></dd></div>
          <div><dt>Resultado dos ativos com custo</dt><dd className={resultado < 0 ? 'neg' : 'pos'}>{brl(resultado)}</dd></div>
          <div><dt>Proventos em 12 meses</dt><dd><Contador valor={prov12} /></dd></div>
        </dl>
      </section>

      {c.aReceber.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}><CalendarClock size={18} aria-hidden="true" /> Próximos pagamentos</h2>
          <ul className="lista-simples">
            {c.aReceber.map((r, i) => <li key={i} className="linha entre" style={{ padding: '8px 0' }}><span><strong>{r.codigo}</strong> <span className="sub">{r.evento.toLowerCase()} · {dataBR(r.previsao)}</span></span><span className="num">{brl(r.valor)}</span></li>)}
          </ul>
          <p className="sub">Total previsto: {brl(somaCentavos(c.aReceber.map((r) => r.valor)))}</p>
        </section>
      )}

      <div className="grade-2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Por classe</h2>
          <div className="rosca">
            <div style={{ width: 170, height: 170 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={classes} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={!reduzir}>
                    {classes.map((_, i) => <Cell key={i} fill={TEMA.serie[i % TEMA.serie.length]} />)}
                  </Pie>
                  <Tooltip content={<Dica />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="legenda">
              {classes.map((x, i) => <li key={x.nome}><span className="ponto" style={{ background: TEMA.serie[i % TEMA.serie.length] }} />{x.nome}<span className="num">{pctBR(total ? x.valor / total : 0, 0)}</span></li>)}
            </ul>
          </div>
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Por instituição</h2>
          <div style={{ height: Math.max(100, instituicoes.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={instituicoes} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fill: TEMA.texto, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Dica />} cursor={{ fill: 'rgba(212,171,92,.08)' }} />
                <Bar dataKey="valor" name="Valor" fill={TEMA.ouro} radius={[0, 4, 4, 0]} isAnimationActive={!reduzir} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grade-2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Evolução</h2>
          {evolucao.length < 2 ? <p className="sub">A evolução aparece a partir da primeira foto mensal (1º dia útil de cada mês).</p> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <AreaChart data={evolucao} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                  <defs><linearGradient id="areaOuro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEMA.ouro} stopOpacity={0.5} /><stop offset="100%" stopColor={TEMA.ouro} stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="competencia" tickFormatter={(v: string) => `${v.slice(5, 7)}/${v.slice(2, 4)}`} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={brlCurto} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<Dica />} />
                  <Area dataKey="valor" name="Patrimônio" stroke={TEMA.ouro} fill="url(#areaOuro)" strokeWidth={2} isAnimationActive={!reduzir} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Concentração</h2>
          <p className="sub" style={{ marginTop: 0 }}>Os 10 maiores ativos somam {pctBR(pesoTop10, 0)} do patrimônio.</p>
          {top10.map((t) => (
            <div key={t.nome} style={{ marginBottom: 6 }}>
              <div className="linha entre" style={{ fontSize: '.9rem' }}><span>{t.nome}</span><span className="num">{pctBR(t.pct)}</span></div>
              <div className="barra"><div style={{ width: `${Math.min(100, t.pct * 100 / Math.max(top10[0]?.pct ?? 1, 0.0001))}%` }} /></div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function Ativos({ c, onSalvo }: { c: Carteira; onSalvo: () => void }) {
  const classesPresentes = [...new Set(c.ativos.map((a) => a.classe))];
  const [filtro, setFiltro] = useState<Classe | 'todas' | 'incompletos'>('todas');
  const [ordem, setOrdem] = useState<'valor' | 'resultado' | 'proventos'>('valor');
  const [edit, setEdit] = useState<Ativo | null>(null);
  const negociavel = (a: Ativo) => ['acao', 'bdr', 'etf', 'fii'].includes(a.classe);
  const lista = c.ativos
    .filter((a) => filtro === 'todas' || (filtro === 'incompletos' ? negociavel(a) && a.pm == null : a.classe === filtro))
    .sort((a, b) => (ordem === 'valor' ? b.mercado - a.mercado : ordem === 'resultado' ? (b.resultadoPct ?? -9) - (a.resultadoPct ?? -9) : b.proventos - a.proventos));
  const incompletos = c.ativos.filter((a) => negociavel(a) && a.pm == null).length;
  return (
    <>
      {incompletos > 0 && (
        <div className="aviso"><AlertTriangle size={15} aria-hidden="true" /> {incompletos} ativo(s) sem preço médio: o histórico da B3 não explica a quantidade atual (compras em IPO, ofertas ou conversões). Informe o preço médio tocando no ativo ou use a conferência com a planilha antiga em “Importar”.</div>
      )}
      <div className="chips" role="group" aria-label="Filtrar por classe">
        <button className={filtro === 'todas' ? 'ativo' : ''} onClick={() => setFiltro('todas')}>Todas</button>
        {classesPresentes.map((k) => <button key={k} className={filtro === k ? 'ativo' : ''} onClick={() => setFiltro(k)}>{NOME_CLASSE[k]}</button>)}
        {incompletos > 0 && <button className={filtro === 'incompletos' ? 'ativo' : ''} onClick={() => setFiltro('incompletos')}>Sem preço médio</button>}
      </div>
      <div className="linha" style={{ margin: '6px 0 10px' }}>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}><option value="valor">valor</option><option value="resultado">resultado %</option><option value="proventos">proventos</option></select>
        </label>
      </div>
      {lista.map((a) => (
        <button key={a.codigo} className="card ativo-linha" onClick={() => setEdit(a)}>
          <div className="grow" style={{ textAlign: 'left' }}>
            <strong>{a.codigo}</strong> <span className="sub">{a.nome.slice(0, 40)}</span>
            <div className="sub">
              {negociavel(a) ? `${a.quantidade.toLocaleString('pt-BR')} × ${a.preco != null ? brl(a.preco) : '—'}` : NOME_CLASSE[a.classe]}
              {a.pm != null && negociavel(a) && ` · PM ${brl(a.pm)}${a.origemPm !== 'histórico B3' ? ` (${a.origemPm})` : ''}`}
              {negociavel(a) && a.pm == null && <span style={{ color: 'var(--alerta)' }}> · sem preço médio</span>}
              {a.proventos ? ` · proventos ${brl(a.proventos)}` : ''}
              {a.alvo != null && <span className={a.atingiuAlvo ? 'pos' : ''}> · <Target size={12} aria-hidden="true" /> alvo {brl(a.alvo)}{a.atingiuAlvo ? ' atingido' : ''}</span>}
            </div>
          </div>
          <div className="num">
            <strong>{brl(a.mercado)}</strong>
            {a.resultadoPct != null && <div className={a.resultadoPct < 0 ? 'neg' : 'pos'} style={{ fontSize: '.85rem' }}>{a.resultadoPct > 0 ? '+' : ''}{pctBR(a.resultadoPct)}</div>}
          </div>
        </button>
      ))}
      {edit && <EditarAtivo a={edit} c={c} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); onSalvo(); }} />}
    </>
  );
}

function EditarAtivo({ a, c, onFechar, onSalvo }: { a: Ativo; c: Carteira; onFechar: () => void; onSalvo: () => void }) {
  const [pm, setPm] = useState(a.origemPm && a.origemPm !== 'histórico B3' && a.pm != null ? String(a.pm).replace('.', ',') : '');
  const [alvo, setAlvo] = useState(a.alvo != null ? String(a.alvo).replace('.', ',') : '');
  const { erro, ocupado, rodar } = useAcao();
  const hist = c.custos.get(a.codigo);
  const prov = c.proventos.filter((p) => p.codigo === a.codigo);
  return (
    <Modal titulo={`${a.codigo} — ${a.nome.slice(0, 30)}`} onFechar={onFechar}>
      <dl className="resumo-numeros">
        <div><dt>Quantidade (B3)</dt><dd>{a.quantidade.toLocaleString('pt-BR')}</dd></div>
        <div><dt>Valor</dt><dd>{brl(a.mercado)}</dd></div>
        <div><dt>Investido</dt><dd>{brl(a.investido)}</dd></div>
        <div><dt>Retorno total (com proventos)</dt><dd className={(a.retornoTotal ?? 0) < 0 ? 'neg' : 'pos'}>{brl(a.retornoTotal)}</dd></div>
      </dl>
      <p className="sub">
        Histórico da B3: {hist ? `${hist.quantidade.toLocaleString('pt-BR')} cotas calculadas, PM ${hist.pm != null ? brl(hist.pm) : '—'}, ${hist.vendas.length} venda(s)` : 'sem negociações'}.
        {hist?.eventosSemCusto.length ? ` Eventos sem custo: ${hist.eventosSemCusto.join(', ')}.` : ''}
        {!a.custoCompleto && ' O histórico não bate com a posição atual, então o PM calculado não é usado.'}
      </p>
      <div className="campos">
        <label>Preço médio manual (vazio = usar o histórico)<input inputMode="decimal" value={pm} onChange={(e) => setPm(e.target.value)} /></label>
        <label>Preço-alvo de saída (opcional)<input inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} /></label>
      </div>
      <p className="sub">{prov.length} provento(s) recebido(s), total {brl(somaCentavos(prov.map((p) => p.valor)))}.</p>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => { await salvarAjuste(a.codigo, { preco_medio: numeroDe(pm), preco_alvo: numeroDe(alvo), origem: numeroDe(pm) != null ? 'manual' : null as unknown as string }); onSalvo(); })}>Salvar</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
const TIPOS: [string, string, string][] = [['rendimento', 'Rendimentos (FII)', TEMA.ouroClaro], ['dividendo', 'Dividendos', TEMA.ouro], ['jcp', 'JCP', TEMA.ouroEscuro], ['juros', 'Juros (renda fixa)', TEMA.renda]];
function Proventos({ c }: { c: Carteira }) {
  const reduzir = useReducedMotion();
  const anos = [...new Set(c.proventos.map((p) => p.data.slice(0, 4)))].sort().reverse();
  const [ano, setAno] = useState(anos[0] ?? String(new Date().getFullYear()));
  const doAno = c.proventos.filter((p) => p.data.startsWith(ano));
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const dados = meses.map((m) => {
    const o: Record<string, number | string> = { mes: m };
    for (const [t] of TIPOS) o[t] = somaCentavos(doAno.filter((p) => p.data.startsWith(m) && p.tipo === t).map((p) => p.valor));
    return o;
  });
  const porAno = anos.map((a) => ({ ano: a, total: somaCentavos(c.proventos.filter((p) => p.data.startsWith(a)).map((p) => p.valor)) }));
  const porAtivo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of doAno) m.set(p.codigo, somaCentavos([m.get(p.codigo) ?? 0, p.valor]));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [doAno]);
  if (!c.proventos.length) return <p className="sub">Importe o arquivo de Movimentação da B3 para ver os proventos.</p>;
  return (
    <>
      <div className="chips">{anos.map((a) => <button key={a} className={a === ano ? 'ativo' : ''} onClick={() => setAno(a)}>{a}</button>)}</div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{ano}: {brl(somaCentavos(doAno.map((p) => p.valor)))}</h2>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={dados} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
              <XAxis dataKey="mes" tickFormatter={(v: string) => new Date(v + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={brlCurto} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<Dica />} cursor={{ fill: 'rgba(212,171,92,.08)' }} />
              {TIPOS.map(([t, nome, cor], i) => <Bar key={t} dataKey={t} name={nome} stackId="p" fill={cor} radius={i === TIPOS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={!reduzir} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="legenda" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {TIPOS.map(([t, nome, cor]) => <li key={t} style={{ border: 0 }}><span className="ponto" style={{ background: cor }} />{nome}</li>)}
        </ul>
      </section>
      <div className="grade-2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Quem mais pagou em {ano}</h2>
          <ul className="lista-simples">{porAtivo.map(([k, v]) => <li key={k} className="linha entre" style={{ padding: '6px 0' }}><span>{k}</span><span className="num">{brl(v)}</span></li>)}</ul>
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Por ano</h2>
          <ul className="lista-simples">{porAno.map((a) => <li key={a.ano} className="linha entre" style={{ padding: '6px 0' }}><span>{a.ano}</span><span className="num">{brl(a.total)}</span></li>)}</ul>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function Importar({ c, onImportado }: { c: Carteira; onImportado: () => void }) {
  const [resultados, setResultados] = useState<string[]>([]);
  const [div, setDiv] = useState<Divergencia[] | null>(null);
  const [pmsPlanilha, setPmsPlanilha] = useState<{ codigo: string; pm: number }[]>([]);
  const [manual, setManual] = useState({ instituicao: '', produto: '', classe: 'previdencia', competencia: competenciaDe(hojeBrasilia()).slice(0, 7), saldo: '', aportes: '' });
  const { erro, ocupado, rodar } = useAcao();

  const importar = (arquivos: FileList) => rodar(async () => {
    const msgs: string[] = [];
    for (const f of [...arquivos]) {
      try {
        const arq = lerArquivoB3(new Uint8Array(await f.arrayBuffer()));
        const r = await importarArquivoB3(arq, f.name);
        msgs.push(`${f.name}: ${arq.tipo} — ${r.novas} nova(s) de ${r.total} linha(s)${r.dataRef ? `, posição de ${dataBR(r.dataRef)}` : ''}.`);
      } catch (e) {
        msgs.push(`${f.name}: ${e instanceof ArquivoB3Error ? e.message : String(e)} Nada deste arquivo foi gravado.`);
      }
    }
    setResultados(msgs);
    onImportado();
  });

  const conferir = (f: File) => rodar(async () => {
    const { resumo } = lerPlanilhaAntiga(new Uint8Array(await f.arrayBuffer()));
    setDiv(conciliar(resumo, c.ativos, c.proventos));
    setPmsPlanilha(c.ativos.filter((a) => ['acao', 'bdr', 'etf', 'fii'].includes(a.classe) && a.pm == null && resumo.has(a.codigo)).map((a) => ({ codigo: a.codigo, pm: Math.round(resumo.get(a.codigo)!.pm * 1e4) / 1e4 })));
  });

  const grupos = div ? (['quantidade', 'preço médio', 'proventos'] as const).map((campo) => ({ campo, itens: div.filter((d) => d.campo === campo) })) : [];
  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}><FileUp size={18} aria-hidden="true" /> Arquivos da B3</h2>
        <p className="sub">Área do Investidor → Extratos: exporte <strong>Negociação</strong> e <strong>Movimentação</strong> (período mais longo possível), <strong>Posição</strong> e <strong>Proventos a receber</strong>. Pode enviar todos de uma vez; o que já foi importado não se repete.</p>
        <label className="linha"><span className="botao-arquivo"><FileUp size={16} aria-hidden="true" /> Escolher arquivos</span>
          <input type="file" accept=".xlsx" multiple style={{ width: 0, height: 0, opacity: 0 }} disabled={ocupado} onChange={(e) => { if (e.target.files?.length) importar(e.target.files); e.target.value = ''; }} />
        </label>
        {ocupado && <p className="sub">Importando…</p>}
        {resultados.map((r, i) => <div key={i} className={/Nada deste/.test(r) ? 'erro' : 'okmsg'}>{r}</div>)}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Previdência e aplicações fora da B3</h2>
        <p className="sub">Informe o saldo do mês de cada plano (Brasilprev, Icatu, Itaú, Porto, Bradesco…). Vale sempre o saldo mais recente.</p>
        <div className="campos">
          <label>Instituição<input value={manual.instituicao} onChange={(e) => setManual({ ...manual, instituicao: e.target.value })} /></label>
          <label>Produto<input value={manual.produto} placeholder="ex.: PGBL Brasilprev RT" onChange={(e) => setManual({ ...manual, produto: e.target.value })} /></label>
          <label>Tipo<select value={manual.classe} onChange={(e) => setManual({ ...manual, classe: e.target.value })}><option value="previdencia">Previdência</option><option value="renda_fixa">Renda fixa</option><option value="fundo">Fundo</option><option value="outro">Outro</option></select></label>
          <label>Mês<input type="month" value={manual.competencia} onChange={(e) => setManual({ ...manual, competencia: e.target.value })} /></label>
          <label>Saldo<input inputMode="decimal" value={manual.saldo} onChange={(e) => setManual({ ...manual, saldo: e.target.value })} /></label>
          <label>Aportes no mês (opcional)<input inputMode="decimal" value={manual.aportes} onChange={(e) => setManual({ ...manual, aportes: e.target.value })} /></label>
        </div>
        <button className="pri" style={{ marginTop: 8 }} disabled={ocupado} onClick={() => rodar(async () => {
          const saldo = numeroDe(manual.saldo);
          if (!manual.instituicao.trim() || !manual.produto.trim() || saldo == null) throw new Error('Informe instituição, produto e saldo.');
          ok(await supabase.from('inv_saldos_manuais').upsert({ instituicao: manual.instituicao.trim(), produto: manual.produto.trim(), classe: manual.classe, competencia: manual.competencia + '-01', saldo, aportes: numeroDe(manual.aportes) }, { onConflict: 'user_id,instituicao,produto,competencia' }));
          setManual({ ...manual, saldo: '', aportes: '' });
          onImportado();
        })}>Salvar saldo</button>
        {c.manuais.length > 0 && (
          <ul className="lista-simples" style={{ marginTop: 8 }}>
            {c.manuais.map((m) => <li key={m.id} className="linha entre" style={{ padding: '6px 0' }}><span>{m.instituicao} · {m.produto} <span className="sub">({nomeMes(m.competencia).toLowerCase()})</span></span><span className="num">{brl(m.saldo)}</span></li>)}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Conferir com a planilha antiga</h2>
        <p className="sub">Envie o INVESTIMENTOS.xlsx. Ele é lido só para comparar: nada da planilha substitui os dados da B3.</p>
        <label className="linha"><span className="botao-arquivo"><FileUp size={16} aria-hidden="true" /> Escolher planilha</span>
          <input type="file" accept=".xlsx" style={{ width: 0, height: 0, opacity: 0 }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) conferir(f); }} />
        </label>
        {pmsPlanilha.length > 0 && (
          <div className="aviso" style={{ marginTop: 8 }}>
            {pmsPlanilha.length} ativo(s) sem preço médio têm preço de compra na planilha ({pmsPlanilha.map((p) => p.codigo).join(', ')}).
            <button className="pri pequeno" style={{ marginLeft: 8 }} disabled={ocupado} onClick={() => rodar(async () => {
              for (const p of pmsPlanilha) await salvarAjuste(p.codigo, { preco_medio: p.pm, origem: 'planilha' });
              setPmsPlanilha([]);
              onImportado();
            })}>Usar preço da planilha</button>
          </div>
        )}
        {div && (div.length === 0 ? <div className="okmsg">Nenhuma diferença entre a planilha e a B3.</div> : grupos.filter((g) => g.itens.length).map((g) => (
          <details key={g.campo} open={g.campo !== 'proventos'}>
            <summary>{g.itens.length} diferença(s) de {g.campo}</summary>
            <div className="rolar"><table>
              <thead><tr><th>Ativo</th><th className="num">Planilha</th><th className="num">B3</th><th>Obs.</th></tr></thead>
              <tbody>{g.itens.map((d, i) => <tr key={i}><td>{d.codigo}</td><td className="num">{d.planilha}</td><td className="num">{d.b3}</td><td className="sub">{d.detalhe ?? ''}</td></tr>)}</tbody>
            </table></div>
          </details>
        )))}
      </section>
      <Erro msg={erro} />
    </>
  );
}
