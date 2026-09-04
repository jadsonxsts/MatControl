/**
 * Controle de Matéria & Máquinas - Frontend Logic
 * Fluxo em 3 Etapas: Tirada -> Encostada -> Carregada
 * Tipos de Matéria: Melhorada e Melhorada+
 * Autenticação por Código de Operador (sem senha)
 */

// Estado Global da Aplicação
const state = {
  currentDate: getTodayDateString(),
  records: [],
  summary: {},
  filter: 'all', // 'all', 'melhorada', 'melhorada_plus', 'tiradas', 'encostadas', 'carregadas', 'pendentes'
  searchQuery: '',
  allDates: [],
  operatorCode: localStorage.getItem('matcontrol_operator_code') || ''
};

// Formata data atual em YYYY-MM-DD (local)
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Formata data para exibição brasileira (DD/MM/AAAA)
function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkOperatorLogin();
  setDate(getTodayDateString());
});

// Gerenciamento de Login do Operador
function checkOperatorLogin() {
  const savedOperator = localStorage.getItem('matcontrol_operator_code');
  if (savedOperator && savedOperator.trim()) {
    setOperator(savedOperator.trim().toUpperCase());
  } else {
    openLoginModal();
  }
}

function setOperator(code) {
  state.operatorCode = code.trim().toUpperCase();
  localStorage.setItem('matcontrol_operator_code', state.operatorCode);
  
  const displayEl = document.getElementById('currentOperatorDisplay');
  if (displayEl) {
    displayEl.textContent = state.operatorCode;
  }

  const navOperatorLabel = document.getElementById('navOperatorLabel');
  if (navOperatorLabel) {
    navOperatorLabel.textContent = state.operatorCode ? state.operatorCode.substring(0, 7) : 'Operador';
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const input = document.getElementById('inputOperatorCode');
  input.value = state.operatorCode || '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 150);
  if (window.lucide) lucide.createIcons();
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

// Helper para headers autenticados com o código do operador
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-operator-code': state.operatorCode || 'ANÔNIMO'
  };
}

// Configuração de ouvintes de eventos
function setupEventListeners() {
  // Mobile Bottom Navigation Buttons
  const navDashboard = document.getElementById('navItemDashboard');
  if (navDashboard) {
    navDashboard.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      highlightBottomNav('navItemDashboard');
    });
  }

  const navHistory = document.getElementById('navItemHistory');
  if (navHistory) {
    navHistory.addEventListener('click', () => {
      openHistoryModal();
      highlightBottomNav('navItemHistory');
    });
  }

  const navAdd = document.getElementById('navItemAddMachine');
  if (navAdd) {
    navAdd.addEventListener('click', () => {
      openAddModal();
    });
  }

  const navOperator = document.getElementById('navItemOperator');
  if (navOperator) {
    navOperator.addEventListener('click', () => {
      openLoginModal();
      highlightBottomNav('navItemOperator');
    });
  }

  const navMore = document.getElementById('navItemMore');
  if (navMore) {
    navMore.addEventListener('click', () => {
      openExportModal();
      highlightBottomNav('navItemMore');
    });
  }

  // Login Form
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('inputOperatorCode').value.trim();
    if (!code) {
      showToast('Digite seu código de operador', 'error');
      return;
    }
    setOperator(code);
    closeLoginModal();
    showToast(`Bem-vindo, Operador ${state.operatorCode}!`, 'success');
    loadRecords();
  });

  // Botão Trocar Operador no Topo
  document.getElementById('btnChangeOperator').addEventListener('click', () => {
    openLoginModal();
  });

  // Navegação de Datas
  const dateInput = document.getElementById('selectedDate');
  dateInput.value = state.currentDate;
  dateInput.addEventListener('change', (e) => {
    if (e.target.value) setDate(e.target.value);
  });

  document.getElementById('btnToday').addEventListener('click', () => {
    setDate(getTodayDateString());
  });

  document.getElementById('btnPrevDay').addEventListener('click', () => {
    changeDateOffset(-1);
  });

  document.getElementById('btnNextDay').addEventListener('click', () => {
    changeDateOffset(1);
  });

  // Busca e Filtros
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderAllViews();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-teal-600', 'text-white', 'active');
        b.classList.add('bg-slate-800');
      });
      btn.classList.remove('bg-slate-800');
      btn.classList.add('bg-teal-600', 'text-white', 'active');
      state.filter = btn.dataset.filter;
      renderAllViews();
    });
  });

  // Modal Adicionar / Editar
  document.getElementById('btnOpenAddModal').addEventListener('click', openAddModal);
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);
  document.getElementById('machineForm').addEventListener('submit', handleFormSubmit);

  // Auto-ajustes nos switches do modal
  document.getElementById('formCarregada').addEventListener('change', (e) => {
    if (e.target.checked) {
      document.getElementById('formTirada').checked = true;
      document.getElementById('formEncostada').checked = true;
    }
  });

  document.getElementById('formEncostada').addEventListener('change', (e) => {
    if (e.target.checked) {
      document.getElementById('formTirada').checked = true;
    } else {
      document.getElementById('formCarregada').checked = false;
    }
  });

  document.getElementById('formTirada').addEventListener('change', (e) => {
    if (!e.target.checked) {
      document.getElementById('formEncostada').checked = false;
      document.getElementById('formCarregada').checked = false;
    }
  });

  // Modal Histórico
  document.getElementById('btnOpenHistory').addEventListener('click', openHistoryModal);
  document.getElementById('btnCloseHistory').addEventListener('click', closeHistoryModal);

  // Modal Exportação
  document.getElementById('btnExportMenu').addEventListener('click', openExportModal);
  document.getElementById('btnCloseExport').addEventListener('click', closeExportModal);

  // Ações Especiais
  document.getElementById('btnQuickRollover').addEventListener('click', handleQuickRollover);

  document.getElementById('btnDismissNotice').addEventListener('click', () => {
    document.getElementById('rolloverNotice').classList.add('hidden');
  });

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    const machineModal = document.getElementById('machineModal');
    const historyModal = document.getElementById('historyModal');
    const exportModal = document.getElementById('exportModal');

    if (e.target === machineModal) closeModal();
    if (e.target === historyModal) closeHistoryModal();
    if (e.target === exportModal) closeExportModal();
  });

  // Atalho de Teclado (ESC para fechar modais)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeHistoryModal();
      closeExportModal();
    }
  });
}

// Helper para destacar botão ativo na navegação inferior móvel
function highlightBottomNav(activeId) {
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.remove('active', 'text-teal-400');
    btn.classList.add('text-slate-400');
  });

  const activeBtn = document.getElementById(activeId);
  if (activeBtn) {
    activeBtn.classList.add('active', 'text-teal-400');
    activeBtn.classList.remove('text-slate-400');
  }
}

// Altera a data atual com deslocamento de dias
function changeDateOffset(offset) {
  const [y, m, d] = state.currentDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + offset);
  const newDateStr = date.toISOString().split('T')[0];
  setDate(newDateStr);
}

// Define uma nova data e carrega os registros
async function setDate(dateStr) {
  state.currentDate = dateStr;
  document.getElementById('selectedDate').value = dateStr;

  // Atualiza link de exportação CSV
  const linkCsv = document.getElementById('linkExportCsv');
  if (linkCsv) {
    linkCsv.href = `/api/export/csv?date=${dateStr}`;
  }

  await loadRecords();
}

// Busca registros da API para a data atual
async function loadRecords() {
  try {
    const res = await fetch(`/api/records?date=${state.currentDate}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success) {
      state.records = data.records || [];
      state.summary = data.summary || {};
      state.allDates = data.allDates || [];

      updateStats();
      renderAllViews();
      checkRolloverNotice(data);
      if (window.lucide) lucide.createIcons();
    } else {
      showToast(data.error || 'Erro ao carregar dados', 'error');
    }
  } catch (err) {
    console.error('Erro na requisição:', err);
    showToast('Falha na comunicação com o servidor', 'error');
  }
}

// Atualiza os cards estatísticos do topo
function updateStats() {
  const total = state.records.length;
  const tiradas = state.records.filter(r => r.tirada).length;
  const encostadas = state.records.filter(r => r.encostada).length;
  const carregadas = state.records.filter(r => r.carregada).length;
  const pendentes = total - carregadas;
  const melhoradaCount = state.records.filter(r => (r.tipoMat || 'Melhorada') === 'Melhorada').length;
  const melhoradaPlusCount = state.records.filter(r => r.tipoMat === 'Melhorada+').length;
  const percent = total > 0 ? Math.round((carregadas / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statTiradas').textContent = tiradas;
  document.getElementById('statEncostadas').textContent = encostadas;
  document.getElementById('statCarregadas').textContent = carregadas;
  document.getElementById('statPercent').textContent = `${percent}%`;

  const progressBar = document.getElementById('statProgressBar');
  progressBar.style.width = `${percent}%`;

  if (percent === 100 && total > 0) {
    progressBar.className = 'bg-teal-500 h-2 rounded-full transition-all duration-500 shadow-sm shadow-teal-500/50';
  } else {
    progressBar.className = 'bg-gradient-to-r from-teal-500 to-purple-500 h-2 rounded-full transition-all duration-500';
  }

  document.getElementById('statSummaryText').textContent = `${carregadas} de ${total} carregadas`;

  // Atualiza contadores nas abas de filtro
  document.getElementById('filterCountAll').textContent = total;
  document.getElementById('filterCountMelhorada').textContent = melhoradaCount;
  document.getElementById('filterCountMelhoradaPlus').textContent = melhoradaPlusCount;
  document.getElementById('filterCountTiradas').textContent = tiradas;
  document.getElementById('filterCountEncostadas').textContent = encostadas;
  document.getElementById('filterCountCarregadas').textContent = carregadas;
  document.getElementById('filterCountPendentes').textContent = pendentes;
}

// Retorna HTML do Badge de Tipo de Matéria
function renderTipoBadge(tipoMat) {
  const isPlus = tipoMat === 'Melhorada+';
  if (isPlus) {
    return `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold badge-melhorada-plus tracking-wider">
        <i data-lucide="sparkles" class="w-3 h-3 text-amber-300"></i>
        Melhorada+
      </span>
    `;
  }
  return `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold badge-melhorada">
      <i data-lucide="zap" class="w-3 h-3 text-purple-400"></i>
      Melhorada
    </span>
  `;
}

// Verifica se deve exibir aviso de transição automática
function checkRolloverNotice(data) {
  const notice = document.getElementById('rolloverNotice');
  const transferredItems = state.records.filter(r => r.transferido);

  if (transferredItems.length > 0) {
    const origens = [...new Set(transferredItems.map(r => r.origemData).filter(Boolean))];
    const origensFormatadas = origens.map(formatDateBR).join(', ');
    
    document.getElementById('rolloverNoticeText').textContent = 
      `${transferredItems.length} máquina(s) não carregada(s) foram migradas automaticamente (${origensFormatadas || 'dia anterior'}).`;
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

// Filtra registros baseado no estado atual
function getFilteredRecords() {
  return state.records.filter(record => {
    if (state.filter === 'melhorada' && (record.tipoMat || 'Melhorada') !== 'Melhorada') return false;
    if (state.filter === 'melhorada_plus' && record.tipoMat !== 'Melhorada+') return false;
    if (state.filter === 'tiradas' && !record.tirada) return false;
    if (state.filter === 'encostadas' && !record.encostada) return false;
    if (state.filter === 'carregadas' && !record.carregada) return false;
    if (state.filter === 'pendentes' && record.carregada) return false;

    if (state.searchQuery) {
      const q = state.searchQuery;
      const matchMaq = (record.maq || '').toLowerCase().includes(q);
      const matchMat = (record.mat || '').toLowerCase().includes(q);
      const matchTipo = (record.tipoMat || '').toLowerCase().includes(q);
      const matchDiam = (record.diam || '').toLowerCase().includes(q);
      const matchLoc = (record.loc || '').toLowerCase().includes(q);
      const matchObs = (record.obs || '').toLowerCase().includes(q);
      const matchCriador = (record.criadoPor || '').toLowerCase().includes(q);
      const matchAtualizador = (record.atualizadoPor || '').toLowerCase().includes(q);
      return matchMaq || matchMat || matchTipo || matchDiam || matchLoc || matchObs || matchCriador || matchAtualizador;
    }

    return true;
  });
}

// Renderiza todas as visualizações (Tabela Desktop + Cards Mobile)
function renderAllViews() {
  const filtered = getFilteredRecords();
  const emptyState = document.getElementById('emptyState');
  const tbody = document.getElementById('tableBody');
  const mobileContainer = document.getElementById('mobileCardsContainer');

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    tbody.innerHTML = '';
    mobileContainer.innerHTML = '';
    if (window.lucide) lucide.createIcons();
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  renderDesktopTable(filtered);
  renderMobileCards(filtered);

  if (window.lucide) lucide.createIcons();
}

// 1. Renderiza Tabela no Desktop
function renderDesktopTable(filtered) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  filtered.forEach(record => {
    const tr = document.createElement('tr');
    tr.className = `table-row-item ${record.carregada ? 'is-carregada' : 'is-pendente'}`;

    const transferBadge = record.transferido ? `
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30" title="Pendente transferida de ${formatDateBR(record.origemData)}">
        <i data-lucide="arrow-down-left" class="w-3 h-3"></i>
        ${record.origemData ? formatDateBR(record.origemData) : 'Anterior'}
      </span>
    ` : '';

    const tiradaBtnClass = record.tirada 
      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm' 
      : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400';

    const encostadaBtnClass = record.encostada 
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm' 
      : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400';

    const carregadaBtnClass = record.carregada 
      ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-sm' 
      : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400';

    tr.innerHTML = `
      <!-- Coluna: 3 Etapas Dinâmicas com 1 Clique e Operador -->
      <td class="py-3 px-3">
        <div class="flex items-center justify-center gap-1.5">
          <button 
            onclick="updateRecordStatus('${record.id}', 'tirada', ${!record.tirada})"
            class="px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${tiradaBtnClass}"
            title="${record.tiradaPor ? `Tirada por Operador: ${record.tiradaPor}` : '1. Matéria Tirada do Estoque'}">
            <i data-lucide="${record.tirada ? 'check' : 'package'}" class="w-3.5 h-3.5"></i>
            <span>1. Tirada</span>
            ${record.tiradaPor ? `<span class="text-[9px] font-normal opacity-80">(${escapeHtml(record.tiradaPor)})</span>` : ''}
          </button>

          <i data-lucide="chevron-right" class="w-3 h-3 text-slate-600"></i>

          <button 
            onclick="updateRecordStatus('${record.id}', 'encostada', ${!record.encostada})"
            class="px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${encostadaBtnClass}"
            title="${record.encostadaPor ? `Encostada por Operador: ${record.encostadaPor}` : '2. Matéria Encostada na Máquina'}">
            <i data-lucide="${record.encostada ? 'check' : 'truck'}" class="w-3.5 h-3.5"></i>
            <span>2. Encostada</span>
            ${record.encostadaPor ? `<span class="text-[9px] font-normal opacity-80">(${escapeHtml(record.encostadaPor)})</span>` : ''}
          </button>

          <i data-lucide="chevron-right" class="w-3 h-3 text-slate-600"></i>

          <button 
            onclick="updateRecordStatus('${record.id}', 'carregada', ${!record.carregada})"
            class="px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${carregadaBtnClass}"
            title="${record.carregadaPor ? `Carregada por Operador: ${record.carregadaPor}` : '3. Máquina Carregada'}">
            <i data-lucide="${record.carregada ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>
            <span>3. Carregada</span>
            ${record.carregadaPor ? `<span class="text-[9px] font-normal opacity-80">(${escapeHtml(record.carregadaPor)})</span>` : ''}
          </button>
        </div>
      </td>

      <!-- MAQ (Máquina) -->
      <td class="py-3 px-4">
        <div class="flex items-center gap-2">
          <span class="font-bold text-white tracking-wide">${escapeHtml(record.maq)}</span>
          ${transferBadge}
        </div>
      </td>

      <!-- MAT (Matéria) + Tipo (Melhorada / Melhorada+) -->
      <td class="py-3 px-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-200">
            ${escapeHtml(record.mat || '-')}
          </span>
          <div>
            ${renderTipoBadge(record.tipoMat || 'Melhorada')}
          </div>
        </div>
      </td>

      <!-- DIAM (Diâmetro) -->
      <td class="py-3 px-4">
        <span class="text-slate-300 font-mono text-xs">
          ${escapeHtml(record.diam || '-')}
        </span>
      </td>

      <!-- LOC (Localização) -->
      <td class="py-3 px-4">
        <div class="flex items-center gap-1.5 text-xs text-slate-300">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500"></i>
          <span>${escapeHtml(record.loc || '-')}</span>
        </div>
      </td>

      <!-- OBS / Histórico de Operadores -->
      <td class="py-3 px-4 max-w-xs">
        <div class="flex flex-col gap-0.5">
          <p class="text-xs text-slate-300 truncate" title="${escapeHtml(record.obs || '')}">
            ${escapeHtml(record.obs || '-')}
          </p>
          <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
            <i data-lucide="user" class="w-3 h-3"></i>
            <span>Op: <b class="text-slate-400">${escapeHtml(record.atualizadoPor || record.criadoPor || 'SISTEMA')}</b></span>
          </div>
        </div>
      </td>

      <!-- Ações -->
      <td class="py-3 px-4 text-right actions-col">
        <div class="flex items-center justify-end gap-1">
          <button onclick="openEditModal('${record.id}')" title="Editar" class="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-lg transition">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteRecord('${record.id}', '${escapeHtml(record.maq)}')" title="Excluir" class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// 2. Renderiza Cards Otimizados para Mobile (Smartphones)
function renderMobileCards(filtered) {
  const container = document.getElementById('mobileCardsContainer');
  container.innerHTML = '';

  filtered.forEach(record => {
    const card = document.createElement('div');
    card.className = `mobile-machine-card bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg backdrop-blur space-y-3.5 ${record.carregada ? 'is-carregada' : 'is-pendente'}`;

    const transferBadge = record.transferido ? `
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        <i data-lucide="arrow-down-left" class="w-3 h-3"></i> ${record.origemData ? formatDateBR(record.origemData) : 'Anterior'}
      </span>
    ` : '';

    const tiradaBtnClass = record.tirada 
      ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 shadow-sm font-bold' 
      : 'bg-slate-800/80 text-slate-500 border-slate-700 font-medium';

    const encostadaBtnClass = record.encostada 
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm font-bold' 
      : 'bg-slate-800/80 text-slate-500 border-slate-700 font-medium';

    const carregadaBtnClass = record.carregada 
      ? 'bg-teal-500/20 text-teal-300 border-teal-500/60 shadow-sm font-bold' 
      : 'bg-slate-800/80 text-slate-500 border-slate-700 font-medium';

    card.innerHTML = `
      <!-- Cabeçalho do Card Mobile -->
      <div class="flex items-start justify-between gap-2 border-b border-slate-800/60 pb-2.5">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-bold text-white">${escapeHtml(record.maq)}</h3>
            ${transferBadge}
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-slate-300 font-medium">${escapeHtml(record.mat || 'Sem material')}</span>
            ${renderTipoBadge(record.tipoMat || 'Melhorada')}
          </div>
        </div>
        
        <!-- Ações Rápidas -->
        <div class="flex items-center gap-1">
          <button onclick="openEditModal('${record.id}')" class="p-1.5 text-slate-400 hover:text-teal-300 bg-slate-800/60 rounded-lg">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteRecord('${record.id}', '${escapeHtml(record.maq)}')" class="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/60 rounded-lg">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Detalhes em Grid no Mobile -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-800/40 p-2 rounded-xl border border-slate-700/40">
          <span class="text-[10px] text-slate-400 font-semibold uppercase block">DIAM (Diâmetro)</span>
          <span class="text-slate-200 font-mono font-medium">${escapeHtml(record.diam || '-')}</span>
        </div>
        <div class="bg-slate-800/40 p-2 rounded-xl border border-slate-700/40">
          <span class="text-[10px] text-slate-400 font-semibold uppercase block">LOC (Localização)</span>
          <span class="text-slate-200 font-medium truncate block">${escapeHtml(record.loc || '-')}</span>
        </div>
      </div>

      ${record.obs ? `
        <div class="bg-slate-800/30 p-2 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-start gap-1.5">
          <i data-lucide="info" class="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0"></i>
          <span>${escapeHtml(record.obs)}</span>
        </div>
      ` : ''}

      <!-- Última movimentação -->
      <div class="text-[10px] text-slate-500 flex items-center justify-between px-1">
        <span>Última ação: <b class="text-slate-400">${escapeHtml(record.atualizadoPor || record.criadoPor || 'SISTEMA')}</b></span>
        ${record.carregadaPor ? `<span class="text-teal-400 font-semibold">Carregada por ${escapeHtml(record.carregadaPor)}</span>` : ''}
      </div>

      <!-- Botões de Etapas Touch-Friendly com Operador -->
      <div class="pt-1">
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 text-center">Toque para definir o status</p>
        <div class="grid grid-cols-3 gap-1.5">
          
          <button 
            onclick="updateRecordStatus('${record.id}', 'tirada', ${!record.tirada})"
            class="py-2.5 px-1 rounded-xl text-xs border transition flex flex-col items-center justify-center gap-1 ${tiradaBtnClass}">
            <i data-lucide="${record.tirada ? 'check' : 'package'}" class="w-4 h-4"></i>
            <span class="text-[11px]">1. Tirada</span>
            ${record.tiradaPor ? `<span class="text-[9px] font-normal opacity-80">${escapeHtml(record.tiradaPor)}</span>` : ''}
          </button>

          <button 
            onclick="updateRecordStatus('${record.id}', 'encostada', ${!record.encostada})"
            class="py-2.5 px-1 rounded-xl text-xs border transition flex flex-col items-center justify-center gap-1 ${encostadaBtnClass}">
            <i data-lucide="${record.encostada ? 'check' : 'truck'}" class="w-4 h-4"></i>
            <span class="text-[11px]">2. Encostada</span>
            ${record.encostadaPor ? `<span class="text-[9px] font-normal opacity-80">${escapeHtml(record.encostadaPor)}</span>` : ''}
          </button>

          <button 
            onclick="updateRecordStatus('${record.id}', 'carregada', ${!record.carregada})"
            class="py-2.5 px-1 rounded-xl text-xs border transition flex flex-col items-center justify-center gap-1 ${carregadaBtnClass}">
            <i data-lucide="${record.carregada ? 'check-circle-2' : 'circle'}" class="w-4 h-4"></i>
            <span class="text-[11px]">3. Carregada</span>
            ${record.carregadaPor ? `<span class="text-[9px] font-normal opacity-80">${escapeHtml(record.carregadaPor)}</span>` : ''}
          </button>

        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Atualizar status individual (tirada, encostada, carregada) gravando o operador
async function updateRecordStatus(id, field, value) {
  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  try {
    const res = await fetch(`/api/records/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        date: state.currentDate,
        field,
        value
      })
    });

    const data = await res.json();
    if (data.success) {
      const idx = state.records.findIndex(r => r.id === id);
      if (idx !== -1) {
        state.records[idx] = data.record;
      }
      updateStats();
      renderAllViews();

      const labels = {
        tirada: value ? `TIRADA registrada por ${state.operatorCode}` : 'Status de Tirada desmarcado',
        encostada: value ? `ENCOSTADA registrada por ${state.operatorCode}` : 'Status de Encostada desmarcado',
        carregada: value ? `CARREGADA registrada por ${state.operatorCode} (OK)` : 'Máquina marcada como Pendente'
      };
      showToast(labels[field] || 'Status atualizado!', 'info');
    } else {
      showToast(data.error || 'Erro ao alterar status', 'error');
      loadRecords();
    }
  } catch (err) {
    console.error(err);
    showToast('Erro de conexão ao atualizar status', 'error');
    loadRecords();
  }
}

// Abrir modal para adicionar máquina
function openAddModal() {
  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  document.getElementById('formRecordId').value = '';
  document.getElementById('modalTitle').textContent = 'Adicionar Nova Máquina';
  document.getElementById('btnSubmitText').textContent = 'Salvar Registro';
  document.getElementById('machineForm').reset();
  
  const radioMelhorada = document.querySelector('input[name="tipoMat"][value="Melhorada"]');
  if (radioMelhorada) radioMelhorada.checked = true;

  document.getElementById('formTirada').checked = false;
  document.getElementById('formEncostada').checked = false;
  document.getElementById('formCarregada').checked = false;

  document.getElementById('machineModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('formMaq').focus(), 100);
  if (window.lucide) lucide.createIcons();
}

// Abrir modal para editar máquina
function openEditModal(id) {
  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  const record = state.records.find(r => r.id === id);
  if (!record) return;

  document.getElementById('formRecordId').value = record.id;
  document.getElementById('modalTitle').textContent = `Editar Máquina: ${record.maq}`;
  document.getElementById('btnSubmitText').textContent = 'Salvar Alterações';

  document.getElementById('formMaq').value = record.maq || '';
  document.getElementById('formMat').value = record.mat || '';
  document.getElementById('formDiam').value = record.diam || '';
  document.getElementById('formLoc').value = record.loc || '';
  document.getElementById('formObs').value = record.obs || '';

  const tipo = record.tipoMat || 'Melhorada';
  const radio = document.querySelector(`input[name="tipoMat"][value="${tipo}"]`) || document.querySelector('input[name="tipoMat"][value="Melhorada"]');
  if (radio) radio.checked = true;

  document.getElementById('formTirada').checked = !!record.tirada;
  document.getElementById('formEncostada').checked = !!record.encostada;
  document.getElementById('formCarregada').checked = !!record.carregada;

  document.getElementById('machineModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('formMaq').focus(), 100);
  if (window.lucide) lucide.createIcons();
}

function closeModal() {
  document.getElementById('machineModal').classList.add('hidden');
}

// Salvar / Submeter formulário
async function handleFormSubmit(e) {
  e.preventDefault();

  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  const id = document.getElementById('formRecordId').value;
  const maq = document.getElementById('formMaq').value.trim();
  const mat = document.getElementById('formMat').value.trim();
  const tipoMat = document.querySelector('input[name="tipoMat"]:checked')?.value || 'Melhorada';
  const diam = document.getElementById('formDiam').value.trim();
  const loc = document.getElementById('formLoc').value.trim();
  const obs = document.getElementById('formObs').value.trim();
  const tirada = document.getElementById('formTirada').checked;
  const encostada = document.getElementById('formEncostada').checked;
  const carregada = document.getElementById('formCarregada').checked;

  if (!maq) {
    showToast('Informe o nome da máquina (MAQ)', 'error');
    return;
  }

  const payload = {
    date: state.currentDate,
    maq,
    mat,
    tipoMat,
    diam,
    loc,
    obs,
    tirada,
    encostada,
    carregada
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/records/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/records', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast(id ? 'Máquina atualizada!' : 'Máquina cadastrada com sucesso!', 'success');
      loadRecords();
    } else {
      showToast(data.error || 'Erro ao salvar', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro de conexão ao salvar', 'error');
  }
}

// Excluir registro
async function deleteRecord(id, maqName) {
  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  if (!confirm(`Deseja realmente remover a máquina "${maqName}" do dia ${formatDateBR(state.currentDate)}?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/records/${id}?date=${state.currentDate}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (data.success) {
      showToast('Registro excluído com sucesso', 'info');
      loadRecords();
    } else {
      showToast(data.error || 'Erro ao excluir', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao excluir registro', 'error');
  }
}

// Forçar puxada de pendências do dia anterior
async function handleQuickRollover() {
  if (!state.operatorCode) {
    openLoginModal();
    return;
  }

  const [y, m, d] = state.currentDate.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const prevDate = prev.toISOString().split('T')[0];

  try {
    const res = await fetch('/api/rollover', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        sourceDate: prevDate,
        targetDate: state.currentDate
      })
    });

    const data = await res.json();
    if (data.success) {
      if (data.transferred > 0) {
        showToast(`${data.transferred} máquina(s) puxadas de ${formatDateBR(prevDate)}!`, 'success');
      } else {
        showToast(`Nenhuma pendência nova em ${formatDateBR(prevDate)}.`, 'info');
      }
      loadRecords();
    } else {
      showToast(data.error || 'Erro ao puxar pendências', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao sincronizar pendências', 'error');
  }
}

// Modal de Histórico
async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Carregando histórico...</p>';
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/history', { headers: getAuthHeaders() });
    const data = await res.json();

    if (data.success && data.history.length > 0) {
      list.innerHTML = '';
      data.history.forEach(item => {
        const isCurrent = item.date === state.currentDate;
        const div = document.createElement('div');
        div.className = `p-3 sm:p-4 rounded-xl border transition flex items-center justify-between cursor-pointer ${
          isCurrent 
            ? 'bg-teal-500/10 border-teal-500/40 text-white' 
            : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-800 text-slate-200'
        }`;

        div.onclick = () => {
          setDate(item.date);
          closeHistoryModal();
        };

        div.innerHTML = `
          <div class="flex items-center gap-2.5 sm:gap-3">
            <div class="p-2 sm:p-2.5 rounded-lg ${isCurrent ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-400'}">
              <i data-lucide="calendar" class="w-4 h-4 sm:w-5 sm:h-5"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs sm:text-sm text-white">${formatDateBR(item.date)}</span>
                ${isCurrent ? '<span class="text-[10px] px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded font-semibold">Hoje/Atual</span>' : ''}
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">
                Total: <b>${item.total}</b> • Carregadas: <b class="text-teal-400">${item.carregadas}</b> • Pendentes: <b class="text-amber-400">${item.pendentes}</b>
              </p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[11px] sm:text-xs font-bold px-2 py-1 rounded-full ${item.porcentagem === 100 ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-300'}">
              ${item.porcentagem}%
            </span>
          </div>
        `;
        list.appendChild(div);
      });
      if (window.lucide) lucide.createIcons();
    } else {
      list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nenhum dia registrado até o momento.</p>';
    }
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-rose-400 text-center py-6">Erro ao obter histórico.</p>';
  }
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.add('hidden');
}

// Modal Exportação
function openExportModal() {
  document.getElementById('exportModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeExportModal() {
  document.getElementById('exportModal').classList.add('hidden');
}

// Sistema de Notificações Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');

  const bgColors = {
    success: 'bg-teal-900/95 border-teal-500 text-teal-200',
    error: 'bg-rose-900/95 border-rose-500 text-rose-200',
    info: 'bg-slate-800/95 border-slate-600 text-slate-100'
  };

  const icons = {
    success: 'check-circle',
    error: 'alert-triangle',
    info: 'info'
  };

  toast.className = `toast-msg flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-xl backdrop-blur text-xs font-medium ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Escape de HTML para evitar XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
