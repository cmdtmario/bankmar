// Senhas dos PDFs de fatura (decisão do Mário em 27/11/2026, revisa o caso 2 da spec).
// Ficam SÓ neste aparelho, no IndexedDB do navegador, cifradas com AES-GCM por uma chave que o próprio navegador
// gera e não deixa exportar. Nada vai para o servidor, para o backup nem para o banco de dados.

const DB = 'bankmar-local';
const LOJA = 'senhas-pdf';
const LOJA_CHAVE = 'chave';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(LOJA, { keyPath: 'id' });
      r.result.createObjectStore(LOJA_CHAVE);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); }); }

async function chave(db: IDBDatabase): Promise<CryptoKey> {
  const tx = db.transaction(LOJA_CHAVE, 'readonly');
  const k = await req(tx.objectStore(LOJA_CHAVE).get('aes')) as CryptoKey | undefined;
  if (k) return k;
  const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await req(db.transaction(LOJA_CHAVE, 'readwrite').objectStore(LOJA_CHAVE).put(nova, 'aes'));
  return nova;
}

interface Registro { id: string; rotulo: string; iv: Uint8Array<ArrayBuffer>; dados: ArrayBuffer; criadaEm: string }
export interface SenhaSalva { id: string; rotulo: string; criadaEm: string }

export async function listarSenhas(): Promise<SenhaSalva[]> {
  const db = await abrir();
  const todos = await req(db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll()) as Registro[];
  return todos.map(({ id, rotulo, criadaEm }) => ({ id, rotulo, criadaEm })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

export async function salvarSenha(rotulo: string, senha: string) {
  if (!senha) throw new Error('Informe a senha.');
  const db = await abrir();
  const k = await chave(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(senha));
  const reg: Registro = { id: crypto.randomUUID(), rotulo: rotulo.trim().slice(0, 60) || 'Fatura', iv, dados, criadaEm: new Date().toISOString() };
  await req(db.transaction(LOJA, 'readwrite').objectStore(LOJA).put(reg));
}

export async function removerSenha(id: string) {
  const db = await abrir();
  await req(db.transaction(LOJA, 'readwrite').objectStore(LOJA).delete(id));
}

/** Senhas em claro, só para tentar abrir um PDF agora. Se o rótulo combinar com o cartão, ela é tentada primeiro. */
export async function senhasParaTentar(preferir?: string): Promise<string[]> {
  try {
    const db = await abrir();
    const k = await chave(db);
    const todos = await req(db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll()) as Registro[];
    const p = (preferir ?? '').toLowerCase();
    todos.sort((a, b) => Number(b.rotulo.toLowerCase().includes(p) || p.includes(b.rotulo.toLowerCase())) - Number(a.rotulo.toLowerCase().includes(p) || p.includes(a.rotulo.toLowerCase())));
    const out: string[] = [];
    for (const r of todos) {
      try { out.push(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, k, r.dados))); } catch { /* registro de outra chave: ignora */ }
    }
    return [...new Set(out)];
  } catch { return []; } // navegador sem IndexedDB: segue pedindo a senha
}
