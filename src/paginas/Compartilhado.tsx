// RF-40: página pública do link de consulta (sem login). Mostra só o que o banco devolve.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { agruparPorMarcador, rotuloParcela, type ItemPessoa } from '../lib/resumo';
import { brl, dataBR } from '../lib/formato';
import { Carregando } from '../ui/comum';

interface Resumo { disponivel: boolean; pessoa?: string; pix?: string | null; inicio?: string; fim?: string; itens?: ItemPessoa[]; total?: number; recebido?: number; saldo?: number }

export function Compartilhado() {
  const { token } = useParams();
  const [r, setR] = useState<Resumo | null>(null);
  useEffect(() => {
    supabase.rpc('get_shared_summary', { p_token: token ?? '' }).then(({ data }) => setR((data as Resumo) ?? { disponivel: false }));
  }, [token]);
  if (!r) return <main><Carregando /></main>;
  if (!r.disponivel) return <main><h1>BankMaR</h1><div className="card">Este link não está mais disponível.</div></main>;
  return (
    <main style={{ paddingBottom: 24 }}>
      <h1>Resumo de {r.pessoa}</h1>
      <p className="sub">{dataBR(r.inicio)} a {dataBR(r.fim)}</p>
      {agruparPorMarcador((r.itens ?? []).map((i) => ({ ...i, valor: Number(i.valor) }))).map((g) => (
        <div className="card" key={g.marcador ?? '-'}>
          <div className="linha entre"><strong>{g.marcador ?? 'Pessoal'}</strong><strong>{brl(g.subtotal)}</strong></div>
          {g.itens.map((i, k) => (
            <div className="linha entre" key={k} style={{ borderTop: '1px solid var(--linha)', padding: '4px 0' }}>
              <span className="grow">{i.descricao}{rotuloParcela(i)}<div className="sub">{dataBR(i.data)}</div></span>
              <span className="num">{brl(i.valor)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="card">
        <div className="linha entre"><span>Total</span><strong>{brl(Number(r.total))}</strong></div>
        <div className="linha entre"><span>Já recebido</span><span>{brl(Number(r.recebido))}</span></div>
        <div className="linha entre"><span>A pagar</span><strong>{brl(Number(r.saldo))}</strong></div>
        {r.pix && <p>Pix: <code>{r.pix}</code></p>}
      </div>
    </main>
  );
}
