const path = require('node:path');
const fs = require('node:fs');
const { openDatabase } = require('../src/db');

async function seed({ dbPath = path.join(__dirname, '..', 'data', 'app.db'), uploadDir = path.join(__dirname, '..', 'uploads'), force = false } = {}) {
  function ensureUploads() {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  function placeholderFile(name, contents = 'placeholder') {
    const p = path.join(uploadDir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, contents);
    return name;
  }

  function getOrCreate(db, table, uniqueCol, values) {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE ${uniqueCol} = ?`).get(values[uniqueCol]);
    if (existing) return existing;
    const cols = Object.keys(values);
    const q = cols.map(() => '?').join(',');
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${q})`).run(...cols.map((c) => values[c]));
    return db.prepare(`SELECT * FROM ${table} WHERE ${uniqueCol} = ?`).get(values[uniqueCol]);
  }

  function upsertUser(db, email, role, name, password_hash = 'seeded') {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user) return user;
    db.prepare('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)').run(email, password_hash, role, name);
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  ensureUploads();
  const db = openDatabase(dbPath);

  if (!force) {
    const hasUsers = !!db.prepare('SELECT 1 FROM sqlite_master WHERE type = "table" AND name = "users"').get() && !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
    if (hasUsers) {
      console.log('Database already has users; skipping seed. Use force=true to override.');
      return;
    }
  }

  db.exec('BEGIN');
  try {
    console.log('Inserting users...');
    const a1 = upsertUser(db, 'alice.athlete@example.com', 'athlete', 'Alice Athlete');
    const a2 = upsertUser(db, 'ben.athlete@example.com', 'athlete', 'Ben Athlete');
    const c1 = upsertUser(db, 'coach.carson@example.com', 'coach', 'Carson Coach');
    const c2 = upsertUser(db, 'coach.dana@example.com', 'coach', 'Dana Coach');

    console.log('Inserting athlete profiles...');
    db.prepare(
      `INSERT OR IGNORE INTO athlete_profiles (user_id, athlete_code, sport, position, position_rank, star_rating, grad_year, high_school, city, state, height, weight, gpa, bio, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(a1.id, 'A1001', 'Football', 'QB', 1, 5, 2026, 'Central High', 'Springfield', 'IL', "6'2\"", '190', '3.8', 'Hardworking QB', '555-0101');

    db.prepare(
      `INSERT OR IGNORE INTO athlete_profiles (user_id, athlete_code, sport, position, position_rank, star_rating, grad_year, high_school, city, state, height, weight, gpa, bio, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(a2.id, 'A1002', 'Basketball', 'G', 12, 4, 2025, 'West High', 'Rivertown', 'CA', "6'0\"", '170', '3.6', 'Sharp shooter', '555-0202');

    console.log('Inserting teams and coach profiles...');
    const team1 = getOrCreate(db, 'teams', 'school', { school: 'State U', sport: 'Football', division: 'Division I' });
    const team2 = getOrCreate(db, 'teams', 'school', { school: 'City College', sport: 'Basketball', division: 'Division II' });

    db.prepare('INSERT OR IGNORE INTO coach_profiles (user_id, school, title, sport, division, team_id) VALUES (?, ?, ?, ?, ?, ?)').run(c1.id, 'State U', 'Coach', 'Football', 'Division I', team1.id);
    db.prepare('INSERT OR IGNORE INTO coach_profiles (user_id, school, title, sport, division, team_id) VALUES (?, ?, ?, ?, ?, ?)').run(c2.id, 'City College', 'Assistant', 'Basketball', 'Division II', team2.id);

    console.log('Creating placeholder upload files and videos...');
    const vfile1 = placeholderFile('alice_game1.mp4', 'fake video content');
    const vfile2 = placeholderFile('ben_game1.mp4', 'fake video content');

    db.prepare(
      `INSERT OR IGNORE INTO videos (athlete_id, title, description, sport, opponent, game_date, filename, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(a1.id, 'Alice vs Rivals', 'Season opener', 'Football', 'Rivals HS', '2025-09-01', vfile1, 'video/mp4', 123456);

    db.prepare(
      `INSERT OR IGNORE INTO videos (athlete_id, title, description, sport, opponent, game_date, filename, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(a2.id, 'Ben Highlight Reel', 'Top plays', 'Basketball', 'East HS', '2024-12-15', vfile2, 'video/mp4', 234567);

    console.log('Creating posts for teams...');
    const media1 = placeholderFile('team1_post.jpg', 'fake image');
    const media2 = placeholderFile('team2_post.jpg', 'fake image');

    db.prepare('INSERT OR IGNORE INTO posts (team_id, author_id, caption, media_filename, media_kind, mime_type) VALUES (?, ?, ?, ?, ?, ?)').run(team1.id, c1.id, 'Welcome to State U recruiting page', media1, 'image', 'image/jpeg');
    db.prepare('INSERT OR IGNORE INTO posts (team_id, author_id, caption, media_filename, media_kind, mime_type) VALUES (?, ?, ?, ?, ?, ?)').run(team2.id, c2.id, 'City College highlights', media2, 'image', 'image/jpeg');

    console.log('Adding a visit slot and a pending visit request...');
    db.prepare('INSERT INTO visit_slots (coach_id, starts_at, duration_minutes, capacity, location) VALUES (?, ?, ?, ?, ?)').run(c1.id, '2025-07-15T10:00', 30, 1, 'State U Campus');
    const slotRow = db.prepare('SELECT * FROM visit_slots WHERE coach_id = ? ORDER BY id DESC LIMIT 1').get(c1.id);

    db.prepare('INSERT OR IGNORE INTO visit_requests (coach_id, athlete_id, video_id, message, proposed_date, status, slot_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c1.id, a1.id, null, 'We would like to invite you to visit State U.', '2025-07-15', 'pending', slotRow.id);

    db.exec('COMMIT');

    const counts = {
      users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      videos: db.prepare('SELECT COUNT(*) as c FROM videos').get().c,
      posts: db.prepare('SELECT COUNT(*) as c FROM posts').get().c,
      teams: db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
    };

    console.log('Seeding complete. Summary:', counts);
    console.log('Uploads directory:', uploadDir);
    console.log('Database file:', dbPath);
  } catch (err) {
    console.error('Error during seeding:', err);
    db.exec('ROLLBACK');
    throw err;
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed };
