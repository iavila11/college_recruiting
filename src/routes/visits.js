const express = require('express');
const { requireRole } = require('../auth');
const { groupByDay } = require('../calendar');
const { localPath } = require('../paths');
const { upcomingSlots, findSlot, isBookable, openRequest } = require('../services/visits');

// Visit requests: athletes request times on calendars opened to them; coaches confirm or decline.
// Coaches manage their calendar and who has access in routes/calendar.js.
const router = express.Router();

const MAX_NOTE_LENGTH = 1000;

// The coach (with team info) whose calendar this athlete wants to use, if it's open to them.
function accessibleCoach(req) {
  const db = req.app.locals.db;
  return db
    .prepare(
      `SELECT u.id, u.name, c.title, c.school, ca.message, ca.video_id, v.title AS video_title
       FROM calendar_access ca
       JOIN users u ON u.id = ca.coach_id
       LEFT JOIN coach_profiles c ON c.user_id = ca.coach_id
       LEFT JOIN videos v ON v.id = ca.video_id
       WHERE ca.coach_id = ? AND ca.athlete_id = ?`
    )
    .get(Number(req.params.id), req.user.id);
}

function noAccess(res) {
  return res.status(403).render('error', {
    title: 'Calendar not open',
    message: "This coach hasn't opened their visit calendar to you. Coaches choose which athletes can request visits.",
  });
}

router.get('/coaches/:id/visit', requireRole('athlete'), (req, res) => {
  const db = req.app.locals.db;
  const coach = accessibleCoach(req);
  if (!coach) return noAccess(res);
  const current = openRequest(db, coach.id, req.user.id);
  const slots = upcomingSlots(db, coach.id, { openOnly: true }).filter((s) => !current || s.id !== current.slot_id);
  res.render('visit-schedule', { title: 'Request a visit', coach, current, days: groupByDay(slots) });
});

// Athletes request one time at a time per coach; picking a new time replaces the open request,
// and the coach confirms it again.
router.post('/coaches/:id/visit', requireRole('athlete'), (req, res) => {
  const db = req.app.locals.db;
  const coach = accessibleCoach(req);
  if (!coach) return noAccess(res);

  const slot = findSlot(db, Number(req.body.slot_id), coach.id);
  if (!isBookable(slot)) {
    req.session.flash = 'That time is no longer available. Please choose another.';
    return res.redirect(`/coaches/${coach.id}/visit`);
  }

  const note = (req.body.message || '').trim().slice(0, MAX_NOTE_LENGTH);
  const current = openRequest(db, coach.id, req.user.id);
  if (current) {
    db.prepare(
      "UPDATE visit_requests SET status = 'pending', slot_id = ?, message = ?, response_message = NULL, responded_at = NULL WHERE id = ?"
    ).run(slot.id, note, current.id);
  } else {
    db.prepare('INSERT INTO visit_requests (coach_id, athlete_id, video_id, slot_id, message) VALUES (?, ?, ?, ?, ?)').run(
      coach.id,
      req.user.id,
      coach.video_id,
      slot.id,
      note
    );
  }
  req.session.flash = `Visit requested. ${coach.name} will confirm or decline it.`;
  res.redirect('/dashboard');
});

router.post('/visit-requests/:id/cancel', requireRole('athlete'), (req, res, next) => {
  const db = req.app.locals.db;
  const request = db
    .prepare("SELECT id FROM visit_requests WHERE id = ? AND athlete_id = ? AND status IN ('pending', 'accepted')")
    .get(req.params.id, req.user.id);
  if (!request) return next();
  db.prepare('DELETE FROM visit_requests WHERE id = ?').run(request.id);
  req.session.flash = 'Visit cancelled.';
  res.redirect('/dashboard');
});

// Coaches confirm or decline each request. Confirming shares the athlete's contact info with the staff.
router.post('/visit-requests/:id/respond', requireRole('coach'), (req, res, next) => {
  const db = req.app.locals.db;
  const request = db
    .prepare('SELECT r.*, u.name AS athlete_name FROM visit_requests r JOIN users u ON u.id = r.athlete_id WHERE r.id = ? AND r.coach_id = ?')
    .get(req.params.id, req.user.id);
  if (!request) return next();
  const back = localPath(req.body.back, '/dashboard');
  const decision = req.body.decision;
  const note = (req.body.response_message || '').trim().slice(0, MAX_NOTE_LENGTH) || null;

  if (request.status !== 'pending' || !['accept', 'decline'].includes(decision)) {
    req.session.flash = 'That request can no longer be updated.';
    return res.redirect(back);
  }
  if (decision === 'accept' && !isBookable(findSlot(db, request.slot_id, req.user.id))) {
    req.session.flash = 'That time is full or has passed. Decline the request so the athlete can pick another time.';
    return res.redirect(back);
  }

  db.prepare("UPDATE visit_requests SET status = ?, response_message = ?, responded_at = datetime('now') WHERE id = ?").run(
    decision === 'accept' ? 'accepted' : 'declined',
    note,
    request.id
  );
  req.session.flash =
    decision === 'accept' ? `Visit with ${request.athlete_name} confirmed.` : `Request from ${request.athlete_name} declined.`;
  res.redirect(back);
});

module.exports = router;
