const { REPORT_WARNING_THRESHOLD } = require('../constants');

// How a profile's reports affect what viewers see. Confirmed reports always warn; open reports warn
// once enough different people have made them, so one person can't flag an account alone.
function reportSummary(db, userId, viewerId) {
  const counts = db
    .prepare(
      `SELECT SUM(status = 'open') AS open, SUM(status = 'confirmed') AS confirmed
       FROM reports WHERE reported_id = ?`
    )
    .get(userId);
  const open = counts.open || 0;
  const confirmed = counts.confirmed || 0;
  const viewerReported =
    !!viewerId && !!db.prepare('SELECT 1 FROM reports WHERE reporter_id = ? AND reported_id = ?').get(viewerId, userId);
  return { warning: confirmed > 0 || open >= REPORT_WARNING_THRESHOLD, confirmed: confirmed > 0, viewerReported };
}

module.exports = { reportSummary };
