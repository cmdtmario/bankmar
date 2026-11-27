// Entrega 2 — Milhas e pontos (RF-50 a RF-58, RF-92).
import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FileUp, Plus } from 'lucide-react';
import {
  carregarMilhas, garantirConta, inserirMovimentos, removerMovimento, salvarVenda, removerVenda, salvarEmissao, removerEmissao, salvarPrograma,
  importarMilhasPlanilha, type DadosMilhas, type ContaMilhas, type Programa,
} from '../lib/dadosCartoes';
import { cashbackRenunciado, cpfsUsados, custoMilheiro, lerControleMilhas, lucroVenda, pontosPrevistos, saldoImportado, transferencia } from '../lib/milhas';
import { brl, dataBR, hojeBrasilia, nomeMes, somaCentavos } from '../lib/formato';
import { Carregando, Erro, Modal, numeroDe, useAcao } from '../ui/comum';

type Aba = 'resumo' | 'movimentos' | 'vendas' | 'emissoes' | 'importar';
const ABAS: [Aba, string][] = [['resumo', 'Resumo'], ['movimentos', 'Movimentos'], ['vendas', 'Vendas'], ['emissoes', 'Emissões'], ['importar', 'Importar']];
const pts = (v: number) => Math.round(v).toLocaleString('pt-BR');
const mil = (v: number | null) => (v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ORIGENS: Record<string, string> = { cartao: 'Cartão', clube: 'Clube', compra: 'Compra', transferencia: 'Transferência', bonus_transferencia: 'Bônus de transferência', voo: 'Voo', bonus: 'Bônus/missão', outros: 'Outros', uso: 'Uso em viagem', expiracao: 'Expiração', ajuste: 'Ajuste', cashback: 'Cashback renunciado' };

export function Milhas() {
  const [aba, setAba] = useState<Aba>('resumo');
  const [d, setD] = useState<DadosMilhas | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { erro, rodar } = useAcao();
  const carregar = () => rodar(async () => setD(await carregarMilhas()));
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d && !d.contas.length) setAba('importar'); }, [d?.contas.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const nomeConta = (id: string) => { const c = d?.contas.find((x) => x.conta_id === id); return c ? `${c.programa} · ${c.titular}` : '—'; };

  return (
    <main>
      <h1 style={{ margin: '8px 0' }}>Milhas e pontos</h1>
      <div className="segmentos" role="tablist">
        {ABAS.map(([k, t]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}
      {!d ? <Carregando /> : aba === 'resumo' ? <Resumo d={d} onMudou={carregar} />
        : aba === 'movimentos' ? <Movimentos d={d} nomeConta={nomeConta} onMudou={carregar} />
        : aba === 'vendas' ? <Vendas d={d} nomeConta={nomeConta} onMudou={carregar} />
        : aba === 'emissoes' ? <Emissoes d={d} nomeConta={nomeConta} onMudou={carregar} />
        : <Importar onImportado={(t) => { setMsg(t); carregar(); }} />}
    </main>
  );
}

function SelConta({ contas, valor, onMuda, rotulo = 'Conta' }: { contas: ContaMilhas[]; valor: string; onMuda: (v: string) => void; rotulo?: string }) {
  return (
    <label>{rotulo}<select value={valor} onChange={(e) => onMuda(e.target.value)}>
      <option value="">Escolha…</option>
      {contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.programa} · {c.titular}</option>)}
    </select></label>
  );
}

// ---------------------------------------------------------------------------
function Resumo({ d, onMudou }: { d: DadosMilhas; onMudou: () => void }) {
  const hoje = hojeBrasilia();
  const [prog, setProg] = useState<Programa | null>(null);
  const [confirmando, setConfirmando] = useState<{ invoice_id: string; previsto: number; conta: string; total: number; pct: number; competencia: string; apelido: string } | null>(null);
  const minhas = d.contas.filter((c) => !c.de_terceiro);
  const terceiros = d.contas.filter((c) => c.de_terceiro);
  const ini12 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const vendas12 = d.vendas.filter((v) => v.data >= ini12 && v.status !== 'cancelado');
  const cm = (conta: string) => d.contas.find((c) => c.conta_id === conta)?.custo_milheiro ?? null;
  const lucro12 = somaCentavos(vendas12.map((v) => lucroVenda(v.valor_total, v.quantidade, cm(v.conta_id))));

  // RF-58: por programa (somente contas do Mário), RF-56: CPFs
  const porPrograma = (contas: ContaMilhas[]) => d.programas.map((p) => {
    const cs = contas.filter((c) => c.programa_id === p.id);
    if (!cs.length) return null;
    const ids = new Set(d.contas.filter((c) => c.programa_id === p.id).map((c) => c.conta_id));
    const usados = cpfsUsados(p.periodo_cpfs, hoje, [...d.vendas.filter((v) => ids.has(v.conta_id) && v.status !== 'cancelado'), ...d.emissoes.filter((e) => ids.has(e.conta_id) && e.status !== 'cancelada')]);
    const saldo = cs.reduce((s, c) => s + c.saldo, 0);
    return { p, cs, saldo, custoMil: custoMilheiro(cs.reduce((s, c) => s + c.custos, 0), cs.reduce((s, c) => s + c.entradas, 0)), usados };
  }).filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => b.saldo - a.saldo);
  const linhas = porPrograma(minhas);
  const linhasTerceiros = porPrograma(terceiros);

  // RF-52: faturas confirmadas de cartões ligados a um programa, ainda sem o crédito informado
  const creditadas = new Set(d.movimentos.filter((m) => m.invoice_id && m.tipo === 'entrada').map((m) => m.invoice_id));
  const aConfirmar = d.faturas.filter((f) => !creditadas.has(f.invoice_id)).flatMap((f) => {
    const k = d.cartoes.find((c) => c.id === f.card_id && c.pontos_nacional);
    return k ? [{ invoice_id: f.invoice_id, previsto: pontosPrevistos(f.total, k.pontos_nacional), conta: k.mil_conta_id, total: f.total, pct: k.cashback_pct, competencia: f.competencia, apelido: k.apelido }] : [];
  }).slice(0, 12);
  const confirmados = d.movimentos.filter((m) => m.invoice_id && m.tipo === 'entrada' && m.previsto != null).slice(0, 6);

  const Tabela = ({ ls }: { ls: typeof linhas }) => (
    <div className="razao-tabela"><table>
      <thead><tr><th>Programa</th><th className="num">Saldo</th><th className="num">Milheiro</th><th className="num">CPFs</th></tr></thead>
      <tbody>{ls.map(({ p, cs, saldo, custoMil, usados }) => (
        <tr key={p.id} tabIndex={0} onClick={() => setProg(p)} onKeyDown={(e) => { if (e.key === 'Enter') setProg(p); }} style={{ cursor: 'pointer' }}>
          <td><strong>{p.nome}</strong>{cs.length > 1 && <div className="sub nome-ativo">{cs.map((c) => `${c.titular} ${pts(c.saldo)}`).join(' · ')}</div>}</td>
          <td className="num"><strong>{pts(saldo)}</strong></td>
          <td className="num">{mil(custoMil)}</td>
          <td className="num">{p.limite_cpfs != null ? <span className={usados >= p.limite_cpfs ? 'neg' : ''}>{usados} de {p.limite_cpfs}</span> : <span className="sub">{usados} · sem limite</span>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );

  return (
    <>
      <dl className="numeros-linha">
        <div><dt>Seus pontos</dt><dd>{pts(minhas.reduce((s, c) => s + c.saldo, 0))}</dd></div>
        <div><dt>Custo médio do milheiro</dt><dd>{mil(custoMilheiro(minhas.reduce((s, c) => s + c.custos, 0), minhas.reduce((s, c) => s + c.entradas, 0)))}</dd></div>
        <div><dt>Vendas em 12 meses</dt><dd>{brl(somaCentavos(vendas12.map((v) => v.valor_total)))}</dd></div>
        <div><dt>Lucro das vendas</dt><dd className={lucro12 < 0 ? 'neg' : 'pos'}>{brl(lucro12)}</dd></div>
      </dl>
      {!linhas.length ? <p className="sub">Nenhuma conta ainda. Importe o Controle de Milhas ou lance um movimento.</p> : <Tabela ls={linhas} />}
      {linhasTerceiros.length > 0 && (<><h2>Contas de terceiros</h2><Tabela ls={linhasTerceiros} /></>)}

      <h2>Pontos de cartão a confirmar</h2>
      {!aConfirmar.length ? <p className="sub">Nenhuma fatura esperando o crédito de pontos. Ligue cada cartão a um programa em Cartões para os pontos aparecerem aqui.</p> : (
        <ul className="razao">
          {aConfirmar.map((f) => (
            <li key={f.invoice_id}><button className="razao-linha" onClick={() => setConfirmando(f)}>
              <span className="razao-cod">{f.apelido}</span><span className="razao-valor num">{pts(f.previsto)} previstos</span>
              <span className="razao-det">{nomeMes(f.competencia)} · fatura {brl(f.total)}</span><span className="razao-var num"><span className="link-acao" style={{ padding: 0 }}>Confirmar crédito</span></span>
            </button></li>
          ))}
        </ul>
      )}
      {confirmados.length > 0 && (
        <>
          <h3 className="inspetor-sec">Últimos créditos: previsto × recebido</h3>
          <ul className="onde-lista">{confirmados.map((m) => {
            const dif = (m.pontos ?? 0) - (m.previsto ?? 0);
            return <li key={m.id}><span>{m.descricao ?? ORIGENS[m.origem]}</span><span className="sub num">{pts(m.previsto!)} → {pts(m.pontos ?? 0)}</span><span className={`num ${dif < 0 ? 'neg' : dif > 0 ? 'pos' : ''}`}>{dif > 0 ? '+' : ''}{pts(dif)}</span></li>;
          })}</ul>
        </>
      )}

      {confirmando && <ConfirmarPontos f={confirmando} onFechar={() => setConfirmando(null)} onSalvo={() => { setConfirmando(null); onMudou(); }} />}
      {prog && <EditarPrograma p={prog} onFechar={() => setProg(null)} onSalvo={() => { setProg(null); onMudou(); }} />}
    </>
  );
}

function ConfirmarPontos({ f, onFechar, onSalvo }: { f: { invoice_id: string; previsto: number; conta: string; total: number; pct: number; competencia: string; apelido: string }; onFechar: () => void; onSalvo: () => void }) {
  const [real, setReal] = useState(String(f.previsto));
  const [data, setData] = useState(hojeBrasilia());
  const { erro, ocupado, rodar } = useAcao();
  const cb = cashbackRenunciado(f.total, f.pct);
  return (
    <Modal titulo={`Pontos do ${f.apelido}`} onFechar={onFechar}>
      <p className="sub" style={{ marginTop: 0 }}>Fatura de {nomeMes(f.competencia).toLowerCase()} ({brl(f.total)}). Pela regra do cartão: {pts(f.previsto)} pontos.</p>
      <div className="campos">
        <label>Pontos recebidos<input inputMode="numeric" value={real} onChange={(e) => setReal(e.target.value)} /></label>
        <label>Data do crédito<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      </div>
      <p className="sub">Também entra como custo o cashback que você deixou de ganhar: {brl(cb)} ({String(f.pct).replace('.', ',')}% da fatura).</p>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        const p = numeroDe(real);
        if (p == null || p < 0) throw new Error('Informe os pontos recebidos.');
        const desc = `${f.apelido} · ${nomeMes(f.competencia).toLowerCase()}`;
        await inserirMovimentos([
          { conta_id: f.conta, data, tipo: 'entrada', origem: 'cartao', pontos: p, previsto: f.previsto, invoice_id: f.invoice_id, descricao: desc },
          ...(cb > 0 ? [{ conta_id: f.conta, data, tipo: 'custo' as const, origem: 'cashback', valor: cb, descricao: `Cashback renunciado · ${desc}` }] : []),
        ]);
        onSalvo();
      })}>Confirmar crédito</button>
    </Modal>
  );
}

function EditarPrograma({ p, onFechar, onSalvo }: { p: Programa; onFechar: () => void; onSalvo: () => void }) {
  const [lim, setLim] = useState(p.limite_cpfs != null ? String(p.limite_cpfs) : '');
  const [per, setPer] = useState(p.periodo_cpfs);
  const { erro, ocupado, rodar } = useAcao();
  return (
    <Modal titulo={p.nome} onFechar={onFechar}>
      <p className="sub" style={{ marginTop: 0 }}>Limite de CPFs diferentes por período (ex.: Latam Pass 24 por ano, Smiles 25). O BankMaR guarda só a contagem, nunca os CPFs.</p>
      <div className="campos">
        <label>Limite de CPFs<input type="number" min={0} value={lim} onChange={(e) => setLim(e.target.value)} placeholder="sem limite" /></label>
        <label>Período<select value={per} onChange={(e) => setPer(e.target.value as Programa['periodo_cpfs'])}><option value="ano_civil">Ano civil (jan–dez)</option><option value="12_meses">Últimos 12 meses</option></select></label>
      </div>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => { await salvarPrograma({ ...p, limite_cpfs: lim ? Number(lim) : null, periodo_cpfs: per }); onSalvo(); })}>Salvar</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Movimentos({ d, nomeConta, onMudou }: { d: DadosMilhas; nomeConta: (id: string) => string; onMudou: () => void }) {
  const [conta, setConta] = useState('');
  const [novo, setNovo] = useState(false);
  const [transf, setTransf] = useState(false);
  const { erro, rodar } = useAcao();
  const lista = useMemo(() => d.movimentos.filter((m) => !conta || m.conta_id === conta).slice(0, 300), [d, conta]);
  return (
    <>
      <div className="barra-ferramentas">
        <label className="campo-inline">Conta<select value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Todas</option>{d.contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.programa} · {c.titular}</option>)}
        </select></label>
        <button onClick={() => setNovo(true)}><Plus size={16} aria-hidden="true" /> Movimento</button>
        <button onClick={() => setTransf(true)}><ArrowRightLeft size={16} aria-hidden="true" /> Transferir</button>
      </div>
      <Erro msg={erro} />
      <ul className="razao">
        {lista.map((m) => (
          <li key={m.id}><div className="razao-linha estatico">
            <span className="razao-cod">{m.descricao ?? ORIGENS[m.origem]}</span>
            <span className={`razao-valor num ${m.tipo === 'entrada' ? 'pos' : m.tipo === 'saida' ? 'neg' : ''}`}>{m.tipo === 'custo' ? brl(m.valor ?? 0) : `${m.tipo === 'entrada' ? '+' : '−'}${pts(m.pontos ?? 0)}`}</span>
            <span className="razao-det">{dataBR(m.data)} · {ORIGENS[m.origem] ?? m.origem}{!conta ? ` · ${nomeConta(m.conta_id)}` : ''}</span>
            <span className="razao-var num"><button className="link-acao" onClick={() => rodar(async () => { await removerMovimento(m.id); onMudou(); })} aria-label="Remover movimento">Remover</button></span>
          </div></li>
        ))}
      </ul>
      {lista.length >= 300 && <p className="sub">Mostrando os 300 mais recentes. Filtre por conta para ver os outros.</p>}
      {novo && <NovoMovimento contas={d.contas} conta={conta} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); onMudou(); }} />}
      {transf && <Transferir contas={d.contas} onFechar={() => setTransf(false)} onSalvo={() => { setTransf(false); onMudou(); }} />}
    </>
  );
}

function NovoMovimento({ contas, conta, onFechar, onSalvo }: { contas: ContaMilhas[]; conta: string; onFechar: () => void; onSalvo: () => void }) {
  const [m, setM] = useState({ conta, data: hojeBrasilia(), tipo: 'entrada' as 'entrada' | 'saida' | 'custo', origem: 'cartao', qtd: '', descricao: '' });
  const [nova, setNova] = useState({ programa: '', titular: 'Mário' });
  const { erro, ocupado, rodar } = useAcao();
  const origens = m.tipo === 'entrada' ? ['cartao', 'clube', 'compra', 'transferencia', 'bonus_transferencia', 'voo', 'bonus', 'outros'] : m.tipo === 'saida' ? ['uso', 'expiracao', 'ajuste', 'outros'] : ['clube', 'compra', 'cashback', 'outros'];
  return (
    <Modal titulo="Novo movimento" onFechar={onFechar}>
      <div className="campos">
        <SelConta contas={contas} valor={m.conta} onMuda={(v) => setM({ ...m, conta: v })} />
        {!m.conta && <>
          <label>Ou nova conta: programa<input value={nova.programa} placeholder="ex.: Smiles" onChange={(e) => setNova({ ...nova, programa: e.target.value })} /></label>
          <label>Titular<input value={nova.titular} onChange={(e) => setNova({ ...nova, titular: e.target.value })} /></label>
        </>}
        <label>Tipo<select value={m.tipo} onChange={(e) => { const t = e.target.value as typeof m.tipo; setM({ ...m, tipo: t, origem: t === 'entrada' ? 'cartao' : t === 'saida' ? 'uso' : 'clube' }); }}>
          <option value="entrada">Entrada de pontos</option><option value="saida">Saída de pontos</option><option value="custo">Custo (R$)</option>
        </select></label>
        <label>Origem<select value={m.origem} onChange={(e) => setM({ ...m, origem: e.target.value })}>{origens.map((o) => <option key={o} value={o}>{ORIGENS[o]}</option>)}</select></label>
        <label>{m.tipo === 'custo' ? 'Valor (R$)' : 'Pontos'}<input inputMode="decimal" value={m.qtd} onChange={(e) => setM({ ...m, qtd: e.target.value })} /></label>
        <label>Data<input type="date" value={m.data} onChange={(e) => setM({ ...m, data: e.target.value })} /></label>
        <label className="campo-largo">Descrição<input value={m.descricao} onChange={(e) => setM({ ...m, descricao: e.target.value })} /></label>
      </div>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        const v = numeroDe(m.qtd);
        if (v == null || v <= 0) throw new Error(m.tipo === 'custo' ? 'Informe o valor.' : 'Informe os pontos.');
        const conta_id = m.conta || (nova.programa.trim() ? await garantirConta(nova.programa, nova.titular.trim() || 'Mário', (nova.titular.trim() || 'Mário') !== 'Mário') : '');
        if (!conta_id) throw new Error('Escolha a conta ou informe o programa.');
        await inserirMovimentos([{ conta_id, data: m.data, tipo: m.tipo, origem: m.origem, pontos: m.tipo === 'custo' ? null : v, valor: m.tipo === 'custo' ? v : null, descricao: m.descricao.trim() || null }]);
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}

function Transferir({ contas, onFechar, onSalvo }: { contas: ContaMilhas[]; onFechar: () => void; onSalvo: () => void }) {
  const [t, setT] = useState({ de: '', para: '', pontos: '', bonus: '0', data: hojeBrasilia() });
  const { erro, ocupado, rodar } = useAcao();
  const de = contas.find((c) => c.conta_id === t.de);
  const p = numeroDe(t.pontos) ?? 0; const b = numeroDe(t.bonus) ?? 0;
  return (
    <Modal titulo="Transferir pontos" onFechar={onFechar}>
      <div className="campos">
        <SelConta contas={contas} valor={t.de} onMuda={(v) => setT({ ...t, de: v })} rotulo="De" />
        <SelConta contas={contas} valor={t.para} onMuda={(v) => setT({ ...t, para: v })} rotulo="Para" />
        <label>Pontos<input inputMode="numeric" value={t.pontos} onChange={(e) => setT({ ...t, pontos: e.target.value })} /></label>
        <label>Bônus (%)<input inputMode="decimal" value={t.bonus} onChange={(e) => setT({ ...t, bonus: e.target.value })} /></label>
        <label>Data<input type="date" value={t.data} onChange={(e) => setT({ ...t, data: e.target.value })} /></label>
      </div>
      {de && p > 0 && <p className="sub">Chegam {pts(p * (1 + b / 100))} pontos. Vai junto o custo de {brl((p / 1000) * (de.custo_milheiro ?? 0))} ({mil(de.custo_milheiro)} o milheiro na origem).</p>}
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        if (!de || !t.para || t.para === t.de) throw new Error('Escolha contas de origem e destino diferentes.');
        const r = transferencia(p, b, de.saldo, de.custo_milheiro);
        const id = crypto.randomUUID();
        const para = contas.find((c) => c.conta_id === t.para)!;
        await inserirMovimentos([
          { conta_id: de.conta_id, data: t.data, tipo: 'saida', origem: 'transferencia', pontos: r.sai, transferencia_id: id, descricao: `Para ${para.programa} · ${para.titular}` },
          { conta_id: para.conta_id, data: t.data, tipo: 'entrada', origem: 'transferencia', pontos: r.entra, transferencia_id: id, descricao: `De ${de.programa} · ${de.titular}` },
          ...(r.bonus > 0 ? [{ conta_id: para.conta_id, data: t.data, tipo: 'entrada' as const, origem: 'bonus_transferencia', pontos: r.bonus, transferencia_id: id, descricao: `Bônus de ${String(b).replace('.', ',')}%` }] : []),
          ...(r.custo > 0 ? [
            { conta_id: de.conta_id, data: t.data, tipo: 'custo' as const, origem: 'transferencia', valor: -r.custo, transferencia_id: id, descricao: 'Custo que saiu com a transferência' },
            { conta_id: para.conta_id, data: t.data, tipo: 'custo' as const, origem: 'transferencia', valor: r.custo, transferencia_id: id, descricao: 'Custo que veio com a transferência' },
          ] : []),
        ]);
        onSalvo();
      })}>Transferir</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Vendas({ d, nomeConta, onMudou }: { d: DadosMilhas; nomeConta: (id: string) => string; onMudou: () => void }) {
  const [nova, setNova] = useState(false);
  const { erro, rodar } = useAcao();
  const cm = (id: string) => d.contas.find((c) => c.conta_id === id)?.custo_milheiro ?? null;
  return (
    <>
      <div className="barra-ferramentas"><button onClick={() => setNova(true)}><Plus size={16} aria-hidden="true" /> Venda</button></div>
      <Erro msg={erro} />
      {!d.vendas.length && <p className="sub">Nenhuma venda registrada.</p>}
      <ul className="razao">
        {d.vendas.map((v) => {
          const l = lucroVenda(v.valor_total, v.quantidade, cm(v.conta_id));
          return (
            <li key={v.id}><div className="razao-linha estatico">
              <span className="razao-cod">{nomeConta(v.conta_id)}{v.status !== 'pago' && <span className="selo-inst">{v.status}</span>}</span>
              <span className="razao-valor num">{brl(v.valor_total)}</span>
              <span className="razao-det">{dataBR(v.data)} · {pts(v.quantidade)} a {v.quantidade ? mil(v.valor_total / v.quantidade * 1000) : '—'}{v.plataforma ? ` · ${v.plataforma}` : ''} · {v.cpfs} CPF{v.cpfs === 1 ? '' : 's'}</span>
              <span className="razao-var num"><span className={l < 0 ? 'neg' : 'pos'}>lucro {brl(l)}</span> <button className="link-acao" onClick={() => rodar(async () => { await removerVenda(v.id); onMudou(); })}>Remover</button></span>
            </div></li>
          );
        })}
      </ul>
      {nova && <NovaVenda contas={d.contas} onFechar={() => setNova(false)} onSalvo={() => { setNova(false); onMudou(); }} />}
    </>
  );
}

function NovaVenda({ contas, onFechar, onSalvo }: { contas: ContaMilhas[]; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({ conta: '', plataforma: '', data: hojeBrasilia(), qtd: '', valor: '', prazo: '0', cpfs: '1', status: 'aguardando' });
  const { erro, ocupado, rodar } = useAcao();
  const c = contas.find((x) => x.conta_id === v.conta);
  const q = numeroDe(v.qtd) ?? 0; const val = numeroDe(v.valor) ?? 0;
  return (
    <Modal titulo="Nova venda" onFechar={onFechar}>
      <div className="campos">
        <SelConta contas={contas} valor={v.conta} onMuda={(x) => setV({ ...v, conta: x })} />
        <label>Plataforma<input value={v.plataforma} placeholder="ex.: Balcão, HotMilhas" onChange={(e) => setV({ ...v, plataforma: e.target.value })} /></label>
        <label>Data<input type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} /></label>
        <label>Milhas<input inputMode="numeric" value={v.qtd} onChange={(e) => setV({ ...v, qtd: e.target.value })} /></label>
        <label>Valor total (R$)<input inputMode="decimal" value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} /></label>
        <label>Prazo de pagamento (dias)<input type="number" min={0} value={v.prazo} onChange={(e) => setV({ ...v, prazo: e.target.value })} /></label>
        <label>CPFs usados<input type="number" min={0} value={v.cpfs} onChange={(e) => setV({ ...v, cpfs: e.target.value })} /></label>
        <label>Status<select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="aguardando">Aguardando pagamento</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select></label>
      </div>
      {c && q > 0 && val > 0 && <p className="sub">Milheiro de {mil(val / q * 1000)}. Lucro pelo custo médio da conta ({mil(c.custo_milheiro)}): {brl(lucroVenda(val, q, c.custo_milheiro))}.{q > c.saldo ? ' Atenção: maior que o saldo da conta.' : ''}</p>}
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        if (!v.conta || q <= 0 || val < 0) throw new Error('Informe conta, milhas e valor.');
        const prazo = Number(v.prazo) || 0;
        const pag = new Date(Date.parse(v.data + 'T12:00:00Z') + prazo * 864e5).toISOString().slice(0, 10);
        await salvarVenda({ conta_id: v.conta, plataforma: v.plataforma.trim() || null, data: v.data, quantidade: q, valor_total: val, prazo_dias: prazo, data_pagamento: pag, cpfs: Number(v.cpfs) || 0, status: v.status });
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Emissoes({ d, nomeConta, onMudou }: { d: DadosMilhas; nomeConta: (id: string) => string; onMudou: () => void }) {
  const [nova, setNova] = useState(false);
  const { erro, rodar } = useAcao();
  return (
    <>
      <div className="barra-ferramentas"><button onClick={() => setNova(true)}><Plus size={16} aria-hidden="true" /> Emissão</button></div>
      <Erro msg={erro} />
      {!d.emissoes.length && <p className="sub">Nenhuma emissão registrada.</p>}
      <ul className="razao">
        {d.emissoes.map((e) => (
          <li key={e.id}><div className="razao-linha estatico">
            <span className="razao-cod">{e.trecho ?? 'Emissão'}{e.localizador && <span className="selo-inst">{e.localizador}</span>}</span>
            <span className="razao-valor num">{e.milhas ? `${pts(e.milhas)} milhas` : ''}{e.milhas && e.valor ? ' + ' : ''}{e.valor ? brl(e.valor) : ''}</span>
            <span className="razao-det">{dataBR(e.data)} · voo {e.data_voo ?? '—'} · {nomeConta(e.conta_id)}{e.cartao_texto ? ` · ${e.cartao_texto}` : ''}{e.cashback ? ` · cashback ${brl(e.cashback)}` : ''}</span>
            <span className="razao-var num">
              <span className={`situacao ${e.status === 'reembolsada' ? 'neutro' : e.status === 'cancelada' ? 'atrasada' : 'ok'}`}>{e.status[0].toUpperCase() + e.status.slice(1)}{e.reembolsado ? ` ${brl(e.reembolsado)}` : ''}</span>
              {' '}<button className="link-acao" onClick={() => rodar(async () => { await removerEmissao(e.id); onMudou(); })}>Remover</button>
            </span>
          </div></li>
        ))}
      </ul>
      {nova && <NovaEmissao d={d} onFechar={() => setNova(false)} onSalvo={() => { setNova(false); onMudou(); }} />}
    </>
  );
}

function NovaEmissao({ d, onFechar, onSalvo }: { d: DadosMilhas; onFechar: () => void; onSalvo: () => void }) {
  const [e, setE] = useState({ conta: '', data: hojeBrasilia(), localizador: '', data_voo: '', trecho: '', card_id: '', milhas: '', valor: '', cashback: '', status: 'emitida', reembolsado: '', cpfs: '1' });
  const { erro, ocupado, rodar } = useAcao();
  const set = (k: keyof typeof e, v: string) => setE({ ...e, [k]: v });
  return (
    <Modal titulo="Nova emissão" onFechar={onFechar}>
      <div className="campos">
        <SelConta contas={d.contas} valor={e.conta} onMuda={(v) => set('conta', v)} />
        <label>Data da emissão<input type="date" value={e.data} onChange={(x) => set('data', x.target.value)} /></label>
        <label>Localizador<input value={e.localizador} maxLength={16} onChange={(x) => set('localizador', x.target.value.replace(/[^A-Za-z0-9]/g, ''))} /></label>
        <label>Trecho<input value={e.trecho} placeholder="BSB>GRU" onChange={(x) => set('trecho', x.target.value)} /></label>
        <label>Data do voo<input value={e.data_voo} placeholder="dd/mm/aaaa" onChange={(x) => set('data_voo', x.target.value)} /></label>
        <label>Cartão das taxas<select value={e.card_id} onChange={(x) => set('card_id', x.target.value)}><option value="">—</option>{d.cartoes.map((k) => <option key={k.id} value={k.id}>{k.apelido}</option>)}</select></label>
        <label>Milhas usadas<input inputMode="numeric" value={e.milhas} onChange={(x) => set('milhas', x.target.value)} /></label>
        <label>Valor pago (R$)<input inputMode="decimal" value={e.valor} onChange={(x) => set('valor', x.target.value)} /></label>
        <label>Cashback (R$)<input inputMode="decimal" value={e.cashback} onChange={(x) => set('cashback', x.target.value)} /></label>
        <label>Passageiros (CPFs)<input type="number" min={0} value={e.cpfs} onChange={(x) => set('cpfs', x.target.value)} /></label>
        <label>Status<select value={e.status} onChange={(x) => set('status', x.target.value)}><option value="emitida">Emitida</option><option value="remarcada">Remarcada</option><option value="reembolsada">Reembolsada</option><option value="cancelada">Cancelada</option></select></label>
        {e.status === 'reembolsada' && <label>Valor reembolsado (R$)<input inputMode="decimal" value={e.reembolsado} onChange={(x) => set('reembolsado', x.target.value)} /></label>}
      </div>
      <p className="sub">O BankMaR guarda só quantos passageiros (CPFs) foram usados, nunca os dados deles.</p>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        if (!e.conta) throw new Error('Escolha a conta.');
        if (e.localizador && !/^[A-Za-z0-9]{5,16}$/.test(e.localizador)) throw new Error('Localizador deve ter de 5 a 16 letras ou números.');
        await salvarEmissao({ conta_id: e.conta, data: e.data, localizador: e.localizador || null, trecho: e.trecho.trim() || null, data_voo: e.data_voo.trim() || null, card_id: e.card_id || null,
          milhas: numeroDe(e.milhas), valor: numeroDe(e.valor), cashback: numeroDe(e.cashback) ?? 0, status: e.status, reembolsado: numeroDe(e.reembolsado) ?? 0, cpfs: Number(e.cpfs) || 0 });
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Importar({ onImportado }: { onImportado: (msg: string) => void }) {
  const [rel, setRel] = useState<{ conta: string; nosso: number; planilha: number | null; custoNosso: number; custoPlanilha: number | null }[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const { erro, ocupado, rodar } = useAcao();
  return (
    <section>
      <p className="sub">Envie o Controle_Milhas.xlsx. São lidas as abas de cada programa (custos, acumulados, usos e transferências), VENDAS MILHAS e GERADOR LATAM. A aba de CPFs e as observações das vendas (contatos de compradores) não são lidas. Reenviar não duplica.</p>
      <label className="linha"><span className="botao-arquivo"><FileUp size={16} aria-hidden="true" /> Escolher planilha</span>
        <input type="file" accept=".xlsx" style={{ width: 0, height: 0, opacity: 0 }} disabled={ocupado} onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) rodar(async () => {
            const r = lerControleMilhas(new Uint8Array(await f.arrayBuffer()), hojeBrasilia());
            const n = await importarMilhasPlanilha(r, f.name);
            setAvisos(r.avisos);
            setRel(r.contas.map((c) => { const s = saldoImportado(r, c.chave); return { conta: c.chave.replace('|', ' · '), nosso: s.saldo, planilha: c.saldoPlanilha, custoNosso: s.custos, custoPlanilha: c.custoPlanilha }; }));
            onImportado(`${n.movimentos} movimento(s), ${n.vendas} venda(s) e ${n.emissoes} emissão(ões) novos.`);
          });
        }} />
      </label>
      {ocupado && <p className="sub">Importando…</p>}
      <Erro msg={erro} />
      {avisos.map((a, i) => <p key={i} className="sub">{a}</p>)}
      {rel && (
        <>
          <h2>Conferência com a planilha</h2>
          <div className="razao-tabela"><table>
            <thead><tr><th>Conta</th><th className="num">Saldo calculado</th><th className="num">Saldo na planilha</th><th className="num">Custos somados</th><th className="num">“Total Gastos” da planilha</th></tr></thead>
            <tbody>{rel.map((r) => (
              <tr key={r.conta}><td>{r.conta}</td><td className="num">{pts(r.nosso)}</td>
                <td className={`num ${r.planilha != null && Math.abs(r.planilha - r.nosso) > 0.5 ? 'alerta-txt' : ''}`}>{r.planilha != null ? pts(r.planilha) : '—'}</td>
                <td className="num">{brl(r.custoNosso)}</td><td className={`num ${r.custoPlanilha != null && Math.abs(r.custoPlanilha - r.custoNosso) > 0.5 ? 'alerta-txt' : ''}`}>{r.custoPlanilha != null ? brl(r.custoPlanilha) : '—'}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="sub">Diferenças de custo vêm de colunas de “Total” da planilha que não somam todos os meses; o BankMaR soma mês a mês.</p>
        </>
      )}
    </section>
  );
}
