// Visit calendars: coaches' open times, which athletes may request them, and visit requests.
// Request statuses: 'pending' (athlete asked, coach hasn't answered), 'accepted' (confirmed), 'declined'.
const { nowLocal } = require('../calendar');

// SQL (on slot alias `s`) for how many athletes have a confirmed visit at that time.
const BOOKED = "(SELECT COUNT(*) FROM visit_requests b WHERE b.slot_id = s.id AND b.status = 'accepted')";

// A coach's upcoming slots with how many athletes have booked each.
function upcomingSlots(db, coachId, { openOnly = false } = {}) {
  return db
    .prepare(
      `SELECT s.*, ${BOOKED} AS booked
       FROM visit_slots s
       WHERE s.coach_id = ? AND s.starts_at > ?
       ${openOnly ? `AND ${BOOKED} < s.capacity` : ''}
       ORDER BY s.starts_at`
    )
    .all(coachId, nowLocal());
}

// One of a coach's slots with its booked count, or undefined.
function findSlot(db, slotId, coachId) {
  return db.prepare(`SELECT s.*, ${BOOKED} AS booked FROM visit_slots s WHERE s.id = ? AND s.coach_id = ?`).get(slotId, coachId);
}

// Whether a slot can still take a confirmed visit.
function isBookable(slot) {
  return !!slot && slot.starts_at > nowLocal() && slot.booked < slot.capacity;
}

// Whether a coach has opened their calendar to this athlete, which lets the athlete request visits.
function hasCalendarAccess(db, coachId, athleteId) {
  return !!db.prepare('SELECT 1 FROM calendar_access WHERE coach_id = ? AND athlete_id = ?').get(coachId, athleteId);
}

// The athlete's open request with this coach: awaiting the coach, or an upcoming confirmed visit.
function openRequest(db, coachId, athleteId) {
  return db
    .prepare(
      `SELECT r.*, s.starts_at, s.duration_minutes, s.location FROM visit_requests r LEFT JOIN visit_slots s ON s.id = r.slot_id
       WHERE r.coach_id = ? AND r.athlete_id = ?
         AND (r.status = 'pending' OR (r.status = 'accepted' AND s.starts_at > ?))
       ORDER BY r.id DESC LIMIT 1`
    )
    .get(coachId, athleteId, nowLocal());
}

module.exports = { upcomingSlots, findSlot, isBookable, hasCalendarAccess, openRequest };
