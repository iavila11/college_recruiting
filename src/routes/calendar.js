const express = require('express');
const { requireRole } = require('../auth');
const { nowLocal, isValidLocal, groupByDay } = require('../calendar');
const { localPath } = require('../paths');
const { upcomingSlots, hasCalendarAccess, openRequest } = require('../services/visits');

// A coach's visit calendar: open times, and which athletes may request them.
// Athletes' requests and coaches' answers are in routes/visits.js.
const router = express.Router();

const MAX_NOTE_LENGTH = 1000;

function renderCalendar(req, res, { status = 200, error = null, form = {}, access: accessForm = {} } = {}) {
  const db = req.app.locals.db;
  const slots = upcomingSlots(db, req.user.id);
  const bookings = db
    .prepare(
      `SELECT r.slot_id, r.status, u.id AS athlete_id, u.name AS athlete_name
       FROM visit_requests r JOIN users u ON u.id = r.athlete_id
       WHERE r.coach_id = ? AND r.status IN ('pending', 'accepted') AND r.slot_id IS NOT NULL`
    )
    .all(req.user.id);
  for (const slot of slots) {
    slot.athletes = bookings.filter((b) => b.slot_id === slot.id && b.status === 'accepted');
    slot.requested = bookings.filter((b) => b.slot_id === slot.id && b.status === 'pending').length;
  }
  // Athletes this coach has opened the calendar to, with their open request if they've made one.
  const access = db
    .prepare(
      `SELECT ca.created_at, u.id AS athlete_id, u.name, a.athlete_code, a.sport, a.position
       FROM calendar_access ca
       JOIN users u ON u.id = ca.athlete_id
       LEFT JOIN athlete_profiles a ON a.user_id = ca.athlete_id
       WHERE ca.coach_id = ?
       ORDER BY ca.created_at DESC`
    )
    .all(req.user.id);
  for (const a of access) a.request = openRequest(db, req.user.id, a.athlete_id);
  const accessFormValues = { athlete_code: req.query.athlete_id || '', message: '', ...accessForm };
  res.status(status).render('calendar', {
    title: 'Visit calendar',
    days: groupByDay(slots),
    access,
    error,
    form,
    accessError: accessForm.error || null,
    accessForm: accessFormValues,
    minStart: nowLocal(),
  });
}

router.get('/calendar', requireRole('coach'), (req, res) => renderCalendar(req, res));

router.post('/calendar/slots', requireRole('coach'), (req, res) => {
  const form = {
    starts_at: (req.body.starts_at || '').trim(),
    duration_minutes: req.body.duration_minutes || '120',
    capacity: req.body.capacity || '1',
    location: (req.body.location || '').trim(),
  };
  const duration = Number(form.duration_minutes);
  const capacity = Number(form.capacity);

  let error = null;
  if (!isValidLocal(form.starts_at)) error = 'Choose a date and start time.';
  else if (form.starts_at <= nowLocal()) error = 'Visit times must be in the future.';
  else if (!Number.isInteger(duration) || duration < 15 || duration > 720) error = 'Length must be between 15 minutes and 12 hours.';
  else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) error = 'Athletes per time must be between 1 and 50.';
  else if (form.location.length > 300) error = 'Location and notes can be up to 300 characters.';
  if (error) return renderCalendar(req, res, { status: 400, error, form });

  req.app.locals.db
    .prepare('INSERT INTO visit_slots (coach_id, starts_at, duration_minutes, capacity, location) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, form.starts_at, duration, capacity, form.location || null);
  req.session.flash = 'Visit time added to your calendar.';
  res.redirect('/calendar');
});

router.post('/calendar/slots/:id/delete', requireRole('coach'), (req, res, next) => {
  const db = req.app.locals.db;
  const slot = db.prepare('SELECT id FROM visit_slots WHERE id = ? AND coach_id = ?').get(req.params.id, req.user.id);
  if (!slot) return next();
  const booked = db.prepare("SELECT 1 FROM visit_requests WHERE slot_id = ? AND status = 'accepted'").get(slot.id);
  if (booked) {
    req.session.flash = 'That time has booked visits. Message the athletes before changing it.';
    return res.redirect('/calendar');
  }
  // Requests still waiting on this time go away with it; the athletes can request another time.
  db.prepare("DELETE FROM visit_requests WHERE slot_id = ? AND status = 'pending'").run(slot.id);
  db.prepare('DELETE FROM visit_slots WHERE id = ?').run(slot.id);
  req.session.flash = 'Visit time removed.';
  res.redirect('/calendar');
});

// Coaches decide which athletes may request visits by opening their calendar to them by Athlete ID.
// The calendar is never public, so coaches aren't flooded with requests from athletes they don't know.
router.post('/calendar/access', requireRole('coach'), (req, res) => {
  const db = req.app.locals.db;
  const code = (req.body.athlete_code || '').trim();
  const message = (req.body.message || '').trim().slice(0, MAX_NOTE_LENGTH);
  const fromProfile = localPath(req.body.back, null);
  const fail = (error) => {
    if (fromProfile) {
      req.session.flash = error;
      return res.redirect(fromProfile);
    }
    return renderCalendar(req, res, { status: 400, access: { athlete_code: code, message, error } });
  };

  if (!code) return fail('Enter the Athlete ID of the athlete you want to give access to.');
  const athlete = db
    .prepare(
      `SELECT u.id, u.name, a.athlete_code FROM athlete_profiles a JOIN users u ON u.id = a.user_id
       WHERE a.athlete_code = ? COLLATE NOCASE`
    )
    .get(code);
  if (!athlete) return fail(`No athlete has the Athlete ID ${code}. Check the ID with the athlete.`);
  if (hasCalendarAccess(db, req.user.id, athlete.id)) return fail(`Your calendar is already open to ${athlete.name}.`);

  let videoId = req.body.video_id ? Number(req.body.video_id) : null;
  if (videoId && !db.prepare('SELECT 1 FROM videos WHERE id = ? AND athlete_id = ?').get(videoId, athlete.id)) videoId = null;

  db.prepare('INSERT INTO calendar_access (coach_id, athlete_id, message, video_id) VALUES (?, ?, ?, ?)').run(
    req.user.id,
    athlete.id,
    message || null,
    videoId
  );
  req.session.flash = `Your visit calendar is now open to ${athlete.name} (${athlete.athlete_code}). They can request a visit time.`;
  res.redirect(fromProfile || '/calendar');
});

// Closing the calendar stops new requests and drops requests still waiting; confirmed visits stay.
router.post('/calendar/access/:athleteId/revoke', requireRole('coach'), (req, res, next) => {
  const db = req.app.locals.db;
  const athlete = db
    .prepare('SELECT u.id, u.name FROM calendar_access ca JOIN users u ON u.id = ca.athlete_id WHERE ca.coach_id = ? AND ca.athlete_id = ?')
    .get(req.user.id, Number(req.params.athleteId));
  if (!athlete) return next();
  db.prepare('DELETE FROM calendar_access WHERE coach_id = ? AND athlete_id = ?').run(req.user.id, athlete.id);
  db.prepare("DELETE FROM visit_requests WHERE coach_id = ? AND athlete_id = ? AND status = 'pending'").run(req.user.id, athlete.id);
  req.session.flash = `${athlete.name} can no longer request visits on your calendar.`;
  res.redirect(localPath(req.body.back, '/calendar'));
});

module.exports = router;
