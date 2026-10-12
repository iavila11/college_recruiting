// SQL condition (on alias `c`) for conversations this user can read: an athlete sees their own,
// a coach sees ones addressed to them or to their team's shared inbox.
function accessClause(user) {
  return user.role === 'athlete'
    ? { sql: 'c.athlete_id = ?', params: [user.id] }
    : { sql: '(c.coach_id = ? OR c.team_id = (SELECT team_id FROM coach_profiles WHERE user_id = ?))', params: [user.id, user.id] };
}

function unreadCount(db, user) {
  const access = accessClause(user);
  return db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
       WHERE ${access.sql} AND m.sender_id != ? AND m.id > COALESCE(r.last_read_message_id, 0)`
    )
    .get(user.id, ...access.params, user.id).n;
}

module.exports = { accessClause, unreadCount };
