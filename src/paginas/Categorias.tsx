import { ChevronLeft, ChevronRight, X } from 'lucide-react';
// RF-30 (categorias), RF-31 (regras), RF-32 (visões).
import { useEffect, useState } from 'react';
import { supabase, ok } from '../lib/supabase';
import { brl, competenciaDe, hojeBrasilia, somaMeses, nomeMes, somaCentavos } from '../lib/formato';
import { chaveEstabelecimento } from '../lib/regras';
import { Carregando, Erro, Modal, useAcao, useCadastros } from '../ui/comum';

interface Gasto { competencia: string; category_id: string | null; total: number; total_mario: number }
interface RegraDb { id: string; padrao: string; category_id: string }

export function Categorias() {
  const { c, recarregar } = useCadastros();
  const [comp, setComp] = useState(competenciaDe(hojeBrasilia()));
  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [top, setTop] = useState<{ nome: string; total: number; qtd: number }[]>([]);
  const [regras, setRegras] = useState<RegraDb[]>([]);
  const [gerir, setGerir] = useState(false);
  const [base, setBase] = useState<'total_mario' | 'total'>('total_mario');
  const { erro, rodar } = useAcao();
  const inicio12 = somaMeses(comp, -11);

  useEffect(() => {
    rodar(async () => {
      const g = ok(await supabase.from('gastos_categoria').select('*').gte('competencia', inicio12).lte('competencia', comp)) as Gasto[];
      setGastos(g.map((x) => ({ ...x, total: Number(x.total), total_mario: Number(x.total_mario) })));
      const invs = ok(await supabase.from('invoices').select('id').eq('competencia', comp)) as { id: string }[];
      const txs = invs.length ? (ok(await supabase.from('transactions').select('descricao, descricao_original, valor').in('invoice_id', invs.map((i) => i.id)).eq('situacao', 'real')) as { descricao: string; descricao_original: string | null; valor: number }[]) : [];
      const m = new Map<string, { nome: string; total: number; qtd: number }>();
      for (const t of txs) {
        const k = chaveEstabelecimento(t.descricao_original || t.descricao).split(' ').slice(0, 2).join(' ');
        const cur = m.get(k) ?? { nome: k, total: 0, qtd: 0 };
        m.set(k, { nome: k, total: somaCentavos([cur.total, Number(t.valor)]), qtd: cur.qtd + 1 });
      }
      setTop([...m.values()].sort((a, b) => b.total - a.total).slice(0, 10));
      setRegras(ok(await supabase.from('category_rules').select('*').order('padrao')) as RegraDb[]);
    });
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeCat = (id: string | null) => c.categorias.find((k) => k.id === id)?.nome ?? 'Sem categoria';
  const doMes = (gastos ?? []).filter((g) => g.competencia === comp);
  const porCat = new Map<string, number>();
  for (const g of doMes) porCat.set(nomeCat(g.category_id), somaCentavos([porCat.get(nomeCat(g.category_id)) ?? 0, g[base]]));
  const lista = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...lista.map(([, v]) => v));
  const meses = Array.from({ length: 12 }, (_, i) => somaMeses(inicio12, i));
  const cats = [...new Set((gastos ?? []).map((g) => nomeCat(g.category_id)))].sort();
  const val = (cat: string, m: string) => somaCentavos((gastos ?? []).filter((g) => g.competencia === m && nomeCat(g.category_id) === cat).map((g) => g[base]));

  return (
    <main>
      <p className="titulo-pagina">Gastos por categoria</p>
      <div className="linha entre">
        <button onClick={() => setComp(somaMeses(comp, -1))} aria-label="Mês anterior" className="icone"><ChevronLeft size={20} /></button>
        <h1>{nomeMes(comp)}</h1>
        <button onClick={() => setComp(somaMeses(comp, 1))} aria-label="Próximo mês" className="icone"><ChevronRight size={20} /></button>
      </div>
      <div className="linha">
        <select value={base} onChange={(e) => setBase(e.target.value as typeof base)}><option value="total_mario">Só a minha parte</option><option value="total">Valor total</option></select>
        <button onClick={() => setGerir(true)}>Categorias e regras</button>
      </div>
      <Erro msg={erro} />
      {!gastos ? <Carregando /> : (
        <>
          <h2>Por categoria</h2>
          <div className="card">
            {lista.map(([nome, v]) => (
              <div key={nome} style={{ marginBottom: 8 }}>
                <div className="linha entre"><span>{nome}</span><span className="num">{brl(v)}</span></div>
                <div className="barra"><div style={{ width: `${Math.max(0, (v / max) * 100)}%` }} /></div>
              </div>
            ))}
            {!lista.length && <p className="sub">Sem gastos neste mês.</p>}
          </div>
          <h2>Últimos 12 meses</h2>
          <div className="card rolar">
            <table>
              <thead><tr><th>Categoria</th>{meses.map((m) => <th key={m} className="num">{m.slice(5, 7)}/{m.slice(2, 4)}</th>)}</tr></thead>
              <tbody>
                {cats.map((cat) => <tr key={cat}><td>{cat}</td>{meses.map((m) => <td key={m} className="num">{val(cat, m) ? val(cat, m).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : ''}</td>)}</tr>)}
                <tr><th>Total</th>{meses.map((m) => <th key={m} className="num">{somaCentavos(cats.map((k) => val(k, m))).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</th>)}</tr>
              </tbody>
            </table>
          </div>
          <h2>Top estabelecimentos (faturas do mês)</h2>
          <div className="card">
            {top.map((t) => <div className="linha entre" key={t.nome}><span>{t.nome} <span className="sub">({t.qtd})</span></span><span className="num">{brl(t.total)}</span></div>)}
            {!top.length && <p className="sub">Sem lançamentos de fatura neste mês.</p>}
          </div>
        </>
      )}
      {gerir && <GerirCategorias regras={regras} onFechar={async () => { setGerir(false); await recarregar(); setRegras(ok(await supabase.from('category_rules').select('*').order('padrao')) as RegraDb[]); }} />}
    </main>
  );
}

function GerirCategorias({ regras, onFechar }: { regras: RegraDb[]; onFechar: () => void }) {
  const { c, recarregar } = useCadastros();
  const [nova, setNova] = useState('');
  const [rs, setRs] = useState(regras);
  const [padrao, setPadrao] = useState('');
  const [cat, setCat] = useState(c.categorias[0]?.id ?? '');
  const { erro, rodar } = useAcao();
  return (
    <Modal titulo="Categorias e regras" onFechar={onFechar}>
      <h2>Categorias</h2>
      {c.categorias.map((k) => (
        <div className="linha entre" key={k.id} style={{ opacity: k.ativo ? 1 : 0.5 }}>
          <input defaultValue={k.nome} onBlur={(e) => e.target.value !== k.nome && rodar(async () => { ok(await supabase.from('categories').update({ nome: e.target.value }).eq('id', k.id)); await recarregar(); })} />
          <button onClick={() => rodar(async () => { ok(await supabase.from('categories').update({ ativo: !k.ativo }).eq('id', k.id)); await recarregar(); })}>{k.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      ))}
      <div className="linha" style={{ marginTop: 6 }}>
        <input placeholder="nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
        <button onClick={() => rodar(async () => { if (nova.trim()) { ok(await supabase.from('categories').insert({ nome: nova.trim() })); setNova(''); await recarregar(); } })}>Adicionar</button>
      </div>
      <h2>Regras (estabelecimento contém → categoria)</h2>
      <p className="sub">Regras usadas para sugerir a categoria na revisão das faturas.</p>
      {rs.map((r) => (
        <div className="linha entre" key={r.id}>
          <span className="grow">{r.padrao}</span><span>{c.categorias.find((k) => k.id === r.category_id)?.nome}</span>
          <button className="perigo" onClick={() => rodar(async () => { ok(await supabase.from('category_rules').delete().eq('id', r.id)); setRs(rs.filter((x) => x.id !== r.id)); })} aria-label="Remover"><X size={16} /></button>
        </div>
      ))}
      <div className="linha" style={{ marginTop: 6 }}>
        <input placeholder="ex.: 99FOOD" value={padrao} onChange={(e) => setPadrao(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{c.categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select>
        <button onClick={() => rodar(async () => {
          const p = chaveEstabelecimento(padrao);
          if (!p) return;
          const r = ok(await supabase.from('category_rules').upsert({ padrao: p, category_id: cat }, { onConflict: 'user_id,padrao' }).select().single()) as RegraDb;
          setRs([...rs.filter((x) => x.padrao !== p), r]); setPadrao('');
        })}>Adicionar regra</button>
      </div>
      <Erro msg={erro} />
    </Modal>
  );
}
