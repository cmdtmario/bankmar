import { X } from 'lucide-react';
// RF-35 a RF-40 e RF-39a: pessoas, marcadores, saldo, recebimentos, resumo, links.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, ok } from '../lib/supabase';
import type { Pessoa, Tag } from '../lib/dados';
import { agruparPorMarcador, rotuloParcela, textoWhatsApp, type ItemPessoa } from '../lib/resumo';
import { gerarPdfResumo } from '../lib/pdfResumo';
import { gerarToken, sha256Hex } from '../lib/token';
import { brl, dataBR, competenciaDe, hojeBrasilia, somaMeses, somaCentavos, nomeMes } from '../lib/formato';
import { Carregando, Erro, Modal, numeroDe, useAcao, useCadastros } from '../ui/comum';

export function Pessoas() {
  const { c, recarregar } = useCadastros();
  const [edit, setEdit] = useState<Partial<Pessoa> | null>(null);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [novaTag, setNovaTag] = useState('');
  const { erro, rodar } = useAcao();

  useEffect(() => {
    rodar(async () => {
      const [it, rec] = await Promise.all([supabase.from('person_items').select('person_id, valor').not('person_id', 'is', null), supabase.from('receipts').select('person_id, valor')]);
      const s: Record<string, number> = {};
      for (const i of ok(it) as { person_id: string; valor: number }[]) s[i.person_id] = somaCentavos([s[i.person_id] ?? 0, Number(i.valor)]);
      for (const r of ok(rec) as { person_id: string; valor: number }[]) s[r.person_id] = somaCentavos([s[r.person_id] ?? 0, -Number(r.valor)]);
      setSaldos(s);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <h1>Pessoas</h1>
      <Erro msg={erro} />
      <button className="pri" onClick={() => setEdit({ nome: '', ativo: true })}>+ Pessoa</button>
      {c.pessoas.map((p) => (
        <div className="card linha entre" key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
          <Link to={`/pessoas/${p.id}`} className="grow"><strong>{p.nome}</strong>{p.apelido && <span className="sub"> ({p.apelido})</span>}</Link>
          <span className="num">{brl(saldos[p.id] ?? 0)}<div className="sub">saldo a receber</div></span>
          <button onClick={() => setEdit(p)}>Editar</button>
        </div>
      ))}
      <h2>Marcadores</h2>
      <p className="sub">Separam grupos no resumo da pessoa (ex.: “Salão” para os gastos do salão do Diego).</p>
      <div className="linha">
        {c.tags.map((t: Tag) => <span className="selo" key={t.id}>{t.nome}</span>)}
        <input placeholder="novo marcador" value={novaTag} onChange={(e) => setNovaTag(e.target.value)} />
        <button onClick={() => rodar(async () => { if (novaTag.trim()) { ok(await supabase.from('tags').insert({ nome: novaTag.trim() })); setNovaTag(''); await recarregar(); } })}>Adicionar</button>
      </div>
      {edit && (
        <Modal titulo={edit.id ? 'Editar pessoa' : 'Nova pessoa'} onFechar={() => setEdit(null)}>
          <div className="campos">
            <label>Nome<input value={edit.nome ?? ''} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label>Apelido<input value={edit.apelido ?? ''} onChange={(e) => setEdit({ ...edit, apelido: e.target.value || null })} /></label>
            <label>Chave Pix (aparece no resumo)<input value={edit.pix ?? ''} onChange={(e) => setEdit({ ...edit, pix: e.target.value || null })} /></label>
            <label>Ativa<select value={edit.ativo ? '1' : '0'} onChange={(e) => setEdit({ ...edit, ativo: e.target.value === '1' })}><option value="1">Sim</option><option value="0">Não</option></select></label>
          </div>
          <button className="pri" onClick={() => rodar(async () => {
            if (!edit.nome?.trim()) throw new Error('Informe o nome.');
            const d = { nome: edit.nome.trim(), apelido: edit.apelido ?? null, pix: edit.pix ?? null, ativo: edit.ativo ?? true };
            if (edit.id) ok(await supabase.from('people').update(d).eq('id', edit.id)); else ok(await supabase.from('people').insert(d));
            setEdit(null); await recarregar();
          })}>Salvar</button>
        </Modal>
      )}
    </main>
  );
}

interface ItemDb extends ItemPessoa { person_id: string; competencia: string; origem: string; item_id: string }
interface Recebimento { id: string; data: string; valor: number; observacao: string | null }
interface LinkDb { id: string; inicio: string; fim: string; expira_em: string; revogado_em: string | null; criado_em: string }

export function PessoaDetalhe() {
  const { id } = useParams();
  const { c } = useCadastros();
  const pessoa = c.pessoas.find((p) => p.id === id);
  const hojeComp = competenciaDe(hojeBrasilia());
  const [ini, setIni] = useState(hojeComp);
  const [fim, setFim] = useState(hojeComp);
  const [itens, setItens] = useState<ItemDb[] | null>(null);
  const [recs, setRecs] = useState<Recebimento[]>([]);
  const [saldoGeral, setSaldoGeral] = useState(0);
  const [links, setLinks] = useState<LinkDb[]>([]);
  const [novoLink, setNovoLink] = useState<string | null>(null);
  const [rec, setRec] = useState({ data: hojeBrasilia(), valor: '', obs: '' });
  const [copiado, setCopiado] = useState(false);
  const { erro, rodar } = useAcao();
  const fimData = (() => { const f = somaMeses(fim, 1); const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();

  const carregar = () => rodar(async () => {
    const [it, rc, todos, todosRec, lk] = await Promise.all([
      supabase.from('person_items').select('*').eq('person_id', id!).gte('competencia', ini).lte('competencia', fim),
      supabase.from('receipts').select('*').eq('person_id', id!).gte('data', ini).lte('data', fimData).order('data'),
      supabase.from('person_items').select('valor').eq('person_id', id!),
      supabase.from('receipts').select('valor').eq('person_id', id!),
      supabase.from('share_links').select('*').eq('person_id', id!).order('criado_em', { ascending: false }),
    ]);
    setItens((ok(it) as (ItemDb & { tag_nome: string | null })[]).map((x) => ({ ...x, valor: Number(x.valor), marcador: x.tag_nome })));
    setRecs((ok(rc) as Recebimento[]).map((r) => ({ ...r, valor: Number(r.valor) })));
    setSaldoGeral(somaCentavos([...(ok(todos) as { valor: number }[]).map((x) => Number(x.valor)), ...(ok(todosRec) as { valor: number }[]).map((x) => -Number(x.valor))]));
    setLinks(ok(lk) as LinkDb[]);
  });
  useEffect(() => { carregar(); }, [id, ini, fim]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pessoa) return <main><p>Pessoa não encontrada.</p></main>;
  const periodo = ini === fim ? nomeMes(ini) : `${nomeMes(ini)} a ${nomeMes(fim)}`;
  const total = somaCentavos((itens ?? []).map((i) => i.valor));
  const recebido = somaCentavos(recs.map((r) => r.valor));
  const texto = itens ? textoWhatsApp({ pessoa: pessoa.nome, periodo, itens, recebido, pix: pessoa.pix }) : '';

  return (
    <main>
      <Link to="/pessoas">← Pessoas</Link>
      <h1>{pessoa.nome}</h1>
      <Erro msg={erro} />
      <div className="card">
        <div className="campos">
          <label>De<input type="month" value={ini.slice(0, 7)} onChange={(e) => e.target.value && setIni(e.target.value + '-01')} /></label>
          <label>Até<input type="month" value={fim.slice(0, 7)} onChange={(e) => e.target.value && setFim(e.target.value + '-01')} /></label>
        </div>
        <div className="linha entre" style={{ marginTop: 8 }}>
          <div><div className="sub">Total do período</div><strong>{brl(total)}</strong></div>
          <div><div className="sub">Recebido no período</div><strong>{brl(recebido)}</strong></div>
          <div><div className="sub">Saldo acumulado</div><strong>{brl(saldoGeral)}</strong></div>
        </div>
      </div>
      {!itens ? <Carregando /> : agruparPorMarcador(itens).map((g) => (
        <div className="card" key={g.marcador ?? '-'}>
          <div className="linha entre"><strong>{g.marcador ?? 'Pessoal'}</strong><strong>{brl(g.subtotal)}</strong></div>
          {g.itens.map((i, k) => (
            <div className="linha entre" key={k} style={{ borderTop: '1px solid var(--linha)', padding: '4px 0' }}>
              <span className="grow">{i.descricao}{rotuloParcela(i)}<div className="sub">{dataBR(i.data)} · {i.cartao ?? 'conta'}</div></span>
              <span className="num">{brl(i.valor)}</span>
            </div>
          ))}
        </div>
      ))}

      <h2>Enviar resumo</h2>
      <div className="linha">
        <button onClick={() => gerarPdfResumo({ pessoa: pessoa.nome, periodo, competencia: ini, itens: itens ?? [], recebido, pix: pessoa.pix })}>Baixar PDF</button>
        <button onClick={async () => { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>{copiado ? 'Copiado!' : 'Copiar texto'}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"><button>Abrir no WhatsApp</button></a>
        <button onClick={() => rodar(async () => {
          const token = gerarToken();
          ok(await supabase.from('share_links').insert({ person_id: pessoa.id, inicio: ini, fim: fimData, token_hash: await sha256Hex(token) }));
          setNovoLink(`${location.origin}/c/${token}`);
          await carregar();
        })}>Gerar link de consulta</button>
      </div>
      {novoLink && (
        <div className="okmsg">Link (válido por 30 dias; só aparece agora — copie):<br /><code style={{ wordBreak: 'break-all' }}>{novoLink}</code><br />
          <button onClick={() => navigator.clipboard.writeText(novoLink)}>Copiar link</button></div>
      )}
      {links.length > 0 && (
        <div className="card">
          <strong>Links gerados</strong>
          {links.map((l) => {
            const ativo = !l.revogado_em && new Date(l.expira_em) > new Date();
            return (
              <div className="linha entre" key={l.id} style={{ marginTop: 4 }}>
                <span className="sub grow">{dataBR(l.inicio)}–{dataBR(l.fim)} · {l.revogado_em ? 'revogado' : ativo ? `expira ${dataBR(l.expira_em)}` : 'expirado'}</span>
                {ativo && <button className="perigo" onClick={() => rodar(async () => { ok(await supabase.from('share_links').update({ revogado_em: new Date().toISOString() }).eq('id', l.id)); await carregar(); })}>Revogar</button>}
              </div>
            );
          })}
        </div>
      )}

      <h2>Recebimentos</h2>
      <div className="card">
        <div className="campos">
          <label>Data<input type="date" value={rec.data} onChange={(e) => setRec({ ...rec, data: e.target.value })} /></label>
          <label>Valor<input inputMode="decimal" value={rec.valor} onChange={(e) => setRec({ ...rec, valor: e.target.value })} /></label>
          <label>Observação<input value={rec.obs} onChange={(e) => setRec({ ...rec, obs: e.target.value })} /></label>
        </div>
        <button className="pri" style={{ marginTop: 8 }} onClick={() => rodar(async () => {
          const v = numeroDe(rec.valor);
          if (!v || v <= 0) throw new Error('Informe um valor maior que zero.');
          ok(await supabase.from('receipts').insert({ person_id: pessoa.id, data: rec.data, valor: v, observacao: rec.obs || null }));
          setRec({ ...rec, valor: '', obs: '' }); await carregar();
        })}>Registrar recebimento</button>
        {recs.map((r) => (
          <div className="linha entre" key={r.id} style={{ marginTop: 6 }}>
            <span className="grow">{dataBR(r.data)} {r.observacao ?? ''}</span><span className="num">{brl(r.valor)}</span>
            <button className="perigo" onClick={() => rodar(async () => { ok(await supabase.from('receipts').delete().eq('id', r.id)); await carregar(); })} aria-label="Remover"><X size={16} /></button>
          </div>
        ))}
      </div>
    </main>
  );
}
