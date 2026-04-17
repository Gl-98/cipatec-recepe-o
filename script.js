(function () {
  "use strict";

  /* ===== CONSTANTES ===== */
  var DEFAULT_COLUMNS = [
    { id: "modelo", title: "MODELO" },
    { id: "normal", title: "SENHA NORMAL" },
    { id: "preferencial", title: "SENHA PREFERENCIAL" },
    { id: "autorizacao", title: "AGUARDO AUTORIZAÇÃO" },
    { id: "medico", title: "AGUARDANDO ATENDIMENTO MÉDICO" },
    { id: "finalizado", title: "FINALIZADO" }
  ];
  var COLUMNS = DEFAULT_COLUMNS.slice();
  var COL_ORDER = COLUMNS.map(function (c) { return c.id; });
  var AVATAR_COLORS = [
    "#579DFF", "#61bd4f", "#eb5a46", "#f5cd47",
    "#c377e0", "#ff8ed4", "#00c2e0", "#51e898"
  ];

  /* ===== STATE ===== */
  var state = { nextSeq: 1, cards: {} };
  var pendingRemoveId = null;
  var pendingRemoveCol = null;

  var lastDataHash = '';

  /* ===== API ===== */
  function api(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function loadFromServer() {
    return api('GET', '/api/cards').then(function (data) {
      lastDataHash = JSON.stringify(data);
      state = data;

      // Reconstrói COLUMNS com colunas customizadas
      COLUMNS = DEFAULT_COLUMNS.slice();
      if (data.customColumns && data.customColumns.length > 0) {
        data.customColumns.forEach(function (cc) {
          COLUMNS.push({ id: cc.id, title: cc.title, custom: true });
        });
      }
      COL_ORDER = COLUMNS.map(function (c) { return c.id; });

      render();
    }).catch(function(err) {
      console.error('Erro ao carregar dados:', err);
    });
  }

  /* ===== UTILITÁRIOS ===== */
  function todayDDMM() {
    var d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function genId() {
    return 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function randomAvatarColor() {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  }

  function getInitials(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /* ===== ÍCONES DE COLUNA (SVG) ===== */
  var COL_ICONS = {
    modelo: { bg: 'linear-gradient(135deg,#579DFF,#3b7ce0)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>' },
    normal: { bg: 'linear-gradient(135deg,#579DFF,#3b7ce0)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>' },
    preferencial: { bg: 'linear-gradient(135deg,#61BD4F,#3d9140)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' },
    autorizacao: { bg: 'linear-gradient(135deg,#F2D600,#d4a600)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
    medico: { bg: 'linear-gradient(135deg,#c377e0,#9b4dca)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
    finalizado: { bg: 'linear-gradient(135deg,#61BD4F,#2d8a3e)', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' }
  };

  /* ===== RENDER PRINCIPAL ===== */
  var boardEl = document.getElementById('board');

  function render() {
    boardEl.innerHTML = '';

    COLUMNS.forEach(function (col) {
      var colEl = document.createElement('div');
      colEl.className = 'column';
      colEl.dataset.col = col.id;

      var cards = state.cards[col.id] || [];
      var icon = COL_ICONS[col.id] || COL_ICONS.modelo;

      // Cabeçalho da coluna
      var hdr = document.createElement('div');
      hdr.className = 'column-header';
      var countHtml = col.id === 'modelo' ? '' : '<span class="col-count">' + cards.length + '</span>';
      hdr.innerHTML =
        '<span class="col-icon" style="background:' + icon.bg + '">' + icon.svg + '</span>' +
        '<span class="col-title-text">' + escapeHtml(col.title) + '</span>' + countHtml +
        '<button class="col-menu-btn" data-col-id="' + col.id + '" data-col-title="' + escapeHtml(col.title) + '" data-custom="' + (col.custom ? '1' : '0') + '" title="Ações da Lista">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
        '</button>';
      colEl.appendChild(hdr);

      // Menu de 3 pontos
      hdr.querySelector('.col-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        openColMenu(this, this.dataset.colId, this.dataset.colTitle, this.dataset.custom === '1');
      });

      // Área de cartões
      var area = document.createElement('div');
      area.className = 'column-body';
      area.dataset.col = col.id;

      cards.forEach(function (card) {
        area.appendChild(renderCard(card, col.id));
      });

      // Drag events
      area.addEventListener('dragover', onDragOver);
      area.addEventListener('dragenter', onDragEnter);
      area.addEventListener('dragleave', onDragLeave);
      area.addEventListener('drop', onDrop);

      colEl.appendChild(area);

      // Botão "+ Adicionar" e formulário inline
      if (col.id !== 'modelo') {
        var form = createInlineForm(col.id);
        colEl.appendChild(form);

        var addBtn = document.createElement('div');
        addBtn.className = 'add-card-btn';
        addBtn.textContent = '+ Adicionar um cartão';
        addBtn.addEventListener('click', function () {
          form.classList.add('active');
          addBtn.style.display = 'none';
          form.querySelector('input[type=text]').focus();
        });
        colEl.appendChild(addBtn);

        form._addBtn = addBtn;
      }

      boardEl.appendChild(colEl);
    });

    // Botão "+ Adicionar outra lista"
    var addListWrapper = document.createElement('div');
    addListWrapper.className = 'add-list-wrapper';
    addListWrapper.innerHTML =
      '<button class="add-list-btn" id="addListBtn">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
          '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' +
        '</svg> Adicionar outra lista' +
      '</button>' +
      '<div class="add-list-form" style="display:none">' +
        '<input type="text" class="add-list-input" placeholder="Nome da lista…">' +
        '<div class="add-list-actions">' +
          '<button class="btn-add add-list-confirm">Adicionar lista</button>' +
          '<button class="btn-cancel add-list-cancel">&times;</button>' +
        '</div>' +
      '</div>';
    boardEl.appendChild(addListWrapper);

    // Eventos do formulário de nova lista
    var addListBtn = addListWrapper.querySelector('#addListBtn');
    var addListForm = addListWrapper.querySelector('.add-list-form');
    var addListInput = addListWrapper.querySelector('.add-list-input');

    addListBtn.addEventListener('click', function () {
      addListBtn.style.display = 'none';
      addListForm.style.display = 'flex';
      addListInput.value = '';
      addListInput.focus();
    });

    addListWrapper.querySelector('.add-list-confirm').addEventListener('click', function () {
      var title = addListInput.value.trim();
      if (title) {
        api('POST', '/api/columns', { title: title }).then(function () {
          loadFromServer();
        });
      }
    });

    addListInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var title = addListInput.value.trim();
        if (title) {
          api('POST', '/api/columns', { title: title }).then(function () {
            loadFromServer();
          });
        }
      }
      if (e.key === 'Escape') {
        addListForm.style.display = 'none';
        addListBtn.style.display = '';
      }
    });

    addListWrapper.querySelector('.add-list-cancel').addEventListener('click', function () {
      addListForm.style.display = 'none';
      addListBtn.style.display = '';
    });

    applySearch();
  }

  /* ===== RENDER CARTÃO ===== */
  var BADGE_MAP = {
    normal: 'badge-normal',
    preferencial: 'badge-preferencial',
    autorizacao: 'badge-autorizacao'
  };

  function renderCard(card, colId) {
    var el = document.createElement('div');
    el.className = 'card' + (card.fixed ? ' modelo' : '');
    el.dataset.id = card.id;

    var colIdx = COL_ORDER.indexOf(colId);
    var avatarLetters = card.avatar || '??';
    var avatarBg = card.avatarColor || '#579DFF';
    var doneClass = card.done ? ' done' : '';

    // Badge de tipo — derivado da coluna original
    var tipoKey = (colId === 'normal' || colId === 'preferencial' || colId === 'autorizacao')
      ? colId : 'normal';
    var badgeClass = BADGE_MAP[tipoKey] || BADGE_MAP.normal;
    var badgeLabel = tipoKey === 'preferencial' ? 'Preferencial' : tipoKey === 'autorizacao' ? 'Autorização' : 'Normal';

    // Determina se pode mover para esquerda/direita
    var showLeft = !card.fixed && colIdx > 1;
    var showRight = !card.fixed && colIdx < COL_ORDER.length - 1;

    // Botões de ação (SVG)
    var footerHtml = '<div class="card-footer">';
    if (showLeft) {
      footerHtml += '<button class="btn-left" title="Mover para coluna anterior"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>';
    }
    if (showRight) {
      footerHtml += '<button class="btn-right" title="Mover para próxima coluna"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>';
    }
    footerHtml += '<button class="btn-remove" title="Remover/Arquivar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
    footerHtml += '</div>';

    el.innerHTML =
      '<div class="card-top">' +
        '<span class="card-avatar" style="background:' + avatarBg + '">' + escapeHtml(avatarLetters) + '</span>' +
        '<span class="card-title' + doneClass + '">' + escapeHtml((card.senha || pad2(card.num)) + ' – ' + card.name) + '</span>' +
        '<span class="card-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
      '</div>' +
      '<div class="card-row">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span>' + escapeHtml(card.date) + '</span>' +
      '</div>' +
      footerHtml;


    // Permitir abrir o modal de detalhes para qualquer cartão, inclusive o modelo
    el.addEventListener('click', function (e) {
      if (e.target.closest('button')) return; // ignora cliques em botões
      openCardDetail(card.id, colId);
    });

    // Permitir marcar como concluído por duplo clique, exceto para o modelo
    if (!card.fixed) {
      el.draggable = true;
      el.addEventListener('dragstart', onDragStart);
      el.addEventListener('dragend', onDragEnd);

      el.querySelector('.card-title').addEventListener('dblclick', function (e) {
        e.stopPropagation();
        api('PATCH', '/api/cards/' + encodeURIComponent(card.id) + '/done').then(function () {
          loadFromServer();
        });
      });

      var btnLeft = el.querySelector('.btn-left');
      if (btnLeft) {
        btnLeft.addEventListener('click', function (e) {
          e.stopPropagation();
          moveCard(card.id, colId, -1);
        });
      }

      var btnRight = el.querySelector('.btn-right');
      if (btnRight) {
        btnRight.addEventListener('click', function (e) {
          e.stopPropagation();
          moveCard(card.id, colId, 1);
        });
      }
    }

    // Permitir remover qualquer cartão, exceto o modelo (opcional: pode remover se quiser)
    el.querySelector('.btn-remove').addEventListener('click', function (e) {
      e.stopPropagation();
      confirmRemove(card.id, colId);
    });

    return el;
  }

  /* ===== FORMULÁRIO INLINE ===== */
  function createInlineForm(colId) {
    var form = document.createElement('div');
    form.className = 'inline-form';
    form.innerHTML =
      '<input type="text" placeholder="Nome completo" class="inline-nome">' +
      '<div class="form-row">' +
        '<select class="inline-tipo">' +
          '<option value="normal">Senha Normal</option>' +
          '<option value="preferencial">Senha Preferencial</option>' +
          '<option value="autorizacao">Aguardo Autoriza\u00e7\u00e3o</option>' +
        '</select>' +
        '<input type="text" class="inline-data" style="max-width:90px" value="' + todayDDMM() + '">' +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn-add">Adicionar cart\u00e3o</button>' +
        '<button class="btn-cancel">&times;</button>' +
      '</div>';

    var inpNome = form.querySelector('.inline-nome');
    var selTipo = form.querySelector('.inline-tipo');
    var inpData = form.querySelector('.inline-data');

    // Pré-seleciona tipo com base na coluna
    if (colId === 'normal') selTipo.value = 'normal';
    else if (colId === 'preferencial') selTipo.value = 'preferencial';
    else selTipo.value = 'autorizacao';

    form.querySelector('.btn-add').addEventListener('click', function () {
      addCard(inpNome.value.trim(), selTipo.value, inpData.value.trim());
      closeInlineForm(form);
    });

    inpNome.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        addCard(inpNome.value.trim(), selTipo.value, inpData.value.trim());
        closeInlineForm(form);
      }
      if (e.key === 'Escape') closeInlineForm(form);
    });

    form.querySelector('.btn-cancel').addEventListener('click', function () {
      closeInlineForm(form);
    });

    return form;
  }

  function closeInlineForm(form) {
    form.classList.remove('active');
    form.querySelector('.inline-nome').value = '';
    form.querySelector('.inline-data').value = todayDDMM();
    if (form._addBtn) form._addBtn.style.display = '';
  }

  /* ===== ADICIONAR CARTÃO ===== */
  function addCard(name, tipo, date) {
    if (!name) return;

    var targetCol = tipo === 'normal' ? 'normal'
      : tipo === 'preferencial' ? 'preferencial'
      : 'autorizacao';

    var cardData = {
      id: genId(),
      col: targetCol,
      num: state.nextSeq,
      name: name.toUpperCase(),
      date: date || todayDDMM(),
      avatar: getInitials(name),
      avatarColor: randomAvatarColor()
    };

    api('POST', '/api/cards', cardData).then(function () {
      loadFromServer().then(function () {
        var el = document.querySelector('[data-id="' + cardData.id + '"]');
        if (el) {
          el.classList.add('card-entering');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  /* ===== MOVER CARTÃO ===== */
  function moveCard(cardId, fromCol, dir) {
    var fromIdx = COL_ORDER.indexOf(fromCol);
    var toIdx = fromIdx + dir;
    if (toIdx < 1) toIdx = 1;
    if (toIdx >= COL_ORDER.length) toIdx = COL_ORDER.length - 1;

    var toCol = COL_ORDER[toIdx];
    if (toCol === fromCol) return;

    api('PATCH', '/api/cards/' + encodeURIComponent(cardId) + '/move', {
      col: toCol
    }).then(function () {
      loadFromServer();
    });
  }

  /* ===== DRAG & DROP ===== */
  var dragCardId = null;
  var dragSourceCol = null;

  function onDragStart(e) {
    dragCardId = e.currentTarget.dataset.id;
    dragSourceCol = e.currentTarget.closest('.column-body').dataset.col;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.column-body').forEach(function (a) {
      a.classList.remove('drag-over');
    });
    document.querySelectorAll('.drop-indicator').forEach(function (el) { el.remove(); });
    dragCardId = null;
    dragSourceCol = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Mostra indicador de posição dentro da mesma coluna
    var area = e.currentTarget;
    if (!area || !dragCardId) return;

    // Remove indicadores antigos
    document.querySelectorAll('.drop-indicator').forEach(function (el) { el.remove(); });

    var targetCol = area.dataset.col;
    if (targetCol !== dragSourceCol) return;

    var cards = Array.prototype.slice.call(area.querySelectorAll('.card'));
    var otherCards = cards.filter(function (c) { return c.dataset.id !== dragCardId; });

    var insertBefore = null;
    for (var j = 0; j < otherCards.length; j++) {
      var rect = otherCards[j].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        insertBefore = otherCards[j];
        break;
      }
    }

    var indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    if (insertBefore) {
      area.insertBefore(indicator, insertBefore);
    } else {
      area.appendChild(indicator);
    }
  }

  function onDragEnter(e) {
    e.preventDefault();
    var area = e.currentTarget;
    if (area) area.classList.add('drag-over');
  }

  function onDragLeave(e) {
    var area = e.currentTarget;
    if (area && !area.contains(e.relatedTarget)) {
      area.classList.remove('drag-over');
      document.querySelectorAll('.drop-indicator').forEach(function (el) { el.remove(); });
    }
  }

  function onDrop(e) {
    e.preventDefault();
    var area = e.currentTarget;
    if (!area) return;
    area.classList.remove('drag-over');
    // Remove indicadores de posição
    document.querySelectorAll('.drop-indicator').forEach(function (el) { el.remove(); });

    var targetCol = area.dataset.col;
    if (!dragCardId) return;

    if (targetCol === dragSourceCol) {
      // Reordenar dentro da mesma coluna
      var cards = Array.prototype.slice.call(area.querySelectorAll('.card'));
      var otherCards = cards.filter(function (c) { return c.dataset.id !== dragCardId; });

      // Encontra posição de soltura entre os outros cartões
      var insertAt = otherCards.length;
      for (var j = 0; j < otherCards.length; j++) {
        var rect = otherCards[j].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          insertAt = j;
          break;
        }
      }

      // Monta nova ordem
      var newOrder = otherCards.map(function (c) { return c.dataset.id; });
      newOrder.splice(insertAt, 0, dragCardId);

      api('PUT', '/api/cards/reorder', { col: targetCol, cardIds: newOrder }).then(function () {
        loadFromServer();
      });
    } else {
      // Mover entre colunas — servidor auto-ordena por número da senha
      api('PATCH', '/api/cards/' + encodeURIComponent(dragCardId) + '/move', {
        col: targetCol
      }).then(function () {
        loadFromServer();
      });
    }
  }

  /* ===== CONFIRMAR REMOÇÃO ===== */
  var confirmOverlay = document.getElementById('confirmOverlay');

  function confirmRemove(cardId, colId) {
    pendingRemoveId = cardId;
    pendingRemoveCol = colId;
    confirmOverlay.classList.add('active');
  }

  document.getElementById('confirmYes').addEventListener('click', function () {
    if (pendingRemoveId) {
      api('DELETE', '/api/cards/' + encodeURIComponent(pendingRemoveId)).then(function () {
        loadFromServer();
      });
    }
    pendingRemoveId = null;
    pendingRemoveCol = null;
    confirmOverlay.classList.remove('active');
  });

  document.getElementById('confirmNo').addEventListener('click', function () {
    pendingRemoveId = null;
    pendingRemoveCol = null;
    confirmOverlay.classList.remove('active');
  });

  confirmOverlay.addEventListener('click', function (e) {
    if (e.target === confirmOverlay) {
      pendingRemoveId = null;
      pendingRemoveCol = null;
      confirmOverlay.classList.remove('active');
    }
  });

  /* ===== MODAL CRIAR (HEADER) ===== */
  var modalOverlay = document.getElementById('modalOverlay');
  var modalNome = document.getElementById('modalNome');
  var modalTipo = document.getElementById('modalTipo');
  var modalData = document.getElementById('modalData');

  document.getElementById('btnCriarHeader').addEventListener('click', function () {
    modalNome.value = '';
    modalTipo.value = 'normal';
    modalData.value = todayDDMM();
    modalOverlay.classList.add('active');
    setTimeout(function () { modalNome.focus(); }, 100);
  });

  document.getElementById('modalConfirm').addEventListener('click', function () {
    var name = modalNome.value.trim();
    if (!name) return;
    addCard(name, modalTipo.value, modalData.value.trim());
    modalOverlay.classList.remove('active');
  });

  document.getElementById('modalCancel').addEventListener('click', function () {
    modalOverlay.classList.remove('active');
  });

  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) modalOverlay.classList.remove('active');
  });

  modalNome.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('modalConfirm').click();
    if (e.key === 'Escape') modalOverlay.classList.remove('active');
  });

  /* ===== BUSCA EM TEMPO REAL ===== */
  var searchInput = document.getElementById('searchInput');
  var searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
  var searchDebounce = null;

  searchInput.addEventListener('input', function () {
    applyFilters();

    clearTimeout(searchDebounce);
    var q = searchInput.value.trim();
    if (q.length < 1) {
      searchHistoryDropdown.classList.remove('active');
      searchHistoryDropdown.innerHTML = '';
      return;
    }
    searchDebounce = setTimeout(function () {
      api('GET', '/api/cards/search/history?q=' + encodeURIComponent(q)).then(function (data) {
        if (!data.ok || !data.results.length) {
          searchHistoryDropdown.classList.remove('active');
          searchHistoryDropdown.innerHTML = '';
          return;
        }
        renderSearchHistory(data.results);
      });
    }, 250);
  });

  searchInput.addEventListener('focus', function () {
    if (searchHistoryDropdown.children.length > 0) {
      searchHistoryDropdown.classList.add('active');
    }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.header-search')) {
      searchHistoryDropdown.classList.remove('active');
    }
  });

  function renderSearchHistory(results) {
    searchHistoryDropdown.innerHTML = '';

    // Agrupa por nome (case-insensitive)
    var grouped = {};
    results.forEach(function (c) {
      var key = c.name.toUpperCase();
      if (!grouped[key]) grouped[key] = { name: c.name, avatar: c.avatar, avatar_color: c.avatar_color, visits: [] };
      grouped[key].visits.push(c);
    });

    Object.keys(grouped).forEach(function (key) {
      var g = grouped[key];
      var item = document.createElement('div');
      item.className = 'sh-person';

      var header = document.createElement('div');
      header.className = 'sh-person-header';
      header.innerHTML =
        '<span class="sh-avatar" style="background:' + (g.avatar_color || '#579DFF') + '">' + (g.avatar || '??') + '</span>' +
        '<span class="sh-name">' + escapeHtml(g.name) + '</span>' +
        '<span class="sh-count">' + g.visits.length + ' visita' + (g.visits.length > 1 ? 's' : '') + '</span>';
      item.appendChild(header);

      header.addEventListener('click', function () {
        item.classList.toggle('expanded');
      });

      var visitsList = document.createElement('div');
      visitsList.className = 'sh-visits';

      g.visits.forEach(function (v) {
        var colName = '';
        COLUMNS.forEach(function (col) { if (col.id === v.col) colName = col.title; });

        var row = document.createElement('div');
        row.className = 'sh-visit-row';
        row.innerHTML =
          '<div class="sh-visit-top">' +
            '<span class="sh-visit-date">' + (v.date || '—') + '</span>' +
            (v.senha ? '<span class="sh-visit-senha">' + escapeHtml(v.senha) + '</span>' : '') +
            '<span class="sh-visit-col ' + (v.done ? 'done' : '') + '">' + escapeHtml(colName) + '</span>' +
          '</div>' +
          '<div class="sh-visit-details">' +
            (v.tipo_exame ? '<span><b>Exame:</b> ' + escapeHtml(v.tipo_exame) + '</span>' : '') +
            (v.empresa ? '<span><b>Empresa:</b> ' + escapeHtml(v.empresa) + '</span>' : '') +
            (v.funcao ? '<span><b>Função:</b> ' + escapeHtml(v.funcao) + '</span>' : '') +
            (v.telefone ? '<span><b>Tel:</b> ' + escapeHtml(v.telefone) + '</span>' : '') +
            (v.hora_chegada ? '<span><b>Chegada:</b> ' + v.hora_chegada + '</span>' : '') +
            (v.hora_saida ? '<span><b>Saída:</b> ' + v.hora_saida + '</span>' : '') +
            (v.done_at ? '<span><b>Finalizado:</b> ' + v.done_at + '</span>' : '') +
          '</div>';

        row.addEventListener('click', function (e) {
          e.stopPropagation();
          searchHistoryDropdown.classList.remove('active');
          searchInput.value = '';
          applyFilters();
          openCardDetail(v.id, v.col);
        });

        visitsList.appendChild(row);
      });

      item.appendChild(visitsList);
      searchHistoryDropdown.appendChild(item);
    });

    searchHistoryDropdown.classList.add('active');
  }

  /* ===== PAINEL DE FILTRO ===== */
  var filterPanel = document.getElementById('filterPanel');
  var btnFiltro = document.getElementById('btnFiltro');
  var filterPanelClose = document.getElementById('filterPanelClose');
  var filterKeyword = document.getElementById('filterKeyword');
  var filterNoMember = document.getElementById('filterNoMember');
  var filterMyCards = document.getElementById('filterMyCards');
  var filterSelectMember = document.getElementById('filterSelectMember');
  var filterMemberList = document.getElementById('filterMemberList');
  var filterDone = document.getElementById('filterDone');
  var filterNotDone = document.getElementById('filterNotDone');
  var filterNoDate = document.getElementById('filterNoDate');
  var filterOverdue = document.getElementById('filterOverdue');
  var filterClearBtn = document.getElementById('filterClearBtn');
  var filterMeAvatar = document.getElementById('filterMeAvatar');

  var currentUserName = '';
  var selectedFilterMembers = [];

  btnFiltro.addEventListener('click', function () {
    filterPanel.classList.toggle('active');
    if (filterPanel.classList.contains('active')) {
      filterKeyword.focus();
    }
  });

  filterPanelClose.addEventListener('click', function () {
    filterPanel.classList.remove('active');
  });

  // Toggle member select dropdown
  filterSelectMember.addEventListener('change', function () {
    filterMemberList.style.display = filterSelectMember.checked ? 'block' : 'none';
    if (!filterSelectMember.checked) {
      selectedFilterMembers = [];
      filterMemberList.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.checked = false;
      });
    }
    applyFilters();
  });

  // All filter inputs trigger applyFilters
  [filterKeyword].forEach(function (el) {
    el.addEventListener('input', applyFilters);
  });
  [filterNoMember, filterMyCards, filterDone, filterNotDone, filterNoDate, filterOverdue].forEach(function (el) {
    el.addEventListener('change', applyFilters);
  });

  filterClearBtn.addEventListener('click', function () {
    filterKeyword.value = '';
    searchInput.value = '';
    [filterNoMember, filterMyCards, filterSelectMember, filterDone, filterNotDone, filterNoDate, filterOverdue].forEach(function (cb) {
      cb.checked = false;
    });
    filterMemberList.style.display = 'none';
    selectedFilterMembers = [];
    filterMemberList.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.checked = false;
    });
    applyFilters();
  });

  function populateFilterMembers(members) {
    filterMemberList.innerHTML = '';
    members.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'filter-option filter-member-item';
      row.innerHTML =
        '<input type="checkbox" data-member-name="' + escapeHtml(m.name) + '">' +
        '<span class="filter-member-avatar" style="background:' + MEMBER_COLORS[0] + '">' + escapeHtml(m.initials) + '</span>' +
        '<span>' + escapeHtml(m.name) + '</span>';
      var cb = row.querySelector('input');
      cb.addEventListener('change', function () {
        if (cb.checked) {
          if (selectedFilterMembers.indexOf(m.name) === -1) selectedFilterMembers.push(m.name);
        } else {
          selectedFilterMembers = selectedFilterMembers.filter(function (n) { return n !== m.name; });
        }
        applyFilters();
      });
      filterMemberList.appendChild(row);
    });
  }

  function isCardOverdue(dateStr) {
    if (!dateStr || dateStr === '--/--') return false;
    var parts = dateStr.split('/');
    if (parts.length !== 2) return false;
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month)) return false;
    var now = new Date();
    var year = now.getFullYear();
    var cardDate = new Date(year, month - 1, day, 23, 59, 59);
    return cardDate < now;
  }

  function applyFilters() {
    var q = (searchInput.value.trim() + ' ' + filterKeyword.value.trim()).trim().toUpperCase();
    var anyFilterActive = q || filterNoMember.checked || filterMyCards.checked || filterDone.checked ||
      filterNotDone.checked || filterNoDate.checked || filterOverdue.checked || selectedFilterMembers.length > 0;

    // Update filter button indicator
    btnFiltro.classList.toggle('filter-active', anyFilterActive);

    document.querySelectorAll('.card').forEach(function (el) {
      if (!anyFilterActive) {
        el.classList.remove('hidden-card');
        return;
      }

      var cardId = el.dataset.id;
      var titleText = el.querySelector('.card-title').textContent.toUpperCase();
      var dateEl = el.querySelector('.card-row span');
      var dateText = dateEl ? dateEl.textContent.trim() : '';
      var isDone = el.querySelector('.card-title.done') !== null;

      var show = true;

      // Keyword filter
      if (q && !titleText.includes(q)) {
        show = false;
      }

      // Status filters
      if (show && filterDone.checked && !filterNotDone.checked) {
        if (!isDone) show = false;
      }
      if (show && filterNotDone.checked && !filterDone.checked) {
        if (isDone) show = false;
      }

      // Date filters
      if (show && filterNoDate.checked) {
        if (dateText && dateText !== '--/--') show = false;
      }
      if (show && filterOverdue.checked) {
        if (!isCardOverdue(dateText)) show = false;
      }

      // Member filters — "Cartões atribuídos a mim"
      if (show && filterMyCards.checked) {
        var cardName = titleText.replace(/^\d+\s*[–-]\s*/, '');
        if (!cardName.includes(currentUserName.toUpperCase())) {
          // filter by "my" name — basic check
        }
      }

      el.classList.toggle('hidden-card', !show);
    });

    // Atualiza contadores
    COLUMNS.forEach(function (col) {
      var area = document.querySelector('.column-body[data-col="' + col.id + '"]');
      if (!area) return;
      var visible = area.querySelectorAll('.card:not(.hidden-card)').length;
      var countEl = area.closest('.column').querySelector('.col-count');
      if (countEl) countEl.textContent = ' \u2022 ' + visible;
    });
  }

  function applySearch() {
    applyFilters();
  }

  /* ===== BOTTOM NAV ===== */
  document.querySelectorAll('.nav-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.nav-tab').forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
    });
  });

  /* ===== MENU DE AÇÕES DA COLUNA (3 pontos) ===== */
  var colMenuOverlay = null;

  function closeColMenu() {
    if (colMenuOverlay) {
      colMenuOverlay.remove();
      colMenuOverlay = null;
    }
  }

  function openColMenu(btnEl, colId, colTitle, isCustom) {
    closeColMenu();

    colMenuOverlay = document.createElement('div');
    colMenuOverlay.className = 'col-menu-overlay';
    colMenuOverlay.addEventListener('click', function (e) {
      if (e.target === colMenuOverlay) closeColMenu();
    });

    var menu = document.createElement('div');
    menu.className = 'col-menu-dropdown';

    // Position near button
    var rect = btnEl.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';

    var menuTitle = '<div class="col-menu-header"><span>Ações da Lista</span><button class="col-menu-close">&times;</button></div>';

    var items = [
      { label: 'Adicionar cartão', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>', action: 'add-card' },
      { label: 'Copiar lista', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: 'copy-list' },
      { label: 'Mover lista', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/></svg>', action: 'move-list' },
      { label: 'Seguir', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', action: 'follow' },
      { type: 'divider' },
      { type: 'section', label: 'Automação' },
      { label: 'Quando um cartão for adicionado à lista...', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', action: 'auto-add', sub: true },
      { label: 'Todo dia, ordenar a lista por...', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', action: 'auto-daily', sub: true },
      { label: 'Toda segunda-feira, ordenar a lista por...', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', action: 'auto-weekly', sub: true },
      { label: 'Criar uma regra', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4"/></svg>', action: 'auto-rule', sub: true },
      { type: 'divider' },
      { label: 'Arquivar Esta Lista', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', action: 'archive', danger: isCustom }
    ];

    var html = menuTitle + '<div class="col-menu-body">';
    items.forEach(function (item) {
      if (item.type === 'divider') {
        html += '<div class="col-menu-divider"></div>';
      } else if (item.type === 'section') {
        html += '<div class="col-menu-section">' + item.label + '</div>';
      } else {
        var cls = 'col-menu-item' + (item.sub ? ' sub' : '') + (item.danger ? ' danger' : '');
        html += '<button class="' + cls + '" data-action="' + item.action + '">' + item.icon + '<span>' + item.label + '</span></button>';
      }
    });
    html += '</div>';
    menu.innerHTML = html;

    colMenuOverlay.appendChild(menu);
    document.body.appendChild(colMenuOverlay);

    // Close button
    menu.querySelector('.col-menu-close').addEventListener('click', closeColMenu);

    // Actions
    menu.querySelectorAll('.col-menu-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.dataset.action;
        closeColMenu();
        handleColAction(action, colId, colTitle, isCustom);
      });
    });
  }

  function handleColAction(action, colId, colTitle, isCustom) {
    switch (action) {
      case 'add-card':
        // Ativa o formulário inline da coluna
        var colEl = document.querySelector('.column[data-col="' + colId + '"]');
        if (colEl) {
          var form = colEl.querySelector('.inline-form');
          var addBtn = colEl.querySelector('.add-card-btn');
          if (form && addBtn) { form.classList.add('active'); addBtn.style.display = 'none'; form.querySelector('input[type=text]').focus(); }
        }
        break;

      case 'copy-list':
        var newTitle = prompt('Nome da nova lista:', colTitle + ' (cópia)');
        if (!newTitle || !newTitle.trim()) return;
        api('POST', '/api/columns', { title: newTitle.trim() }).then(function (data) {
          if (!data.ok) return;
          var newColId = data.column.id;
          // Copia cartões da coluna original
          var cardsInCol = state.cards[colId] || [];
          var promises = cardsInCol.map(function (card) {
            return api('POST', '/api/cards', { name: card.name, col: newColId });
          });
          Promise.all(promises).then(function () { loadFromServer(); });
        });
        break;

      case 'move-list':
        var options = COLUMNS.filter(function (c) { return c.id !== colId; })
          .map(function (c, i) { return (i + 1) + '. ' + c.title; }).join('\n');
        var choice = prompt('Mover todos os cartões para:\n\n' + options + '\n\nDigite o número:');
        if (!choice) return;
        var idx = parseInt(choice) - 1;
        var targets = COLUMNS.filter(function (c) { return c.id !== colId; });
        if (idx < 0 || idx >= targets.length) return;
        var targetCol = targets[idx].id;
        var cardsToMove = (state.cards[colId] || []).map(function (card) {
          return card;
        });
        var movePromises = cardsToMove.map(function (card) {
          return api('PATCH', '/api/cards/' + card.id + '/move', { col: targetCol });
        });
        Promise.all(movePromises).then(function () { loadFromServer(); });
        break;

      case 'follow':
        alert('Você está seguindo a lista "' + colTitle + '". Notificações ativadas.');
        break;

      case 'auto-add':
        alert('Automação: Quando um cartão for adicionado a "' + colTitle + '"...\n\n(Funcionalidade de automação em breve)');
        break;

      case 'auto-daily':
        alert('Automação: Todo dia, ordenar "' + colTitle + '" por...\n\n(Funcionalidade de automação em breve)');
        break;

      case 'auto-weekly':
        alert('Automação: Toda segunda-feira, ordenar "' + colTitle + '" por...\n\n(Funcionalidade de automação em breve)');
        break;

      case 'auto-rule':
        alert('Criar uma regra personalizada para "' + colTitle + '".\n\n(Funcionalidade de automação em breve)');
        break;

      case 'archive':
        if (isCustom) {
          if (confirm('Arquivar a lista "' + colTitle + '" e remover todos os cartões dela?')) {
            api('DELETE', '/api/columns/' + encodeURIComponent(colId)).then(function () {
              loadFromServer();
            });
          }
        } else {
          // Para colunas padrão, apenas remove os cartões
          if (confirm('Arquivar todos os cartões da lista "' + colTitle + '"?')) {
            var cardsToDel = (state.cards[colId] || []).map(function (card) {
              return card;
            });
            var delPromises = cardsToDel.map(function (card) {
              return api('DELETE', '/api/cards/' + card.id);
            });
            Promise.all(delPromises).then(function () { loadFromServer(); });
          }
        }
        break;
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeColMenu();
  });

  /* ===== CAIXA DE ENTRADA (NOTIFICAÇÕES + MENSAGENS) ===== */
  var inboxOverlay = document.getElementById('inboxOverlay');
  var inboxClose = document.getElementById('inboxClose');
  var inboxList = document.getElementById('inboxList');
  var inboxEmpty = document.getElementById('inboxEmpty');
  var inboxMarkAll = document.getElementById('inboxMarkAll');
  var inboxClearAll = document.getElementById('inboxClearAll');
  var navInbox = document.getElementById('navInbox');
  var navInboxBadge = document.getElementById('navInboxBadge');
  var msgTabBadge = document.getElementById('msgTabBadge');

  // Tabs
  var inboxTabs = document.querySelectorAll('.inbox-tab[data-tab]');
  var tabNotif = document.getElementById('tabNotif');
  var tabChat = document.getElementById('tabChat');

  // Chat elements
  var chatConvos = document.getElementById('chatConvos');
  var chatConvoList = document.getElementById('chatConvoList');
  var chatConvosEmpty = document.getElementById('chatConvosEmpty');
  var chatNewBtn = document.getElementById('chatNewBtn');
  var chatPickUser = document.getElementById('chatPickUser');
  var chatPickBack = document.getElementById('chatPickBack');
  var chatUserList = document.getElementById('chatUserList');
  var chatView = document.getElementById('chatView');
  var chatViewBack = document.getElementById('chatViewBack');
  var chatViewAvatar = document.getElementById('chatViewAvatar');
  var chatViewName = document.getElementById('chatViewName');
  var chatMessages = document.getElementById('chatMessages');
  var chatInput = document.getElementById('chatInput');
  var chatSendBtn = document.getElementById('chatSendBtn');

  var currentChatUserId = null;
  var currentUserId = null;
  var chatRefreshInterval = null;

  var NOTIF_ICONS = {
    card_created: { color: '#579DFF', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' },
    card_moved: { color: '#c377e0', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' },
    card_done: { color: '#61BD4F', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' },
    card_deleted: { color: '#eb5a46', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' }
  };

  // === TABS ===
  inboxTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab;
      inboxTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      tabNotif.classList.toggle('active', target === 'notif');
      tabChat.classList.toggle('active', target === 'chat');
      if (target === 'chat') {
        showChatConvos();
        loadConversations();
      }
    });
  });

  // === ABRIR CAIXA DE ENTRADA ===
  function openInbox() {
    inboxOverlay.classList.add('active');
    loadNotifications();
    api('PATCH', '/api/notifications/read-all').then(function () {
      navInboxBadge.style.display = 'none';
      var bellBadge = document.getElementById('headerBellBadge');
      if (bellBadge) bellBadge.style.display = 'none';
    });
  }

  navInbox.addEventListener('click', function (e) {
    e.preventDefault();
    openInbox();
  });

  // Sino do header também abre a caixa de entrada
  var headerBell = document.getElementById('headerBell');
  if (headerBell) {
    headerBell.addEventListener('click', function () {
      openInbox();
    });
  }

  inboxClose.addEventListener('click', function () {
    inboxOverlay.classList.remove('active');
    stopChatRefresh();
  });
  inboxOverlay.addEventListener('click', function (e) {
    if (e.target === inboxOverlay) {
      inboxOverlay.classList.remove('active');
      stopChatRefresh();
    }
  });

  // === NOTIFICAÇÕES ===
  inboxMarkAll.addEventListener('click', function () {
    api('PATCH', '/api/notifications/read-all').then(function () {
      navInboxBadge.style.display = 'none';
      inboxList.querySelectorAll('.notif-item.unread').forEach(function (el) {
        el.classList.remove('unread');
      });
    });
  });

  inboxClearAll.addEventListener('click', function () {
    api('DELETE', '/api/notifications/clear').then(function () {
      inboxList.innerHTML = '';
      inboxEmpty.style.display = 'flex';
      navInboxBadge.style.display = 'none';
    });
  });

  function loadNotifications() {
    api('GET', '/api/notifications').then(function (data) {
      if (!data.ok) return;
      renderNotifications(data.notifications);
      updateInboxBadge(data.unreadCount);
    });
  }

  function updateInboxBadge(count) {
    var bellBadge = document.getElementById('headerBellBadge');
    if (count > 0) {
      navInboxBadge.textContent = count > 99 ? '99+' : String(count);
      navInboxBadge.style.display = 'flex';
      if (bellBadge) bellBadge.style.display = '';
    } else {
      navInboxBadge.style.display = 'none';
      if (bellBadge) bellBadge.style.display = 'none';
    }
  }

  function timeAgo(dateStr) {
    var d = new Date(dateStr + 'Z');
    var now = new Date();
    var diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return Math.floor(diff / 60) + ' min atrás';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h atrás';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd atrás';
    return d.toLocaleDateString('pt-BR');
  }

  function renderNotifications(notifications) {
    inboxList.innerHTML = '';
    if (!notifications || notifications.length === 0) {
      inboxEmpty.style.display = 'flex';
      return;
    }
    inboxEmpty.style.display = 'none';

    notifications.forEach(function (n) {
      var el = document.createElement('div');
      el.className = 'notif-item' + (n.read === 0 ? ' unread' : '');
      var icon = NOTIF_ICONS[n.type] || NOTIF_ICONS.card_created;
      el.innerHTML =
        '<div class="notif-icon" style="background:' + icon.color + '">' + icon.svg + '</div>' +
        '<div class="notif-content">' +
          '<p class="notif-message">' + escapeHtml(n.message) + '</p>' +
          '<span class="notif-time">' + timeAgo(n.created_at) + '</span>' +
        '</div>';
      inboxList.appendChild(el);
    });
  }

  function checkUnread() {
    var totalBell = 0;
    api('GET', '/api/notifications?limit=1').then(function (data) {
      if (data.ok) {
        updateInboxBadge(data.unreadCount);
        totalBell += (data.unreadCount || 0);
      }
    }).catch(function () {});
    // Também checa mensagens não lidas
    api('GET', '/api/messages/conversations').then(function (data) {
      if (data.ok && data.totalUnread > 0) {
        msgTabBadge.textContent = data.totalUnread > 99 ? '99+' : String(data.totalUnread);
        msgTabBadge.style.display = 'inline-flex';
        totalBell += data.totalUnread;
      } else {
        msgTabBadge.style.display = 'none';
      }
      // Atualiza badge do sino com total (notificações + mensagens)
      var bellBadge = document.getElementById('headerBellBadge');
      if (bellBadge) bellBadge.style.display = totalBell > 0 ? '' : 'none';
    }).catch(function () {});
  }
  setInterval(checkUnread, 5000);

  // === CHAT: NAVEGAÇÃO ===
  function showChatConvos() {
    chatConvos.style.display = '';
    chatPickUser.style.display = 'none';
    chatView.style.display = 'none';
    stopChatRefresh();
  }

  function showChatPick() {
    chatConvos.style.display = 'none';
    chatPickUser.style.display = 'flex';
    chatView.style.display = 'none';
    loadUserList();
  }

  function showChatView(userId, userName) {
    chatConvos.style.display = 'none';
    chatPickUser.style.display = 'none';
    chatView.style.display = 'flex';
    currentChatUserId = userId;

    var initials = userName.trim().split(/\s+/).length >= 2
      ? (userName.trim().split(/\s+/)[0][0] + userName.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
      : userName.substring(0, 2).toUpperCase();

    chatViewAvatar.textContent = initials;
    chatViewAvatar.style.background = MEMBER_COLORS[userId % MEMBER_COLORS.length];
    chatViewName.textContent = userName;
    chatInput.value = '';

    loadChatMessages(userId);
    startChatRefresh(userId);
  }

  chatNewBtn.addEventListener('click', showChatPick);
  chatPickBack.addEventListener('click', showChatConvos);
  chatViewBack.addEventListener('click', function () {
    showChatConvos();
    loadConversations();
  });

  // === CHAT: LISTA DE CONVERSAS ===
  function loadConversations() {
    api('GET', '/api/messages/conversations').then(function (data) {
      if (!data.ok) return;
      chatConvoList.innerHTML = '';
      if (data.conversations.length === 0) {
        chatConvosEmpty.style.display = 'flex';
        return;
      }
      chatConvosEmpty.style.display = 'none';
      data.conversations.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'chat-convo-item' + (c.unread > 0 ? ' has-unread' : '');

        var initials = c.name.trim().split(/\s+/).length >= 2
          ? (c.name.trim().split(/\s+/)[0][0] + c.name.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
          : c.name.substring(0, 2).toUpperCase();
        var color = MEMBER_COLORS[c.userId % MEMBER_COLORS.length];

        var unreadBadge = c.unread > 0
          ? '<span class="chat-convo-unread">' + c.unread + '</span>'
          : '';

        var preview = c.lastMessage.length > 40 ? c.lastMessage.substring(0, 40) + '…' : c.lastMessage;

        el.innerHTML =
          '<div class="chat-convo-avatar" style="background:' + color + '">' + escapeHtml(initials) + '</div>' +
          '<div class="chat-convo-info">' +
            '<div class="chat-convo-top">' +
              '<span class="chat-convo-name">' + escapeHtml(c.name) + '</span>' +
              '<span class="chat-convo-time">' + timeAgo(c.lastTime) + '</span>' +
            '</div>' +
            '<div class="chat-convo-bottom">' +
              '<span class="chat-convo-preview">' + escapeHtml(preview) + '</span>' +
              unreadBadge +
            '</div>' +
          '</div>';

        el.addEventListener('click', function () {
          showChatView(c.userId, c.name);
        });
        chatConvoList.appendChild(el);
      });

      if (data.totalUnread > 0) {
        msgTabBadge.textContent = data.totalUnread;
        msgTabBadge.style.display = 'inline-flex';
      } else {
        msgTabBadge.style.display = 'none';
      }
    });
  }

  // === CHAT: LISTA DE USUÁRIOS (nova msg) ===
  function loadUserList() {
    api('GET', '/api/users').then(function (data) {
      if (!data.ok) return;
      chatUserList.innerHTML = '';
      data.members.forEach(function (m) {
        if (m.id === currentUserId) return; // Não mostra eu mesmo
        var el = document.createElement('div');
        el.className = 'chat-user-item';
        var color = MEMBER_COLORS[m.id % MEMBER_COLORS.length];
        el.innerHTML =
          '<div class="chat-convo-avatar" style="background:' + color + '">' + escapeHtml(m.initials) + '</div>' +
          '<div class="chat-user-info">' +
            '<span class="chat-user-name">' + escapeHtml(m.name) + '</span>' +
            '<span class="chat-user-email">' + escapeHtml(m.email) + '</span>' +
          '</div>';
        el.addEventListener('click', function () {
          showChatView(m.id, m.name);
        });
        chatUserList.appendChild(el);
      });
    });
  }

  // === CHAT: MENSAGENS ===
  function loadChatMessages(userId) {
    api('GET', '/api/messages/' + userId).then(function (data) {
      if (!data.ok) return;
      renderChatMessages(data.messages);
    });
  }

  function renderChatMessages(messages) {
    chatMessages.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatMessages.innerHTML = '<div class="chat-empty-msg">Nenhuma mensagem ainda. Diga olá! 👋</div>';
      return;
    }
    var lastDate = '';
    messages.forEach(function (m) {
      var msgDate = m.created_at.split(' ')[0];
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        var sep = document.createElement('div');
        sep.className = 'chat-date-sep';
        var d = new Date(msgDate);
        sep.textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        chatMessages.appendChild(sep);
      }

      var isMine = m.from_user_id === currentUserId;
      var bubble = document.createElement('div');
      bubble.className = 'chat-bubble ' + (isMine ? 'mine' : 'theirs');
      var time = m.created_at.split(' ')[1] || '';
      var hhmm = time.substring(0, 5);
      bubble.innerHTML =
        '<p>' + escapeHtml(m.text) + '</p>' +
        '<span class="chat-bubble-time">' + hhmm + '</span>';
      chatMessages.appendChild(bubble);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Enviar mensagem
  function sendMessage() {
    var text = chatInput.value.trim();
    if (!text || !currentChatUserId) return;
    chatInput.value = '';
    api('POST', '/api/messages', { toUserId: currentChatUserId, text: text }).then(function (data) {
      if (data.ok) {
        loadChatMessages(currentChatUserId);
      }
    });
  }

  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });

  // Auto-refresh do chat aberto
  function startChatRefresh(userId) {
    stopChatRefresh();
    chatRefreshInterval = setInterval(function () {
      if (currentChatUserId === userId) {
        loadChatMessages(userId);
      }
    }, 3000);
  }

  function stopChatRefresh() {
    if (chatRefreshInterval) {
      clearInterval(chatRefreshInterval);
      chatRefreshInterval = null;
    }
  }

  /* ===== MEMBROS (AVATARES NO HEADER) ===== */
  var MEMBER_COLORS = ['#579DFF', '#61bd4f', '#eb5a46', '#f5cd47', '#c377e0', '#ff8ed4', '#00c2e0', '#51e898'];
  var headerMembersEl = document.getElementById('headerMembers');
  var membersDropdown = document.getElementById('membersDropdown');
  var membersDropdownList = document.getElementById('membersDropdownList');

  function loadMembers() {
    api('GET', '/api/users').then(function (data) {
      if (!data.ok || !data.members) return;
      renderMemberAvatars(data.members);
      renderMembersDropdown(data.members);
      populateFilterMembers(data.members);
    }).catch(function () {});
  }

  function renderMemberAvatars(members) {
    headerMembersEl.innerHTML = '';
    var maxShow = 5;
    var shown = members.slice(0, maxShow);
    var extra = members.length - maxShow;

    shown.forEach(function (m, i) {
      var el = document.createElement('div');
      el.className = 'member-avatar';
      el.style.zIndex = String(shown.length - i);
      el.title = m.name;

      var color = MEMBER_COLORS[i % MEMBER_COLORS.length];
      el.style.backgroundColor = color;
      el.textContent = m.initials;

      // Tenta carregar Gravatar
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        el.textContent = '';
        el.style.backgroundColor = 'transparent';
        img.className = 'member-avatar-img';
        el.appendChild(img);
      };
      img.src = m.gravatar;

      headerMembersEl.appendChild(el);
    });

    if (extra > 0) {
      var moreEl = document.createElement('div');
      moreEl.className = 'member-avatar member-avatar-more';
      moreEl.textContent = '+' + extra;
      moreEl.style.zIndex = '0';
      headerMembersEl.appendChild(moreEl);
    }
  }

  function renderMembersDropdown(members) {
    membersDropdownList.innerHTML = '';
    members.forEach(function (m, i) {
      var row = document.createElement('div');
      row.className = 'member-row';

      var color = MEMBER_COLORS[i % MEMBER_COLORS.length];
      var avatarHtml = '<div class="member-row-avatar" style="background:' + color + '">' + escapeHtml(m.initials) + '</div>';

      row.innerHTML = avatarHtml +
        '<div class="member-row-info">' +
          '<span class="member-row-name">' + escapeHtml(m.name) + '</span>' +
          '<span class="member-row-email">' + escapeHtml(m.email) + '</span>' +
        '</div>';

      // Tenta carregar Gravatar no dropdown também
      var avatarEl = row.querySelector('.member-row-avatar');
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        avatarEl.textContent = '';
        avatarEl.style.backgroundColor = 'transparent';
        img.className = 'member-avatar-img';
        avatarEl.appendChild(img);
      };
      img.src = m.gravatar;

      membersDropdownList.appendChild(row);
    });
  }

  // Toggle dropdown ao clicar nos avatares
  headerMembersEl.addEventListener('click', function (e) {
    e.stopPropagation();
    membersDropdown.classList.toggle('active');
  });

  // Fechar dropdown ao clicar fora
  document.addEventListener('click', function (e) {
    if (!membersDropdown.contains(e.target) && !headerMembersEl.contains(e.target)) {
      membersDropdown.classList.remove('active');
    }
  });

  /* ===== INICIALIZAÇÃO ===== */
  loadFromServer();
  loadMembers();

  // Auto-refresh a cada 3 segundos para sincronizar entre usuários
  setInterval(function () {
    // Não atualiza se estiver arrastando ou com modal aberto
    if (dragCardId) return;
    if (document.querySelector('.modal-overlay.active')) return;
    if (document.querySelector('.confirm-overlay.active')) return;

    api('GET', '/api/cards').then(function (data) {
      // Só re-renderiza se houve mudança
      var newHash = JSON.stringify(data);
      if (newHash !== lastDataHash) {
        lastDataHash = newHash;
        state = data;

        // Reconstrói COLUMNS com colunas customizadas
        COLUMNS = DEFAULT_COLUMNS.slice();
        if (data.customColumns && data.customColumns.length > 0) {
          data.customColumns.forEach(function (cc) {
            COLUMNS.push({ id: cc.id, title: cc.title, custom: true });
          });
        }
        COL_ORDER = COLUMNS.map(function (c) { return c.id; });

        render();
      }
    }).catch(function () {});
  }, 3000);

  // Carrega dados do usuário logado
  fetch('/api/auth/me').then(function (r) { return r.json(); }).then(function (data) {
    if (data.ok && data.user) {
      var el = document.getElementById('headerUser');
      if (el) el.textContent = data.user.name;
      currentUserName = data.user.name || '';
      currentUserId = data.user.id;
      // Avatar do "eu" no filtro
      if (filterMeAvatar) {
        var initials = currentUserName.trim().split(/\s+/).length >= 2
          ? (currentUserName.trim().split(/\s+/)[0][0] + currentUserName.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
          : currentUserName.substring(0, 2).toUpperCase();
        filterMeAvatar.textContent = initials;
        filterMeAvatar.style.background = '#579DFF';
      }
    }
  }).catch(function () {});

  // Logout
  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST' }).then(function () {
        window.location.href = '/login.html';
      });
    });
  }

  /* ===== PLANEJADOR ===== */
  var plannerOverlay = document.getElementById('plannerOverlay');
  var plannerGrid = document.getElementById('plannerGrid');
  var plannerWeekLabel = document.getElementById('plannerWeekLabel');
  var plannerSettings = document.getElementById('plannerSettings');
  var plannerConnected = document.getElementById('plannerConnected');
  var plannerModal = document.getElementById('plannerModal');
  var navPlanner = document.getElementById('navPlanner');
  var plannerWeekStart = null;
  var pCards = [], pEvents = [], pCalEvents = [];
  var selectedEventColor = '#61BD4F';

  function getMonday(d) {
    d = new Date(d);
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  function fmtISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  var PLAN_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var PLAN_DAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

  navPlanner.addEventListener('click', function(e) {
    e.preventDefault();
    plannerOverlay.classList.add('active');
    document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
    navPlanner.classList.add('active');
    if (!plannerWeekStart) plannerWeekStart = getMonday(new Date());
    loadPlannerData();
  });

  document.getElementById('plannerClose').addEventListener('click', function() {
    plannerOverlay.classList.remove('active');
    document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
    var quadroTab = document.querySelectorAll('.nav-tab')[2];
    if (quadroTab) quadroTab.classList.add('active');
  });

  plannerOverlay.addEventListener('click', function(e) {
    if (e.target === plannerOverlay) {
      plannerOverlay.classList.remove('active');
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
      var quadroTab = document.querySelectorAll('.nav-tab')[2];
      if (quadroTab) quadroTab.classList.add('active');
    }
  });

  document.getElementById('plannerPrev').addEventListener('click', function() {
    plannerWeekStart = new Date(plannerWeekStart.getTime() - 7*864e5);
    loadPlannerData();
  });
  document.getElementById('plannerNext').addEventListener('click', function() {
    plannerWeekStart = new Date(plannerWeekStart.getTime() + 7*864e5);
    loadPlannerData();
  });
  document.getElementById('plannerToday').addEventListener('click', function() {
    plannerWeekStart = getMonday(new Date());
    loadPlannerData();
  });

  document.getElementById('plannerSettingsBtn').addEventListener('click', function() {
    var s = plannerSettings;
    s.style.display = s.style.display === 'none' ? '' : 'none';
    if (s.style.display !== 'none') loadCalConnections();
  });

  function updateWeekLabel() {
    var e = new Date(plannerWeekStart.getTime() + 6*864e5);
    plannerWeekLabel.textContent =
      plannerWeekStart.getDate() + ' ' + PLAN_MONTHS[plannerWeekStart.getMonth()] + ' — ' +
      e.getDate() + ' ' + PLAN_MONTHS[e.getMonth()] + ' ' + e.getFullYear();
  }

  function loadPlannerData() {
    var start = fmtISO(plannerWeekStart);
    var endD = new Date(plannerWeekStart.getTime() + 6*864e5);
    var end = fmtISO(endD);
    updateWeekLabel();
    Promise.all([
      api('GET', '/api/planner/cards'),
      api('GET', '/api/planner/events?start=' + start + '&end=' + end),
      api('GET', '/api/calendar/events?start=' + start + '&end=' + end)
    ]).then(function(r) {
      pCards = (r[0] && r[0].ok) ? r[0].cards : [];
      pEvents = (r[1] && r[1].ok) ? r[1].events : [];
      pCalEvents = (r[2] && r[2].ok) ? r[2].events : [];
      renderPlannerGrid();
    }).catch(function() { renderPlannerGrid(); });
  }

  function renderPlannerGrid() {
    plannerGrid.innerHTML = '';
    var today = fmtISO(new Date());

    for (var i = 0; i < 7; i++) {
      var dd = new Date(plannerWeekStart.getTime() + i*864e5);
      var iso = fmtISO(dd);
      var ddmm = String(dd.getDate()).padStart(2,'0') + '/' + String(dd.getMonth()+1).padStart(2,'0');
      var isToday = iso === today;

      var col = document.createElement('div');
      col.className = 'planner-day' + (isToday ? ' is-today' : '');

      // Header
      var hdr = document.createElement('div');
      hdr.className = 'planner-day-header';
      hdr.innerHTML =
        '<span class="planner-day-name">' + PLAN_DAYS[i] + '</span>' +
        '<span class="planner-day-num' + (isToday ? ' today' : '') + '">' + dd.getDate() + '</span>';
      col.appendChild(hdr);

      // Events container
      var evBox = document.createElement('div');
      evBox.className = 'planner-day-events';
      evBox.setAttribute('data-iso', iso);
      evBox.setAttribute('data-ddmm', ddmm);
      col.appendChild(evBox);

      // Add button
      var addBtn = document.createElement('button');
      addBtn.className = 'planner-add-ev';
      addBtn.textContent = '+ Evento';
      addBtn.setAttribute('data-date', iso);
      col.appendChild(addBtn);

      plannerGrid.appendChild(col);
    }

    // Place cards
    pCards.forEach(function(card) {
      var el = plannerGrid.querySelector('.planner-day-events[data-ddmm="'+card.date+'"]');
      if (!el) return;
      var pill = document.createElement('div');
      pill.className = 'planner-pill pill-card';
      pill.innerHTML =
        '<span class="pill-dot" style="background:' + (card.avatar_color||'#579DFF') + '"></span>' +
        '<div class="pill-text"><strong>#' + card.num + '</strong> ' + escapeHtml(card.name) + '</div>';
      el.appendChild(pill);
    });

    // Place planner events
    pEvents.forEach(function(ev) {
      var el = plannerGrid.querySelector('.planner-day-events[data-iso="'+ev.event_date+'"]');
      if (!el) return;
      var pill = document.createElement('div');
      pill.className = 'planner-pill pill-event';
      pill.innerHTML =
        '<span class="pill-dot" style="background:' + (ev.color||'#61BD4F') + '"></span>' +
        '<div class="pill-text">' +
          '<span class="pill-time">' + (ev.start_time||'') + ' - ' + (ev.end_time||'') + '</span> ' +
          escapeHtml(ev.title) +
        '</div>' +
        '<button class="pill-del" data-id="'+ev.id+'">&times;</button>';
      el.appendChild(pill);
    });

    // Place external calendar events
    pCalEvents.forEach(function(ev) {
      var el = plannerGrid.querySelector('.planner-day-events[data-iso="'+ev.date+'"]');
      if (!el) return;
      var prov = ev.provider === 'google' ? 'G' : 'O';
      var pill = document.createElement('div');
      pill.className = 'planner-pill pill-cal';
      pill.innerHTML =
        '<span class="pill-dot" style="background:' + (ev.color||'#888') + '"></span>' +
        '<div class="pill-text">' +
          '<span class="pill-time">' + (ev.startTime||'') + '</span> ' +
          escapeHtml(ev.title) +
        '</div>' +
        '<span class="pill-prov">' + prov + '</span>';
      el.appendChild(pill);
    });

    // Bind add event
    plannerGrid.querySelectorAll('.planner-add-ev').forEach(function(btn) {
      btn.addEventListener('click', function() { openPlannerModal(this.getAttribute('data-date')); });
    });

    // Bind delete
    plannerGrid.querySelectorAll('.pill-del').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        api('DELETE', '/api/planner/events/' + id).then(function() { loadPlannerData(); });
      });
    });
  }

  // Event modal
  function openPlannerModal(date) {
    document.getElementById('plannerEvTitle').value = '';
    document.getElementById('plannerEvDate').value = date;
    document.getElementById('plannerEvStart').value = '09:00';
    document.getElementById('plannerEvEnd').value = '10:00';
    selectedEventColor = '#61BD4F';
    plannerModal.querySelectorAll('.planner-color-opt').forEach(function(c) {
      c.classList.toggle('active', c.getAttribute('data-color') === selectedEventColor);
    });
    plannerModal.style.display = 'flex';
    document.getElementById('plannerEvTitle').focus();
  }

  plannerModal.querySelectorAll('.planner-color-opt').forEach(function(c) {
    c.addEventListener('click', function() {
      selectedEventColor = this.getAttribute('data-color');
      plannerModal.querySelectorAll('.planner-color-opt').forEach(function(o) { o.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  document.getElementById('plannerEvSave').addEventListener('click', function() {
    var title = document.getElementById('plannerEvTitle').value.trim();
    var date = document.getElementById('plannerEvDate').value;
    var startT = document.getElementById('plannerEvStart').value;
    var endT = document.getElementById('plannerEvEnd').value;
    if (!title) return;
    api('POST', '/api/planner/events', {
      title: title, event_date: date, start_time: startT, end_time: endT, color: selectedEventColor
    }).then(function() {
      plannerModal.style.display = 'none';
      loadPlannerData();
    });
  });

  document.getElementById('plannerEvCancel').addEventListener('click', function() {
    plannerModal.style.display = 'none';
  });

  plannerModal.addEventListener('click', function(e) {
    if (e.target === plannerModal) plannerModal.style.display = 'none';
  });

  // Calendar connections
  function loadCalConnections() {
    api('GET', '/api/calendar/connections').then(function(data) {
      if (!data.ok) return;
      plannerConnected.innerHTML = '';
      if (data.connections.length === 0) {
        plannerConnected.innerHTML = '<p class="planner-no-conn">Nenhum calendário conectado ainda</p>';
        return;
      }
      data.connections.forEach(function(c) {
        var el = document.createElement('div');
        el.className = 'planner-conn-item';
        var icon = c.provider === 'google' ? '<span style="color:#ea4335">●</span>' : '<span style="color:#0078d4">●</span>';
        el.innerHTML = '<span>' + icon + ' ' + escapeHtml(c.cal_email) + '</span>' +
          '<button class="planner-conn-del" data-id="'+c.id+'">Desconectar</button>';
        plannerConnected.appendChild(el);
      });
      plannerConnected.querySelectorAll('.planner-conn-del').forEach(function(btn) {
        btn.addEventListener('click', function() {
          api('DELETE', '/api/calendar/connections/' + this.getAttribute('data-id')).then(function() {
            loadCalConnections();
            loadPlannerData();
          });
        });
      });
    });
  }

  // Auto-abre planejador após conexão de calendário
  if (window.location.search.indexOf('planner=connected') > -1) {
    window.history.replaceState({}, '', '/index.html');
    setTimeout(function() { navPlanner.click(); }, 500);
  }

  /* ===== MODAL DETALHADO DO CARTÃO ===== */
  var cdOverlay = document.getElementById('cardDetailOverlay');
  var cdClose = document.getElementById('cdClose');
  var cdTitle = document.getElementById('cdTitle');
  var cdDoneBtn = document.getElementById('cdDoneBtn');
  var cdColSelect = document.getElementById('cdColSelect');
  var cdAvatar = document.getElementById('cdAvatar');
  var cdNome = document.getElementById('cdNome');
  var cdTelefone = document.getElementById('cdTelefone');
  var cdChegada = document.getElementById('cdChegada');
  var cdEmpresa = document.getElementById('cdEmpresa');
  var cdTipoExame = document.getElementById('cdTipoExame');
  var cdFuncao = document.getElementById('cdFuncao');
  var cdSaida = document.getElementById('cdSaida');
  var cdSaveFields = document.getElementById('cdSaveFields');
  var cdCommentInput = document.getElementById('cdCommentInput');
  var cdCommentSend = document.getElementById('cdCommentSend');
  var cdActivityList = document.getElementById('cdActivityList');
  var cdToggleDetails = document.getElementById('cdToggleDetails');
  var currentDetailCardId = null;
  var showActivityDetails = false;

  function openCardDetail(cardId, colId) {
    currentDetailCardId = cardId;
    cdOverlay.classList.add('active');

    // Preenche select de colunas
    cdColSelect.innerHTML = '';
    COLUMNS.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title;
      if (c.id === colId) opt.selected = true;
      cdColSelect.appendChild(opt);
    });

    // Carrega detalhes via API
    api('GET', '/api/cards/' + encodeURIComponent(cardId) + '/detail').then(function(data) {
      if (!data.ok || !data.card) {
        cdOverlay.classList.remove('active');
        return;
      }
      var c = data.card;

      cdTitle.value = (c.senha || pad2(c.num)) + ' – ' + c.name;
      cdNome.value = c.name || '';
      cdTelefone.value = c.telefone || '';
      cdChegada.value = c.hora_chegada || '';
      cdSaida.value = c.hora_saida || '';
      cdEmpresa.value = c.empresa || '';
      cdTipoExame.value = c.tipo_exame || '';
      cdFuncao.value = c.funcao || '';

      // Avatar
      var avatarLetters = c.avatar || '??';
      var avatarBg = c.avatar_color || '#579DFF';
      cdAvatar.style.background = avatarBg;
      cdAvatar.textContent = avatarLetters;

      // Estado concluído
      updateDoneBtn(c.done === 1);

      // Renderiza comentários e atividade
      renderCardActivity(data.comments, data.activity);
    });
  }

  function updateDoneBtn(isDone) {
    if (isDone) {
      cdDoneBtn.classList.add('done');
      cdDoneBtn.title = 'Desmarcar como concluído';
    } else {
      cdDoneBtn.classList.remove('done');
      cdDoneBtn.title = 'Marcar como concluído';
    }
  }

  function renderCardActivity(comments, activity) {
    cdActivityList.innerHTML = '';

    // Mescla comentários e atividade em ordem cronológica
    var items = [];
    comments.forEach(function(c) {
      items.push({ type: 'comment', user: c.user_name, text: c.text, date: c.created_at });
    });
    if (showActivityDetails) {
      activity.forEach(function(a) {
        items.push({ type: 'activity', user: a.user_name, text: a.action, date: a.created_at });
      });
    }

    items.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    if (items.length === 0) {
      cdActivityList.innerHTML = '<div class="cd-empty">Nenhuma atividade ainda</div>';
      return;
    }

    items.forEach(function(item) {
      var el = document.createElement('div');
      el.className = 'cd-activity-item' + (item.type === 'activity' ? ' cd-activity-log' : '');

      var initials = (item.user || '').trim().split(/\s+/).length >= 2
        ? ((item.user || '').trim().split(/\s+/)[0][0] + (item.user || '').trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
        : (item.user || '??').substring(0, 2).toUpperCase();

      var timeStr = formatRelativeTime(item.date);

      if (item.type === 'comment') {
        el.innerHTML =
          '<div class="cd-act-avatar">' + escapeHtml(initials) + '</div>' +
          '<div class="cd-act-content">' +
            '<span class="cd-act-user">' + escapeHtml(item.user) + '</span>' +
            '<div class="cd-act-comment-text">' + escapeHtml(item.text) + '</div>' +
            '<span class="cd-act-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>';
      } else {
        el.innerHTML =
          '<div class="cd-act-avatar small">' + escapeHtml(initials) + '</div>' +
          '<div class="cd-act-content">' +
            '<span class="cd-act-user">' + escapeHtml(item.user) + '</span> ' +
            '<span class="cd-act-action">' + escapeHtml(item.text) + '</span>' +
            '<span class="cd-act-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>';
      }
      cdActivityList.appendChild(el);
    });
  }

  function formatRelativeTime(dateStr) {
    var now = new Date();
    var date = new Date(dateStr);
    var diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return Math.floor(diff / 60) + ' min atrás';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h atrás';
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Fechar modal
  cdClose.addEventListener('click', function() {
    cdOverlay.classList.remove('active');
    currentDetailCardId = null;
  });
  cdOverlay.addEventListener('click', function(e) {
    if (e.target === cdOverlay) {
      cdOverlay.classList.remove('active');
      currentDetailCardId = null;
    }
  });

  // Marcar como concluído
  cdDoneBtn.addEventListener('click', function() {
    if (!currentDetailCardId) return;
    api('PATCH', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/done').then(function(data) {
      if (data.ok) {
        updateDoneBtn(data.done);
        loadFromServer();
      }
    });
  });

  // Mover para outra coluna
  cdColSelect.addEventListener('change', function() {
    if (!currentDetailCardId) return;
    api('PATCH', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/fields', { col: cdColSelect.value }).then(function() {
      loadFromServer();
      // Recarrega atividade
      api('GET', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/detail').then(function(data) {
        if (data.ok) renderCardActivity(data.comments, data.activity);
      });
    });
  });

  // Salvar campos
  cdSaveFields.addEventListener('click', function() {
    if (!currentDetailCardId) return;
    var body = {
      name: cdNome.value.trim(),
      telefone: cdTelefone.value.trim(),
      empresa: cdEmpresa.value.trim(),
      tipo_exame: cdTipoExame.value.trim(),
      funcao: cdFuncao.value.trim(),
      hora_chegada: cdChegada.value.trim(),
      hora_saida: cdSaida.value.trim()
    };
    // Salvar título customizado se editado
    var titleParts = cdTitle.value.split(' – ');
    if (titleParts.length >= 2) {
      body.name = titleParts.slice(1).join(' – ').trim();
      cdNome.value = body.name;
    }
    api('PATCH', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/fields', body).then(function(data) {
      if (data.ok) {
        cdSaveFields.textContent = '✓ Salvo!';
        setTimeout(function() { cdSaveFields.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Salvar alterações'; }, 1500);
        cdTitle.value = cdTitle.value.split(' – ')[0] + ' – ' + cdNome.value.trim();
        loadFromServer();
        // Recarrega atividade
        api('GET', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/detail').then(function(d) {
          if (d.ok) renderCardActivity(d.comments, d.activity);
        });
      }
    });
  });

  // Enviar comentário
  function sendComment() {
    var text = cdCommentInput.value.trim();
    if (!text || !currentDetailCardId) return;
    api('POST', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/comments', { text: text }).then(function(data) {
      if (data.ok) {
        cdCommentInput.value = '';
        // Recarrega
        api('GET', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/detail').then(function(d) {
          if (d.ok) renderCardActivity(d.comments, d.activity);
        });
      }
    });
  }
  cdCommentSend.addEventListener('click', sendComment);
  cdCommentInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendComment();
  });

  // Toggle detalhes de atividade
  cdToggleDetails.addEventListener('click', function() {
    showActivityDetails = !showActivityDetails;
    cdToggleDetails.textContent = showActivityDetails ? 'Ocultar Detalhes' : 'Mostrar Detalhes';
    if (currentDetailCardId) {
      api('GET', '/api/cards/' + encodeURIComponent(currentDetailCardId) + '/detail').then(function(data) {
        if (data.ok) renderCardActivity(data.comments, data.activity);
      });
    }
  });

  /* ===== HISTÓRICO DE CONCLUÍDOS ===== */
  var historyOverlay = document.getElementById('historyOverlay');
  var historyClose = document.getElementById('historyClose');
  var historyBody = document.getElementById('historyBody');
  var navHistory = document.getElementById('navHistory');

  navHistory.addEventListener('click', function() {
    historyOverlay.classList.add('active');
    loadHistory();
  });
  historyClose.addEventListener('click', function() {
    historyOverlay.classList.remove('active');
  });
  historyOverlay.addEventListener('click', function(e) {
    if (e.target === historyOverlay) historyOverlay.classList.remove('active');
  });

  function loadHistory() {
    historyBody.innerHTML = '<div class="cd-empty">Carregando...</div>';
    api('GET', '/api/history/completed').then(function(data) {
      if (!data.ok) return;
      historyBody.innerHTML = '';
      var days = Object.keys(data.history);
      if (days.length === 0) {
        historyBody.innerHTML = '<div class="cd-empty">Nenhum cartão concluído ainda</div>';
        return;
      }
      days.forEach(function(day) {
        var dayEl = document.createElement('div');
        dayEl.className = 'history-day';
        var dateObj = new Date(day + 'T12:00:00');
        var dayLabel = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        dayEl.innerHTML = '<h4 class="history-day-title">' + escapeHtml(dayLabel) + ' <span class="history-count">' + data.history[day].length + ' concluído(s)</span></h4>';
        var list = document.createElement('div');
        list.className = 'history-day-list';
        data.history[day].forEach(function(c) {
          var item = document.createElement('div');
          item.className = 'history-item';
          item.innerHTML =
            '<span class="card-avatar" style="background:' + (c.avatar_color || '#579DFF') + ';width:28px;height:28px;font-size:.7rem;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700">' + escapeHtml(c.avatar || '??') + '</span>' +
            '<span class="history-item-name">' + escapeHtml(pad2(c.num) + ' – ' + c.name) + '</span>' +
            '<span class="history-item-col">' + escapeHtml(colName(c.col)) + '</span>' +
            '<span class="history-item-time">' + new Date(c.done_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>';
          list.appendChild(item);
        });
        dayEl.appendChild(list);
        historyBody.appendChild(dayEl);
      });
    });
  }

  function colName(colId) {
    for (var i = 0; i < COLUMNS.length; i++) {
      if (COLUMNS[i].id === colId) return COLUMNS[i].title;
    }
    return colId;
  }

  /* ===== DASHBOARD ===== */
  var dashOverlay = document.getElementById('dashOverlay');
  var dashClose = document.getElementById('dashClose');
  var btnDashboard = document.getElementById('btnDashboard');

  var DASH_COLORS = ['#579DFF', '#61bd4f', '#f5cd47', '#eb5a46', '#c377e0', '#ff8ed4', '#00c2e0', '#51e898'];

  var COL_NAMES = {
    normal: 'Senha Normal',
    preferencial: 'Preferencial',
    autorizacao: 'Aguard. Autorização',
    medico: 'Atend. Médico',
    finalizado: 'Finalizado'
  };

  if (btnDashboard) {
    btnDashboard.addEventListener('click', function() {
      dashOverlay.classList.add('active');
      loadDashboard();
    });
  }
  if (dashClose) {
    dashClose.addEventListener('click', function() {
      dashOverlay.classList.remove('active');
    });
  }
  if (dashOverlay) {
    dashOverlay.addEventListener('click', function(e) {
      if (e.target === dashOverlay) dashOverlay.classList.remove('active');
    });
  }

  // Tabs do dashboard
  var dashTabs = document.querySelectorAll('.dash-tab[data-dtab]');
  dashTabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      dashTabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.dash-tab-content').forEach(function(c) { c.classList.remove('active'); });
      var target = document.getElementById('dtab' + capitalize(tab.dataset.dtab));
      if (target) target.classList.add('active');
    });
  });

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function loadDashboard() {
    api('GET', '/api/stats/dashboard').then(function(data) {
      if (!data.ok) return;

      // Stat cards
      document.getElementById('dashTotal').textContent = data.totalCards;
      document.getElementById('dashPending').textContent = data.totalPending;
      document.getElementById('dashDone').textContent = data.totalDone;
      document.getElementById('dashToday').textContent = data.doneToday;

      // Barras por coluna
      var colBars = document.getElementById('dashColBars');
      colBars.innerHTML = '';
      var maxCol = 0;
      var colEntries = Object.keys(data.colCounts).filter(function(k) { return k !== 'modelo'; });
      colEntries.forEach(function(k) { if (data.colCounts[k] > maxCol) maxCol = data.colCounts[k]; });
      colEntries.forEach(function(k, i) {
        var pct = maxCol > 0 ? (data.colCounts[k] / maxCol * 100) : 0;
        var color = DASH_COLORS[i % DASH_COLORS.length];
        var label = COL_NAMES[k] || k;
        colBars.innerHTML +=
          '<div class="dash-bar-row">' +
            '<span class="dash-bar-label">' + escapeHtml(label) + '</span>' +
            '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '<span class="dash-bar-value">' + data.colCounts[k] + '</span>' +
          '</div>';
      });
      if (colEntries.length === 0) colBars.innerHTML = '<div class="cd-empty">Nenhum dado</div>';

      // Barras por tipo de exame
      var exameBars = document.getElementById('dashExameBars');
      exameBars.innerHTML = '';
      var maxExame = 0;
      data.byExame.forEach(function(e) { if (e.count > maxExame) maxExame = e.count; });
      data.byExame.forEach(function(e, i) {
        var pct = maxExame > 0 ? (e.count / maxExame * 100) : 0;
        var color = DASH_COLORS[(i + 2) % DASH_COLORS.length];
        exameBars.innerHTML +=
          '<div class="dash-bar-row">' +
            '<span class="dash-bar-label">' + escapeHtml(e.tipo_exame) + '</span>' +
            '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '<span class="dash-bar-value">' + e.count + '</span>' +
          '</div>';
      });
      if (data.byExame.length === 0) exameBars.innerHTML = '<div class="cd-empty">Nenhum tipo de exame registrado</div>';

      // Barras por usuário
      var userBars = document.getElementById('dashUserBars');
      userBars.innerHTML = '';
      var maxUser = 0;
      data.activityByUser.forEach(function(u) { if (u.count > maxUser) maxUser = u.count; });
      data.activityByUser.forEach(function(u, i) {
        var pct = maxUser > 0 ? (u.count / maxUser * 100) : 0;
        var color = DASH_COLORS[(i + 1) % DASH_COLORS.length];
        userBars.innerHTML +=
          '<div class="dash-bar-row">' +
            '<span class="dash-bar-label">' + escapeHtml(u.user_name) + '</span>' +
            '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '<span class="dash-bar-value">' + u.count + ' ações</span>' +
          '</div>';
      });
      if (data.activityByUser.length === 0) userBars.innerHTML = '<div class="cd-empty">Nenhuma atividade</div>';

      // Histórico de atividades recentes
      var actList = document.getElementById('dashActivityList');
      actList.innerHTML = '';
      if (data.recentActivity.length === 0) {
        actList.innerHTML = '<div class="cd-empty">Nenhuma atividade ainda</div>';
        return;
      }
      data.recentActivity.forEach(function(a) {
        var initials = (a.user_name || '').trim().split(/\s+/).length >= 2
          ? ((a.user_name || '').trim().split(/\s+/)[0][0] + (a.user_name || '').trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
          : (a.user_name || '??').substring(0, 2).toUpperCase();
        var color = DASH_COLORS[Math.abs(hashCode(a.user_name || '')) % DASH_COLORS.length];
        var timeStr = formatRelativeTime(a.created_at);
        var item = document.createElement('div');
        item.className = 'dash-act-item';
        item.innerHTML =
          '<div class="dash-act-avatar" style="background:' + color + '">' + escapeHtml(initials) + '</div>' +
          '<div class="dash-act-content">' +
            '<span class="dash-act-user">' + escapeHtml(a.user_name) + '</span> ' +
            '<span class="dash-act-action">' + escapeHtml(a.action) + '</span>' +
            (a.card_name ? ' <span class="dash-act-card">"' + escapeHtml(a.card_name) + '"</span>' : '') +
            '<span class="dash-act-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>';
        actList.appendChild(item);
      });
    });
  }

  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

})();
