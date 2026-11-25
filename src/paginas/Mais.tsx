// Cartões (cadastro mínimo para faturas), avisos (RF-80/82), exportação (RNF-07),
// importação da planilha 2026 (RF-90/94) e histórico de importações (RNF-04).
import { useEffect, useState } from 'react';
import { supabase, ok } from '../lib/supabase';
import type { Cartao } from '../lib/dados';
import { importarPlanilha2026, totaisDoMes, PESSOA_A_REVISAR, type ResultadoImportacao } from '../lib/importacao/planilha2026';
import { sugerirCategoria, type RegraCategoria } from '../lib/regras';
import { exportarTudo } from '../lib/exportar';
import { brl, nomeMes } from '../lib/formato';
import { ativarPush } from '../lib/push';
import { Erro, Modal, useAcao, useCadastros } from '../ui/comum';

export function Mais() {
  const { c, recarregar } = useCadastros();
  const [cartao, setCartao] = useState<Partial<Cartao> | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; tipo: string; arquivo: string | null; em: string; importadas: number; ignoradas: number; alteradas: number }[]>([]);
  const [plan, setPlan] = useState<{ r: ResultadoImportacao; arquivo: string } | null>(null);
  const { erro, ocupado, rodar } = useAcao();

  useEffect(() => {
    rodar(async () => {
      const s = ok(await supabase.from('notification_settings').select('email').maybeSingle()) as { email: string } | null;
      setEmail(s?.email ?? '');
      setLogs(ok(await supabase.from('import_log').select('*').order('em', { ascending: false }).limit(20)) as typeof logs);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <h1>Mais</h1>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}

      <h2>Cartões</h2>
      <button onClick={() => setCartao({ apelido: '', emissor: 'outro', ativo: true })}>+ Cartão</button>
      {c.cartoes.map((k) => (
        <div className="card linha entre" key={k.id} style={{ opacity: k.ativo ? 1 : 0.5 }}>
          <span className="grow"><strong>{k.apelido}</strong><div className="sub">{k.emissor === 'outro' ? 'sem leitor de PDF' : `leitor ${k.emissor}`} · {k.final4 ? `final ${k.final4}` : 'final não informado'} · vence dia {k.dia_vencimento ?? '—'}{k.ativo ? '' : ' · desativado'}</div></span>
          <button onClick={() => setCartao(k)}>Editar</button>
        </div>
      ))}

      <h2>Avisos de vencimento</h2>
      <div className="card">
        <p className="sub">Na véspera e no dia do vencimento, às 8h, de contas e faturas sem pagamento registrado.</p>
        <div className="linha">
          <input type="email" placeholder="seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button onClick={() => rodar(async () => { ok(await supabase.from('notification_settings').upsert({ email })); setMsg('E-mail dos avisos salvo.'); })}>Salvar e-mail</button>
        </div>
        <button style={{ marginTop: 8 }} onClick={() => rodar(async () => { await ativarPush(); setMsg('Notificações ativadas neste aparelho.'); })}>Ativar notificações neste aparelho</button>
        <p className="sub">No iPhone, adicione o BanKMar à tela de início antes de ativar.</p>
      </div>

      <h2>Cópia de segurança</h2>
      <button disabled={ocupado} onClick={() => rodar(async () => { await exportarTudo(); setMsg('Arquivo de backup baixado.'); })}>Exportar todos os dados (planilha)</button>

      <h2>Importar planilha 2026</h2>
      <div className="card">
        <p className="sub">Arquivo “Contabilidade BanKMar - 2026.xlsx”. A leitura acontece no seu navegador; as abas COFRE, CARTÕES, IRRF e CHURRAS não são importadas.</p>
        <input type="file" accept=".xlsx" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) rodar(async () => setPlan({ r: importarPlanilha2026(new Uint8Array(await f.arrayBuffer())), arquivo: f.name }));
        }} />
      </div>

      <h2>Histórico de importações</h2>
      {logs.map((l) => (
        <div className="sub" key={l.id}>{new Date(l.em).toLocaleString('pt-BR')} · {l.tipo} {l.arquivo ?? ''} · {l.importadas} importadas · {l.ignoradas} ignoradas · {l.alteradas} regras</div>
      ))}

      {cartao && (
        <Modal titulo={cartao.id ? 'Editar cartão' : 'Novo cartão'} onFechar={() => setCartao(null)}>
          <p className="sub">Nunca informe o número completo, validade ou código de segurança — só os 4 últimos dígitos.</p>
          <div className="campos">
            <label>Apelido<input value={cartao.apelido ?? ''} onChange={(e) => setCartao({ ...cartao, apelido: e.target.value })} /></label>
            <label>Leitor de fatura<select value={cartao.emissor} onChange={(e) => setCartao({ ...cartao, emissor: e.target.value as Cartao['emissor'] })}>
              <option value="itau">Itaú</option><option value="caixa">Caixa</option><option value="outro">Outro (colar texto)</option></select></label>
            <label>Final (4 dígitos)<input inputMode="numeric" maxLength={4} value={cartao.final4 ?? ''} onChange={(e) => setCartao({ ...cartao, final4: e.target.value.replace(/\D/g, '').slice(0, 4) || null })} /></label>
            <label>Dia do vencimento<input type="number" min={1} max={31} value={cartao.dia_vencimento ?? ''} onChange={(e) => setCartao({ ...cartao, dia_vencimento: e.target.value ? Number(e.target.value) : null })} /></label>
            <label>Banco de pagamento<input value={cartao.banco_pagamento ?? ''} onChange={(e) => setCartao({ ...cartao, banco_pagamento: e.target.value || null })} /></label>
            <label>Ativo<select value={cartao.ativo ? '1' : '0'} onChange={(e) => setCartao({ ...cartao, ativo: e.target.value === '1' })}><option value="1">Sim</option><option value="0">Não (cancelado)</option></select></label>
          </div>
          <button className="pri" onClick={() => rodar(async () => {
            if (!cartao.apelido?.trim()) throw new Error('Informe o apelido.');
            if (cartao.final4 && !/^\d{4}$/.test(cartao.final4)) throw new Error('O final deve ter 4 dígitos.');
            const d = { apelido: cartao.apelido.trim(), emissor: cartao.emissor, final4: cartao.final4 ?? null, dia_vencimento: cartao.dia_vencimento ?? null, banco_pagamento: cartao.banco_pagamento ?? null, ativo: cartao.ativo ?? true };
            if (cartao.id) ok(await supabase.from('cards').update(d).eq('id', cartao.id)); else ok(await supabase.from('cards').insert(d));
            setCartao(null); await recarregar();
          })}>Salvar</button>
        </Modal>
      )}
      {plan && <PreviaPlanilha plan={plan} onFechar={() => setPlan(null)} onFeito={async (m) => { setPlan(null); setMsg(m); await recarregar(); }} />}
    </main>
  );
}

function PreviaPlanilha({ plan, onFechar, onFeito }: { plan: { r: ResultadoImportacao; arquivo: string }; onFechar: () => void; onFeito: (m: string) => void }) {
  const { r } = plan;
  const { erro, ocupado, rodar } = useAcao();
  const revisar = r.meses.flatMap((m) => [...m.contas, ...m.faturas.flatMap((f) => f.linhas)]).filter((x) => x.regra.tipo !== 'mario' && x.regra.pessoa === PESSOA_A_REVISAR).length;
  return (
    <Modal titulo="Conferência da importação" onFechar={onFechar}>
      <p className="sub">Confira os totais antes de gravar. Nada é gravado até você confirmar.</p>
      <div className="rolar">
        <table>
          <thead><tr><th>Mês</th><th className="num">Renda</th><th className="num">Contas</th><th className="num">Faturas</th><th className="num">Faturas (planilha)</th></tr></thead>
          <tbody>{r.meses.map((m) => { const t = totaisDoMes(m); return (
            <tr key={m.aba}><td style={{ textTransform: 'capitalize' }}>{nomeMes(m.competencia)}</td><td className="num">{brl(m.renda)}</td><td className="num">{brl(t.contas)}</td><td className="num">{brl(t.faturas)}</td><td className="num">{brl(t.faturasPlanilha)}</td></tr>
          ); })}</tbody>
        </table>
      </div>
      {r.divergencias.length > 0 && (
        <div className="aviso"><strong>Faturas cujo total na planilha difere da soma das linhas:</strong>
          {r.divergencias.map((d, i) => <div key={i}>{d.aba} · {d.item}: planilha {brl(d.planilha)}, linhas {brl(d.somaLinhas)} (dif. {brl(d.diferenca)})</div>)}
        </div>
      )}
      <p>Pessoas: {r.pessoas.join(', ')} · Cartões: {r.cartoes.length} ({r.cartoes.filter((k) => k.ativo).length} ativos)</p>
      {revisar > 0 && <div className="aviso">{revisar} item(ns) dividido(s) sem responsável na planilha ficarão com “{PESSOA_A_REVISAR}”. Ajuste depois em Pessoas.</div>}
      <details><summary>{r.ignoradas.length} linhas/abas ignoradas ou ajustadas</summary>
        {r.ignoradas.map((i, k) => <div className="sub" key={k}>{i.aba}{i.linha ? ` · linha ${i.linha}` : ''}: {i.motivo}</div>)}
      </details>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        const regras = ok(await supabase.from('category_rules').select('padrao, category_id')) as RegraCategoria[];
        const meses = r.meses.map((m) => ({ ...m, faturas: m.faturas.map((f) => ({ ...f, linhas: f.linhas.map((l) => ({ ...l, category_id: sugerirCategoria(l.descricao, regras) })) })) }));
        const { data, error } = await supabase.rpc('importar_planilha', { p: { arquivo: plan.arquivo, cartoes: r.cartoes, meses, ignoradas: r.ignoradas, divergencias: r.divergencias } });
        if (error) throw new Error(error.message.includes('PLANILHA_JA_IMPORTADA') ? 'A planilha 2026 já foi importada.' : error.message);
        const d = data as { contas: number; faturas: number; lancamentos: number };
        onFeito(`Importado: ${d.contas} contas, ${d.faturas} faturas, ${d.lancamentos} lançamentos. Revise os cartões (final e dia de vencimento) em “Mais”.`);
      })}>Gravar no sistema</button>
    </Modal>
  );
}
