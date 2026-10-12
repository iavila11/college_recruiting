// Teams and coaching staff: which team a coach belongs to, and the rules for creating and joining teams.

// The team a coach is on, or undefined.
function myTeam(db, coachId) {
  return db.prepare('SELECT t.* FROM coach_profiles c JOIN teams t ON t.id = c.team_id WHERE c.user_id = ?').get(coachId);
}

// A coach's profile with their team's Team ID.
function coachProfile(db, coachId) {
  return db
    .prepare('SELECT c.*, t.team_code FROM coach_profiles c LEFT JOIN teams t ON t.id = c.team_id WHERE c.user_id = ?')
    .get(coachId);
}

function staffCount(db, teamId) {
  return db.prepare('SELECT COUNT(*) AS n FROM coach_profiles WHERE team_id = ?').get(teamId).n;
}

// Returns the id of the team for this school and sport, creating it if needed.
function findOrCreateTeam(db, { school, sport, division }) {
  const existing = db.prepare('SELECT id FROM teams WHERE school = ? COLLATE NOCASE AND sport = ?').get(school, sport);
  if (existing) {
    if (division) db.prepare('UPDATE teams SET division = ? WHERE id = ?').run(division, existing.id);
    return existing.id;
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO teams (school, sport, division) VALUES (?, ?, ?)')
    .run(school, sport, division || null);
  return Number(lastInsertRowid);
}

// Works out which team a coach's profile points at. The first coach to enter a team creates it; after
// that, coaches join only when a staff member adds them (see routes/staff.js), because staff share
// recruiting data. Teams are matched by Team ID, or by team name and sport. Returns { team } or { error }.
function resolveTeam(db, coachId, { school, sport, division, team_code: code }) {
  // Staff editing their own profile stay on their team (leaving is done from the Staff page);
  // a corrected team name renames the team for everyone.
  const current = myTeam(db, coachId);
  const sameCode = !code || (current && current.team_code && current.team_code.toLowerCase() === code.toLowerCase());
  if (current && current.sport === sport && sameCode) {
    const clash = db
      .prepare('SELECT 1 FROM teams WHERE school = ? COLLATE NOCASE AND sport = ? AND id != ?')
      .get(school, sport, current.id);
    if (clash) return { error: `Another ${sport} team is already named ${school}.` };
    db.prepare('UPDATE teams SET school = ?, division = COALESCE(?, division), team_code = COALESCE(team_code, ?) WHERE id = ?').run(
      school,
      division || null,
      code || null,
      current.id
    );
    db.prepare('UPDATE coach_profiles SET school = ? WHERE team_id = ?').run(school, current.id);
    return { team: db.prepare('SELECT * FROM teams WHERE id = ?').get(current.id) };
  }

  const byCode = code ? db.prepare('SELECT * FROM teams WHERE team_code = ? COLLATE NOCASE').get(code) : null;
  if (byCode && byCode.sport !== sport) {
    return { error: `Team ID ${code} belongs to ${byCode.school} ${byCode.sport}. Check the Team ID or team sport.` };
  }
  const byName = byCode ? null : db.prepare('SELECT * FROM teams WHERE school = ? COLLATE NOCASE AND sport = ?').get(school, sport);
  const existing = byCode || byName;

  if (existing) {
    const member = !!db.prepare('SELECT 1 FROM coach_profiles WHERE user_id = ? AND team_id = ?').get(coachId, existing.id);
    if (!member && staffCount(db, existing.id) > 0) {
      return {
        error: `${existing.school} ${existing.sport} already has a coaching staff here. Ask a staff member to add you from the team's Staff page.`,
      };
    }
    if (byName && code && byName.team_code && !member) {
      return { error: `${byName.school} ${byName.sport} is already registered with a different Team ID.` };
    }
    if (byName && code) db.prepare('UPDATE teams SET team_code = ? WHERE id = ?').run(code, byName.id);
    if (division) db.prepare('UPDATE teams SET division = ? WHERE id = ?').run(division, existing.id);
    return { team: db.prepare('SELECT * FROM teams WHERE id = ?').get(existing.id) };
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO teams (school, sport, division, team_code) VALUES (?, ?, ?, ?)')
    .run(school, sport, division || null, code || null);
  return { team: db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(lastInsertRowid)) };
}

// Puts a coach on a team's staff, copying the team's name and sport onto their profile.
function joinTeam(db, coachId, team, title) {
  db.prepare(
    'UPDATE coach_profiles SET team_id = ?, school = ?, sport = ?, division = COALESCE(?, division), title = COALESCE(title, ?) WHERE user_id = ?'
  ).run(team.id, team.school, team.sport, team.division, title || null, coachId);
}

module.exports = { myTeam, coachProfile, staffCount, findOrCreateTeam, resolveTeam, joinTeam };
