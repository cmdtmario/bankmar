import { ChevronLeft, ChevronRight, X } from 'lucide-react';
// RF-12, RF-13, RF-14, RF-16: tela "Mês" (equivalente à aba mensal da planilha).
import { useEffect, useState } from 'react';
import { dadosDoMes, salvarRenda, adicionarPagamento, removerPagamento, type Conta, type FaturaResumo, type PagamentoDb } from '../lib/dados';
import { statusConta } from '../lib/regras';
import { pctBR, brl, dataBR, hojeBrasilia, competenciaDe, somaMeses, nomeMes, somaCentavos } from '../lib/formato';
import { Carregando, Erro, Modal, numeroDe, useAcao, useCadastros } from '../ui/comum';

export type Item = { tipo: 'conta' | 'fatura'; id: string; nome: string; vencimento: string | null; valor: number; mario: number; pagamentos: PagamentoDb[]; banco: string | null; obs?: string | null; extra?: string };

export function Mes() {
  const { c } = useCadastros();
  const [comp, setComp] = useState(competenciaDe(hojeBrasilia()));
  const [dados, setDados] = useState<Awaited<ReturnType<typeof dadosDoMes>> | null>(null);
  const [renda, setRenda] = useState('');
  const [pagando, setPagando] = useState<Item | null>(null);
  const { erro, rodar } = useAcao();
  const hoje = hojeBrasilia();

  const carregar = () => rodar(async () => {
    const d = await dadosDoMes(comp);
    setDados(d);
    setRenda(d.mes?.renda != null ? String(d.mes.renda).replace('.', ',') : '');
  });
  useEffect(() => { setDados(null); carregar(); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartao = (id: string) => c.cartoes.find((x) => x.id === id);
  const itens: Item[] = dados
    ? [
        ...dados.contas.map((k: Conta): Item => ({ tipo: 'conta', id: k.id, nome: k.descricao, vencimento: k.vencimento, valor: k.valor, mario: k.total_mario ?? 0, pagamentos: k.pagamentos, banco: k.banco_pagamento, obs: k.observacao })),
        ...dados.faturas
          .filter((f: FaturaResumo) => f.confirmada || f.qtd_linhas > 0 || f.pagamentos.length > 0)
          .map((f): Item => ({ tipo: 'fatura', id: f.invoice_id, nome: cartao(f.card_id)?.apelido ?? 'Cartão', vencimento: f.vencimento, valor: f.total, mario: f.total_mario, pagamentos: f.pagamentos, banco: cartao(f.card_id)?.banco_pagamento ?? null, extra: f.qtd_nao_conferidas ? `${f.qtd_nao_conferidas} lançamento(s) não conferido(s)` : undefined })),
      ].sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9'))
    : [];
  const rendaNum = dados?.mes?.renda ?? null;
  const total = somaCentavos(itens.map((i) => i.valor));
  const totalMario = somaCentavos(itens.map((i) => i.mario));
  const pendentes = itens.filter((i) => ['FALTA', 'VERIFICAR', 'CONFERIR HOJE'].includes(statusConta(i.valor, i.pagamentos, hoje).tipo));

  return (
    <main>
      <div className="linha entre">
        <button onClick={() => setComp(somaMeses(comp, -1))} aria-label="Mês anterior" className="icone"><ChevronLeft size={20} /></button>
        <h1>{nomeMes(comp)}</h1>
        <button onClick={() => setComp(somaMeses(comp, 1))} aria-label="Próximo mês" className="icone"><ChevronRight size={20} /></button>
      </div>
      <Erro msg={erro} />
      {!dados ? <Carregando /> : (
        <>
          <div className="card">
            <div className="campos">
              <label>Renda líquida do mês
                <input inputMode="decimal" value={renda} placeholder={dados.rendaSugerida != null ? `sugestão: ${brl(dados.rendaSugerida)}` : ''}
                  onChange={(e) => setRenda(e.target.value)} onBlur={() => rodar(async () => { await salvarRenda(comp, numeroDe(renda)); await carregar(); })} />
              </label>
              {rendaNum == null && dados.rendaSugerida != null && (
                <button onClick={() => rodar(async () => { await salvarRenda(comp, dados.rendaSugerida); await carregar(); })}>Usar {brl(dados.rendaSugerida)}</button>
              )}
            </div>
            <div className="linha entre" style={{ marginTop: 10 }}>
              <div><div className="sub">Total do mês</div><strong>{brl(total)}</strong></div>
              <div><div className="sub">Parte do Mário</div><strong>{brl(totalMario)}</strong></div>
              <div><div className="sub">Impacto</div><strong>{rendaNum ? pctBR(totalMario / rendaNum) : '—'}</strong></div>
              <div><div className="sub">Pendências</div><strong>{pendentes.length}</strong></div>
            </div>
          </div>
          {!itens.length && <p className="sub">Nenhuma conta ou fatura neste mês. Cadastre contas recorrentes em “Contas” ou importe faturas em “Faturas”.</p>}
          {itens.map((i) => {
            const st = statusConta(i.valor, i.pagamentos, hoje);
            return (
              <div className="card" key={i.tipo + i.id}>
                <div className="linha entre">
                  <div className="grow">
                    <strong>{i.nome}</strong> <span className="sub">{i.tipo === 'fatura' ? '· fatura' : ''}</span>
                    <div className="sub">vence {dataBR(i.vencimento)} · meu: {brl(i.mario)}{rendaNum ? ` · ${pctBR(i.mario / rendaNum, 2)} da renda` : ''}</div>
                    {i.obs && <div className="sub">{i.obs}</div>}
                    {i.extra && <div className="sub" style={{ color: 'var(--alerta)' }}>{i.extra}</div>}
                  </div>
                  <div className="num"><strong>{brl(i.valor)}</strong><div><span className={`selo ${st.tipo.split(' ')[0]}`}>{st.texto}</span></div></div>
                </div>
                <div className="linha" style={{ marginTop: 6 }}>
                  {i.pagamentos.map((p) => (
                    <span key={p.id} className="sub">pago {dataBR(p.data)} {p.banco ?? ''} {brl(p.valor)}{' '}
                      <button className="perigo" onClick={() => rodar(async () => { await removerPagamento(p.id); await carregar(); })} aria-label="Remover pagamento"><X size={16} /></button>
                    </span>
                  ))}
                  {i.pagamentos.length < 2 && <button onClick={() => setPagando(i)}>Registrar pagamento</button>}
                </div>
              </div>
            );
          })}
        </>
      )}
      {pagando && <FormPagamento item={pagando} hoje={hoje} onFechar={() => setPagando(null)} onSalvo={() => { setPagando(null); carregar(); }} />}
    </main>
  );
}

export function FormPagamento({ item, hoje, onFechar, onSalvo }: { item: Item; hoje: string; onFechar: () => void; onSalvo: () => void }) {
  const restante = somaCentavos([item.valor, ...item.pagamentos.map((p) => -p.valor)]);
  const [data, setData] = useState(hoje);
  const [banco, setBanco] = useState(item.banco ?? '');
  const [valor, setValor] = useState(restante.toFixed(2).replace('.', ','));
  const { erro, ocupado, rodar } = useAcao();
  return (
    <Modal titulo={`Pagamento — ${item.nome}`} onFechar={onFechar}>
      <div className="campos">
        <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label>Banco<input value={banco} onChange={(e) => setBanco(e.target.value)} /></label>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
      </div>
      <p className="sub">Data futura = pagamento agendado. Cada item aceita até 2 pagamentos.</p>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        const v = numeroDe(valor);
        if (v == null || !data) throw new Error('Informe data e valor.');
        await adicionarPagamento({ [item.tipo === 'conta' ? 'bill_id' : 'invoice_id']: item.id, data, banco: banco || null, valor: v });
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}
