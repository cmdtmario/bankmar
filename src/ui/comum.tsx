import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { carregarCadastros, type Cadastros } from '../lib/dados';
import { calcularDivisao, DivisaoError, type RegraDivisao, type Parte } from '../lib/regras';
import { brl } from '../lib/formato';

// ---- Cadastros compartilhados ------------------------------------------------
const Ctx = createContext<{ c: Cadastros; recarregar: () => Promise<void> } | null>(null);
export function CadastrosProvider({ children }: { children: ReactNode }) {
  const [c, setC] = useState<Cadastros | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = async () => {
    try { setC(await carregarCadastros()); } catch (e) { setErro(String(e)); }
  };
  useEffect(() => { recarregar(); }, []);
  if (erro) return <Erro msg={erro} />;
  if (!c) return <Carregando />;
  return <Ctx.Provider value={{ c, recarregar }}>{children}</Ctx.Provider>;
}
export function useCadastros() {
  const v = useContext(Ctx);
  if (!v) throw new Error('CadastrosProvider ausente');
  return v;
}

export const Carregando = () => <p className="sub">Carregando…</p>;
export const Erro = ({ msg }: { msg: string | null }) => (msg ? <div className="erro">{msg}</div> : null);

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="linha entre"><h2 style={{ margin: 0 }}>{titulo}</h2><button onClick={onFechar} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Executa uma ação assíncrona mostrando erro. */
export function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const rodar = async (f: () => Promise<unknown>) => {
    setErro(null); setOcupado(true);
    try { await f(); return true; } catch (e) { setErro(e instanceof Error ? e.message : String(e)); return false; } finally { setOcupado(false); }
  };
  return { erro, setErro, ocupado, rodar };
}

export const numeroDe = (s: string): number | null => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

// ---- Editor de divisão (RF-36 / RF-39a) ---------------------------------------
export function rotuloDivisao(r: RegraDivisao, c: Cadastros): string {
  const nome = (id: string) => c.pessoas.find((p) => p.id === id)?.nome ?? '?';
  const tag = (id?: string | null) => (id ? ` [${c.tags.find((t) => t.id === id)?.nome ?? '?'}]` : '');
  if (r.tipo === 'mario') return 'Só meu';
  if (r.tipo === 'total') return `100% ${nome(r.pessoa_id)}${tag(r.tag_id)}`;
  if (r.tipo === 'pct') return r.partes.map((p) => `${nome(p.pessoa_id)} ${p.pct}%${tag(p.tag_id)}`).join(', ');
  return r.partes.map((p) => `${nome(p.pessoa_id)} ${brl(p.valor ?? 0)}${tag(p.tag_id)}`).join(', ');
}

export function EditorDivisao({ valor, regra, onChange }: { valor: number; regra: RegraDivisao; onChange: (r: RegraDivisao) => void }) {
  const { c } = useCadastros();
  const pessoas = c.pessoas.filter((p) => p.ativo);
  const partes: Parte[] = regra.tipo === 'pct' || regra.tipo === 'valor' ? regra.partes : [];
  let previa: string | null = null;
  let erro: string | null = null;
  try {
    const al = calcularDivisao(valor, regra);
    previa = al.map((a) => `${a.pessoa_id ? c.pessoas.find((p) => p.id === a.pessoa_id)?.nome : 'Mário'}: ${brl(a.valor)}`).join(' · ');
  } catch (e) { erro = e instanceof DivisaoError ? e.message : String(e); }
  const setTipo = (t: RegraDivisao['tipo']) => {
    const p0 = pessoas[0]?.id ?? '';
    if (t === 'mario') onChange({ tipo: 'mario' });
    else if (t === 'total') onChange({ tipo: 'total', pessoa_id: p0, tag_id: null });
    else if (t === 'pct') onChange({ tipo: 'pct', partes: [{ pessoa_id: p0, pct: 50, tag_id: null }] });
    else onChange({ tipo: 'valor', partes: [{ pessoa_id: p0, valor: 0, tag_id: null }] });
  };
  const setParte = (i: number, p: Partial<Parte>) => {
    if (regra.tipo !== 'pct' && regra.tipo !== 'valor') return;
    onChange({ ...regra, partes: regra.partes.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  };
  return (
    <div>
      <div className="linha">
        <select value={regra.tipo} onChange={(e) => setTipo(e.target.value as RegraDivisao['tipo'])} aria-label="Tipo de divisão">
          <option value="mario">Só meu</option>
          <option value="pct">Percentual</option>
          <option value="valor">Valor fixo</option>
          <option value="total">100% de outra pessoa</option>
        </select>
        {!pessoas.length && regra.tipo !== 'mario' && <span className="sub">Cadastre pessoas em “Pessoas”.</span>}
      </div>
      {regra.tipo === 'total' && (
        <div className="linha" style={{ marginTop: 6 }}>
          <select value={regra.pessoa_id} onChange={(e) => onChange({ ...regra, pessoa_id: e.target.value })} aria-label="Pessoa">
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <SelTag tags={c.tags} v={regra.tag_id} on={(t) => onChange({ ...regra, tag_id: t })} />
        </div>
      )}
      {partes.map((p, i) => (
        <div className="linha" key={i} style={{ marginTop: 6 }}>
          <select value={p.pessoa_id} onChange={(e) => setParte(i, { pessoa_id: e.target.value })} aria-label="Pessoa">
            {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          {regra.tipo === 'pct' ? (
            <input style={{ width: 80 }} inputMode="decimal" value={p.pct ?? ''} onChange={(e) => setParte(i, { pct: numeroDe(e.target.value) ?? 0 })} aria-label="Percentual" />
          ) : (
            <input style={{ width: 100 }} inputMode="decimal" defaultValue={p.valor ?? ''} onBlur={(e) => setParte(i, { valor: numeroDe(e.target.value) ?? 0 })} aria-label="Valor" />
          )}
          <span className="sub">{regra.tipo === 'pct' ? '%' : 'R$'}</span>
          <SelTag tags={c.tags} v={p.tag_id} on={(t) => setParte(i, { tag_id: t })} />
          {partes.length > 1 && <button className="perigo" onClick={() => onChange({ ...regra, partes: partes.filter((_, k) => k !== i) } as RegraDivisao)}>remover</button>}
        </div>
      ))}
      {(regra.tipo === 'pct' || regra.tipo === 'valor') && pessoas.length > 0 && (
        <button style={{ marginTop: 6 }} onClick={() => onChange({ ...regra, partes: [...partes, { pessoa_id: pessoas[0].id, pct: regra.tipo === 'pct' ? 0 : undefined, valor: regra.tipo === 'valor' ? 0 : undefined, tag_id: null }] } as RegraDivisao)}>+ pessoa</button>
      )}
      {erro ? <Erro msg={erro} /> : <p className="sub">{previa}</p>}
    </div>
  );
}

function SelTag({ tags, v, on }: { tags: Cadastros['tags']; v: string | null | undefined; on: (s: string | null) => void }) {
  return (
    <select value={v ?? ''} onChange={(e) => on(e.target.value || null)} aria-label="Marcador">
      <option value="">sem marcador</option>
      {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
    </select>
  );
}

export function divisaoValida(valor: number, regra: RegraDivisao) {
  try { calcularDivisao(valor, regra); return true; } catch { return false; }
}
