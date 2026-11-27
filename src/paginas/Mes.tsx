import { ChevronLeft, ChevronRight, X } from 'lucide-react';
// RF-12, RF-13, RF-14, RF-16: tela "Mês" (equivalente à aba mensal da planilha).
import { useEffect, useState } from 'react';
import { dadosDoMes, salvarRenda, adicionarPagamento, removerPagamento, type Conta, type FaturaResumo, type PagamentoDb } from '../lib/dados';
import { statusConta } from '../lib/regras';
import { pctBR, brl, dataBR, hojeBrasilia, competenciaDe, somaMeses, nomeMes, somaCentavos } from '../lib/formato';
import { Carregando, Erro, Modal, Situacao, numeroDe, useAcao, useCadastros } from '../ui/comum';

export type Item = { tipo: 'conta' | 'fatura'; id: string; nome: string; vencimento: string | null; valor: number; mario: number; pagamentos: PagamentoDb[]; banco: string | null; obs?: string | null; extra?: string };

export function Mes() {
  const { c } = useCadastros();
  const [comp, setComp] = useState(competenciaDe(hojeBrasilia()));
  const [dados, setDados] = useState<Awaited<ReturnType<typeof dadosDoMes>> | null>(null);
  const [renda, setRenda] = useState('');
  const [pagando, setPagando] = useState<Item | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
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

  const aberto = itens.find((i) => i.tipo + i.id === detalhe) ?? null;
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
          <dl className="numeros-linha">
            <div><dt>Total do mês</dt><dd>{brl(total)}</dd></div>
            <div><dt>Sua parte</dt><dd>{brl(totalMario)}</dd></div>
            <div><dt>Da renda</dt><dd>{rendaNum ? pctBR(totalMario / rendaNum) : '—'}</dd></div>
            <div><dt>Pendências</dt><dd className={pendentes.length ? 'alerta-txt' : ''}>{pendentes.length}</dd></div>
          </dl>
          <div className="campos renda-linha">
            <label>Renda líquida do mês
              <input inputMode="decimal" value={renda} placeholder={dados.rendaSugerida != null ? `sugestão: ${brl(dados.rendaSugerida)}` : ''}
                onChange={(e) => setRenda(e.target.value)} onBlur={() => rodar(async () => { await salvarRenda(comp, numeroDe(renda)); await carregar(); })} />
            </label>
            {rendaNum == null && dados.rendaSugerida != null && (
              <button onClick={() => rodar(async () => { await salvarRenda(comp, dados.rendaSugerida); await carregar(); })}>Usar {brl(dados.rendaSugerida)}</button>
            )}
          </div>
          {!itens.length && <p className="sub">Nenhuma conta ou fatura neste mês. Cadastre contas recorrentes em “Contas” ou importe faturas em “Faturas”.</p>}
          <ul className="razao">
            {itens.map((i) => {
              const st = statusConta(i.valor, i.pagamentos, hoje);
              return (
                <li key={i.tipo + i.id}>
                  <button className="razao-linha" onClick={() => setDetalhe(i.tipo + i.id)}>
                    <span className="razao-cod">{i.nome}{i.tipo === 'fatura' && <span className="selo-inst">fatura</span>}</span>
                    <span className="razao-valor num">{brl(i.valor)}</span>
                    <span className="razao-det">vence {dataBR(i.vencimento).slice(0, 5)}{i.mario !== i.valor ? ` · sua parte ${brl(i.mario)}` : ''}{i.extra && <> · <span className="alerta-txt">{i.extra}</span></>}</span>
                    <span className="razao-var num"><Situacao tipo={st.tipo} diferenca={'diferenca' in st ? st.diferenca : undefined} vencimento={i.vencimento} hoje={hoje} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {aberto && !pagando && (
        <Modal titulo={aberto.nome} onFechar={() => setDetalhe(null)}>
          <dl className="inspetor-numeros">
            <div><dt>Valor</dt><dd>{brl(aberto.valor)}</dd></div>
            <div><dt>Vencimento</dt><dd>{dataBR(aberto.vencimento)}</dd></div>
            <div><dt>Sua parte</dt><dd>{brl(aberto.mario)}{rendaNum ? ` (${pctBR(aberto.mario / rendaNum, 2)} da renda)` : ''}</dd></div>
            {aberto.banco && <div><dt>Banco de pagamento</dt><dd>{aberto.banco}</dd></div>}
          </dl>
          {aberto.obs && <p className="sub">{aberto.obs}</p>}
          {aberto.extra && <p className="alerta-txt">{aberto.extra}. Confira em Faturas.</p>}
          <h3 className="inspetor-sec">Pagamentos</h3>
          {!aberto.pagamentos.length && <p className="sub">Nenhum pagamento registrado.</p>}
          <ul className="onde-lista">
            {aberto.pagamentos.map((p) => (
              <li key={p.id}>
                <span>{dataBR(p.data)} {p.data > hoje && <span className="sub">(agendado)</span>}</span>
                <span className="sub">{p.banco ?? ''}</span>
                <span className="num">{brl(p.valor)} <button className="icone perigo" onClick={() => rodar(async () => { await removerPagamento(p.id); await carregar(); })} aria-label={`Remover pagamento de ${dataBR(p.data)}`}><X size={16} /></button></span>
              </li>
            ))}
          </ul>
          {aberto.pagamentos.length < 2 && <button className="pri" onClick={() => setPagando(aberto)}>Registrar pagamento</button>}
        </Modal>
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
