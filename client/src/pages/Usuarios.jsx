import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, KeyRound, UserCog, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../components/AuthContext.jsx';

const VAZIO = { usuario: '', senha: '', nome: '', papel: 'equipe' };

const PAPEL_LABEL = { admin: 'Administrador', equipe: 'Equipe' };

export default function Usuarios() {
  const toast = useToast();
  const { usuario: eu } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState(null);

  const [resetAberto, setResetAberto] = useState(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [erroReset, setErroReset] = useState(null);

  function carregar() {
    setCarregando(true);
    api.usuarios.listar()
      .then(setUsuarios)
      .catch((e) => toast.error(e.message))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(u) {
    setEditando(u);
    setForm({ usuario: u.usuario, senha: '', nome: u.nome ?? '', papel: u.papel });
    setErro(null);
    setModalAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      if (editando) {
        await api.usuarios.atualizar(editando.id, { nome: form.nome, papel: form.papel });
        toast.success('Usuário atualizado.');
      } else {
        await api.usuarios.criar(form);
        toast.success('Usuário criado.');
      }
      setModalAberto(false);
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function alternarAtivo(u) {
    try {
      await api.usuarios.atualizar(u.id, { ativo: u.ativo ? 0 : 1 });
      carregar();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function remover(u) {
    if (!confirm(`Remover o usuário "${u.usuario}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await api.usuarios.remover(u.id);
      toast.success('Usuário removido.');
      carregar();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function confirmarReset(e) {
    e.preventDefault();
    setErroReset(null);
    if (novaSenha.length < 6) {
      setErroReset('A senha precisa ter ao menos 6 caracteres.');
      return;
    }
    try {
      await api.usuarios.resetarSenha(resetAberto.id, novaSenha);
      toast.success(`Senha de "${resetAberto.usuario}" redefinida.`);
      setResetAberto(null);
      setNovaSenha('');
    } catch (e) {
      setErroReset(e.message);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Usuários</h2>
        <button onClick={abrirNovo}><Plus size={14} /> Novo usuário</button>
      </div>

      <div className="card">
        {carregando ? (
          <p className="muted">Carregando…</p>
        ) : usuarios.length === 0 ? (
          <div className="empty-state"><UserCog size={28} /> Nenhum usuário cadastrado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.usuario}</td>
                    <td>{u.nome || '—'}</td>
                    <td>{u.papel === 'admin' && <ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--series-blue)' }} />}{PAPEL_LABEL[u.papel] ?? u.papel}</td>
                    <td>{u.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <div className="col-actions">
                        <button className="secondary icon-btn" onClick={() => abrirEdicao(u)} aria-label="Editar"><Pencil size={14} /></button>
                        <button className="secondary icon-btn" onClick={() => setResetAberto(u)} aria-label="Redefinir senha" title="Redefinir senha"><KeyRound size={14} /></button>
                        <button className="secondary" onClick={() => alternarAtivo(u)} disabled={u.id === eu.id}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
                        <button className="danger icon-btn" onClick={() => remover(u)} aria-label="Excluir" disabled={u.id === eu.id}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAberto && (
        <div className="modal-backdrop" onClick={() => setModalAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editando ? 'Editar usuário' : 'Novo usuário'}</h3>
            <form onSubmit={salvar}>
              <div className="form-row">
                <label>Usuário (login)</label>
                <input
                  required
                  disabled={!!editando}
                  value={form.usuario}
                  onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                  placeholder="ex: recepcao.clinica"
                />
              </div>
              {!editando && (
                <div className="form-row">
                  <label>Senha inicial</label>
                  <input required type="password" minLength={6} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                </div>
              )}
              <div className="form-row">
                <label>Nome</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Papel</label>
                <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
                  <option value="equipe">Equipe (sem acesso a Usuários)</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {erro && <p className="error-text">{erro}</p>}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setModalAberto(false)}>Cancelar</button>
                <button type="submit">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetAberto && (
        <div className="modal-backdrop" onClick={() => setResetAberto(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3><KeyRound size={16} /> Redefinir senha de {resetAberto.usuario}</h3>
            <form onSubmit={confirmarReset}>
              <div className="form-row">
                <label>Nova senha</label>
                <input required type="password" minLength={6} autoFocus value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
              </div>
              {erroReset && <p className="error-text">{erroReset}</p>}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setResetAberto(null)}>Cancelar</button>
                <button type="submit">Redefinir</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
