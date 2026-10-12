const express = require('express');
const { requireAuth } = require('../auth');
const {
  missingPreferredFields,
  PREFERRED_ATHLETE_FIELDS,
  missingCoachFields,
  PREFERRED_COACH_FIELDS,
} = require('../constants');
const { nowLocal } = require('../calendar');
const { upcomingSlots } = require('../services/visits');
const { coachProfile } = require('../services/teams');

const router = express.Router();

router.get('/dashboard', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const now = nowLocal();

  if (req.user.role === 'athlete') {
    const videos = db
      .prepare('SELECT * FROM videos WHERE athlete_id = ? ORDER BY created_at DESC, id DESC')
      .all(req.user.id);
    // Visit requests that are waiting on the coach, confirmed and upcoming, or recently declined.
    const requests = db
      .prepare(
        `SELECT r.*, u.name AS coach_name, u.email AS coach_email, c.school, c.title AS coach_title,
                s.starts_at, s.duration_minutes, s.location
         FROM visit_requests r
         JOIN users u ON u.id = r.coach_id
         LEFT JOIN coach_profiles c ON c.user_id = r.coach_id
         LEFT JOIN visit_slots s ON s.id = r.slot_id
         WHERE r.athlete_id = ? AND (s.starts_at IS NULL OR s.starts_at > ?)
         ORDER BY r.status = 'pending' DESC, r.status = 'accepted' DESC, s.starts_at, r.id DESC`
      )
      .all(req.user.id, now);
    // Coaches who opened their calendar to this athlete, so the athlete can request a visit.
    const calendars = db
      .prepare(
        `SELECT ca.*, u.name AS coach_name, c.school, c.title AS coach_title, c.division,
                (SELECT COUNT(*) FROM visit_slots o WHERE o.coach_id = ca.coach_id AND o.starts_at > ?) AS open_times
         FROM calendar_access ca
         JOIN users u ON u.id = ca.coach_id
         LEFT JOIN coach_profiles c ON c.user_id = ca.coach_id
         WHERE ca.athlete_id = ?
         ORDER BY ca.created_at DESC`
      )
      .all(now, req.user.id);
    for (const cal of calendars) {
      cal.request = requests.find((r) => r.coach_id === cal.coach_id && r.status !== 'declined') || null;
    }
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const profile = db.prepare('SELECT * FROM athlete_profiles WHERE user_id = ?').get(req.user.id) || {};
    const missing = missingPreferredFields(profile);
    return res.render('dashboard-athlete', {
      title: 'Dashboard',
      videos,
      requests,
      calendars,
      totalViews,
      profile,
      missing,
      totalFields: PREFERRED_ATHLETE_FIELDS.length,
    });
  }

  const requests = db
    .prepare(
      `SELECT r.*, u.name AS athlete_name, v.title AS video_title, p.sport, p.position, p.grad_year,
              s.starts_at, s.duration_minutes
       FROM visit_requests r
       JOIN users u ON u.id = r.athlete_id
       LEFT JOIN athlete_profiles p ON p.user_id = r.athlete_id
       LEFT JOIN videos v ON v.id = r.video_id
       LEFT JOIN visit_slots s ON s.id = r.slot_id
       WHERE r.coach_id = ? AND r.status IN ('pending', 'accepted') AND s.starts_at > ?
       ORDER BY s.starts_at, r.id`
    )
    .all(req.user.id, now);
  const profile = coachProfile(db, req.user.id) || {};
  const missing = missingCoachFields(profile);
  const openTimes = upcomingSlots(db, req.user.id, { openOnly: true }).length;
  const accessCount = db.prepare('SELECT COUNT(*) AS n FROM calendar_access WHERE coach_id = ?').get(req.user.id).n;
  res.render('dashboard-coach', {
    title: 'Dashboard',
    pending: requests.filter((r) => r.status === 'pending'),
    upcoming: requests.filter((r) => r.status === 'accepted'),
    profile,
    openTimes,
    accessCount,
    missing,
    totalFields: PREFERRED_COACH_FIELDS.length,
  });
});

module.exports = router;
