// Only same-site paths are followed from form fields ("back", "next"), so a crafted value can't
// redirect off-site. Anything else falls back to `fallback`.
function localPath(p, fallback) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : fallback;
}

function profilePath(user) {
  return user.role === 'athlete' ? `/athletes/${user.id}` : `/coaches/${user.id}`;
}

module.exports = { localPath, profilePath };
