// Follower/following counts for a user, and whether the viewer follows them.
// "Following" includes teams an athlete follows as well as people.
function followStats(db, userId, viewerId) {
  const followers = db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE followee_id = ?').get(userId).n;
  const following =
    db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE follower_id = ?').get(userId).n +
    db.prepare('SELECT COUNT(*) AS n FROM team_follows WHERE athlete_id = ?').get(userId).n;
  const isFollowing =
    !!viewerId && !!db.prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, userId);
  return { followers, following, isFollowing };
}

module.exports = { followStats };
