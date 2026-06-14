-- EduFlow LMS — Schema PostgreSQL pour Render
-- Coller dans le SQL Editor de Render

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  avatar VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  promoter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  thumbnail VARCHAR(50) DEFAULT 'book',
  teacher_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id INT REFERENCES modules(id) ON DELETE SET NULL,
  duration VARCHAR(50) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'pdf',
  file_url VARCHAR(500),
  duration VARCHAR(50) DEFAULT '',
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  title VARCHAR(200) DEFAULT 'Evaluation',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a VARCHAR(300) NOT NULL,
  option_b VARCHAR(300) NOT NULL,
  option_c VARCHAR(300) NOT NULL,
  option_d VARCHAR(300) NOT NULL,
  correct_ans SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  UNIQUE(student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score INT NOT NULL,
  total INT NOT NULL,
  passed BOOLEAN DEFAULT FALSE,
  taken_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id INT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  issued_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, module_id)
);

-- Données de démonstration
INSERT INTO users (name, email, password, role) VALUES
('Admin Promoteur', 'promoteur@eduflow.cm', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'promoter'),
('Prof. Mbarga', 'mbarga@eduflow.cm', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'teacher'),
('Daniel Mohamat', 'daniel@eduflow.cm', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student')
ON CONFLICT DO NOTHING;

INSERT INTO modules (title, description, promoter_id) VALUES
('Licence Informatique Fondamentale', 'Maitrise des fondamentaux algorithmiques.', 1),
('Developpement Web Full-Stack', 'De la conception a la mise en production.', 1)
ON CONFLICT DO NOTHING;

INSERT INTO courses (title, description, thumbnail, teacher_id, module_id, duration) VALUES
('Algorithmique et Structures de donnees', 'Maitriser les algorithmes fondamentaux.', 'algo', 2, 1, '12h'),
('Analyse de donnees et Statistiques', 'Introduction a analyse statistique.', 'stats', 2, 1, '10h'),
('Developpement Web JavaScript', 'HTML, CSS, JS et AJAX en pratique.', 'web', 2, 2, '8h')
ON CONFLICT DO NOTHING;

INSERT INTO lessons (course_id, title, type, duration, position) VALUES
(1, 'Introduction aux algorithmes', 'pdf', '45 min', 1),
(1, 'Tableaux et listes chainees', 'video', '1h', 2),
(1, 'Arbres binaires', 'pdf', '1h30', 3),
(1, 'Graphes et parcours BFS/DFS', 'video', '2h', 4),
(2, 'Statistiques descriptives', 'pdf', '1h', 1),
(2, 'Regression lineaire', 'video', '1h30', 2),
(3, 'HTML et CSS fondamentaux', 'pdf', '2h', 1),
(3, 'JavaScript et le DOM', 'video', '2h', 2),
(3, 'AJAX et les API REST', 'pdf', '1h30', 3)
ON CONFLICT DO NOTHING;

INSERT INTO enrollments (student_id, course_id) VALUES (3,1),(3,2) ON CONFLICT DO NOTHING;
INSERT INTO lesson_progress (student_id, lesson_id, completed, completed_at) VALUES (3,1,true,NOW()),(3,2,true,NOW()) ON CONFLICT DO NOTHING;
