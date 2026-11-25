// RF-23 (revisão), RF-24 (aprendizado), RF-25 (parcelas), RF-26 (total), RF-27 (estornos), RF-28 (manual), casos 3 e 5.
import { useEffect, useMemo, useState } from 'react';
import { supabase, ok } from '../lib/supabase';
import {
  planejarImportacao, conferirTotal, chaveEstabelecimento, contemNumeroCartao, calcularDivisao,
  type Compra, type Projecao, type RegraAprendida, type RegraCategoria, type RegraDivisao, type LinhaPlanejada,
} from '../lib/regras';
import { brl, competenciaDe, dataBR, isoDeBR, nomeMes } from '../lib/formato';
import { Carregando, EditorDivisao, Erro, Modal, divisaoValida, numeroDe, rotuloDivisao, useAcao, useCadastros } from '../ui/comum';
import type { Importacao } from './Faturas';

// A descrição do banco (descricao_original) fica congelada; descricaoFinal é o lembrete amigável (vazio = usa a do banco).
interface Linha extends LinhaPlanejada { manual: boolean; conferido: boolean; k: number }

export function Revisao({ imp, onFechar, onConfirmada }: { imp: Importacao; onFechar: () => void; onConfirmada: (comp: string) => void }) {
  const { c } = useCadastros();
  const [venc, setVenc] = useState(imp.lida.vencimento ?? '');
  const comp = venc ? competenciaDe(venc) : null;
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [naoEnc, setNaoEnc] = useState<(Projecao & { acao: 'manter' | 'excluir' })[]>([]);
  const [duplicada, setDuplicada] = useState(false);
  const [substituir, setSubstituir] = useState(false);
  const [total, setTotal] = useState(imp.lida.totalEsperado != null ? String(imp.lida.totalEsperado).replace('.', ',') : '');
  const [justificativa, setJustificativa] = useState('');
  const [editando, setEditando] = useState<Linha | null>(null);
  const { erro, ocupado, rodar } = useAcao();

  useEffect(() => {
    if (!comp) { setLinhas([]); return; }
    rodar(async () => {
      const inv = ok(await supabase.from('invoices').select('id, confirmada').eq('card_id', imp.cartao.id).eq('competencia', comp).maybeSingle()) as { id: string; confirmada: boolean } | null;
      setDuplicada(Boolean(inv?.confirmada));
      const [compras, projecoes, regras] = await Promise.all([
        supabase.from('purchases').select('*').eq('card_id', imp.cartao.id),
        inv ? supabase.from('transactions').select('id, purchase_id, parcela_atual, valor, descricao').eq('invoice_id', inv.id).eq('situacao', 'projetada') : Promise.resolve({ data: [], error: null }),
        supabase.from('category_rules').select('*'),
      ]);
      const plano = planejarImportacao(imp.lida.linhas, ok(projecoes) as Projecao[], (ok(compras) as Compra[]).map((x) => ({ ...x, valor_parcela: Number(x.valor_parcela) })), [] as RegraAprendida[], ok(regras) as RegraCategoria[]); // regras aprendidas desativadas a pedido do Mário
      setLinhas(plano.linhas.map((l, k) => ({ ...l, manual: false, conferido: false, k })));
      setNaoEnc(plano.naoEncontradas.map((p) => ({ ...p, acao: 'manter' })));
    });
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const esperado = numeroDe(total);
  const conf = useMemo(() => conferirTotal(linhas ?? [], esperado), [linhas, esperado]);
  const invalidas = (linhas ?? []).filter((l) => !divisaoValida(l.valor, l.split_rule));
  const podeConfirmar = comp && linhas && linhas.length > 0 && !invalidas.length && (!duplicada || substituir) && (conf.ok || justificativa.trim().length >= 5);

  const atualizar = (l: Linha) => setLinhas((ls) => ls!.map((x) => (x.k === l.k ? l : x)));

  const confirmar = () => rodar(async () => {
    for (const l of linhas!) {
      if (!l.descricao_original.trim()) throw new Error('Há lançamento manual sem descrição.');
      if (contemNumeroCartao(l.descricaoFinal) || contemNumeroCartao(l.descricao_original)) throw new Error(`A descrição "${l.descricaoFinal}" parece conter um número de cartão.`);
    }
    const payload = {
      card_id: imp.cartao.id, competencia: comp, vencimento: venc || null, total_impresso: esperado, origem: imp.origem,
      arquivo_nome: imp.arquivo, justificativa: conf.ok ? null : justificativa, substituir, avisos: imp.avisos,
      nao_encontradas: naoEnc.map((p) => ({ id: p.id, acao: p.acao })),
      linhas: linhas!.map((l) => ({
        data: l.data, descricao_original: l.descricao_original, descricao: l.descricaoFinal.trim() || l.descricao_original, chave: chaveEstabelecimento(l.descricao_original),
        parcela_atual: l.parcelaAtual, parcelas_total: l.parcelasTotal, valor: l.valor, category_id: l.category_id,
        split_rule: l.split_rule, conferido: l.conferido, purchase_id: l.purchase_id, projecao_id: l.projecao_id, lembrar: false,
      })),
    };
    const { error } = await supabase.rpc('confirmar_fatura', { p: payload });
    if (error) {
      if (error.message.includes('FATURA_DUPLICADA')) { setDuplicada(true); throw new Error('Já existe uma fatura confirmada deste cartão neste mês. Marque “substituir” ou cancele.'); }
      throw new Error(error.message);
    }
    onConfirmada(comp!);
  });

  const novaLinha = () => setLinhas((ls) => [...(ls ?? []), { data: null, descricao: '', descricao_original: '', descricaoFinal: '', parcelaAtual: null, parcelasTotal: null, valor: 0, category_id: null, split_rule: { tipo: 'mario' }, purchase_id: null, projecao_id: null, origemSugestao: 'nenhuma', manual: true, conferido: true, k: Date.now() }]);

  return (
    <Modal titulo={`Revisão — ${imp.cartao.apelido}`} onFechar={onFechar}>
      {imp.avisos.map((a, i) => <div className="aviso" key={i}>{a}</div>)}
      <div className="campos">
        <label>Vencimento<input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></label>
        <label>Total para conferir ({imp.lida.origemTotal})<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      </div>
      {comp && <p className="sub">Mês da fatura: {nomeMes(comp)}</p>}
      {duplicada && (
        <div className="aviso">
          Já existe fatura confirmada deste cartão em {comp && nomeMes(comp)} (caso 3). Os pagamentos registrados são mantidos.
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} /> Substituir os lançamentos importados antes</label>
        </div>
      )}
      {!linhas ? <Carregando /> : (
        <>
          <div className={conf.ok ? 'okmsg' : 'aviso'}>
            Soma dos lançamentos: <strong>{brl(conf.soma)}</strong>
            {esperado != null && <> · fatura: <strong>{brl(esperado)}</strong>{!conf.ok && <> · diferença <strong>{brl(conf.diferenca)}</strong></>}</>}
            {!conf.ok && (
              <label style={{ marginTop: 6 }}>Justifique a diferença para confirmar (RF-26)
                <input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="ex.: IOF lançado na próxima fatura" />
              </label>
            )}
          </div>
          <div className="rolar">
            <table>
              <thead><tr><th>✓</th><th>Data</th><th>Descrição</th><th className="num">Valor</th><th>Categoria / divisão</th><th></th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.k}>
                    <td><input type="checkbox" checked={l.conferido} onChange={(e) => atualizar({ ...l, conferido: e.target.checked })} aria-label="Conferido" /></td>
                    <td className="sub">{dataBR(l.data)}</td>
                    <td>
                      {l.manual
                        ? <input value={l.descricao_original} placeholder="descrição" onChange={(e) => atualizar({ ...l, descricao_original: e.target.value })} style={{ width: '100%', minWidth: 160 }} />
                        : <div title="Descrição da fatura (não editável)">{l.descricao_original}</div>}
                      <input value={l.descricaoFinal === l.descricao_original ? '' : l.descricaoFinal} placeholder="lembrete (opcional)" onChange={(e) => atualizar({ ...l, descricaoFinal: e.target.value })} style={{ width: '100%', minWidth: 160, marginTop: 4 }} aria-label="Lembrete" />
                      <div className="sub">{l.parcelaAtual ? `parcela ${l.parcelaAtual}/${l.parcelasTotal} · ` : ''}{l.origemSugestao === 'parcela anterior' ? 'dados da parcela anterior' : l.origemSugestao === 'regra de categoria' ? 'categoria sugerida' : ''}{l.projecao_id ? ' · substitui parcela prevista' : ''}</div>
                    </td>
                    <td className="num" style={{ color: l.valor < 0 ? 'var(--ok)' : undefined }}>{brl(l.valor)}</td>
                    <td>
                      <select value={l.category_id ?? ''} onChange={(e) => atualizar({ ...l, category_id: e.target.value || null })} aria-label="Categoria">
                        <option value="">—</option>{c.categorias.filter((k) => k.ativo).map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
                      </select>
                      <div className="sub" style={{ color: divisaoValida(l.valor, l.split_rule) ? undefined : 'var(--erro)' }}>{rotuloDivisao(l.split_rule, c)}</div>
                    </td>
                    <td>
                      <button onClick={() => setEditando(l)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={novaLinha} style={{ marginTop: 8 }}>+ Lançamento manual</button>
          {naoEnc.length > 0 && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Parcelas previstas que não vieram nesta fatura (caso 5)</strong>
              {naoEnc.map((p) => (
                <div key={p.id} className="linha entre" style={{ marginTop: 6 }}>
                  <span className="grow">{p.descricao} {p.parcela_atual ? `(${p.parcela_atual})` : ''} · {brl(Number(p.valor))}</span>
                  <select value={p.acao} onChange={(e) => setNaoEnc((xs) => xs.map((x) => (x.id === p.id ? { ...x, acao: e.target.value as 'manter' | 'excluir' } : x)))}>
                    <option value="manter">Manter para o mês seguinte</option>
                    <option value="excluir">Excluir</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {invalidas.length > 0 && <Erro msg={`${invalidas.length} lançamento(s) com divisão inválida (a soma das partes passa do valor).`} />}
          <Erro msg={erro} />
          <div className="linha" style={{ marginTop: 10 }}>
            <button className="pri" disabled={!podeConfirmar || ocupado} onClick={confirmar}>Confirmar importação</button>
            <button onClick={onFechar}>Cancelar</button>
          </div>
        </>
      )}
      {editando && <EditarLinha l={editando} onFechar={() => setEditando(null)} onSalvar={(l) => { atualizar(l); setEditando(null); }} />}
    </Modal>
  );
}

function EditarLinha({ l, onFechar, onSalvar }: { l: Linha; onFechar: () => void; onSalvar: (l: Linha) => void }) {
  const { c } = useCadastros();
  const [f, setF] = useState(l);
  const [valor, setValor] = useState(String(l.valor).replace('.', ','));
  const [data, setData] = useState(l.data ? dataBR(l.data) : '');
  const v = numeroDe(valor) ?? 0;
  let erroDiv: string | null = null;
  try { calcularDivisao(v, f.split_rule); } catch (e) { erroDiv = String(e); }
  return (
    <Modal titulo="Lançamento" onFechar={onFechar}>
      <div className="campos">
        {f.manual
          ? <label>Descrição<input value={f.descricao_original} onChange={(e) => setF({ ...f, descricao_original: e.target.value })} /></label>
          : <label>Descrição da fatura<input value={f.descricao_original} disabled /></label>}
        <label>Lembrete (opcional)<input value={f.descricaoFinal === f.descricao_original ? '' : f.descricaoFinal} onChange={(e) => setF({ ...f, descricaoFinal: e.target.value })} /></label>
        <label>Data<input value={data} onChange={(e) => setData(e.target.value)} placeholder="dd/mm/aaaa" /></label>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>Parcela atual<input type="number" value={f.parcelaAtual ?? ''} onChange={(e) => setF({ ...f, parcelaAtual: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>Total de parcelas<input type="number" value={f.parcelasTotal ?? ''} onChange={(e) => setF({ ...f, parcelasTotal: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>Categoria<select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value || null })}>
          <option value="">—</option>{c.categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></label>
      </div>
      <h2>Divisão</h2>
      <EditorDivisao valor={v} regra={f.split_rule} onChange={(r: RegraDivisao) => setF({ ...f, split_rule: r })} />
      <button className="pri" disabled={Boolean(erroDiv) || !f.descricao_original.trim()} onClick={() => onSalvar({
        ...f, valor: v, data: data ? isoDeBR(data) : null,
        parcelaAtual: f.parcelaAtual && f.parcelasTotal && f.parcelasTotal > 1 ? f.parcelaAtual : null,
        parcelasTotal: f.parcelaAtual && f.parcelasTotal && f.parcelasTotal > 1 ? f.parcelasTotal : null,
      })}>Aplicar</button>
    </Modal>
  );
}
