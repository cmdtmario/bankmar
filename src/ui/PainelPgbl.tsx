// "Quanto falta no PGBL para chegar ao teto de dedução" — no Início e no topo do Imposto de Renda.
import { Link } from 'react-router-dom';
import { PiggyBank } from 'lucide-react';
import { brl, pctBR } from '../lib/formato';
import type { tetoPgbl } from '../lib/ir';

export function PainelPgbl({ t, ano, compacto = false }: { t: ReturnType<typeof tetoPgbl>; ano: number; compacto?: boolean }) {
  if (t.teto == null) {
    return (
      <section className="pgbl">
        <h2><PiggyBank size={18} aria-hidden="true" /> PGBL {ano}</h2>
        <p className="sub">Lance a folha em Imposto de Renda → Mês a mês (ou informe a renda tributável) para ver quanto falta até o teto de dedução.</p>
        <Link to="/ir" className="link-acao" style={{ padding: 0 }}>Abrir Imposto de Renda</Link>
      </section>
    );
  }
  const passou = (t.falta ?? 0) < 0;
  return (
    <section className="pgbl">
      <div className="linha entre" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}><PiggyBank size={18} aria-hidden="true" /> PGBL {ano}</h2>
        {compacto && <Link to="/ir" className="link-acao">Detalhes</Link>}
      </div>
      <div className="pgbl-falta">
        {passou ? <><span className="sub">Passou do teto em</span><strong className="alerta-txt">{brl(-(t.falta ?? 0))}</strong></>
          : (t.falta ?? 0) === 0 ? <><span className="sub">Teto atingido</span><strong className="pos">{brl(t.teto)}</strong></>
          : <><span className="sub">Falta investir para o teto</span><strong>{brl(t.falta)}</strong></>}
      </div>
      <div className="barra pgbl-barra" aria-hidden="true"><div style={{ width: `${Math.min(100, (t.pct ?? 0) * 100)}%`, background: passou ? 'var(--perda)' : undefined }} /></div>
      <dl className="pgbl-numeros">
        <div><dt>Já investido</dt><dd>{brl(t.contribuido)}</dd></div>
        <div><dt>Teto (12%)</dt><dd>{brl(t.teto)}</dd></div>
        <div><dt>{t.mesesRestantes > 1 ? `Por mês até dez (${t.mesesRestantes} meses)` : 'Até 31/12'}</dt><dd>{t.porMes ? brl(t.porMes) : '—'}</dd></div>
      </dl>
      <p className="sub" style={{ margin: '4px 0 0' }}>
        {pctBR(t.pct ?? 0, 0)} do teto. {t.baseEstimada ? `Teto estimado pela folha lançada (renda tributável ~${brl(t.base)}). Informe a renda do informe de rendimentos no IR para o valor exato.` : `Renda tributável informada: ${brl(t.base)}.`}
        {passou && ' O que passa do teto não é dedutível.'}
      </p>
    </section>
  );
}
