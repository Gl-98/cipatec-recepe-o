require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const crypto = require('crypto');
const https = require('https');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== BANCO DE DADOS ===== */
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Cria tabelas se não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    provider TEXT DEFAULT 'local',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    col TEXT NOT NULL,
    num INTEGER NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    avatar TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    fixed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_columns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    card_name TEXT,
    from_col TEXT,
    to_col TEXT,
    actor_name TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS calendar_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires TEXT,
    cal_email TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS planner_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT DEFAULT '09:00',
    end_time TEXT DEFAULT '10:00',
    color TEXT DEFAULT '#579DFF',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Tabelas para modal detalhado do cartão
db.exec(`
  CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS card_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );
`);

// Tabela de emails bloqueados (contas deletadas, para impedir recriação via OAuth)
db.exec(`
  CREATE TABLE IF NOT EXISTS deleted_emails (
    email TEXT PRIMARY KEY,
    deleted_at TEXT DEFAULT (datetime('now'))
  );
`);

// Adiciona colunas extras na tabela cards (ignora se já existem)
const cardCols = db.prepare("PRAGMA table_info(cards)").all().map(c => c.name);
if (!cardCols.includes('description')) db.exec("ALTER TABLE cards ADD COLUMN description TEXT DEFAULT ''");
if (!cardCols.includes('telefone'))    db.exec("ALTER TABLE cards ADD COLUMN telefone TEXT DEFAULT ''");
if (!cardCols.includes('empresa'))     db.exec("ALTER TABLE cards ADD COLUMN empresa TEXT DEFAULT ''");
if (!cardCols.includes('tipo_exame'))  db.exec("ALTER TABLE cards ADD COLUMN tipo_exame TEXT DEFAULT ''");
if (!cardCols.includes('funcao'))      db.exec("ALTER TABLE cards ADD COLUMN funcao TEXT DEFAULT ''");
if (!cardCols.includes('done_at'))     db.exec("ALTER TABLE cards ADD COLUMN done_at TEXT DEFAULT NULL");
if (!cardCols.includes('hora_chegada')) db.exec("ALTER TABLE cards ADD COLUMN hora_chegada TEXT DEFAULT ''");
if (!cardCols.includes('hora_saida'))   db.exec("ALTER TABLE cards ADD COLUMN hora_saida TEXT DEFAULT ''");
if (!cardCols.includes('senha'))        db.exec("ALTER TABLE cards ADD COLUMN senha TEXT DEFAULT ''");

// Inicializa sequência se não existir
const seqRow = db.prepare('SELECT value FROM config WHERE key = ?').get('next_seq');
if (!seqRow) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('next_seq', '1');
}
// Sequências separadas por tipo
if (!db.prepare('SELECT value FROM config WHERE key = ?').get('next_seq_p')) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('next_seq_p', '1');
}
if (!db.prepare('SELECT value FROM config WHERE key = ?').get('next_seq_a')) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('next_seq_a', '1');
}
if (!db.prepare('SELECT value FROM config WHERE key = ?').get('next_seq_t')) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('next_seq_t', '1');
}

// Insere cartão modelo se não existir
const modelo = db.prepare('SELECT id FROM cards WHERE id = ?').get('modelo-fixo');
if (!modelo) {
  db.prepare(`
    INSERT INTO cards (id, col, num, name, date, avatar, avatar_color, done, fixed, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('modelo-fixo', 'modelo', 0, 'MODELO', '--/--', 'MD', '#579DFF', 0, 1, 0);
}

/* ===== MIDDLEWARE ===== */
app.set('trust proxy', 1);
app.use(express.json());

// Sessão
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const isProduction = !!process.env.BASE_URL;
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
  done(null, user || null);
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.includes('COLE_SEU')) {
  var googleCallbackURL = process.env.BASE_URL
    ? process.env.BASE_URL + '/api/auth/google/callback'
    : '/api/auth/google/callback';
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleCallbackURL
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
    if (!email) return done(null, false);

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Cria conta automática com senha aleatória
      const hash = bcrypt.hashSync(crypto.randomBytes(20).toString('hex'), 10);
      const result = db.prepare(
        'INSERT INTO users (name, email, password_hash, provider) VALUES (?, ?, ?, ?)'
      ).run(profile.displayName || email.split('@')[0], email, hash, 'google');
      user = { id: result.lastInsertRowid, name: profile.displayName, email };
    }
    done(null, user);
  }));
  console.log('✔ Google OAuth configurado');
} else {
  console.log('⚠ Google OAuth não configurado (preencha .env)');
}

// Microsoft OAuth Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET &&
    !process.env.MICROSOFT_CLIENT_ID.includes('COLE_SEU')) {
  var msCallbackURL = process.env.BASE_URL
    ? process.env.BASE_URL + '/api/auth/microsoft/callback'
    : '/api/auth/microsoft/callback';
  passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: msCallbackURL,
    scope: ['user.read']
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
    if (!email) return done(null, false);

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const hash = bcrypt.hashSync(crypto.randomBytes(20).toString('hex'), 10);
      const result = db.prepare(
        'INSERT INTO users (name, email, password_hash, provider) VALUES (?, ?, ?, ?)'
      ).run(profile.displayName || email.split('@')[0], email, hash, 'microsoft');
      user = { id: result.lastInsertRowid, name: profile.displayName, email };
    }
    done(null, user);
  }));
  console.log('✔ Microsoft OAuth configurado');
} else {
  console.log('⚠ Microsoft OAuth não configurado (preencha .env)');
}

// Arquivos públicos (login)
app.use('/img', express.static(path.join(__dirname, 'img')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.css', (req, res) => res.sendFile(path.join(__dirname, 'login.css')));
app.get('/login.js', (req, res) => res.sendFile(path.join(__dirname, 'login.js')));

// Redirect raiz para login ou board
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/index.html');
  }
  res.redirect('/login.html');
});

// Protege board — exige autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  // Se for pedido de página HTML, redireciona
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.redirect('/login.html');
  }
  return res.status(401).json({ error: 'Não autenticado' });
}

// Protege index.html, style.css, script.js
app.get('/index.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/script.js', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

/* ===== ROTAS DE AUTENTICAÇÃO ===== */

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
  }

  // Normaliza email
  const emailLower = email.toLowerCase().trim();

  // Verifica se já existe
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
  if (existing) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, provider) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), emailLower, hash, 'local');

  // Loga automaticamente após registrar
  req.session.userId = result.lastInsertRowid;
  req.session.userName = name.trim();

  res.json({ ok: true });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  const emailLower = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailLower);

  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;

  res.json({ ok: true, user: { id: user.id, name: user.name } });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /api/users — lista todos os membros (avatar via Gravatar)
app.get('/api/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, email FROM users ORDER BY created_at ASC').all();
  const members = users.map(u => {
    const hash = crypto.createHash('md5').update(u.email.trim().toLowerCase()).digest('hex');
    const initials = u.name.trim().split(/\s+/).length >= 2
      ? (u.name.trim().split(/\s+/)[0][0] + u.name.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
      : u.name.substring(0, 2).toUpperCase();
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      gravatar: 'https://www.gravatar.com/avatar/' + hash + '?s=80&d=404',
      initials
    };
  });
  res.json({ ok: true, members });
});

// DELETE /api/users/:id — remove conta de um membro
app.delete('/api/users/:id', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'ID inválido' });

  const target = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Remove o usuário
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  // Notificação
  const actorName = req.session.userName || 'Alguém';
  notify('member_removed', actorName + ' removeu o membro "' + target.name + '"', { actorName });

  // Se o usuário deletou a própria conta, encerra a sessão
  const isSelf = req.session.userId === targetId;
  if (isSelf) {
    return req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true, logout: true });
    });
  }

  res.json({ ok: true });
});

// GET /api/auth/me — retorna dados do usuário logado
app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  res.json({ ok: true, user });
});

// Google OAuth rotas
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=google' }),
  (req, res) => {
    if (!req.user) return res.redirect('/login.html?error=google');
    req.session.userId = req.user.id;
    req.session.userName = req.user.name;
    req.session.save(function() {
      res.redirect('/index.html');
    });
  }
);

// Microsoft OAuth rotas
app.get('/api/auth/microsoft',
  passport.authenticate('microsoft', { prompt: 'select_account' })
);
app.get('/api/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/login.html?error=microsoft' }),
  (req, res) => {
    if (!req.user) return res.redirect('/login.html?error=microsoft');
    req.session.userId = req.user.id;
    req.session.userName = req.user.name;
    req.session.save(function() {
      res.redirect('/index.html');
    });
  }
);
app.get('/api/auth/github', (req, res) => {
  res.redirect('/login.html?social=github');
});

/* ===== ROTAS DA API (protegidas) ===== */

// Helper: cria notificação
function notify(type, message, opts = {}) {
  db.prepare(
    'INSERT INTO notifications (type, message, card_name, from_col, to_col, actor_name) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(type, message, opts.cardName || null, opts.fromCol || null, opts.toCol || null, opts.actorName || null);
}

// Mapa de nomes de colunas
function colName(colId) {
  const map = {
    modelo: 'Modelo', normal: 'Senha Normal', preferencial: 'Senha Preferencial',
    autorizacao: 'Aguardo Autorização', medico: 'Atendimento Médico', finalizado: 'Finalizado'
  };
  if (map[colId]) return map[colId];
  const custom = db.prepare('SELECT title FROM custom_columns WHERE id = ?').get(colId);
  return custom ? custom.title : colId;
}

// GET /api/cards — retorna todos os cartões agrupados por coluna
app.get('/api/cards', requireAuth, (req, res) => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY sort_order ASC').all();
  const nextSeq = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('next_seq').value);
  const customCols = db.prepare('SELECT * FROM custom_columns ORDER BY sort_order ASC').all();

  // Colunas padrão
  const columns = {
    modelo: [], normal: [], preferencial: [],
    autorizacao: [], medico: [], finalizado: []
  };
  // Inclui colunas customizadas
  customCols.forEach(cc => {
    columns[cc.id] = [];
  });

  cards.forEach(c => {
    const card = {
      id: c.id,
      num: c.num,
      senha: c.senha || '',
      name: c.name,
      date: c.date,
      avatar: c.avatar,
      avatarColor: c.avatar_color,
      done: c.done === 1,
      fixed: c.fixed === 1
    };
    if (columns[c.col]) columns[c.col].push(card);
  });

  res.json({ nextSeq, cards: columns, customColumns: customCols });
});

// POST /api/cards — adiciona um cartão
app.post('/api/cards', requireAuth, (req, res) => {
  const { id, col, num, name, date, avatar, avatarColor } = req.body;

  if (!id || !col || !name) {
    return res.status(400).json({ error: 'Campos obrigatórios: id, col, name' });
  }

  // Gera senha automática baseada no tipo
  let senhaPrefix = 'P';
  let seqKey = 'next_seq_p';
  if (col === 'preferencial') {
    senhaPrefix = 'A';
    seqKey = 'next_seq_a';
  } else if (col === 'autorizacao') {
    senhaPrefix = 'T';
    seqKey = 'next_seq_t';
  }
  const seqVal = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get(seqKey).value);
  const senha = senhaPrefix + seqVal;

  // Pega próxima ordem para a coluna
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM cards WHERE col = ?').get(col).m;

  db.prepare(`
    INSERT INTO cards (id, col, num, name, date, avatar, avatar_color, done, fixed, sort_order, senha)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(id, col, num, name, date, avatar, avatarColor, maxOrder + 1, senha);

  // Atualiza sequências
  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(String(num + 1), 'next_seq');
  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(String(seqVal + 1), seqKey);

  // Notificação
  const actorName = req.session.userName || 'Alguém';
  notify('card_created', actorName + ' criou o cartão "' + name + '" (' + senha + ') em ' + colName(col), { cardName: name, toCol: col, actorName });

  res.json({ ok: true, senha });
});

// PATCH /api/cards/:id/move — move cartão para outra coluna
app.patch('/api/cards/:id/move', requireAuth, (req, res) => {
  const { col, sortOrder } = req.body;
  const cardId = req.params.id;

  if (!col) {
    return res.status(400).json({ error: 'Coluna de destino obrigatória' });
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

  let order;
  if (sortOrder != null) {
    order = sortOrder;
  } else {
    // Calcula posição correta baseada no número da senha (num)
    // Encontra a posição onde este cartão deveria ficar para manter a ordem numérica
    const cardsInDestCol = db.prepare('SELECT id, num, sort_order FROM cards WHERE col = ? ORDER BY sort_order ASC').all(col);
    order = cardsInDestCol.length; // por padrão, vai no final
    for (let i = 0; i < cardsInDestCol.length; i++) {
      if (card.num < cardsInDestCol[i].num) {
        order = i;
        break;
      }
    }
  }

  const moveTransaction = db.transaction(() => {
    // Abre espaço na coluna destino
    db.prepare('UPDATE cards SET sort_order = sort_order + 1 WHERE col = ? AND sort_order >= ?').run(col, order);
    // Move o cartão
    db.prepare('UPDATE cards SET col = ?, sort_order = ? WHERE id = ?').run(col, order, cardId);
    // Recompacta sort_order da coluna destino para evitar buracos
    const reordered = db.prepare('SELECT id FROM cards WHERE col = ? ORDER BY sort_order ASC').all(col);
    reordered.forEach((c, idx) => {
      db.prepare('UPDATE cards SET sort_order = ? WHERE id = ?').run(idx, c.id);
    });
  });
  moveTransaction();

  // Notificação
  const actorName = req.session.userName || 'Alguém';
  notify('card_moved', actorName + ' moveu "' + card.name + '" de ' + colName(card.col) + ' para ' + colName(col), { cardName: card.name, fromCol: card.col, toCol: col, actorName });

  res.json({ ok: true });
});

// PATCH /api/cards/:id/done — alterna status concluído
app.patch('/api/cards/:id/done', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

  const newDone = card.done === 1 ? 0 : 1;
  const doneAt = newDone === 1 ? new Date().toISOString() : null;
  db.prepare('UPDATE cards SET done = ?, done_at = ? WHERE id = ?').run(newDone, doneAt, req.params.id);

  // Log de atividade
  const actorDone = req.session.userName || 'Alguém';
  db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(
    req.params.id, actorDone, newDone === 1 ? 'marcou como concluído' : 'desmarcou como concluído'
  );

  // Notificação
  const doneMsg = newDone === 1
    ? actorDone + ' marcou "' + card.name + '" como concluído'
    : actorDone + ' desmarcou "' + card.name + '" como concluído';
  notify('card_done', doneMsg, { cardName: card.name, actorName: actorDone });

  res.json({ ok: true, done: newDone === 1 });
});

// DELETE /api/cards/:id — remove cartão
app.delete('/api/cards/:id', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
  if (card.id === 'modelo-fixo') return res.status(403).json({ error: 'O cartão modelo não pode ser removido' });

  // Remove comentários e atividades relacionados
  db.prepare('DELETE FROM card_comments WHERE card_id = ?').run(req.params.id);
  db.prepare('DELETE FROM card_activity WHERE card_id = ?').run(req.params.id);
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);

  // Notificação
  const actorDel = req.session.userName || 'Alguém';
  notify('card_deleted', actorDel + ' removeu o cartão "' + card.name + '"', { cardName: card.name, actorName: actorDel });

  res.json({ ok: true });
});

// DELETE /api/cards/by-name/:name — remove TODOS os cartões de uma pessoa pelo nome
app.delete('/api/cards/by-name/:name', requireAuth, (req, res) => {
  const name = decodeURIComponent(req.params.name).toUpperCase().trim();
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const cards = db.prepare("SELECT id FROM cards WHERE UPPER(name) = ? AND fixed = 0").all(name);
  if (cards.length === 0) return res.status(404).json({ error: 'Nenhum cartão encontrado' });

  const deleteAll = db.transaction(() => {
    cards.forEach(c => {
      db.prepare('DELETE FROM card_comments WHERE card_id = ?').run(c.id);
      db.prepare('DELETE FROM card_activity WHERE card_id = ?').run(c.id);
      db.prepare('DELETE FROM cards WHERE id = ?').run(c.id);
    });
  });
  deleteAll();

  const actorDel = req.session.userName || 'Alguém';
  notify('card_deleted', actorDel + ' apagou todos os registros de "' + name + '" (' + cards.length + ')', { cardName: name, actorName: actorDel });

  res.json({ ok: true, deleted: cards.length });
});

// PATCH /api/cards/:id/finalize — finaliza cartão (move para coluna finalizado e marca concluído)
app.patch('/api/cards/:id/finalize', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
  if (card.id === 'modelo-fixo') return res.status(403).json({ error: 'O cartão modelo não pode ser finalizado' });

  const now = new Date();
  const doneAt = now.toISOString();
  const horaSaida = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM cards WHERE col = ?').get('finalizado').m;

  db.prepare('UPDATE cards SET col = ?, done = 1, done_at = ?, hora_saida = ?, sort_order = ? WHERE id = ?')
    .run('finalizado', doneAt, horaSaida, maxOrder + 1, req.params.id);

  // Log de atividade
  const actorName = req.session.userName || 'Alguém';
  db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(
    req.params.id, actorName, 'finalizou o cartão'
  );

  notify('card_moved', actorName + ' finalizou "' + card.name + '"', { cardName: card.name, fromCol: card.col, toCol: 'finalizado', actorName });

  res.json({ ok: true });
});

// PUT /api/cards/reorder — reordena todos os cartões de uma coluna
app.put('/api/cards/reorder', requireAuth, (req, res) => {
  const { col, cardIds } = req.body;

  if (!col || !Array.isArray(cardIds)) {
    return res.status(400).json({ error: 'col e cardIds obrigatórios' });
  }

  const reorderTransaction = db.transaction(() => {
    cardIds.forEach((id, index) => {
      db.prepare('UPDATE cards SET col = ?, sort_order = ? WHERE id = ?').run(col, index, id);
    });
  });
  reorderTransaction();

  res.json({ ok: true });
});

// GET /api/cards/:id/detail — retorna detalhes completos do cartão
app.get('/api/cards/:id/detail', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
  const comments = db.prepare('SELECT * FROM card_comments WHERE card_id = ? ORDER BY created_at DESC').all(req.params.id);
  const activity = db.prepare('SELECT * FROM card_activity WHERE card_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ ok: true, card, comments, activity });
});

// PATCH /api/cards/:id/fields — atualiza campos do cartão
app.patch('/api/cards/:id/fields', requireAuth, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

  const allowed = ['name', 'description', 'telefone', 'empresa', 'tipo_exame', 'funcao', 'col', 'hora_chegada', 'hora_saida'];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(key + ' = ?');
      vals.push(req.body[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  vals.push(req.params.id);
  db.prepare('UPDATE cards SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);

  // Log de atividade
  const actor = req.session.userName || 'Alguém';
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.includes('col')) {
    const newCol = req.body.col;
    db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(
      req.params.id, actor, 'moveu o cartão para ' + colName(newCol)
    );
    notify('card_moved', actor + ' moveu "' + card.name + '" para ' + colName(newCol), { cardName: card.name, fromCol: card.col, toCol: newCol, actorName: actor });
  } else {
    db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(
      req.params.id, actor, 'atualizou ' + fields.join(', ')
    );
  }
  res.json({ ok: true });
});

// POST /api/cards/:id/comments — adiciona comentário
app.post('/api/cards/:id/comments', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Texto obrigatório' });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

  const userName = req.session.userName || 'Alguém';
  const userId = req.session.userId || 0;
  db.prepare('INSERT INTO card_comments (card_id, user_id, user_name, text) VALUES (?, ?, ?, ?)').run(req.params.id, userId, userName, text.trim());
  db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(req.params.id, userName, 'adicionou um comentário');
  res.json({ ok: true });
});

// GET /api/cards/search/history — busca histórico de pessoas pelo nome
app.get('/api/cards/search/history', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json({ ok: true, results: [] });

  // Busca todos os cartões cujo nome contém o termo (case-insensitive)
  const cards = db.prepare(
    `SELECT id, col, num, name, date, tipo_exame, empresa, funcao, telefone,
            hora_chegada, hora_saida, senha, done, done_at, avatar, avatar_color
     FROM cards
     WHERE name LIKE ? AND col != 'modelo'
     ORDER BY ROWID DESC
     LIMIT 30`
  ).all('%' + q + '%');

  res.json({ ok: true, results: cards });
});

// GET /api/stats/dashboard — estatísticas do dashboard
app.get('/api/stats/dashboard', requireAuth, (req, res) => {
  // Cards por coluna
  const cardsByCol = db.prepare("SELECT col, COUNT(*) as count FROM cards WHERE fixed = 0 GROUP BY col").all();
  const colCounts = {};
  cardsByCol.forEach(r => { colCounts[r.col] = r.count; });

  // Total de cards ativos e concluídos
  const totalCards = db.prepare("SELECT COUNT(*) as c FROM cards WHERE fixed = 0").get().c;
  const totalDone = db.prepare("SELECT COUNT(*) as c FROM cards WHERE done = 1 AND fixed = 0").get().c;
  const totalPending = totalCards - totalDone;

  // Concluídos hoje
  const today = new Date().toISOString().substring(0, 10);
  const doneToday = db.prepare("SELECT COUNT(*) as c FROM cards WHERE done = 1 AND done_at LIKE ?").get(today + '%').c;

  // Por tipo de exame
  const byExame = db.prepare("SELECT tipo_exame, COUNT(*) as count FROM cards WHERE fixed = 0 AND tipo_exame != '' GROUP BY tipo_exame").all();

  // Atividades recentes (últimas 50)
  const recentActivity = db.prepare(`
    SELECT ca.user_name, ca.action, ca.created_at, c.name as card_name
    FROM card_activity ca
    LEFT JOIN cards c ON c.id = ca.card_id
    ORDER BY ca.created_at DESC LIMIT 50
  `).all();

  // Atividade por usuário (contagem)
  const activityByUser = db.prepare(`
    SELECT user_name, COUNT(*) as count
    FROM card_activity
    GROUP BY user_name
    ORDER BY count DESC
  `).all();

  res.json({
    ok: true,
    colCounts,
    totalCards,
    totalDone,
    totalPending,
    doneToday,
    byExame,
    recentActivity,
    activityByUser
  });
});

// GET /api/history/completed — histórico de concluídos agrupado por dia
app.get('/api/history/completed', requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM cards WHERE done = 1 AND done_at IS NOT NULL ORDER BY done_at DESC").all();
  const grouped = {};
  rows.forEach(c => {
    const day = c.done_at.substring(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push({ id: c.id, name: c.name, num: c.num, col: c.col, done_at: c.done_at, avatar: c.avatar, avatar_color: c.avatar_color });
  });
  res.json({ ok: true, history: grouped });
});

// POST /api/columns — cria coluna customizada
app.post('/api/columns', requireAuth, (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Título obrigatório' });
  }
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM custom_columns').get().m;
  db.prepare('INSERT INTO custom_columns (id, title, sort_order) VALUES (?, ?, ?)').run(id, title.trim().toUpperCase(), maxOrder + 1);
  res.json({ ok: true, column: { id, title: title.trim().toUpperCase(), sort_order: maxOrder + 1 } });
});

// DELETE /api/columns/:id — remove coluna customizada e seus cartões
app.delete('/api/columns/:id', requireAuth, (req, res) => {
  const colId = req.params.id;
  if (!colId.startsWith('custom_')) {
    return res.status(400).json({ error: 'Apenas colunas customizadas podem ser removidas' });
  }
  const col = db.prepare('SELECT * FROM custom_columns WHERE id = ?').get(colId);
  if (!col) return res.status(404).json({ error: 'Coluna não encontrada' });

  const deleteTransaction = db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE col = ? AND fixed = 0').run(colId);
    db.prepare('DELETE FROM custom_columns WHERE id = ?').run(colId);
  });
  deleteTransaction();

  res.json({ ok: true });
});

/* ===== ROTAS DE NOTIFICAÇÕES ===== */

// GET /api/notifications — lista notificações (mais recentes primeiro)
app.get('/api/notifications', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const notifications = db.prepare(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE read = 0').get().c;
  res.json({ ok: true, notifications, unreadCount });
});

// PATCH /api/notifications/read-all — marca todas como lidas
app.patch('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  res.json({ ok: true });
});

// DELETE /api/notifications/clear — limpa todas
app.delete('/api/notifications/clear', requireAuth, (req, res) => {
  db.prepare('DELETE FROM notifications').run();
  res.json({ ok: true });
});

/* ===== ROTAS DE MENSAGENS ===== */

// GET /api/messages/conversations — lista conversas do usuário logado
app.get('/api/messages/conversations', requireAuth, (req, res) => {
  const userId = req.session.userId;
  // Pega a última mensagem de cada conversa
  const convos = db.prepare(`
    SELECT m.*, 
      CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END as other_id,
      u.name as other_name, u.email as other_email
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END
    WHERE m.id IN (
      SELECT MAX(id) FROM messages 
      WHERE from_user_id = ? OR to_user_id = ?
      GROUP BY CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END
    )
    ORDER BY m.created_at DESC
  `).all(userId, userId, userId, userId, userId);

  // Conta não lidas por conversa
  const results = convos.map(c => {
    const unread = db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE from_user_id = ? AND to_user_id = ? AND read = 0'
    ).get(c.other_id, userId).cnt;
    return {
      userId: c.other_id,
      name: c.other_name,
      email: c.other_email,
      lastMessage: c.text,
      lastTime: c.created_at,
      unread
    };
  });

  const totalUnread = db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE to_user_id = ? AND read = 0'
  ).get(userId).cnt;

  res.json({ ok: true, conversations: results, totalUnread });
});

// GET /api/messages/:userId — pega mensagens com um usuário
app.get('/api/messages/:userId', requireAuth, (req, res) => {
  const myId = req.session.userId;
  const otherId = parseInt(req.params.userId);
  if (!otherId) return res.status(400).json({ error: 'userId inválido' });

  const messages = db.prepare(`
    SELECT m.*, u.name as from_name 
    FROM messages m
    JOIN users u ON u.id = m.from_user_id
    WHERE (m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?)
    ORDER BY m.created_at ASC
    LIMIT 200
  `).all(myId, otherId, otherId, myId);

  // Marca como lidas
  db.prepare(
    'UPDATE messages SET read = 1 WHERE from_user_id = ? AND to_user_id = ? AND read = 0'
  ).run(otherId, myId);

  res.json({ ok: true, messages });
});

// POST /api/messages — envia mensagem
app.post('/api/messages', requireAuth, (req, res) => {
  const fromId = req.session.userId;
  const { toUserId, text } = req.body;

  if (!toUserId || !text || !text.trim()) {
    return res.status(400).json({ error: 'toUserId e text obrigatórios' });
  }
  if (parseInt(toUserId) === fromId) {
    return res.status(400).json({ error: 'Não pode enviar mensagem para si mesmo' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(parseInt(toUserId));
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const result = db.prepare(
    'INSERT INTO messages (from_user_id, to_user_id, text) VALUES (?, ?, ?)'
  ).run(fromId, parseInt(toUserId), text.trim());

  res.json({ ok: true, id: result.lastInsertRowid });
});

// DELETE /api/messages/conversation/:userId — apaga toda a conversa com um usuário
app.delete('/api/messages/conversation/:userId', requireAuth, (req, res) => {
  const myId = req.session.userId;
  const otherId = parseInt(req.params.userId);
  if (!otherId) return res.status(400).json({ error: 'userId inválido' });

  db.prepare(
    'DELETE FROM messages WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)'
  ).run(myId, otherId, otherId, myId);

  res.json({ ok: true });
});

/* ===== PLANEJADOR & CALENDÁRIOS ===== */

// Helpers HTTP para OAuth e APIs externas
function httpPost(url, formData) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = new URLSearchParams(formData).toString();
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function httpGet(url, bearer) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET',
      headers: bearer ? { Authorization: 'Bearer ' + bearer } : {}
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

async function getValidToken(conn) {
  if (conn.token_expires && new Date(conn.token_expires) > new Date()) return conn.access_token;
  if (!conn.refresh_token) return null;
  try {
    let data;
    if (conn.provider === 'google') {
      data = await httpPost('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: conn.refresh_token, grant_type: 'refresh_token'
      });
    } else {
      data = await httpPost('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: process.env.MICROSOFT_CLIENT_ID, client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: conn.refresh_token, grant_type: 'refresh_token', scope: 'Calendars.Read offline_access'
      });
    }
    if (data.access_token) {
      const exp = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
      db.prepare('UPDATE calendar_connections SET access_token = ?, token_expires = ? WHERE id = ?')
        .run(data.access_token, exp, conn.id);
      if (data.refresh_token) {
        db.prepare('UPDATE calendar_connections SET refresh_token = ? WHERE id = ?').run(data.refresh_token, conn.id);
      }
      return data.access_token;
    }
  } catch (e) { console.error('Token refresh failed:', e.message); }
  return null;
}

// --- Planner Events CRUD ---
app.get('/api/planner/events', requireAuth, (req, res) => {
  const { start, end } = req.query;
  const userId = req.session.userId;
  const events = (start && end)
    ? db.prepare('SELECT * FROM planner_events WHERE user_id = ? AND event_date >= ? AND event_date <= ? ORDER BY start_time').all(userId, start, end)
    : db.prepare('SELECT * FROM planner_events WHERE user_id = ? ORDER BY event_date DESC LIMIT 100').all(userId);
  res.json({ ok: true, events });
});

app.post('/api/planner/events', requireAuth, (req, res) => {
  const { title, event_date, start_time, end_time, color } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Título e data obrigatórios' });
  const r = db.prepare('INSERT INTO planner_events (user_id,title,event_date,start_time,end_time,color) VALUES (?,?,?,?,?,?)')
    .run(req.session.userId, title.trim(), event_date, start_time || '09:00', end_time || '10:00', color || '#579DFF');
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/planner/events/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM planner_events WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Cards com data (para exibir no planejador)
app.get('/api/planner/cards', requireAuth, (req, res) => {
  const cards = db.prepare("SELECT * FROM cards WHERE date != '--/--' AND date != '' ORDER BY sort_order").all();
  res.json({ ok: true, cards });
});

// --- Calendar Connections ---
app.get('/api/calendar/connections', requireAuth, (req, res) => {
  const conns = db.prepare('SELECT id, provider, cal_email, created_at FROM calendar_connections WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, connections: conns });
});

app.delete('/api/calendar/connections/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM calendar_connections WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// --- Google Calendar OAuth ---
app.get('/api/calendar/connect/google', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/index.html?planner=nocreds');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.calState = state;
  const origin = req.protocol + '://' + req.get('host');
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' +
    'client_id=' + encodeURIComponent(process.env.GOOGLE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(origin + '/api/calendar/google/callback') +
    '&response_type=code&access_type=offline&prompt=consent' +
    '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email') +
    '&state=' + state);
});

app.get('/api/calendar/google/callback', requireAuth, async (req, res) => {
  try {
    if (req.query.state !== req.session.calState) return res.redirect('/index.html?planner=error');
    delete req.session.calState;
    const origin = req.protocol + '://' + req.get('host');
    const data = await httpPost('https://oauth2.googleapis.com/token', {
      code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: origin + '/api/calendar/google/callback', grant_type: 'authorization_code'
    });
    if (!data.access_token) return res.redirect('/index.html?planner=error');
    const info = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', data.access_token);
    const exp = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    db.prepare('INSERT INTO calendar_connections (user_id,provider,access_token,refresh_token,token_expires,cal_email) VALUES (?,?,?,?,?,?)')
      .run(req.session.userId, 'google', data.access_token, data.refresh_token || null, exp, info.email || 'Google Calendar');
    res.redirect('/index.html?planner=connected');
  } catch (e) { console.error('Google cal error:', e); res.redirect('/index.html?planner=error'); }
});

// --- Microsoft Calendar OAuth ---
app.get('/api/calendar/connect/microsoft', requireAuth, (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.redirect('/index.html?planner=nocreds');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.calState = state;
  const origin = req.protocol + '://' + req.get('host');
  res.redirect('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    'client_id=' + encodeURIComponent(process.env.MICROSOFT_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(origin + '/api/calendar/microsoft/callback') +
    '&response_type=code' +
    '&scope=' + encodeURIComponent('Calendars.Read User.Read offline_access') +
    '&state=' + state);
});

app.get('/api/calendar/microsoft/callback', requireAuth, async (req, res) => {
  try {
    if (req.query.state !== req.session.calState) return res.redirect('/index.html?planner=error');
    delete req.session.calState;
    const origin = req.protocol + '://' + req.get('host');
    const data = await httpPost('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      code: req.query.code, client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: origin + '/api/calendar/microsoft/callback',
      grant_type: 'authorization_code', scope: 'Calendars.Read User.Read offline_access'
    });
    if (!data.access_token) return res.redirect('/index.html?planner=error');
    const info = await httpGet('https://graph.microsoft.com/v1.0/me', data.access_token);
    const exp = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    db.prepare('INSERT INTO calendar_connections (user_id,provider,access_token,refresh_token,token_expires,cal_email) VALUES (?,?,?,?,?,?)')
      .run(req.session.userId, 'microsoft', data.access_token, data.refresh_token || null, exp, info.mail || info.userPrincipalName || 'Outlook');
    res.redirect('/index.html?planner=connected');
  } catch (e) { console.error('Microsoft cal error:', e); res.redirect('/index.html?planner=error'); }
});

// --- Unified Calendar Events ---
app.get('/api/calendar/events', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start e end obrigatórios' });
  const conns = db.prepare('SELECT * FROM calendar_connections WHERE user_id = ?').all(req.session.userId);
  const external = [];
  for (const c of conns) {
    try {
      const token = await getValidToken(c);
      if (!token) continue;
      if (c.provider === 'google') {
        const d = await httpGet(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' +
          encodeURIComponent(start + 'T00:00:00Z') + '&timeMax=' + encodeURIComponent(end + 'T23:59:59Z') +
          '&singleEvents=true&orderBy=startTime&maxResults=100', token);
        (d.items || []).forEach(ev => {
          const s = ev.start.dateTime || ev.start.date || '';
          const e2 = ev.end.dateTime || ev.end.date || '';
          external.push({ id:'g-'+ev.id, title:ev.summary||'(sem título)', date:s.substring(0,10),
            startTime:s.length>10?s.substring(11,16):'', endTime:e2.length>10?e2.substring(11,16):'',
            provider:'google', calEmail:c.cal_email, color:'#ea4335' });
        });
      } else if (c.provider === 'microsoft') {
        const d = await httpGet(
          'https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=' +
          encodeURIComponent(start + 'T00:00:00') + '&endDateTime=' + encodeURIComponent(end + 'T23:59:59') +
          '&$top=100&$orderby=start/dateTime', token);
        (d.value || []).forEach(ev => {
          const s = ev.start.dateTime || '';
          const e2 = ev.end.dateTime || '';
          external.push({ id:'m-'+ev.id, title:ev.subject||'(sem título)', date:s.substring(0,10),
            startTime:s.substring(11,16), endTime:e2.substring(11,16),
            provider:'microsoft', calEmail:c.cal_email, color:'#0078d4' });
        });
      }
    } catch (e) { console.error('Cal fetch error:', e.message); }
  }
  res.json({ ok: true, events: external });
});

/* ===== AUTO-FINALIZAÇÃO ÀS 19:00 ===== */
let lastAutoFinalize = '';

function autoFinalizeCards() {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = now.toISOString().substring(0, 10);

  // Executa uma vez por dia quando chegar 19:00
  if (hhmm === '19:00' && lastAutoFinalize !== today) {
    lastAutoFinalize = today;
    const doneAt = now.toISOString();
    const horaSaida = '19:00';

    const activeCards = db.prepare(
      "SELECT id, name, col FROM cards WHERE col != 'finalizado' AND col != 'modelo' AND fixed = 0"
    ).all();

    if (activeCards.length > 0) {
      const finalize = db.transaction(() => {
        activeCards.forEach(card => {
          const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM cards WHERE col = ?').get('finalizado').m;
          db.prepare('UPDATE cards SET col = ?, done = 1, done_at = ?, hora_saida = ?, sort_order = ? WHERE id = ?')
            .run('finalizado', doneAt, horaSaida, maxOrder + 1, card.id);
          db.prepare('INSERT INTO card_activity (card_id, user_name, action) VALUES (?, ?, ?)').run(
            card.id, 'Sistema', 'finalizado automaticamente às 19:00'
          );
        });
      });
      finalize();
      console.log('[Auto-Finalização] ' + activeCards.length + ' cartão(ões) finalizado(s) às 19:00');
      notify('auto_finalize', 'Sistema finalizou automaticamente ' + activeCards.length + ' cartão(ões) às 19:00', { actorName: 'Sistema' });
    }
  }
}

// Verifica a cada 30 segundos
setInterval(autoFinalizeCards, 30 * 1000);

/* ===== BOARD INFO (métricas reais) ===== */
app.get('/api/stats/board-info', requireAuth, (req, res) => {
  try {
    const fs = require('fs');

    // Tamanho real do banco SQLite
    let dbSizeBytes = 0;
    try {
      const stat = fs.statSync(DB_PATH);
      dbSizeBytes = stat.size;
      // Incluir WAL e SHM se existirem
      try { dbSizeBytes += fs.statSync(DB_PATH + '-wal').size; } catch(e) {}
      try { dbSizeBytes += fs.statSync(DB_PATH + '-shm').size; } catch(e) {}
    } catch(e) {}

    // Memória RAM do processo
    const memUsage = process.memoryUsage();
    const ramUsedBytes = memUsage.rss; // Resident Set Size

    // Contagens reais
    const totalCards = db.prepare("SELECT COUNT(*) as c FROM cards WHERE fixed = 0").get().c;
    const doneCards = db.prepare("SELECT COUNT(*) as c FROM cards WHERE fixed = 0 AND done = 1").get().c;
    const activeCards = totalCards - doneCards;
    const totalComments = db.prepare("SELECT COUNT(*) as c FROM card_comments").get().c;
    const totalActivities = db.prepare("SELECT COUNT(*) as c FROM card_activity").get().c;

    // Colunas: padrão + customizadas
    const customCols = db.prepare("SELECT COUNT(*) as c FROM custom_columns").get().c;
    const totalCols = 6 + customCols; // 6 padrão

    // Limites Render Starter ($7/mês)
    const RENDER_RAM_MB = 512;
    const RENDER_DISK_MB = 1024; // 1 GB disco persistente

    res.json({
      ok: true,
      ram: {
        usedBytes: ramUsedBytes,
        limitBytes: RENDER_RAM_MB * 1024 * 1024,
        usedMB: +(ramUsedBytes / (1024 * 1024)).toFixed(1),
        limitMB: RENDER_RAM_MB
      },
      disk: {
        usedBytes: dbSizeBytes,
        limitBytes: RENDER_DISK_MB * 1024 * 1024,
        usedMB: +(dbSizeBytes / (1024 * 1024)).toFixed(2),
        limitMB: RENDER_DISK_MB
      },
      cards: { total: totalCards, active: activeCards, done: doneCards },
      columns: { total: totalCols, custom: customCols },
      data: { comments: totalComments, activities: totalActivities }
    });
  } catch(err) {
    res.json({ ok: false, error: err.message });
  }
});

/* ===== INICIAR SERVIDOR ===== */
app.listen(PORT, () => {
  console.log(`CADASTRADO 027 rodando em http://localhost:${PORT}`);
});
