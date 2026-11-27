// Cartões (cadastro mínimo para faturas), avisos (RF-80/82), exportação (RNF-07),
// importação da planilha 2026 (RF-90/94) e histórico de importações (RNF-04).
import { useEffect, useState } from 'react';
import { supabase, ok } from '../lib/supabase';
import { importarPlanilha2026, totaisDoMes, PESSOA_A_REVISAR, type ResultadoImportacao } from '../lib/importacao/planilha2026';
import { sugerirCategoria, type RegraCategoria } from '../lib/regras';
import { exportarTudo } from '../lib/exportar';
import { brl, nomeMes } from '../lib/formato';
import { ativarPush } from '../lib/push';
import { listarSenhas, removerSenha, salvarSenha, type SenhaSalva } from '../lib/senhasPdf';
import { Erro, Modal, useAcao, useCadastros } from '../ui/comum';

export function Mais() {
  const { recarregar } = useCadastros();
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
      <h1>Ajustes e importações</h1>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}

      <SenhasPdf />

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
        <p className="sub">Arquivo “Contabilidade BanKMar - 2026.xlsx”. A leitura acontece no seu navegador; as abas COFRE e CHURRAS não são importadas; CARTÕES e IRRF são importadas em Cartões e em Imposto de Renda.</p>
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
            <tr key={m.aba}><td>{nomeMes(m.competencia)}</td><td className="num">{brl(m.renda)}</td><td className="num">{brl(t.contas)}</td><td className="num">{brl(t.faturas)}</td><td className="num">{brl(t.faturasPlanilha)}</td></tr>
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

/** Senhas dos PDFs de fatura: só neste aparelho, cifradas; o sistema tenta todas ao abrir um PDF protegido. */
function SenhasPdf() {
  const [lista, setLista] = useState<SenhaSalva[]>([]);
  const [nova, setNova] = useState({ rotulo: '', senha: '' });
  const [ver, setVer] = useState(false);
  const { erro, ocupado, rodar } = useAcao();
  const carregar = () => rodar(async () => setLista(await listarSenhas()));
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h2>Senhas dos PDFs de fatura</h2>
      <p className="sub">Ao importar um PDF com senha, o BankMaR tenta estas senhas sozinho. Elas ficam só neste aparelho, cifradas no navegador: não vão para o servidor nem para o backup. Em outro aparelho, cadastre de novo.</p>
      {lista.length > 0 && (
        <ul className="onde-lista">
          {lista.map((x) => (
            <li key={x.id}><span>{x.rotulo}</span><span className="sub">desde {new Date(x.criadaEm).toLocaleDateString('pt-BR')}</span>
              <span className="num"><button className="link-acao" onClick={() => rodar(async () => { await removerSenha(x.id); await carregar(); })}>Esquecer</button></span></li>
          ))}
        </ul>
      )}
      <div className="campos">
        <label>Cartão ou banco<input value={nova.rotulo} placeholder="ex.: Nubank" onChange={(e) => setNova({ ...nova, rotulo: e.target.value })} /></label>
        <label>Senha do PDF<input type={ver ? 'text' : 'password'} autoComplete="off" value={nova.senha} onChange={(e) => setNova({ ...nova, senha: e.target.value })} /></label>
      </div>
      <div className="linha" style={{ marginTop: 8 }}>
        <button className="pri" disabled={ocupado} onClick={() => rodar(async () => { await salvarSenha(nova.rotulo, nova.senha); setNova({ rotulo: '', senha: '' }); await carregar(); })}>Guardar senha</button>
        <button className="link-acao" onClick={() => setVer(!ver)}>{ver ? 'Esconder' : 'Mostrar'} senha</button>
      </div>
      <Erro msg={erro} />
    </>
  );
}
