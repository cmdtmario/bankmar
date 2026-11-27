// Tela inicial: o mês num relance — comprometimento da renda, o que vence, para onde foi o dinheiro.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Bar, BarChart, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, HandCoins, ListChecks, Wallet } from 'lucide-react';
import { carregarPainel, type PainelDados, type Vencimento } from '../lib/painel';
import { pctBR, brl, dataBR, competenciaDe, hojeBrasilia, nomeMes, somaMeses } from '../lib/formato';
import { Contador, Esqueleto, Mostrador, Sequencia } from '../ui/animacao';
import { Erro, useAcao } from '../ui/comum';
import { FormPagamento } from './Mes';
import { TEMA } from '../ui/tema';

const PALETA = TEMA.serie;
const brlCurto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const mesCurto = (c: string) => new Date(c + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');

function DicaGrafico({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dica">
      {label && <div className="sub">{label.length === 10 ? nomeMes(label) : label}</div>}
      {payload.map((p) => <div key={p.name}><span style={{ color: p.color }}>●</span> {p.name}: <strong>{brl(Number(p.value))}</strong></div>)}
    </div>
  );
}

function rotuloPrazo(v: Vencimento) {
  if (v.dias < 0) return { texto: v.dias === -1 ? 'venceu ontem' : `venceu há ${-v.dias} dias`, classe: 'atraso' };
  if (v.dias === 0) return { texto: 'vence hoje', classe: 'hoje' };
  if (v.dias === 1) return { texto: 'vence amanhã', classe: 'hoje' };
  return { texto: `em ${v.dias} dias`, classe: '' };
}

export function Painel() {
  const hoje = hojeBrasilia();
  const [comp, setComp] = useState(competenciaDe(hoje));
  const [d, setD] = useState<PainelDados | null>(null);
  const [pagando, setPagando] = useState<Vencimento | null>(null);
  const { erro, rodar } = useAcao();
  const nav = useNavigate();
  const reduzir = useReducedMotion();

  const carregar = () => rodar(async () => setD(await carregarPainel(comp, hoje)));
  useEffect(() => { setD(null); carregar(); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = d?.renda ? d.gastoMario / d.renda : null;
  const livre = d?.renda != null ? d.renda - d.gastoMario : null;
  const variacao = d?.mediaTres ? (d.gastoMario - d.mediaTres) / d.mediaTres : null;

  return (
    <main className="painel">
      <div className="linha entre seletor-mes">
        <button className="icone" onClick={() => setComp(somaMeses(comp, -1))} aria-label="Mês anterior"><ChevronLeft size={20} /></button>
        <h1 style={{ margin: 0 }}>{nomeMes(comp)}</h1>
        <button className="icone" onClick={() => setComp(somaMeses(comp, 1))} aria-label="Próximo mês"><ChevronRight size={20} /></button>
      </div>
      <Erro msg={erro} />

      {/* Mostrador: o único momento animado da tela */}
      <section className="card destaque">
        {!d ? <Esqueleto altura={240} /> : (
          <div className="destaque-grade">
            <Mostrador pct={pct}>
              <div className="sub">gasto meu no mês</div>
              <div className="valor-grande"><Contador valor={d.gastoMario} /></div>
              <div className="sub">{pct == null ? 'informe a renda' : `${pctBR(pct, 0)} da renda`}</div>
            </Mostrador>
            <dl className="resumo-numeros">
              <div><dt>Renda líquida</dt><dd>{d.renda == null ? <Link to="/mes">informar</Link> : <Contador valor={d.renda} />}</dd></div>
              <div><dt>Sobra prevista</dt><dd className={livre != null && livre < 0 ? 'neg' : ''}>{livre == null ? '—' : <Contador valor={livre} />}</dd></div>
              <div><dt>Total com divisões</dt><dd><Contador valor={d.gastoTotal} /></dd></div>
              {variacao != null && (
                <div><dt>Contra a média de 3 meses</dt><dd className={variacao > 0.05 ? 'neg' : variacao < -0.05 ? 'pos' : ''}>{variacao > 0 ? '+' : ''}{pctBR(variacao, 0)}</dd></div>
              )}
            </dl>
          </div>
        )}
      </section>

      {/* Vencimentos */}
      <section>
        <h2><CalendarClock size={18} aria-hidden="true" /> A pagar nos próximos dias</h2>
        {!d ? <Esqueleto altura={120} /> : !d.vencimentos.length ? (
          <div className="card vazio"><CheckCircle2 size={20} color="var(--ok)" aria-hidden="true" /> Nada vencendo nos próximos 10 dias nem em atraso.</div>
        ) : (
          <Sequencia className="lista-venc">
            {d.vencimentos.map((v) => {
              const r = rotuloPrazo(v);
              return (
                <div className={`venc-linha ${r.classe}`} key={v.tipo + v.id}>
                  <div className="venc-icone" aria-hidden="true">{v.tipo === 'fatura' ? <CreditCard size={18} /> : <Wallet size={18} />}</div>
                  <div className="grow">
                    <strong>{v.nome}</strong>
                    <div className="sub">{dataBR(v.vencimento).slice(0, 5)} · <span className={`prazo ${r.classe}`}>{r.texto}</span>{v.pago > 0 ? ` · faltam ${brl(v.falta)}` : ''}</div>
                  </div>
                  <div className="num"><strong>{brl(v.falta)}</strong><button className="link-acao" onClick={() => setPagando(v)} aria-label={`Pagar ${v.nome}`}>Pagar</button></div>
                </div>
              );
            })}
          </Sequencia>
        )}
      </section>

      <div className="grade-2">
        {/* Categorias */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Para onde foi</h2>
          {!d ? <Esqueleto altura={200} /> : !d.categorias.length ? <p className="sub">Sem gastos categorizados neste mês.</p> : (
            <div className="rosca">
              <div style={{ width: 170, height: 170 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.categorias} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={!reduzir} animationDuration={700}>
                      {d.categorias.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
                    </Pie>
                    <Tooltip content={<DicaGrafico />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="legenda">
                {d.categorias.map((c, i) => (
                  <li key={c.nome}><span className="ponto" style={{ background: PALETA[i % PALETA.length] }} />{c.nome}<span className="num">{brl(c.valor)}</span></li>
                ))}
              </ul>
            </div>
          )}
          <Link to="/categorias" className="mais-link">Ver gastos por categoria</Link>
        </section>

        {/* 12 meses */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Últimos 12 meses</h2>
          {!d ? <Esqueleto altura={200} /> : (
            <div style={{ height: 210 }}>
              <ResponsiveContainer>
                <ComposedChart data={d.serie} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barraOuro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEMA.ouroClaro} /><stop offset="100%" stopColor={TEMA.ouroEscuro} /></linearGradient>
                  </defs>
                  <XAxis dataKey="comp" tickFormatter={mesCurto} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={brlCurto} tick={{ fill: TEMA.textoSuave, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<DicaGrafico />} cursor={{ fill: 'rgba(212,171,92,.08)' }} />
                  <Bar dataKey="gasto" name="Meu gasto" fill="url(#barraOuro)" radius={[4, 4, 0, 0]} isAnimationActive={!reduzir} onClick={(x) => { const c = (x as { payload?: { comp?: string } }).payload?.comp; if (c) setComp(c); }} cursor="pointer" />
                  <Line dataKey="renda" name="Renda" stroke={TEMA.renda} strokeWidth={2} dot={false} connectNulls isAnimationActive={!reduzir} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="sub">Barras: o que é seu em cada mês. Linha: renda informada. Toque numa barra para abrir o mês.</p>
        </section>
      </div>

      <div className="grade-2">
        {/* A receber */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}><HandCoins size={18} aria-hidden="true" /> A receber</h2>
          {!d ? <Esqueleto altura={100} /> : !d.aReceber.length ? <p className="sub">Ninguém te deve nada agora.</p> : (
            <ul className="lista-simples">
              {d.aReceber.map((p) => (
                <li key={p.id}><button className="linha-botao" onClick={() => nav(`/pessoas/${p.id}`)}><span className="grow">{p.nome}</span><span className={`num ${p.saldo < 0 ? 'neg' : ''}`}>{brl(p.saldo)}</span><ChevronRight size={16} aria-hidden="true" /></button></li>
              ))}
            </ul>
          )}
        </section>

        {/* Faturas por cartão */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}><CreditCard size={18} aria-hidden="true" /> Faturas do mês</h2>
          {!d ? <Esqueleto altura={100} /> : !d.cartoes.length ? <p className="sub">Nenhuma fatura neste mês. <Link to="/faturas">Importar</Link></p> : (
            <div style={{ height: Math.max(80, d.cartoes.length * 30) }}>
              <ResponsiveContainer>
                <BarChart data={d.cartoes} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nome" width={120} tick={{ fill: TEMA.texto, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DicaGrafico />} cursor={{ fill: 'rgba(212,171,92,.08)' }} />
                  <Bar dataKey="mario" name="Meu" stackId="a" fill={TEMA.ouro} isAnimationActive={!reduzir} />
                  <Bar dataKey={(x: { total: number; mario: number }) => Math.max(0, x.total - x.mario)} name="Dos outros" stackId="a" fill={TEMA.marca} radius={[0, 4, 4, 0]} isAnimationActive={!reduzir} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Pendências */}
      {d && (d.pendencias.naoConferidos > 0 || d.pendencias.aRevisar > 0 || d.pendencias.semRenda) && (
        <motion.section className="card pendencias" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduzir ? 0 : 0.6 }}>
          <h2 style={{ marginTop: 0 }}><ListChecks size={18} aria-hidden="true" /> Para resolver</h2>
          <ul className="lista-simples">
            {d.pendencias.semRenda && <li><Link to="/mes"><AlertTriangle size={15} aria-hidden="true" /> Renda de {nomeMes(comp)} não informada</Link></li>}
            {d.pendencias.naoConferidos > 0 && <li><Link to="/faturas"><AlertTriangle size={15} aria-hidden="true" /> {d.pendencias.naoConferidos} lançamento(s) de fatura sem conferir</Link></li>}
            {d.pendencias.aRevisar > 0 && <li><Link to="/pessoas"><AlertTriangle size={15} aria-hidden="true" /> Divisões da planilha sem responsável (“A revisar”)</Link></li>}
          </ul>
        </motion.section>
      )}

      {pagando && <FormPagamento item={{ ...pagando, mario: 0 }} hoje={hoje} onFechar={() => setPagando(null)} onSalvo={() => { setPagando(null); carregar(); }} />}
    </main>
  );
}
