require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'eduflow_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── HELPERS ───────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Non authentifié' });
  next();
};
const requireRole = (roles) => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Non authentifié' });
  if (!roles.includes(req.session.user.role)) return res.status(403).json({ success: false, message: 'Accès refusé' });
  next();
};

// ══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════

// INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.json({ success: false, message: 'Tous les champs sont requis' });
    if (password.length < 6) return res.json({ success: false, message: 'Mot de passe trop court' });
    const validRoles = ['student', 'teacher', 'promoter'];
    const userRole = validRoles.includes(role) ? role : 'student';

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return res.json({ success: false, message: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, userRole]
    );
    const user = result.rows[0];
    req.session.user = user;
    res.json({ success: true, message: 'Compte créé !', user });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email et mot de passe requis' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.json({ success: false, message: 'Email ou mot de passe incorrect' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: 'Email ou mot de passe incorrect' });

    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ success: true, message: 'Connexion réussie !', user: req.session.user });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// DÉCONNEXION
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Déconnecté' });
});

// SESSION
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.json({ success: false, message: 'Non connecté' });
  res.json({ success: true, user: req.session.user });
});

// ══════════════════════════════════════════════════════════
//  COURSES ROUTES
// ══════════════════════════════════════════════════════════

// LISTE DES COURS
app.get('/api/courses', requireAuth, async (req, res) => {
  try {
    const { id, role } = req.session.user;
    let query, params;

    if (role === 'teacher') {
      query = `SELECT c.*, u.name AS teacher_name,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(DISTINCT e.student_id) AS enrolled_count
        FROM courses c JOIN users u ON u.id = c.teacher_id
        LEFT JOIN lessons l ON l.course_id = c.id
        LEFT JOIN enrollments e ON e.course_id = c.id
        WHERE c.teacher_id = $1 GROUP BY c.id, u.name ORDER BY c.created_at DESC`;
      params = [id];
    } else if (role === 'student') {
      query = `SELECT c.*, u.name AS teacher_name,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(DISTINCT e2.student_id) AS enrolled_count,
        MAX(CASE WHEN e.student_id = $1 THEN 1 ELSE 0 END) AS is_enrolled
        FROM courses c JOIN users u ON u.id = c.teacher_id
        LEFT JOIN lessons l ON l.course_id = c.id
        LEFT JOIN enrollments e ON e.course_id = c.id AND e.student_id = $1
        LEFT JOIN enrollments e2 ON e2.course_id = c.id
        GROUP BY c.id, u.name ORDER BY c.created_at DESC`;
      params = [id];
    } else {
      query = `SELECT c.*, u.name AS teacher_name,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(DISTINCT e.student_id) AS enrolled_count
        FROM courses c JOIN users u ON u.id = c.teacher_id
        LEFT JOIN lessons l ON l.course_id = c.id
        LEFT JOIN enrollments e ON e.course_id = c.id
        GROUP BY c.id, u.name ORDER BY c.created_at DESC`;
      params = [];
    }

    const result = await pool.query(query, params);
    res.json({ success: true, courses: result.rows });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// CRÉER UN COURS
app.post('/api/courses', requireRole(['teacher']), async (req, res) => {
  try {
    const { title, description, thumbnail, module_id, duration } = req.body;
    if (!title) return res.json({ success: false, message: 'Titre requis' });
    const result = await pool.query(
      'INSERT INTO courses (title, description, thumbnail, teacher_id, module_id, duration) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [title, description || '', thumbnail || 'book', req.session.user.id, module_id || null, duration || '']
    );
    res.json({ success: true, message: 'Cours créé !', id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// S'INSCRIRE À UN COURS
app.post('/api/courses/enroll', requireRole(['student']), async (req, res) => {
  try {
    const { course_id } = req.body;
    await pool.query(
      'INSERT INTO enrollments (student_id, course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.session.user.id, course_id]
    );
    res.json({ success: true, message: 'Inscrit avec succès !' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════
//  LESSONS ROUTES
// ══════════════════════════════════════════════════════════

// LISTE DES LEÇONS
app.get('/api/lessons', requireAuth, async (req, res) => {
  try {
    const { course_id } = req.query;
    const { id } = req.session.user;
    const result = await pool.query(`
      SELECT l.*, q.id AS quiz_id, lp.completed, lp.completed_at
      FROM lessons l
      LEFT JOIN quizzes q ON q.lesson_id = l.id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = $1
      WHERE l.course_id = $2 ORDER BY l.position ASC`,
      [id, course_id]
    );
    res.json({ success: true, lessons: result.rows });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// CRÉER UNE LEÇON
app.post('/api/lessons', requireRole(['teacher']), async (req, res) => {
  try {
    const { course_id, title, type, file_url, duration } = req.body;
    if (!course_id || !title) return res.json({ success: false, message: 'Données manquantes' });

    const pos = await pool.query('SELECT COALESCE(MAX(position),0)+1 AS pos FROM lessons WHERE course_id=$1', [course_id]);
    const result = await pool.query(
      'INSERT INTO lessons (course_id, title, type, file_url, duration, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [course_id, title, type || 'pdf', file_url || '', duration || '', pos.rows[0].pos]
    );
    res.json({ success: true, message: 'Leçon ajoutée !', id: result.rows[0].id });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// MARQUER COMME TERMINÉE
app.post('/api/lessons/complete', requireRole(['student']), async (req, res) => {
  try {
    const { lesson_id } = req.body;
    await pool.query(`
      INSERT INTO lesson_progress (student_id, lesson_id, completed, completed_at)
      VALUES ($1,$2,true,NOW())
      ON CONFLICT (student_id, lesson_id) DO UPDATE SET completed=true, completed_at=NOW()`,
      [req.session.user.id, lesson_id]
    );
    res.json({ success: true, message: 'Leçon terminée !' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// PROGRESSION
app.get('/api/lessons/progress', requireAuth, async (req, res) => {
  try {
    const { course_id } = req.query;
    const { id } = req.session.user;
    const total = await pool.query('SELECT COUNT(*) AS total FROM lessons WHERE course_id=$1', [course_id]);
    const done  = await pool.query(`
      SELECT COUNT(*) AS done FROM lesson_progress lp
      JOIN lessons l ON l.id=lp.lesson_id
      WHERE l.course_id=$1 AND lp.student_id=$2 AND lp.completed=true`, [course_id, id]);
    const t = parseInt(total.rows[0].total);
    const d = parseInt(done.rows[0].done);
    res.json({ success: true, total: t, done: d, percent: t > 0 ? Math.round((d/t)*100) : 0 });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════
//  QUIZ ROUTES
// ══════════════════════════════════════════════════════════

// CRÉER UN QUIZ
app.post('/api/quiz', requireRole(['teacher']), async (req, res) => {
  try {
    const { lesson_id, title, questions } = req.body;
    if (!lesson_id || !questions?.length) return res.json({ success: false, message: 'Données manquantes' });

    await pool.query('DELETE FROM quizzes WHERE lesson_id=$1', [lesson_id]);
    const qResult = await pool.query(
      'INSERT INTO quizzes (lesson_id, title) VALUES ($1,$2) RETURNING id',
      [lesson_id, title || 'Evaluation']
    );
    const quizId = qResult.rows[0].id;

    for (const q of questions) {
      await pool.query(
        'INSERT INTO quiz_questions (quiz_id,question,option_a,option_b,option_c,option_d,correct_ans) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [quizId, q.question, q.options[0]||'', q.options[1]||'', q.options[2]||'', q.options[3]||'', q.correct||0]
      );
    }
    res.json({ success: true, message: 'Quiz créé !', quiz_id: quizId });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// CHARGER UN QUIZ
app.get('/api/quiz', requireAuth, async (req, res) => {
  try {
    const { lesson_id } = req.query;
    const qRes = await pool.query('SELECT * FROM quizzes WHERE lesson_id=$1', [lesson_id]);
    if (!qRes.rows.length) return res.json({ success: false, message: 'Aucun quiz' });
    const quiz = qRes.rows[0];
    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1', [quiz.id]);
    quiz.questions = questions.rows;
    res.json({ success: true, quiz });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// SOUMETTRE UN QUIZ
app.post('/api/quiz/submit', requireRole(['student']), async (req, res) => {
  try {
    const { quiz_id, answers } = req.body;
    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1', [quiz_id]);
    let score = 0;
    const total = questions.rows.length;
    for (const q of questions.rows) {
      if (parseInt(answers[q.id]) === parseInt(q.correct_ans)) score++;
    }
    const passed  = total > 0 && (score / total) >= 0.6;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    await pool.query(`
      INSERT INTO quiz_results (student_id, quiz_id, score, total, passed)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING`,
      [req.session.user.id, quiz_id, score, total, passed]
    );
    res.json({ success: true, score, total, percent, passed });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// RÉSULTATS
app.get('/api/quiz/results', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT qr.*, qz.title AS quiz_title, l.title AS lesson_title, c.title AS course_title
      FROM quiz_results qr
      JOIN quizzes qz ON qz.id=qr.quiz_id
      JOIN lessons l ON l.id=qz.lesson_id
      JOIN courses c ON c.id=l.course_id
      WHERE qr.student_id=$1 ORDER BY qr.taken_at DESC`,
      [req.session.user.id]
    );
    res.json({ success: true, results: result.rows });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════
//  MODULES ROUTES
// ══════════════════════════════════════════════════════════

// LISTE DES MODULES
app.get('/api/modules', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, u.name AS promoter_name,
        COUNT(DISTINCT e.student_id) AS student_count,
        COUNT(DISTINCT cert.student_id) AS certified_count
      FROM modules m JOIN users u ON u.id=m.promoter_id
      LEFT JOIN courses c ON c.module_id=m.id
      LEFT JOIN enrollments e ON e.course_id=c.id
      LEFT JOIN certificates cert ON cert.module_id=m.id
      GROUP BY m.id, u.name ORDER BY m.created_at DESC`
    );
    const modules = result.rows;
    for (const mod of modules) {
      const courses = await pool.query('SELECT id, title, thumbnail FROM courses WHERE module_id=$1', [mod.id]);
      mod.courses = courses.rows;
    }
    res.json({ success: true, modules });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// CRÉER UN MODULE
app.post('/api/modules', requireRole(['promoter']), async (req, res) => {
  try {
    const { title, description, course_ids } = req.body;
    if (!title) return res.json({ success: false, message: 'Titre requis' });
    const result = await pool.query(
      'INSERT INTO modules (title, description, promoter_id) VALUES ($1,$2,$3) RETURNING id',
      [title, description || '', req.session.user.id]
    );
    const modId = result.rows[0].id;
    if (course_ids?.length) {
      for (const cid of course_ids) {
        await pool.query('UPDATE courses SET module_id=$1 WHERE id=$2', [modId, cid]);
      }
    }
    res.json({ success: true, message: 'Module créé !', id: modId });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// MES CERTIFICATS
app.get('/api/modules/my-certificates', requireRole(['student']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cert.*, m.title AS module_title, m.description AS module_desc, u.name AS promoter_name
      FROM certificates cert JOIN modules m ON m.id=cert.module_id
      JOIN users u ON u.id=m.promoter_id
      WHERE cert.student_id=$1 ORDER BY cert.issued_at DESC`,
      [req.session.user.id]
    );
    res.json({ success: true, certificates: result.rows });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ÉMETTRE UN CERTIFICAT
app.post('/api/modules/certify', requireRole(['promoter']), async (req, res) => {
  try {
    const { student_id, module_id } = req.body;
    await pool.query(
      'INSERT INTO certificates (student_id, module_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [student_id, module_id]
    );
    res.json({ success: true, message: 'Certificat émis !' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// STATS GLOBALES
app.get('/api/modules/stats', requireRole(['promoter']), async (req, res) => {
  try {
    const students  = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role='student'");
    const teachers  = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role='teacher'");
    const courses   = await pool.query("SELECT COUNT(*) AS c FROM courses");
    const modules   = await pool.query("SELECT COUNT(*) AS c FROM modules");
    const certs     = await pool.query("SELECT COUNT(*) AS c FROM certificates");
    const enrolls   = await pool.query("SELECT COUNT(*) AS c FROM enrollments");
    res.json({ success: true, stats: {
      students: parseInt(students.rows[0].c),
      teachers: parseInt(teachers.rows[0].c),
      courses:  parseInt(courses.rows[0].c),
      modules:  parseInt(modules.rows[0].c),
      certs:    parseInt(certs.rows[0].c),
      enrolls:  parseInt(enrolls.rows[0].c),
    }});
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'EduFlow API is running! 🎓' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ EduFlow API running on port ${PORT}`));
