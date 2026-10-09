const express = require('express');
const { requireAuth } = require('../auth');

const router = express.Router();

const REASONS = [
  'Fake or fraudulent account',
  'Impersonating someone',
  'Inappropriate content',
  'Misleading or false claims',
  'Harassment or abuse',
  'Spam',
  'Other',
];

const MAX_DETAILS_LENGTH = 2000;

router.get('/users/:id/report', requireAuth, (req, res, next) => {
  const db = req.app.locals.db;
  const target = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return next();
  if (target.id === req.user.id) {
    req.session.flash = 'You cannot report your own account.';
    return res.redirect('back');
  }
  const existing = db
    .prepare('SELECT 1 FROM account_reports WHERE reporter_id = ? AND reported_id = ?')
    .get(req.user.id, target.id);
  res.render('report-new', {
    title: 'Report account',
    target,
    reasons: REASONS,
    error: null,
    alreadyReported: !!existing,
    form: {},
  });
});

router.post('/users/:id/report', requireAuth, (req, res, next) => {
  const db = req.app.locals.db;
  const target = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return next();
  if (target.id === req.user.id) return res.redirect('/');

  const reason = (req.body.reason || '').trim();
  const details = (req.body.details || '').trim().slice(0, MAX_DETAILS_LENGTH) || null;

  if (!REASONS.includes(reason)) {
    return res.status(400).render('report-new', {
      title: 'Report account',
      target,
      reasons: REASONS,
      error: 'Choose a reason for your report.',
      alreadyReported: false,
      form: { reason, details },
    });
  }

  db.prepare(
    'INSERT OR IGNORE INTO account_reports (reporter_id, reported_id, reason, details) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, target.id, reason, details);
  req.session.flash = `Your report of ${target.name} has been submitted. Our team will review it.`;
  res.redirect(target.role === 'athlete' ? `/athletes/${target.id}` : `/coaches/${target.id}`);
});

module.exports = router;
module.exports.REASONS = REASONS;
