// Entrega 2 — Cartões (RF-44 a RF-49, RF-81, RF-91).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FileUp, Plane, Plus, RefreshCw } from 'lucide-react';
import type { Cartao } from '../lib/dados';
import {
  carregarCartoes, salvarCartao, desativarCartao, reativarCartao, usarVip, removerUsoVip, salvarIsencao, removerIsencao,
  decidirBeneficio, checarBeneficiosAgora, importarCartoesPlanilha, type DadosCartoes, type IsencaoDb,
} from '../lib/dadosCartoes';
import { acessosVip, progressoIsencao, lerAbaCartoes, type Isencao } from '../lib/cartoes';
import { carregarCarteira } from '../lib/investimentos/dados';
import { brl, dataBR, hojeBrasilia, pctBR } from '../lib/formato';
import { Carregando, Erro, Modal, numeroDe, useAcao, useCadastros } from '../ui/comum';

const NOME_ISENCAO: Record<Isencao['tipo'], string> = { gasto_mensal: 'Gasto na fatura por mês', gasto_periodo: 'Gasto num período', investido: 'Valor investido', promocional: 'Isenção promocional' };

export function Cartoes() {
  const { recarregar } = useCadastros();
  const [d, setD] = useState<DadosCartoes | null>(null);
  const [investido, setInvestido] = useState<Map<string, number>>(new Map());
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Cartao> | null>(null);
  const [verCancelados, setVerCancelados] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { erro, ocupado, rodar } = useAcao();
  const hoje = hojeBrasilia();

  const carregar = () => rodar(async () => {
    const dados = await carregarCartoes();
    setD(dados);
    if (dados.cartoes.some((c) => c.instituicao_invest)) {
      // RF-46 (investido): soma da carteira na instituição informada no cartão
      const c = await carregarCarteira().catch(() => null);
      if (c) {
        const m = new Map<string, number>();
        for (const a of c.ativos) for (const p of a.porInstituicao) m.set(p.instituicao.toLowerCase(), (m.get(p.instituicao.toLowerCase()) ?? 0) + p.valor);
        for (const s of c.manuais) { const k = c.agrupar(s.instituicao).toLowerCase(); m.set(k, (m.get(k) ?? 0) + s.saldo); }
        setInvestido(m);
      }
    }
  });
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const depois = async () => { await carregar(); recarregar(); };

  const ativos = d?.cartoes.filter((c) => c.ativo) ?? [];
  const cancelados = d?.cartoes.filter((c) => !c.ativo) ?? [];
  const resumo = (c: Cartao) => {
    const usos = d!.usos.filter((u) => u.card_id === c.id);
    const vip = c.vip_acessos != null && c.vip_acessos > 0 ? acessosVip(c.vip_acessos, c.vip_renovacao ?? null, usos, hoje) : null;
    const fat = d!.faturas.filter((f) => f.card_id === c.id);
    const regras = d!.isencoes.filter((i) => i.card_id === c.id);
    const inv = c.instituicao_invest ? investido.get(c.instituicao_invest.toLowerCase()) ?? 0 : null;
    const progs = regras.map((r) => ({ r, p: progressoIsencao(r, fat, inv, hoje) }));
    return { vip, progs, isento: progs.some((x) => x.p.atingida), pendente: d!.pendentes.find((p) => p.card_id === c.id) };
  };
  const cartaoAberto = d?.cartoes.find((c) => c.id === aberto) ?? null;

  return (
    <main>
      <div className="linha entre">
        <h1 style={{ margin: '8px 0' }}>Cartões</h1>
        <button onClick={() => setEditando({ apelido: '', emissor: 'outro', ativo: true, cashback_pct: 1 })}><Plus size={16} aria-hidden="true" /> Cartão</button>
      </div>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}
      {!d ? <Carregando /> : (
        <>
          {d.pendentes.length > 0 && (
            <div className="aviso"><AlertTriangle size={15} aria-hidden="true" /> {d.pendentes.length === 1 ? 'A página de benefícios de 1 cartão mudou.' : `As páginas de benefícios de ${d.pendentes.length} cartões mudaram.`} Abra o cartão para ver o que mudou e aprovar.</div>
          )}
          {!d.cartoes.length && <p className="sub">Nenhum cartão. Cadastre um ou importe a aba CARTÕES da planilha logo abaixo.</p>}
          <ul className="razao">
            {ativos.map((c) => {
              const r = resumo(c);
              return (
                <li key={c.id}>
                  <button className="razao-linha" onClick={() => setAberto(c.id)}>
                    <span className="razao-cod">{c.apelido}{c.final4 && <span className="sub"> · {c.final4}</span>}{r.pendente && <AlertTriangle size={13} className="icone-alerta" aria-label="benefícios mudaram" />}</span>
                    <span className="razao-valor num sub">{c.dia_vencimento ? `vence dia ${c.dia_vencimento}` : ''}</span>
                    <span className="razao-det">
                      {r.vip ? (r.vip.ilimitado ? 'Sala VIP ilimitada' : `Sala VIP ${r.vip.disponiveis} de ${r.vip.total}`) : 'Sem sala VIP'}
                      {c.pontos_nacional ? ` · ${String(c.pontos_nacional).replace('.', ',')} pt/R$` : ''}
                    </span>
                    <span className="razao-var num">
                      {!r.progs.length ? <span className="sub">{c.anuidade ? `anuidade ${brl(c.anuidade)}` : ''}</span>
                        : r.isento ? <span className="situacao ok">Isento</span>
                        : <span className="situacao neutro">Isenção {pctBR(Math.max(...r.progs.map((x) => x.p.pct ?? 0)), 0)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cancelados.length > 0 && (
            <>
              <button className="link-acao" style={{ paddingLeft: 0, marginTop: 8 }} onClick={() => setVerCancelados(!verCancelados)}>{verCancelados ? 'Esconder' : 'Ver'} cartões cancelados ({cancelados.length})</button>
              {verCancelados && (
                <ul className="razao cancelados">
                  {cancelados.map((c) => (
                    <li key={c.id}><button className="razao-linha" onClick={() => setAberto(c.id)}>
                      <span className="razao-cod">{c.apelido}</span><span className="razao-valor num sub">{c.desativado_em ? `desde ${dataBR(c.desativado_em)}` : 'cancelado'}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </>
          )}

          <section className="bloco-secundario">
            <h2>Benefícios: checagem mensal</h2>
            <p className="sub">No dia 1 de cada mês o BankMaR lê a página oficial de cada cartão com link e compara com a última versão aprovada. Se mudar, você recebe um aviso e decide se aceita. O cadastro nunca muda sozinho.</p>
            <button disabled={ocupado} onClick={() => rodar(async () => { const r = await checarBeneficiosAgora(); setMsg(`${r.verificados} página(s) lida(s), ${r.alterados} com mudança, ${r.falhas} sem conseguir ler.`); await carregar(); })}><RefreshCw size={16} aria-hidden="true" /> Checar agora</button>
          </section>

          <section className="bloco-secundario">
            <h2>Importar da planilha</h2>
            <p className="sub">Arquivo “Contabilidade BanKMar - 2026.xlsx”, aba CARTÕES. As colunas de número do cartão, validade e código não são lidas. Cartões com o mesmo apelido são atualizados.</p>
            <label className="linha"><span className="botao-arquivo secundario"><FileUp size={16} aria-hidden="true" /> Escolher planilha</span>
              <input type="file" accept=".xlsx" style={{ width: 0, height: 0, opacity: 0 }} disabled={ocupado} onChange={(e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (f) rodar(async () => {
                  const { cartoes, ignoradas } = lerAbaCartoes(new Uint8Array(await f.arrayBuffer()));
                  const r = await importarCartoesPlanilha(cartoes, hoje, f.name);
                  setMsg(`${r.novos} cartão(ões) novo(s) e ${r.atualizados} atualizado(s).${ignoradas.length ? ' ' + ignoradas.join(' ') : ''}`);
                  await depois();
                });
              }} />
            </label>
          </section>
        </>
      )}
      {cartaoAberto && d && !editando && (
        <DetalheCartao c={cartaoAberto} d={d} resumo={resumo(cartaoAberto)} hoje={hoje} onFechar={() => setAberto(null)} onEditar={() => setEditando(cartaoAberto)} onMudou={depois} />
      )}
      {editando && d && <EditarCartao c={editando} contas={d.contas} hoje={hoje} onFechar={() => setEditando(null)} onSalvo={async () => { setEditando(null); await depois(); }} />}
    </main>
  );
}

function DetalheCartao({ c, d, resumo, hoje, onFechar, onEditar, onMudou }: {
  c: Cartao; d: DadosCartoes; resumo: { vip: ReturnType<typeof acessosVip> | null; progs: { r: IsencaoDb; p: ReturnType<typeof progressoIsencao> }[]; pendente?: DadosCartoes['pendentes'][number] };
  hoje: string; onFechar: () => void; onEditar: () => void; onMudou: () => Promise<void>;
}) {
  const [usando, setUsando] = useState(false);
  const [uso, setUso] = useState({ data: hoje, aeroporto: '' });
  const [regra, setRegra] = useState<Partial<IsencaoDb> | null>(null);
  const { erro, ocupado, rodar } = useAcao();
  const usos = d.usos.filter((u) => u.card_id === c.id && resumo.vip && u.data >= resumo.vip.inicio);
  const conta = d.contas.find((k) => k.conta_id === c.mil_conta_id);
  const ultimaFatura = useMemo(() => d.faturas.filter((f) => f.card_id === c.id).sort((a, b) => b.competencia.localeCompare(a.competencia))[0], [d, c.id]);
  return (
    <Modal titulo={c.apelido} onFechar={onFechar}>
      <dl className="inspetor-numeros">
        {c.bandeira && <div><dt>Bandeira</dt><dd>{c.bandeira}{c.final4 ? ` · final ${c.final4}` : ''}</dd></div>}
        <div><dt>Vencimento e fechamento</dt><dd>{c.dia_vencimento ? `dia ${c.dia_vencimento}` : '—'}{c.dia_fechamento ? ` · fecha dia ${c.dia_fechamento}` : ''}</dd></div>
        <div><dt>Anuidade</dt><dd>{c.anuidade != null ? brl(c.anuidade) : '—'}</dd></div>
        {!c.ativo && <div><dt>Situação</dt><dd>Cancelado{c.desativado_em ? ` em ${dataBR(c.desativado_em)}` : ''}</dd></div>}
      </dl>

      <h3 className="inspetor-sec">Isenção de anuidade</h3>
      {!resumo.progs.length && <p className="sub">Nenhuma regra cadastrada.</p>}
      {resumo.progs.map(({ r, p }) => (
        <div key={r.id} className="regra-isencao">
          <div className="linha entre"><span>{NOME_ISENCAO[r.tipo]}</span><span className={p.atingida ? 'situacao ok' : 'situacao neutro'}>{p.atingida ? 'Atingida' : p.pct != null ? pctBR(p.pct, 0) : ''}</span></div>
          {p.pct != null && <div className="barra discreta"><div style={{ width: `${Math.min(100, p.pct * 100)}%` }} /></div>}
          <div className="sub">{p.texto}{r.observacao ? ` · ${r.observacao}` : ''}</div>
          <div className="acoes-fatura" style={{ marginTop: 2 }}>
            <button onClick={() => setRegra(r)}>Editar</button>
            <button onClick={() => rodar(async () => { await removerIsencao(r.id); await onMudou(); })}>Remover</button>
          </div>
        </div>
      ))}
      {regra ? (
        <div className="campos">
          <label>Tipo<select value={regra.tipo ?? 'gasto_mensal'} onChange={(e) => setRegra({ ...regra, tipo: e.target.value as Isencao['tipo'] })}>
            {Object.entries(NOME_ISENCAO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></label>
          {(regra.tipo ?? 'gasto_mensal') !== 'promocional' && <label>Meta (R$)<input inputMode="decimal" defaultValue={regra.meta ?? ''} onChange={(e) => setRegra({ ...regra, meta: numeroDe(e.target.value) })} /></label>}
          {regra.tipo === 'gasto_periodo' && <label>Período (meses)<input type="number" min={1} max={24} defaultValue={regra.meses ?? 3} onChange={(e) => setRegra({ ...regra, meses: Number(e.target.value) })} /></label>}
          {regra.tipo === 'promocional' && <label>Válida até<input type="date" defaultValue={regra.ate ?? ''} onChange={(e) => setRegra({ ...regra, ate: e.target.value })} /></label>}
          {regra.tipo === 'investido' && !c.instituicao_invest && <p className="sub">Informe em “Editar dados” a instituição onde fica o investimento.</p>}
          <label>Observação<input defaultValue={regra.observacao ?? ''} onChange={(e) => setRegra({ ...regra, observacao: e.target.value || null })} /></label>
          <div className="linha"><button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
            const t = regra.tipo ?? 'gasto_mensal';
            if (t !== 'promocional' && regra.meta == null) throw new Error('Informe a meta.');
            if (t === 'promocional' && !regra.ate) throw new Error('Informe até quando vale a isenção.');
            await salvarIsencao({ ...regra, tipo: t, meses: t === 'gasto_periodo' ? regra.meses ?? 3 : null, card_id: c.id });
            setRegra(null); await onMudou();
          })}>Salvar regra</button><button onClick={() => setRegra(null)}>Cancelar</button></div>
        </div>
      ) : <button className="link-acao" style={{ paddingLeft: 0 }} onClick={() => setRegra({ tipo: 'gasto_mensal' })}>Adicionar regra</button>}

      <h3 className="inspetor-sec">Sala VIP</h3>
      {!resumo.vip ? <p className="sub">Sem acessos cadastrados. Informe em “Editar dados”.</p> : (
        <>
          <div className="vip-contador">
            <strong>{resumo.vip.ilimitado ? 'Ilimitado' : `${resumo.vip.disponiveis} de ${resumo.vip.total}`}</strong>
            <span className="sub">{resumo.vip.ilimitado ? '' : 'acessos disponíveis'} · renova em {dataBR(resumo.vip.renovaEm)}</span>
          </div>
          {c.vip_obs && <p className="sub">{c.vip_obs}</p>}
          {usando ? (
            <div className="campos">
              <label>Data<input type="date" value={uso.data} onChange={(e) => setUso({ ...uso, data: e.target.value })} /></label>
              <label>Aeroporto<input value={uso.aeroporto} placeholder="ex.: BSB" maxLength={80} onChange={(e) => setUso({ ...uso, aeroporto: e.target.value })} /></label>
              <div className="linha"><button className="pri" disabled={ocupado} onClick={() => rodar(async () => { await usarVip(c.id, uso.data, uso.aeroporto.trim() || null); setUsando(false); await onMudou(); })}>Registrar uso</button><button onClick={() => setUsando(false)}>Cancelar</button></div>
            </div>
          ) : c.ativo && <button className="pri" onClick={() => setUsando(true)} disabled={!resumo.vip.ilimitado && resumo.vip.disponiveis === 0}><Plane size={16} aria-hidden="true" /> Usei</button>}
          {usos.length > 0 && (
            <ul className="onde-lista" style={{ marginTop: 8 }}>
              {usos.map((u) => <li key={u.id}><span>{dataBR(u.data)}</span><span className="sub">{u.aeroporto ?? ''}</span><span className="num"><button className="link-acao" onClick={() => rodar(async () => { await removerUsoVip(u.id); await onMudou(); })}>Desfazer</button></span></li>)}
            </ul>
          )}
        </>
      )}

      <h3 className="inspetor-sec">Pontos</h3>
      <p className="sub" style={{ marginTop: 0 }}>
        {conta ? `Vão para ${conta.programa} (${conta.titular})` : 'Sem programa de pontos ligado'}
        {c.pontos_nacional ? ` · ${String(c.pontos_nacional).replace('.', ',')} por real` : ''}{c.pontos_internacional ? ` · ${String(c.pontos_internacional).replace('.', ',')} internacional` : ''}
        {c.pontos_obs ? ` · ${c.pontos_obs}` : ''}
        {ultimaFatura && c.pontos_nacional ? ` · última fatura (${brl(ultimaFatura.total)}) deve render ~${Math.round(ultimaFatura.total * c.pontos_nacional).toLocaleString('pt-BR')} pontos` : ''}
      </p>

      <h3 className="inspetor-sec">Página de benefícios</h3>
      {c.link ? <a href={c.link} target="_blank" rel="noopener noreferrer" className="link-externo">Abrir página oficial <ExternalLink size={14} aria-hidden="true" /></a> : <p className="sub">Sem link cadastrado.</p>}
      <p className="sub">
        {c.beneficio_status === 'nao_verificado' ? 'Não verificado neste mês: a página não pôde ser lida. Os dados anteriores continuam valendo.'
          : c.beneficio_verificado_em ? `Última checagem em ${dataBR(c.beneficio_verificado_em.slice(0, 10))}.` : 'Ainda não checada.'}
      </p>
      {resumo.pendente && (
        <div className="diff">
          <p><strong>A página mudou em {dataBR(resumo.pendente.capturado_em.slice(0, 10))}.</strong> Confira e, se for o caso, atualize os dados do cartão.</p>
          {resumo.pendente.diff?.removidas.slice(0, 12).map((t, i) => <p key={'r' + i} className="diff-sai">− {t}</p>)}
          {resumo.pendente.diff?.adicionadas.slice(0, 12).map((t, i) => <p key={'a' + i} className="diff-entra">+ {t}</p>)}
          <div className="linha">
            <button className="pri" disabled={ocupado} onClick={() => rodar(async () => { await decidirBeneficio(resumo.pendente!, true); await onMudou(); })}>Aceitar como nova referência</button>
            <button disabled={ocupado} onClick={() => rodar(async () => { await decidirBeneficio(resumo.pendente!, false); await onMudou(); })}>Ignorar mudança</button>
          </div>
        </div>
      )}
      {c.observacoes && <><h3 className="inspetor-sec">Observações</h3><p className="sub" style={{ marginTop: 0 }}>{c.observacoes}</p></>}

      <Erro msg={erro} />
      <div className="linha" style={{ marginTop: 12 }}>
        <button onClick={onEditar}>Editar dados</button>
        {c.ativo
          ? <button className="perigo-texto" disabled={ocupado} onClick={() => rodar(async () => { await desativarCartao(c.id, hoje); await onMudou(); onFechar(); })}>Desativar (cancelado)</button>
          : <button disabled={ocupado} onClick={() => rodar(async () => { await reativarCartao(c.id); await onMudou(); })}>Reativar</button>}
      </div>
    </Modal>
  );
}

function EditarCartao({ c, contas, hoje, onFechar, onSalvo }: { c: Partial<Cartao>; contas: DadosCartoes['contas']; hoje: string; onFechar: () => void; onSalvo: () => void }) {
  const [k, setK] = useState<Partial<Cartao>>(c);
  const { erro, ocupado, rodar } = useAcao();
  const set = (campo: keyof Cartao, v: unknown) => setK({ ...k, [campo]: v === '' ? null : v });
  const n = (v: string) => numeroDe(v);
  void hoje;
  return (
    <Modal titulo={c.id ? `Editar ${c.apelido}` : 'Novo cartão'} onFechar={onFechar}>
      <p className="sub" style={{ marginTop: 0 }}>Só os 4 últimos dígitos. Número completo, validade e código nunca são pedidos nem guardados.</p>
      <div className="campos">
        <label>Apelido<input value={k.apelido ?? ''} onChange={(e) => set('apelido', e.target.value)} /></label>
        <label>Leitor de fatura<select value={k.emissor ?? 'outro'} onChange={(e) => set('emissor', e.target.value)}><option value="itau">Itaú</option><option value="caixa">Caixa</option><option value="outro">Outro (colar texto)</option></select></label>
        <label>Bandeira<input value={k.bandeira ?? ''} onChange={(e) => set('bandeira', e.target.value)} /></label>
        <label>Final (4 dígitos)<input inputMode="numeric" maxLength={4} value={k.final4 ?? ''} onChange={(e) => set('final4', e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <label>Dia do vencimento<input type="number" min={1} max={31} value={k.dia_vencimento ?? ''} onChange={(e) => set('dia_vencimento', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>Dia do fechamento<input type="number" min={1} max={31} value={k.dia_fechamento ?? ''} onChange={(e) => set('dia_fechamento', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>Banco de pagamento<input value={k.banco_pagamento ?? ''} onChange={(e) => set('banco_pagamento', e.target.value)} /></label>
        <label>Anuidade (R$/ano)<input inputMode="decimal" defaultValue={k.anuidade ?? ''} onChange={(e) => set('anuidade', n(e.target.value))} /></label>
        <label>Programa de pontos<select value={k.mil_conta_id ?? ''} onChange={(e) => set('mil_conta_id', e.target.value)}>
          <option value="">Nenhum</option>
          {contas.map((ct) => <option key={ct.conta_id} value={ct.conta_id}>{ct.programa} · {ct.titular}</option>)}
        </select></label>
        <label>Pontos por real (nacional)<input inputMode="decimal" defaultValue={k.pontos_nacional ?? ''} onChange={(e) => set('pontos_nacional', n(e.target.value))} /></label>
        <label>Pontos por real (internacional)<input inputMode="decimal" defaultValue={k.pontos_internacional ?? ''} onChange={(e) => set('pontos_internacional', n(e.target.value))} /></label>
        <label>Cashback que deixa de ganhar (%)<input inputMode="decimal" defaultValue={k.cashback_pct ?? 1} onChange={(e) => set('cashback_pct', n(e.target.value) ?? 0)} /></label>
        <label>Acessos de sala VIP por ano (999 = ilimitado)<input type="number" min={0} defaultValue={k.vip_acessos ?? ''} onChange={(e) => set('vip_acessos', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>Renovação dos acessos<input type="date" value={k.vip_renovacao ?? ''} onChange={(e) => set('vip_renovacao', e.target.value)} /></label>
        <label>Convidados e dependentes<input value={k.vip_obs ?? ''} onChange={(e) => set('vip_obs', e.target.value)} /></label>
        <label>Instituição do investimento (isenção)<input value={k.instituicao_invest ?? ''} placeholder="ex.: Inter" onChange={(e) => set('instituicao_invest', e.target.value)} /></label>
        <label className="campo-largo">Página oficial de benefícios<input type="url" value={k.link ?? ''} placeholder="https://" onChange={(e) => set('link', e.target.value)} /></label>
        <label className="campo-largo">Observações de pontuação<input value={k.pontos_obs ?? ''} onChange={(e) => set('pontos_obs', e.target.value)} /></label>
        <label className="campo-largo">Observações<textarea rows={3} value={k.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></label>
      </div>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        if (!k.apelido?.trim()) throw new Error('Informe o apelido.');
        if (k.final4 && !/^\d{4}$/.test(k.final4)) throw new Error('O final deve ter 4 dígitos.');
        if (k.link && !/^https?:\/\//i.test(k.link)) throw new Error('O link precisa começar com https://');
        await salvarCartao({ ...k, apelido: k.apelido.trim() });
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}

