// RF-10 (recorrentes), RF-11 (avulsas), RF-15 (boleto) e edição de contas do mês.
import { useEffect, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { supabase, ok } from '../lib/supabase';
import type { Conta, Modelo } from '../lib/dados';
import { lerCodigoBoleto, BoletoError } from '../lib/boleto';
import { contemNumeroCartao, type RegraDivisao } from '../lib/regras';
import { brl, dataBR, competenciaDe, hojeBrasilia, nomeMes } from '../lib/formato';
import { Carregando, EditorDivisao, Erro, Modal, divisaoValida, numeroDe, rotuloDivisao, useAcao, useCadastros } from '../ui/comum';

export function Contas() {
  const { c } = useCadastros();
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [editModelo, setEditModelo] = useState<Partial<Modelo> | null>(null);
  const [avulsa, setAvulsa] = useState<Partial<Conta> | null>(null);
  const [contasMes, setContasMes] = useState<Conta[]>([]);
  const comp = competenciaDe(hojeBrasilia());
  const { erro, rodar } = useAcao();

  const carregar = () => rodar(async () => {
    setModelos(ok(await supabase.from('bill_templates').select('*').order('dia_vencimento')) as Modelo[]);
    setContasMes(ok(await supabase.from('bills').select('*').eq('competencia', comp).order('vencimento')) as Conta[]);
  });
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <h1>Contas</h1>
      <Erro msg={erro} />
      <div className="linha">
        <button className="pri" onClick={() => setAvulsa({ competencia: comp, descricao: '', valor: 0, split_rule: { tipo: 'mario' } })}>+ Conta avulsa</button>
        <button onClick={() => setEditModelo({ descricao: '', dia_vencimento: 10, valor_padrao: null, split_rule: { tipo: 'mario' }, ativo: true })}>+ Conta recorrente</button>
      </div>

      <h2>Recorrentes</h2>
      <p className="sub">Geradas automaticamente em cada mês, ao abrir o mês na tela “Mês”.</p>
      {!modelos ? <Carregando /> : modelos.map((m) => (
        <div className="card linha entre" key={m.id} style={{ opacity: m.ativo ? 1 : 0.5 }}>
          <div className="grow"><strong>{m.descricao}</strong><div className="sub">dia {m.dia_vencimento} · {m.valor_padrao != null ? brl(m.valor_padrao) : 'valor variável'} · {rotuloDivisao(m.split_rule, c)}{m.ativo ? '' : ' · desativada'}</div></div>
          <button onClick={() => setEditModelo(m)}>Editar</button>
        </div>
      ))}

      <h2>Contas de {nomeMes(comp).toLowerCase()}</h2>
      {contasMes.map((k) => (
        <div className="card linha entre" key={k.id}>
          <div className="grow"><strong>{k.descricao}</strong><div className="sub">vence {dataBR(k.vencimento)} · {rotuloDivisao(k.split_rule, c)}</div></div>
          <span className="num">{brl(Number(k.valor))}</span>
          <button onClick={() => setAvulsa(k)}>Editar</button>
        </div>
      ))}

      {editModelo && <FormModelo m={editModelo} onFechar={() => setEditModelo(null)} onSalvo={() => { setEditModelo(null); carregar(); }} />}
      {avulsa && <FormConta k={avulsa} onFechar={() => setAvulsa(null)} onSalvo={() => { setAvulsa(null); carregar(); }} />}
    </main>
  );
}

function FormModelo({ m, onFechar, onSalvo }: { m: Partial<Modelo>; onFechar: () => void; onSalvo: () => void }) {
  const { c } = useCadastros();
  const [f, setF] = useState(m);
  const [valor, setValor] = useState(m.valor_padrao != null ? String(m.valor_padrao).replace('.', ',') : '');
  const { erro, ocupado, rodar } = useAcao();
  const v = numeroDe(valor);
  return (
    <Modal titulo={m.id ? 'Editar conta recorrente' : 'Nova conta recorrente'} onFechar={onFechar}>
      <div className="campos">
        <label>Descrição<input value={f.descricao ?? ''} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
        <label>Dia do vencimento<input type="number" min={1} max={31} value={f.dia_vencimento ?? ''} onChange={(e) => setF({ ...f, dia_vencimento: Number(e.target.value) })} /></label>
        <label>Valor padrão (vazio = variável)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>Banco de pagamento<input value={f.banco_pagamento ?? ''} onChange={(e) => setF({ ...f, banco_pagamento: e.target.value || null })} /></label>
        <label>Categoria<select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value || null })}>
          <option value="">—</option>{c.categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></label>
        <label>Ativa<select value={f.ativo ? '1' : '0'} onChange={(e) => setF({ ...f, ativo: e.target.value === '1' })}><option value="1">Sim</option><option value="0">Não</option></select></label>
        <label>Previdência no IR (plano)<input value={(f as Record<string, unknown>).ir_plano as string ?? ''} placeholder="vazio = não é previdência" onChange={(e) => setF({ ...f, ir_plano: e.target.value || null } as typeof f)} /></label>
        {(f as Record<string, unknown>).ir_plano ? <label>Tipo<select value={((f as Record<string, unknown>).ir_tipo as string) ?? 'PGBL'} onChange={(e) => setF({ ...f, ir_tipo: e.target.value } as typeof f)}><option>PGBL</option><option>VGBL</option></select></label> : null}
      </div>
      <p className="sub">Previdência no IR: o valor de cada mês desta conta entra sozinho nas contribuições do Imposto de Renda.</p>
      <h2>Divisão</h2>
      <EditorDivisao valor={v ?? 100} regra={f.split_rule as RegraDivisao} onChange={(r) => setF({ ...f, split_rule: r })} />
      {v == null && <p className="sub">Prévia calculada sobre R$ 100,00 (valor variável).</p>}
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        if (!f.descricao?.trim()) throw new Error('Informe a descrição.');
        if (contemNumeroCartao(f.descricao)) throw new Error('A descrição parece conter um número de cartão. Não guarde esse dado aqui.');
        if (!divisaoValida(v ?? 100, f.split_rule as RegraDivisao)) throw new Error('Corrija a divisão.');
        const ir = f as Record<string, unknown>;
        const dados = { descricao: f.descricao, dia_vencimento: f.dia_vencimento, valor_padrao: v, banco_pagamento: f.banco_pagamento ?? null, category_id: f.category_id ?? null, split_rule: f.split_rule, ativo: f.ativo ?? true, ir_plano: (ir.ir_plano as string | null) ?? null, ir_tipo: ir.ir_plano ? ((ir.ir_tipo as string) ?? 'PGBL') : null };
        if (m.id) ok(await supabase.from('bill_templates').update(dados).eq('id', m.id));
        else ok(await supabase.from('bill_templates').insert(dados));
        onSalvo();
      })}>Salvar</button>
    </Modal>
  );
}

const leitorBoleto = () => {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.ITF]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
};

export function FormConta({ k, onFechar, onSalvo }: { k: Partial<Conta>; onFechar: () => void; onSalvo: () => void }) {
  const { c } = useCadastros();
  const [f, setF] = useState(k);
  const [valor, setValor] = useState(k.valor ? String(k.valor).replace('.', ',') : '');
  const [linha, setLinha] = useState('');
  const [msgBoleto, setMsgBoleto] = useState<string | null>(null);
  const { erro, ocupado, rodar, setErro } = useAcao();
  const v = numeroDe(valor) ?? 0;

  const aplicarCodigo = (codigo: string) => {
    try {
      const b = lerCodigoBoleto(codigo);
      if (b.valor != null) setValor(String(b.valor).replace('.', ','));
      setF((x) => ({ ...x, vencimento: b.vencimento ?? x.vencimento ?? null, origem: 'boleto', competencia: b.vencimento ? competenciaDe(b.vencimento) : x.competencia }));
      setMsgBoleto(`Boleto lido: ${b.valor != null ? brl(b.valor) : 'sem valor no código'} · ${b.vencimento ? `vence ${dataBR(b.vencimento)}` : 'sem vencimento no código — informe abaixo'}. Confira antes de salvar.`);
      setErro(null);
    } catch (e) {
      setMsgBoleto(null);
      setErro(e instanceof BoletoError ? e.message : String(e));
    }
  };

  const lerFoto = async (arq: File) => {
    const url = URL.createObjectURL(arq);
    try {
      const r = await leitorBoleto().decodeFromImageUrl(url);
      aplicarCodigo(r.getText());
    } catch {
      setErro('Não consegui ler o código de barras na foto (caso 8). Tire outra foto, com o código inteiro e bem iluminado, ou digite a linha digitável.');
    } finally { URL.revokeObjectURL(url); }
  };

  return (
    <Modal titulo={k.id ? 'Editar conta' : 'Nova conta avulsa'} onFechar={onFechar}>
      {!k.id && (
        <div className="card">
          <strong>Boleto</strong>
          <div className="linha" style={{ marginTop: 6 }}>
            <label>Foto do código de barras<input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && lerFoto(e.target.files[0])} /></label>
          </div>
          <div className="linha" style={{ marginTop: 6 }}>
            <input className="grow" inputMode="numeric" placeholder="ou digite a linha digitável" value={linha} onChange={(e) => setLinha(e.target.value)} />
            <button onClick={() => aplicarCodigo(linha)}>Ler</button>
          </div>
          {msgBoleto && <div className="okmsg">{msgBoleto}</div>}
        </div>
      )}
      <div className="campos">
        <label>Descrição<input value={f.descricao ?? ''} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
        <label>Vencimento<input type="date" value={f.vencimento ?? ''} onChange={(e) => setF({ ...f, vencimento: e.target.value || null, competencia: e.target.value ? competenciaDe(e.target.value) : f.competencia })} /></label>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        <label>Categoria<select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value || null })}>
          <option value="">—</option>{c.categorias.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label>Observação<input value={f.observacao ?? ''} onChange={(e) => setF({ ...f, observacao: e.target.value || null })} /></label>
        <label>Previdência no IR (plano)<input value={(f as Record<string, unknown>).ir_plano as string ?? ''} placeholder="vazio = não é previdência" onChange={(e) => setF({ ...f, ir_plano: e.target.value || null } as typeof f)} /></label>
        {(f as Record<string, unknown>).ir_plano ? <label>Tipo<select value={((f as Record<string, unknown>).ir_tipo as string) ?? 'PGBL'} onChange={(e) => setF({ ...f, ir_tipo: e.target.value } as typeof f)}><option>PGBL</option><option>VGBL</option></select></label> : null}
      </div>
      <p className="sub">Mês: {f.competencia ? nomeMes(f.competencia) : '—'}</p>
      <h2>Divisão</h2>
      <EditorDivisao valor={v} regra={f.split_rule as RegraDivisao} onChange={(r) => setF({ ...f, split_rule: r })} />
      <Erro msg={erro} />
      <div className="linha">
        <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
          if (!f.descricao?.trim()) throw new Error('Informe a descrição.');
          if (contemNumeroCartao(f.descricao) || contemNumeroCartao(f.observacao)) throw new Error('O texto parece conter um número de cartão. Não guarde esse dado aqui.');
          if (!divisaoValida(v, f.split_rule as RegraDivisao)) throw new Error('Corrija a divisão.');
          const ir = f as Record<string, unknown>;
          const dados = { competencia: f.competencia, descricao: f.descricao, vencimento: f.vencimento ?? null, valor: v, category_id: f.category_id ?? null, split_rule: f.split_rule, observacao: f.observacao ?? null, ir_plano: (ir.ir_plano as string | null) ?? null, ir_tipo: ir.ir_plano ? ((ir.ir_tipo as string) ?? 'PGBL') : null };
          if (k.id) ok(await supabase.from('bills').update(dados).eq('id', k.id));
          else {
            ok(await supabase.from('bills').insert({ ...dados, origem: f.origem === 'boleto' ? 'boleto' : 'manual' }));
            if (f.origem === 'boleto') ok(await supabase.from('import_log').insert({ tipo: 'boleto', importadas: 1 }));
          }
          onSalvo();
        })}>Salvar</button>
        {k.id && <button className="perigo" onClick={() => rodar(async () => { if (confirm('Excluir esta conta deste mês?')) { ok(await supabase.from('bills').delete().eq('id', k.id!)); onSalvo(); } })}>Excluir</button>}
      </div>
    </Modal>
  );
}
