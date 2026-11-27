// Entrega 4 — Imposto de Renda (RF-75 a RF-78d, RF-93).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, FileDown, FileSpreadsheet, FileUp } from 'lucide-react';
import {
  carregarIr, carregarBaseInvestimentos, salvarMensal, salvarPrevidencia, removerPrevidencia, salvarConfig, marcarConferencia, importarIrrf,
  parametrosDe, codigosDe, exportarPdfIr, exportarPlanilhaIr, type DadosIr, type Conferencia,
} from '../lib/dadosIr';
import { CODIGOS_PADRAO, FICHAS, PARAMETROS_PADRAO, categoriaDe, lerAbaIrrf, montarRelatorio, rendaVariavel, resumoAnual, tetoPgbl, type ChaveCodigo, type ItemIR, type Mensal } from '../lib/ir';
import { calcularCustos } from '../lib/investimentos/carteira';
import { brl, nomeMes, pctBR } from '../lib/formato';
import { Carregando, Erro, Modal, numeroDe, useAcao } from '../ui/comum';
import { PainelPgbl } from '../ui/PainelPgbl';
import { hojeBrasilia } from '../lib/formato';

type Aba = 'mensal' | 'resumo' | 'rv' | 'relatorio' | 'config';
const ABAS: [Aba, string][] = [['relatorio', 'Relatório'], ['resumo', 'Resumo'], ['mensal', 'Mês a mês'], ['rv', 'Renda variável'], ['config', 'Configurar']];
type Base = Awaited<ReturnType<typeof carregarBaseInvestimentos>>;

export function ImpostoRenda() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [aba, setAba] = useState<Aba>('relatorio');
  const [d, setD] = useState<DadosIr | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { erro, rodar } = useAcao();
  const carregar = () => rodar(async () => { const [x, b] = await Promise.all([carregarIr(ano), base ? Promise.resolve(base) : carregarBaseInvestimentos()]); setD(x); setBase(b); });
  useEffect(() => { setD(null); carregar(); }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => {
    if (!d || !base) return null;
    const p = parametrosDe(d.config);
    const rel = montarRelatorio({ ano, ...base, mensal: d.mensal, previdencia: d.previdencia, codigos: d.config.codigos });
    const classes = new Map(base.posicoes.map((x) => [x.codigo, x.classe]));
    const produtos = new Map(base.movs.map((m) => [m.codigo, m.produto]));
    const vendas = [...calcularCustos(base.negs, base.movs).values()].flatMap((c) => c.vendas);
    const rv = rendaVariavel(vendas, (c) => categoriaDe(c, classes, produtos.get(c) ?? ''), ano, p);
    return { rel, rv, p, resumo: resumoAnual(d.mensal, d.previdencia, d.config.renda_tributavel, p), teto: tetoPgbl(d.mensal, d.previdencia, d.config.renda_tributavel, ano, hojeBrasilia(), p) };
  }, [d, base, ano]);

  return (
    <main>
      <div className="linha entre">
        <button className="icone" aria-label="Ano anterior" onClick={() => setAno(ano - 1)}><ChevronLeft size={20} /></button>
        <h1>Imposto de Renda {ano}</h1>
        <button className="icone" aria-label="Próximo ano" onClick={() => setAno(ano + 1)}><ChevronRight size={20} /></button>
      </div>
      <p className="sub" style={{ marginTop: 0, textAlign: 'center' }}>Ano-calendário {ano} · declaração entregue em {ano + 1}</p>
      <div className="segmentos" role="tablist">
        {ABAS.map(([k, t]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{t}</button>)}
      </div>
      <Erro msg={erro} />
      {msg && <div className="okmsg">{msg}</div>}
      {calc && <PainelPgbl t={calc.teto} ano={ano} />}
      {!d || !calc ? <Carregando /> : aba === 'relatorio' ? <Relatorio ano={ano} itens={calc.rel.itens} avisos={calc.rel.avisos} rv={calc.rv} conf={d.conferencia} revisado={d.config.revisado_em} onMudou={carregar} />
        : aba === 'resumo' ? <Resumo d={d} r={calc.resumo} ano={ano} onMudou={carregar} />
        : aba === 'mensal' ? <MesAMes d={d} ano={ano} onMudou={carregar} />
        : aba === 'rv' ? <RendaVariavel rv={calc.rv} />
        : <Configurar d={d} ano={ano} onMudou={carregar} onImportado={(t) => { setMsg(t); carregar(); }} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="copiar" aria-label={`Copiar ${rotulo}`} onClick={async () => {
      try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* sem permissão: o texto continua selecionável */ }
    }}>{ok ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}<span>{ok ? 'Copiado' : 'Copiar'}</span></button>
  );
}
const valorTxt = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','));

function Relatorio({ ano, itens, avisos, rv, conf, revisado, onMudou }: { ano: number; itens: ItemIR[]; avisos: string[]; rv: ReturnType<typeof rendaVariavel>; conf: Conferencia[]; revisado: string | null; onMudou: () => void }) {
  const [ficha, setFicha] = useState<string>(FICHAS[0]);
  const [conferindo, setConferindo] = useState<ItemIR | null>(null);
  const { erro, rodar } = useAcao();
  const lista = itens.filter((i) => i.ficha === ficha);
  const situacao = (k: string) => conf.find((c) => c.item === k);
  const classificar = itens.filter((i) => i.classificar).length;
  const total = (f: string) => itens.filter((i) => i.ficha === f).length;
  const conferidos = itens.filter((i) => situacao(i.chave)).length;
  return (
    <>
      {!revisado && <div className="aviso"><AlertTriangle size={15} aria-hidden="true" /> Os códigos das fichas são o ponto de partida e ainda não foram revisados para {ano}. Confira com o manual da Receita em “Configurar”.</div>}
      {avisos.map((a, i) => <p key={i} className="sub alerta-txt">{a}</p>)}
      <div className="barra-ferramentas">
        <span className="sub">{itens.length} itens · {conferidos} conferidos{classificar ? ` · ${classificar} para classificar` : ''}</span>
        <button onClick={() => exportarPdfIr(ano, itens, rv)}><FileDown size={16} aria-hidden="true" /> PDF</button>
        <button onClick={() => exportarPlanilhaIr(ano, itens, rv)}><FileSpreadsheet size={16} aria-hidden="true" /> Planilha</button>
      </div>
      <div className="abas-texto" role="group" aria-label="Ficha">
        {FICHAS.filter((f) => f !== 'Renda Variável').map((f) => <button key={f} aria-pressed={ficha === f} onClick={() => setFicha(f)}>{f.replace('Rendimentos Sujeitos à Tributação Exclusiva/Definitiva', 'Tributação exclusiva').replace('Rendimentos Isentos e Não Tributáveis', 'Isentos')} <span className="sub">{total(f)}</span></button>)}
      </div>
      <Erro msg={erro} />
      {!lista.length && <p className="sub">Nada para esta ficha em {ano}.</p>}
      <ul className="itens-ir">
        {lista.map((i) => {
          const s = situacao(i.chave);
          return (
            <li key={i.chave} className="item-ir">
              <div className="linha entre">
                <span className={i.classificar ? 'alerta-txt' : 'codigo-ir'}>{i.classificar ? 'Classificar' : [i.grupo && `Grupo ${i.grupo}`, `Código ${i.codigo}`].filter(Boolean).join(' · ')}</span>
                <button className={`situacao-ir ${s?.situacao ?? ''}`} onClick={() => setConferindo(i)}>{s ? { conferido: 'Conferido', divergente: 'Divergente', nao_veio: 'Não veio na pré-preenchida' }[s.situacao] : 'Conferir'}</button>
              </div>
              {i.nomeCodigo && <div className="sub">{i.nomeCodigo}</div>}
              <div className="campo-ir"><span className="sub">Discriminação</span><p>{i.discriminacao}</p><Copiar texto={i.discriminacao} rotulo="discriminação" /></div>
              {i.cnpj && <div className="campo-ir em-linha"><span className="sub">CNPJ</span><strong className="num">{i.cnpj}</strong><Copiar texto={i.cnpj} rotulo="CNPJ" /></div>}
              {i.ficha === 'Bens e Direitos' ? (
                <div className="valores-ir">
                  <div className="campo-ir em-linha"><span className="sub">31/12/{ano - 1}</span><strong className="num">{i.anterior != null ? brl(i.anterior) : '—'}</strong>{i.anterior != null && <Copiar texto={valorTxt(i.anterior)} rotulo={`valor de 31/12/${ano - 1}`} />}</div>
                  <div className="campo-ir em-linha"><span className="sub">31/12/{ano}</span><strong className="num">{i.atual != null ? brl(i.atual) : '—'}</strong>{i.atual != null && <Copiar texto={valorTxt(i.atual)} rotulo={`valor de 31/12/${ano}`} />}</div>
                </div>
              ) : (
                <div className="campo-ir em-linha"><span className="sub">Valor</span><strong className="num">{brl(i.rendimento)}</strong><Copiar texto={valorTxt(i.rendimento)} rotulo="valor" /></div>
              )}
              {i.observacao && <p className="sub alerta-txt" style={{ margin: '4px 0 0' }}>{i.observacao}</p>}
              {s?.observacao && <p className="sub" style={{ margin: '4px 0 0' }}>Sua anotação: {s.observacao}</p>}
            </li>
          );
        })}
      </ul>
      {conferindo && <Conferir ano={ano} item={conferindo} atual={situacao(conferindo.chave)} onFechar={() => setConferindo(null)} onSalvo={() => { setConferindo(null); onMudou(); }} rodar={rodar} />}
    </>
  );
}

function Conferir({ ano, item, atual, onFechar, onSalvo, rodar }: { ano: number; item: ItemIR; atual?: Conferencia; onFechar: () => void; onSalvo: () => void; rodar: (f: () => Promise<unknown>) => Promise<boolean> }) {
  const [obs, setObs] = useState(atual?.observacao ?? '');
  const marcar = (s: Conferencia['situacao'] | null) => rodar(async () => { await marcarConferencia(ano, item.chave, s, obs.trim() || null); onSalvo(); });
  return (
    <Modal titulo="Conferência com a pré-preenchida" onFechar={onFechar}>
      <p className="sub" style={{ marginTop: 0 }}>{item.discriminacao}</p>
      <label>Anotação (opcional)<input value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="ex.: pré-preenchida veio com R$ 3.050,00" /></label>
      <div className="linha" style={{ marginTop: 10 }}>
        <button className="pri" onClick={() => marcar('conferido')}>Conferido</button>
        <button onClick={() => marcar('divergente')}>Divergente</button>
        <button onClick={() => marcar('nao_veio')}>Não veio</button>
        {atual && <button className="link-acao" onClick={() => marcar(null)}>Limpar</button>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function Resumo({ d, r, ano, onMudou }: { d: DadosIr; r: ReturnType<typeof resumoAnual>; ano: number; onMudou: () => void }) {
  const [renda, setRenda] = useState(d.config.renda_tributavel != null ? String(d.config.renda_tributavel).replace('.', ',') : '');
  const { erro, rodar } = useAcao();
  const pct = r.limitePgbl ? Math.min(1.2, r.pgbl / r.limitePgbl) : null;
  return (
    <>
      <dl className="numeros-linha">
        <div><dt>Líquido + férias + 13º</dt><dd>{brl(r.liquido + r.ferias)}</dd></div>
        <div><dt>IR retido</dt><dd>{brl(r.ir)}</dd></div>
        <div><dt>INSS</dt><dd>{brl(r.inss)}</dd></div>
        <div><dt>Saúde</dt><dd>{brl(r.saude + r.odonto + r.medicoFora)}</dd></div>
      </dl>
      <h2>PGBL e o limite de {pctBR((PARAMETROS_PADRAO.limite_pgbl_pct) / 100, 0)}</h2>
      <div className="campos">
        <label>Renda tributável de {ano} (bruto do informe de rendimentos)
          <input inputMode="decimal" value={renda} placeholder={`estimativa: ${brl(r.rendaEstimada)}`} onChange={(e) => setRenda(e.target.value)}
            onBlur={() => rodar(async () => { await salvarConfig({ ...d.config, renda_tributavel: numeroDe(renda) }); onMudou(); })} />
        </label>
      </div>
      {r.limitePgbl == null ? <p className="sub">Informe a renda tributável para ver quanto ainda dá para deduzir. A estimativa ({brl(r.rendaEstimada)}) soma líquido, férias, INSS e IR retido e pode ficar abaixo do bruto real.</p> : (
        <>
          <div className="barra discreta" style={{ height: 8, marginTop: 8 }}><div style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%`, background: (pct ?? 0) > 1 ? 'var(--perda)' : undefined }} /></div>
          <p>{brl(r.pgbl)} em PGBL de um limite de {brl(r.limitePgbl)}. {r.faltaPgbl! >= 0 ? <>Ainda cabem <strong>{brl(r.faltaPgbl)}</strong> até 31/12.</> : <span className="alerta-txt">Passou {brl(-r.faltaPgbl!)} do limite: o excedente não é dedutível.</span>}</p>
        </>
      )}
      <ul className="onde-lista">{r.porPlano.map((p) => <li key={p.plano + p.tipo}><span>{p.plano}</span><span className="sub">{p.tipo}</span><span className="num">{brl(p.valor)}</span></li>)}</ul>
      {r.vgbl > 0 && <p className="sub">VGBL ({brl(r.vgbl)}) não é dedutível: vai em Bens e Direitos.</p>}
      <Erro msg={erro} />
    </>
  );
}

// ---------------------------------------------------------------------------
const CAMPOS: [keyof Mensal, string][] = [['salario_liquido', 'Salário líquido'], ['ferias_terco', 'Férias + 1/3'], ['decimo_terceiro', '13º salário (líquido)'], ['inss_folha', 'INSS folha'], ['inss_ferias', 'INSS férias'], ['ir_folha', 'IR folha'],
  ['ir_ferias', 'IR férias'], ['ir_vinculo_unico', 'IR vínculo único'], ['plano_saude', 'Plano de saúde'], ['odontologico', 'Odontológico'], ['ensino', 'Ensino'], ['medico_fora', 'Médico fora do plano']];

function MesAMes({ d, ano, onMudou }: { d: DadosIr; ano: number; onMudou: () => void }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}-01`);
  return (
    <>
      <p className="sub">Digite os valores do contracheque de cada mês. O líquido (com férias e 13º) vira a renda do Mês em que o dinheiro entrou, e as contas de previdência do Mês entram aqui sozinhas.</p>
      <ul className="razao">
        {meses.map((m) => {
          const x = d.mensal.find((k) => k.competencia === m);
          const prev = d.previdencia.filter((p) => p.competencia === m).reduce((s, p) => s + p.valor, 0);
          return (
            <li key={m}><button className="razao-linha" onClick={() => setAberto(m)}>
              <span className="razao-cod">{nomeMes(m)}</span>
              <span className="razao-valor num">{x ? brl((x.salario_liquido ?? 0) + (x.ferias_terco ?? 0)) : <span className="sub">—</span>}</span>
              <span className="razao-det">{x ? `IR ${brl((x.ir_folha ?? 0) + (x.ir_ferias ?? 0) + (x.ir_vinculo_unico ?? 0))} · INSS ${brl((x.inss_folha ?? 0) + (x.inss_ferias ?? 0))}` : 'sem lançamento'}</span>
              <span className="razao-var num sub">{prev ? `previdência ${brl(prev)}` : ''}</span>
            </button></li>
          );
        })}
      </ul>
      {aberto && <EditarMes d={d} comp={aberto} onFechar={() => setAberto(null)} onSalvo={() => { setAberto(null); onMudou(); }} />}
    </>
  );
}

function EditarMes({ d, comp, onFechar, onSalvo }: { d: DadosIr; comp: string; onFechar: () => void; onSalvo: () => void }) {
  const x = d.mensal.find((k) => k.competencia === comp);
  const [v, setV] = useState<Record<string, string>>({ ...Object.fromEntries(CAMPOS.map(([k]) => [k, x?.[k] != null ? String(x[k]).replace('.', ',') : ''])), recebido_em: x?.recebido_em ?? '' });
  const [obs, setObs] = useState(x?.obs_medico ?? '');
  const [plano, setPlano] = useState({ nome: '', tipo: 'PGBL' as 'PGBL' | 'VGBL', valor: '' });
  const planos = d.previdencia.filter((p) => p.competencia === comp);
  const conhecidos = [...new Set(d.previdencia.map((p) => p.plano))];
  const { erro, ocupado, rodar } = useAcao();
  return (
    <Modal titulo={nomeMes(comp)} onFechar={onFechar}>
      <div className="campos">
        {CAMPOS.map(([k, t]) => <label key={k}>{t}<input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
        <label>Recebido em<input type="date" value={v.recebido_em ?? ''} onChange={(e) => setV({ ...v, recebido_em: e.target.value })} /></label>
        <label className="campo-largo">Observação das despesas médicas<input value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
      <h3 className="inspetor-sec">Previdência neste mês</h3>
      <ul className="onde-lista">{planos.map((p) => <li key={p.id}><span>{p.plano}</span><span className="sub">{p.tipo}{p.origem === 'conta' ? ' · da conta do Mês' : ''}</span><span className="num">{brl(p.valor)} {p.origem === 'conta' ? <Link to="/mes" className="link-acao">Alterar no Mês</Link> : <button className="link-acao" onClick={() => rodar(async () => { await removerPrevidencia(p.id); onSalvo(); })}>Remover</button>}</span></li>)}</ul>
      <p className="sub">Contas de previdência do Mês entram aqui sozinhas. Lance à mão só o que não é conta (ex.: desconto em folha).</p>
      <div className="campos">
        <label>Plano<input list="planos-conhecidos" value={plano.nome} onChange={(e) => setPlano({ ...plano, nome: e.target.value })} /><datalist id="planos-conhecidos">{conhecidos.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label>Tipo<select value={plano.tipo} onChange={(e) => setPlano({ ...plano, tipo: e.target.value as 'PGBL' | 'VGBL' })}><option>PGBL</option><option>VGBL</option></select></label>
        <label>Valor<input inputMode="decimal" value={plano.valor} onChange={(e) => setPlano({ ...plano, valor: e.target.value })} /></label>
      </div>
      <Erro msg={erro} />
      <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
        const dados: Partial<Mensal> & { competencia: string } = { competencia: comp, obs_medico: obs.trim() || null, recebido_em: v.recebido_em || null };
        for (const [k] of CAMPOS) (dados as Record<string, unknown>)[k] = numeroDe(v[k]);
        await salvarMensal(dados);
        const val = numeroDe(plano.valor);
        if (plano.nome.trim() && val != null) await salvarPrevidencia({ competencia: comp, plano: plano.nome.trim(), tipo: plano.tipo, valor: val });
        onSalvo();
      })}>Salvar mês</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function RendaVariavel({ rv }: { rv: ReturnType<typeof rendaVariavel> }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const totalDarf = rv.reduce((s, m) => s + m.darf, 0);
  if (!rv.length) return <p className="sub">Nenhuma venda de ações, FIIs, ETFs ou BDRs neste ano (pela Negociação importada).</p>;
  return (
    <>
      <dl className="numeros-linha">
        <div><dt>Meses com venda</dt><dd>{rv.length}</dd></div>
        <div><dt>DARFs estimados</dt><dd>{brl(totalDarf)}</dd></div>
        <div><dt>Prejuízo a compensar</dt><dd>{brl(rv[rv.length - 1].prejuizo.comum + rv[rv.length - 1].prejuizo.day + rv[rv.length - 1].prejuizo.fii)}</dd></div>
        <div><dt>Isenção de ações</dt><dd>R$ {(PARAMETROS_PADRAO.isencao_acoes / 1000).toLocaleString('pt-BR')} mil/mês</dd></div>
      </dl>
      <ul className="razao">
        {rv.map((m) => (
          <li key={m.mes}>
            <button className="razao-linha" onClick={() => setAberto(aberto === m.mes ? null : m.mes)} aria-expanded={aberto === m.mes}>
              <span className="razao-cod">{nomeMes(m.mes + '-01')}</span>
              <span className="razao-valor num">{m.darf ? `DARF ${brl(m.darf)}` : <span className="sub">sem DARF</span>}</span>
              <span className="razao-det">ações vendidas {brl(m.vendasAcoes)}{m.vendasAcoes > 0 ? (m.isento ? ' · isento' : ' · acima da isenção') : ''}</span>
              <span className="razao-var num"><span className={(m.comum.resultado + m.day.resultado + m.fii.resultado) < 0 ? 'neg' : 'pos'}>{brl(m.comum.resultado + m.day.resultado + m.fii.resultado)}</span></span>
            </button>
            {aberto === m.mes && (
              <div className="rv-detalhe">
                <dl className="inspetor-numeros">
                  {(['comum', 'day', 'fii'] as const).map((k) => (m[k].resultado !== 0 &&
                    <div key={k}><dt>{k === 'comum' ? 'Operações comuns' : k === 'day' ? 'Day trade' : 'FII'}</dt><dd>{brl(m[k].resultado)}{m[k].compensado ? ` − ${brl(m[k].compensado)} compensado` : ''} → imposto {brl(m[k].imposto)}</dd></div>))}
                  {m.acumuladoDarf > 0 && <div><dt>Abaixo de R$ 10, fica para o mês seguinte</dt><dd>{brl(m.acumuladoDarf)}</dd></div>}
                </dl>
                <ul className="onde-lista">{m.vendas.map((v, i) => <li key={i}><span>{v.codigo}{v.dayTrade ? ' (day trade)' : ''}</span><span className="sub">{v.quantidade.toLocaleString('pt-BR')} · {brl(v.valor)}</span><span className={`num ${v.resultado < 0 ? 'neg' : 'pos'}`}>{brl(v.resultado)}</span></li>)}</ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="sub">Estimativa pelo custo médio do histórico da B3 (não considera corretagem nem o IR retido na fonte de 0,005%). Prejuízos de anos anteriores entram corridos desde a primeira venda importada. Confira antes de pagar o DARF (código 6015).</p>
    </>
  );
}

// ---------------------------------------------------------------------------
function Configurar({ d, ano, onMudou, onImportado }: { d: DadosIr; ano: number; onMudou: () => void; onImportado: (t: string) => void }) {
  const cods = codigosDe(d.config);
  const [ed, setEd] = useState(cods);
  const [par, setPar] = useState(parametrosDe(d.config));
  const { erro, ocupado, rodar } = useAcao();
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Importar a aba IRRF</h2>
      <p className="sub">Arquivo “Contabilidade BanKMar - {ano}.xlsx”. Os meses e planos da planilha substituem os já lançados.</p>
      <label className="linha"><span className="botao-arquivo secundario"><FileUp size={16} aria-hidden="true" /> Escolher planilha</span>
        <input type="file" accept=".xlsx" style={{ width: 0, height: 0, opacity: 0 }} disabled={ocupado} onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) rodar(async () => { const r = lerAbaIrrf(new Uint8Array(await f.arrayBuffer())); await importarIrrf(r, f.name); onImportado(`Aba IRRF de ${r.ano}: ${r.mensal.length} meses e ${r.previdencia.length} contribuições de previdência.`); });
        }} />
      </label>

      <h2>Códigos das fichas em {ano}</h2>
      <p className="sub">Os códigos mudam entre exercícios. Confira cada linha com o manual do programa IRPF {ano + 1} e marque como revisado.{d.config.revisado_em ? ` Revisado em ${d.config.revisado_em.split('-').reverse().join('/')}.` : ''}</p>
      <ul className="tabela-codigos">
        {(Object.keys(CODIGOS_PADRAO) as ChaveCodigo[]).map((k) => (
          <li key={k}>
            <span className="grow">{ed[k].nome}<span className="sub nome-ativo">{ed[k].ficha}</span></span>
            {ed[k].ficha === 'Bens e Direitos' && <label className="mini-campo">Grupo<input className="mini" inputMode="numeric" value={ed[k].grupo} maxLength={2} onChange={(e) => setEd({ ...ed, [k]: { ...ed[k], grupo: e.target.value.replace(/\D/g, '') } })} /></label>}
            <label className="mini-campo">Código<input className="mini" inputMode="numeric" value={ed[k].codigo} maxLength={2} onChange={(e) => setEd({ ...ed, [k]: { ...ed[k], codigo: e.target.value.replace(/\D/g, '') } })} /></label>
          </li>
        ))}
      </ul>

      <h2>Renda variável</h2>
      <div className="campos">
        <label>Isenção de vendas de ações (R$/mês)<input inputMode="decimal" defaultValue={par.isencao_acoes} onChange={(e) => setPar({ ...par, isencao_acoes: numeroDe(e.target.value) ?? 0 })} /></label>
        <label>Alíquota operações comuns (%)<input inputMode="decimal" defaultValue={par.aliquota_comum} onChange={(e) => setPar({ ...par, aliquota_comum: numeroDe(e.target.value) ?? 0 })} /></label>
        <label>Alíquota day trade (%)<input inputMode="decimal" defaultValue={par.aliquota_day_trade} onChange={(e) => setPar({ ...par, aliquota_day_trade: numeroDe(e.target.value) ?? 0 })} /></label>
        <label>Alíquota FII (%)<input inputMode="decimal" defaultValue={par.aliquota_fii} onChange={(e) => setPar({ ...par, aliquota_fii: numeroDe(e.target.value) ?? 0 })} /></label>
        <label>DARF mínimo (R$)<input inputMode="decimal" defaultValue={par.darf_minimo} onChange={(e) => setPar({ ...par, darf_minimo: numeroDe(e.target.value) ?? 0 })} /></label>
        <label>Limite dedutível do PGBL (% da renda)<input inputMode="decimal" defaultValue={par.limite_pgbl_pct} onChange={(e) => setPar({ ...par, limite_pgbl_pct: numeroDe(e.target.value) ?? 0 })} /></label>
      </div>
      <Erro msg={erro} />
      <div className="linha" style={{ marginTop: 10 }}>
        <button className="pri" disabled={ocupado} onClick={() => rodar(async () => {
          const dif = Object.fromEntries((Object.keys(CODIGOS_PADRAO) as ChaveCodigo[]).filter((k) => ed[k].grupo !== CODIGOS_PADRAO[k].grupo || ed[k].codigo !== CODIGOS_PADRAO[k].codigo).map((k) => [k, ed[k]]));
          await salvarConfig({ ...d.config, codigos: dif, parametros: par, revisado_em: new Date().toISOString().slice(0, 10) });
          onMudou();
        })}>Salvar e marcar como revisado</button>
      </div>
    </>
  );
}
