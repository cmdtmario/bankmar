// RF-20 a RF-28: faturas por cartão, importação (PDF, texto, manual) e lançamentos.
import { useEffect, useState } from 'react';
import { supabase, ok } from '../lib/supabase';
import type { Cartao, FaturaResumo } from '../lib/dados';
import { lerFatura, LeitorError, type FaturaLida } from '../lib/faturas';
import { extrairItens } from '../lib/faturas/pdf';
import { faturaDeTexto } from '../lib/faturas/texto';
import { brl, dataBR, competenciaDe, hojeBrasilia, somaMeses, nomeMes, isoDeBR } from '../lib/formato';
import { contemNumeroCartao, type RegraDivisao } from '../lib/regras';
import { Carregando, EditorDivisao, Erro, Modal, numeroDe, rotuloDivisao, useAcao, useCadastros } from '../ui/comum';
import { Revisao } from './Revisao';

export interface Importacao { cartao: Cartao; lida: FaturaLida; origem: 'pdf' | 'texto' | 'manual'; arquivo: string | null; avisos: string[] }

export function Faturas() {
  const { c } = useCadastros();
  const [comp, setComp] = useState(competenciaDe(hojeBrasilia()));
  const [resumos, setResumos] = useState<FaturaResumo[] | null>(null);
  const [importando, setImportando] = useState<Importacao | null>(null);
  const [texto, setTexto] = useState<Cartao | null>(null);
  const [vendo, setVendo] = useState<{ cartao: Cartao; invoice: string } | null>(null);
  const { erro, rodar, setErro } = useAcao();

  const carregar = () => rodar(async () => setResumos(ok(await supabase.from('invoice_summary').select('*').eq('competencia', comp)) as FaturaResumo[]));
  useEffect(() => { setResumos(null); carregar(); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartoes = c.cartoes.filter((k) => k.ativo || resumos?.some((r) => r.card_id === k.id));
  const vencPadrao = (k: Cartao) => (k.dia_vencimento ? `${comp.slice(0, 8)}${String(k.dia_vencimento).padStart(2, '0')}` : null);

  const importarPdf = (k: Cartao, arq: File) => rodar(async () => {
    try {
      const itens = await extrairItens(arq, async (errada) => window.prompt(errada ? 'Senha incorreta. Tente de novo (a senha não é guardada):' : 'Este PDF tem senha. Digite para abrir agora (não é guardada):'));
      const lida = lerFatura(k.emissor, itens);
      const avisos: string[] = [];
      if (k.final4 && lida.final4 && k.final4 !== lida.final4) avisos.push(`O PDF é do cartão final ${lida.final4}, mas o cadastro de “${k.apelido}” tem final ${k.final4}. Confira se escolheu o cartão certo.`);
      setImportando({ cartao: k, lida, origem: 'pdf', arquivo: arq.name, avisos });
    } catch (e) {
      // caso 1: nada é importado parcialmente
      if (e instanceof LeitorError) { setErro(`${e.message}\nNada foi importado. Você pode usar “Colar texto”.`); return; }
      throw e;
    }
  });

  return (
    <main>
      <div className="linha entre">
        <button onClick={() => setComp(somaMeses(comp, -1))} aria-label="Mês anterior">◀</button>
        <h1 style={{ textTransform: 'capitalize' }}>Faturas · {nomeMes(comp)}</h1>
        <button onClick={() => setComp(somaMeses(comp, 1))} aria-label="Próximo mês">▶</button>
      </div>
      <Erro msg={erro} />
      {!resumos ? <Carregando /> : !cartoes.length ? <p className="sub">Cadastre seus cartões em “Mais”.</p> : cartoes.map((k) => {
        const r = resumos.find((x) => x.card_id === k.id);
        return (
          <div className="card" key={k.id}>
            <div className="linha entre">
              <div className="grow">
                <strong>{k.apelido}</strong>{k.final4 && <span className="sub"> · final {k.final4}</span>}
                <div className="sub">
                  {r?.confirmada ? `importada · ${r.qtd_linhas} lançamentos · vence ${dataBR(r.vencimento)}` : r?.qtd_projetadas ? `${r.qtd_projetadas} parcela(s) prevista(s)` : 'sem fatura'}
                  {k.emissor === 'outro' && ' · sem leitor de PDF (use colar texto)'}
                </div>
              </div>
              {r && <span className="num"><strong>{brl(Number(r.total))}</strong><div className="sub">meu {brl(Number(r.total_mario))}</div></span>}
            </div>
            <div className="linha" style={{ marginTop: 8 }}>
              {k.emissor !== 'outro' && (
                <label style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <span className="selo">Importar PDF</span>
                  <input type="file" accept="application/pdf" style={{ width: 0, height: 0, opacity: 0 }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importarPdf(k, f); }} />
                </label>
              )}
              <button onClick={() => setTexto(k)}>Colar texto</button>
              <button onClick={() => setImportando({ cartao: k, origem: 'manual', arquivo: null, avisos: [], lida: { emissor: 'texto', final4: null, vencimento: r?.vencimento ?? vencPadrao(k), totalEsperado: null, origemTotal: 'Total informado por você', linhas: [] } })}>Lançar à mão</button>
              {r && (r.qtd_linhas > 0 || r.qtd_projetadas > 0) && <button onClick={() => setVendo({ cartao: k, invoice: r.invoice_id })}>Ver lançamentos</button>}
            </div>
          </div>
        );
      })}
      {texto && <ColarTexto cartao={texto} venc={vencPadrao(texto)} onFechar={() => setTexto(null)} onPronto={(imp) => { setTexto(null); setImportando(imp); }} />}
      {importando && <Revisao imp={importando} onFechar={() => setImportando(null)} onConfirmada={(c2) => { setImportando(null); setComp(c2); carregar(); }} />}
      {vendo && <Lancamentos cartao={vendo.cartao} invoiceId={vendo.invoice} onFechar={() => { setVendo(null); carregar(); }} />}
    </main>
  );
}

function ColarTexto({ cartao, venc, onFechar, onPronto }: { cartao: Cartao; venc: string | null; onFechar: () => void; onPronto: (i: Importacao) => void }) {
  const [txt, setTxt] = useState('');
  const [vencimento, setVencimento] = useState(venc ?? '');
  const [total, setTotal] = useState('');
  const { erro, rodar } = useAcao();
  return (
    <Modal titulo={`Colar texto — ${cartao.apelido}`} onFechar={onFechar}>
      <p className="sub">Cole a tabela que o ChatGPT devolve, ou um CSV do banco, com as colunas: data (dd/mm/aaaa) | descrição | parcela atual | total de parcelas | valor. Créditos e estornos com sinal negativo.</p>
      <textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'| 05/11/2026 | MERCADO LIVRE | 1 | 6 | 42,51 |'} />
      <div className="campos">
        <label>Vencimento da fatura<input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></label>
        <label>Total da fatura (para conferir)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      </div>
      <Erro msg={erro} />
      <button className="pri" onClick={() => rodar(async () => {
        if (!vencimento) throw new Error('Informe o vencimento.');
        if (contemNumeroCartao(txt)) throw new Error('O texto parece conter um número completo de cartão. Remova antes de importar.');
        const f = faturaDeTexto(txt, vencimento, numeroDe(total));
        if (!f.linhas.length) throw new Error(`Nenhuma linha válida.\n${f.erros.join('\n')}`);
        onPronto({ cartao, lida: f, origem: 'texto', arquivo: null, avisos: f.erros.map((e) => `Ignorada — ${e}`) });
      })}>Revisar</button>
    </Modal>
  );
}

interface Tx { id: string; purchase_id: string | null; data_compra: string | null; descricao: string; descricao_original: string | null; parcela_atual: number | null; parcelas_total: number | null; valor: number; category_id: string | null; split_rule: RegraDivisao; conferido: boolean; situacao: string }

/** Lançamentos já gravados: edição de descrição, categoria, divisão e conferência. */
function Lancamentos({ cartao, invoiceId, onFechar }: { cartao: Cartao; invoiceId: string; onFechar: () => void }) {
  const { c } = useCadastros();
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [edit, setEdit] = useState<Tx | null>(null);
  const { erro, rodar } = useAcao();
  const carregar = () => rodar(async () => setTxs(ok(await supabase.from('transactions').select('*').eq('invoice_id', invoiceId).order('situacao').order('ordem').order('data_compra')) as Tx[]));
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal titulo={`Lançamentos — ${cartao.apelido}`} onFechar={onFechar}>
      <Erro msg={erro} />
      {!txs ? <Carregando /> : txs.map((t) => (
        <div key={t.id} className="linha entre" style={{ borderBottom: '1px solid var(--linha)', padding: '6px 0' }}>
          <div className="grow">
            {t.descricao_original ?? t.descricao}{t.parcela_atual ? ` (${t.parcela_atual}/${t.parcelas_total})` : ''}
            {t.descricao_original && t.descricao !== t.descricao_original && <div className="sub">📝 {t.descricao}</div>}
            <div className="sub">{dataBR(t.data_compra)} · {c.categorias.find((k) => k.id === t.category_id)?.nome ?? 'sem categoria'} · {rotuloDivisao(t.split_rule, c)}{t.situacao !== 'real' ? ` · ${t.situacao}` : ''}{t.conferido ? ' · ✓' : ''}</div>
          </div>
          <span className="num">{brl(Number(t.valor))}</span>
          <button onClick={() => setEdit(t)}>Editar</button>
        </div>
      ))}
      {edit && <EditarTx t={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); carregar(); }} />}
    </Modal>
  );
}

function EditarTx({ t, onFechar, onSalvo }: { t: Tx; onFechar: () => void; onSalvo: () => void }) {
  const { c } = useCadastros();
  const [f, setF] = useState(t);
  const [valor, setValor] = useState(String(t.valor).replace('.', ','));
  const [data, setData] = useState(t.data_compra ? dataBR(t.data_compra) : '');
  const { erro, ocupado, rodar } = useAcao();
  return (
    <Modal titulo="Editar lançamento" onFechar={onFechar}>
      <div className="campos">
        <label>Descrição da fatura<input value={t.descricao_original ?? t.descricao} disabled /></label>
        <label>Lembrete (opcional)<input value={t.descricao_original && f.descricao === t.descricao_original ? '' : f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
        <label>Data<input value={data} onChange={(e) => setData(e.target.value)} placeholder="dd/mm/aaaa" /></label>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>Categoria<select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value || null })}>
          <option value="">—</option>{c.categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></label>
        <label>Conferido<select value={f.conferido ? '1' : '0'} onChange={(e) => setF({ ...f, conferido: e.target.value === '1' })}><option value="1">Sim</option><option value="0">Não</option></select></label>
      </div>
      <h2>Divisão</h2>
      <EditorDivisao valor={numeroDe(valor) ?? 0} regra={f.split_rule} onChange={(r) => setF({ ...f, split_rule: r })} />
      <Erro msg={erro} />
      <div className="linha">
        <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
          if (contemNumeroCartao(f.descricao)) throw new Error('A descrição parece conter um número de cartão.');
          ok(await supabase.from('transactions').update({ descricao: f.descricao.trim() || t.descricao_original || t.descricao, data_compra: data ? isoDeBR(data) : null, valor: numeroDe(valor) ?? 0, category_id: f.category_id, split_rule: f.split_rule, conferido: f.conferido }).eq('id', t.id));
          // parcelas: lembrete, categoria e divisão valem para as parcelas previstas da mesma compra
          if (t.purchase_id) {
            const desc = f.descricao.trim() || t.descricao_original || t.descricao;
            ok(await supabase.from('purchases').update({ descricao: desc, category_id: f.category_id, split_rule: f.split_rule }).eq('id', t.purchase_id));
            ok(await supabase.from('transactions').update({ descricao: desc, category_id: f.category_id, split_rule: f.split_rule }).eq('purchase_id', t.purchase_id).eq('situacao', 'projetada'));
          }
          onSalvo();
        })}>Salvar</button>
        <button className="perigo" onClick={() => rodar(async () => { if (confirm('Excluir este lançamento?')) { ok(await supabase.from('transactions').delete().eq('id', t.id)); onSalvo(); } })}>Excluir</button>
      </div>
    </Modal>
  );
}
