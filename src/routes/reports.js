const express = require('express');
const { requireAuth, requireAdmin } = require('../auth');
const { REPORT_REASONS } = require('../constants');
const { localPath, profilePath } = require('../paths');

const router = express.Router();

const MAX_DETAILS_LENGTH = 2000;

router.post('/people/:id/report', requireAuth, (req, res, next) => {
  const db = req.app.locals.db;
  const target = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return next();
  const back = localPath(req.body.back, profilePath(target));
  if (target.id === req.user.id) return res.redirect(back);

  const reason = req.body.reason;
  const details = (req.body.details || '').trim().slice(0, MAX_DETAILS_LENGTH) || null;
  if (!REPORT_REASONS.includes(reason)) {
    req.session.flash = 'Choose a reason for the report.';
    return res.redirect(back);
  }

  // Reporting again updates the earlier report and reopens it.
  db.prepare(
    `INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES (?, ?, ?, ?)
     ON CONFLICT (reporter_id, reported_id) DO UPDATE
       SET reason = excluded.reason, details = excluded.details, status = 'open', created_at = datetime('now')`
  ).run(req.user.id, target.id, reason, details);
  req.session.flash = `Thanks for reporting ${target.name}. We'll review the account.`;
  res.redirect(back);
});

// Moderators (emails listed in ADMIN_EMAILS) review open reports.
router.get('/reports', requireAuth, requireAdmin, (req, res) => {
  const reports = req.app.locals.db
    .prepare(
      `SELECT r.*, a.name AS reported_name, a.role AS reported_role, a.email AS reported_email, b.name AS reporter_name,
              (SELECT COUNT(*) FROM reports o WHERE o.reported_id = r.reported_id AND o.status = 'open') AS open_count
       FROM reports r JOIN users a ON a.id = r.reported_id JOIN users b ON b.id = r.reporter_id
       WHERE r.status = 'open'
       ORDER BY open_count DESC, r.created_at DESC`
    )
    .all();
  res.render('reports', { title: 'Reports', reports, profilePath });
});

// Confirming flags the account for everyone; dismissing clears that reporter's report.
router.post('/reports/:id/:decision(confirm|dismiss)', requireAuth, requireAdmin, (req, res, next) => {
  const db = req.app.locals.db;
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return next();
  if (req.params.decision === 'confirm') {
    db.prepare("UPDATE reports SET status = 'confirmed' WHERE reported_id = ? AND status = 'open'").run(report.reported_id);
    req.session.flash = 'Account flagged as fraudulent. Its profile now shows a warning.';
  } else {
    db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(report.id);
    req.session.flash = 'Report dismissed.';
  }
  res.redirect('/reports');
});

module.exports = router;
