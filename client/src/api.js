const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let erro = `Erro ${res.status}`;
    let detalhes;
    try {
      const data = await res.json();
      erro = data.erro || erro;
      detalhes = data.detalhes;
    } catch {}
    if (res.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    const e = new Error(erro);
    e.status = res.status;
    e.detalhes = detalhes;
    throw e;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function qs(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries).toString();
}

const json = (method, data) => ({ method, body: JSON.stringify(data) });

export const api = {
  auth: {
    me: () => request('/auth/me'),
    login: (usuario, senha) => request('/auth/login', json('POST', { usuario, senha })),
    logout: () => request('/auth/logout', { method: 'POST' }),
    trocarSenha: (senha_atual, senha_nova) => request('/auth/senha', json('PUT', { senha_atual, senha_nova })),
  },
  usuarios: {
    listar: () => request('/usuarios'),
    criar: (data) => request('/usuarios', json('POST', data)),
    atualizar: (id, data) => request(`/usuarios/${id}`, json('PUT', data)),
    resetarSenha: (id, senha_nova) => request(`/usuarios/${id}/senha`, json('PUT', { senha_nova })),
    remover: (id) => request(`/usuarios/${id}`, { method: 'DELETE' }),
  },
  especialidades: {
    listar: () => request('/especialidades'),
    atualizar: (id, data) => request(`/especialidades/${id}`, json('PUT', data)),
    painel: (slug, params) => request(`/especialidades/${slug}/painel${qs(params)}`),
    opcoes: (slug) => request(`/especialidades/${slug}/opcoes`),
    definicoes: (slug) => request(`/especialidades/${slug}/definicoes`),
    pacientes: (slug, params) => request(`/especialidades/${slug}/pacientes${qs(params)}`),
    urlExportacaoPacientes: (slug, params) => `${BASE}/especialidades/${slug}/pacientes${qs({ ...params, formato: 'csv' })}`,
    paciente: (slug, id) => request(`/especialidades/${slug}/pacientes/${id}`),
    salvarAcompanhamento: (slug, id, data) => request(`/especialidades/${slug}/pacientes/${id}/acompanhamento`, json('PUT', data)),
    agenda: (slug, params) => request(`/especialidades/${slug}/agenda${qs(params)}`),
  },
  importacoes: {
    listar: (params) => request(`/importacoes${qs(params)}`),
    cobertura: () => request('/importacoes/cobertura'),
    obter: (id) => request(`/importacoes/${id}`),
    analisar: (arquivo) => {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      return request('/importacoes/analisar', { method: 'POST', body: fd });
    },
    confirmar: (token, exportado_em) => request('/importacoes/confirmar', json('POST', { token, exportado_em })),
  },
  procedimentos: {
    listar: (params) => request(`/procedimentos${qs(params)}`),
    atualizar: (codigo, data) => request(`/procedimentos/${codigo}`, json('PUT', data)),
  },
  configuracoes: {
    obter: (escopo) => request(`/configuracoes${qs({ escopo })}`),
    atualizar: (escopo, data) => request(`/configuracoes${qs({ escopo })}`, json('PUT', data)),
  },
};
