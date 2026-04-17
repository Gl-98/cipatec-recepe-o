(function () {
  "use strict";

  /* ===== PARTÍCULAS FLUTUANTES ===== */
  var particlesEl = document.getElementById('particles');
  for (var i = 0; i < 30; i++) {
    var p = document.createElement('div');
    p.className = 'particle';
    var size = Math.random() * 4 + 2;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 12 + 8) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.opacity = Math.random() * 0.4 + 0.1;
    var colors = [
      'rgba(87,157,255,.3)', 'rgba(195,119,224,.25)',
      'rgba(97,189,79,.25)', 'rgba(242,214,0,.2)'
    ];
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    particlesEl.appendChild(p);
  }

  /* ===== ABAS ===== */
  var tabs = document.querySelectorAll('.auth-tab');
  var formLogin = document.getElementById('formLogin');
  var formRegister = document.getElementById('formRegister');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');

      if (tab.dataset.tab === 'login') {
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
      } else {
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
      }
      clearErrors();
    });
  });

  /* ===== TOGGLE PASSWORD ===== */
  document.querySelectorAll('.toggle-pass').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      var isPass = inp.type === 'password';
      inp.type = isPass ? 'text' : 'password';
      // troca ícone
      btn.innerHTML = isPass
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });

  /* ===== PASSWORD STRENGTH ===== */
  var regSenha = document.getElementById('regSenha');
  var strengthFill = document.getElementById('strengthFill');
  var strengthLabel = document.getElementById('strengthLabel');

  regSenha.addEventListener('input', function () {
    var val = regSenha.value;
    var score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    var percent, color, label;
    if (val.length === 0) {
      percent = 0; color = 'transparent'; label = '';
    } else if (score <= 1) {
      percent = 20; color = '#eb5a46'; label = 'Fraca';
    } else if (score <= 2) {
      percent = 40; color = '#F2D600'; label = 'Razoável';
    } else if (score <= 3) {
      percent = 65; color = '#579DFF'; label = 'Boa';
    } else {
      percent = 100; color = '#61BD4F'; label = 'Forte';
    }
    strengthFill.style.width = percent + '%';
    strengthFill.style.background = color;
    strengthLabel.style.color = color;
    strengthLabel.textContent = label;
  });

  /* ===== API HELPER ===== */
  function api(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function showError(elId, msg, isSuccess) {
    var el = document.getElementById(elId);
    el.textContent = msg;
    el.classList.add('show');
    if (isSuccess) el.classList.add('success');
    else el.classList.remove('success');
  }

  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(function (el) {
      el.textContent = '';
      el.classList.remove('show', 'success');
    });
  }

  function setLoading(btn, loading) {
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
  }

  /* ===== LOGIN ===== */
  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var email = document.getElementById('loginEmail').value.trim();
    var senha = document.getElementById('loginSenha').value;
    var btn = formLogin.querySelector('.btn-submit');

    if (!email || !senha) {
      showError('loginError', 'Preencha todos os campos.');
      return;
    }

    setLoading(btn, true);

    api('POST', '/api/auth/login', { email: email, password: senha })
      .then(function (data) {
        setLoading(btn, false);
        if (data.ok) {
          window.location.href = '/index.html';
        } else {
          showError('loginError', data.error || 'Credenciais inválidas.');
        }
      })
      .catch(function () {
        setLoading(btn, false);
        showError('loginError', 'Erro de conexão. Tente novamente.');
      });
  });

  /* ===== REGISTRO ===== */
  formRegister.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var nome = document.getElementById('regNome').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var senha = document.getElementById('regSenha').value;
    var senha2 = document.getElementById('regSenha2').value;
    var btn = formRegister.querySelector('.btn-submit');

    if (!nome || !email || !senha || !senha2) {
      showError('registerError', 'Preencha todos os campos.');
      return;
    }
    if (senha.length < 6) {
      showError('registerError', 'A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (senha !== senha2) {
      showError('registerError', 'As senhas não coincidem.');
      return;
    }

    setLoading(btn, true);

    api('POST', '/api/auth/register', { name: nome, email: email, password: senha })
      .then(function (data) {
        setLoading(btn, false);
        if (data.ok) {
          showError('registerError', 'Conta criada com sucesso! Redirecionando…', true);
          setTimeout(function () {
            window.location.href = '/index.html';
          }, 1200);
        } else {
          showError('registerError', data.error || 'Erro ao criar conta.');
        }
      })
      .catch(function () {
        setLoading(btn, false);
        showError('registerError', 'Erro de conexão. Tente novamente.');
      });
  });

  /* ===== SOCIAL LOGIN (redireciona para rota OAuth) ===== */
  document.getElementById('btnGoogle').addEventListener('click', function () {
    window.location.href = '/api/auth/google';
  });
  document.getElementById('btnMicrosoft').addEventListener('click', function () {
    window.location.href = '/api/auth/microsoft';
  });
  document.getElementById('btnGithub').addEventListener('click', function () {
    window.location.href = '/api/auth/github';
  });

})();
