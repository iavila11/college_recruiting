# Highlight Reel

A web app where **athletes** upload raw game highlight videos to get exposure, and **college coaches** browse those athletes and send **visit requests**.

## Features

**Athletes**
- Sign up as an athlete and build a recruiting profile: sport, position, graduation year, school, city/state, height, weight, GPA, bio, and phone.
- Upload raw game video (MP4, MOV, or WebM, up to 500 MB) with a title, opponent, game date, and notes.
- Dashboard with highlight count, total views from other users, your visit requests, and the coaches who opened their calendar to you.
- Athletes can't request visits until a coach opens their calendar to them. Once a coach does, the athlete requests a visit by picking an open time, with an optional note. The coach confirms or declines it. Athletes can change the time (the coach confirms again) or cancel.
- Delete your own videos. This also removes the file from disk.

**Home feed (Instagram-style)**
- After logging in, athletes land on a feed of photo and video posts from college teams.
- **Following** shows posts from teams the athlete follows. **Discover** shows posts from all teams, filtered to the athlete's sport by default; they can switch to any sport or all sports.
- A "Teams you might like" panel suggests teams in the athlete's sport that they don't follow yet.
- **Coaches' feeds and recommendations contain only athletes' posts (highlight videos).** Discover shows highlights filtered to the coach's team sport, Following shows highlights from followed athletes, and an "Athletes to watch" panel suggests athletes with recent highlights.
- Athletes can like posts, follow or unfollow teams, and browse a directory of teams by school and sport.
- Each team has a page with its division, coaches, follower count, and a grid of its posts.

**Following**
- Athletes follow the college teams they're interested in.
- Anyone can follow athletes and coaches, so athletes build a following of other athletes and coaches. Athlete and coach profiles show follower and following counts, with lists of each.
- The **Following** feed tab shows posts from followed teams and coaches, plus new highlight videos from followed athletes.
- Coaches have public profile pages showing their team, follow counts, and posts.

**Direct messages**
- Athletes can message a coach directly from the coach's profile or a visit request, or message a whole team from its team page.
- A message to a team goes to a shared team inbox. Every coach on that team can read and reply to it.
- Coaches reply to athletes but can't start a conversation; opening their visit calendar to an athlete is how coaches reach out first.
- The inbox shows unread counts, and a badge in the navigation bar shows unread messages.

**Coaches**
- Sign up as a coach and fill in your **coach profile**: **title (Coach, Recruiter, or Assistant), Team ID, team name, and team sport**. Division is optional. Coaches enter these themselves.
- Coaches reach their profile from the dashboard. A checklist on the dashboard shows which fields are still missing.
- **Team ID** identifies a team. The first coach to enter a Team ID, or a team name and sport, creates that team. A Team ID can't be reused for a different sport, and matching ignores case.

**Shared coaching staff**
- A team's coaches and recruiters share one team profile.
- **Joining a team:** once a team has staff, a coach can't join it by typing its Team ID or name. A staff member has to add them on the team's **Staff** page by email, choosing a title (Coach, Recruiter, or Assistant).
  - Someone who already has a coach account joins right away.
  - Anyone else joins automatically when they sign up as a coach with that email.
  - A coach already on another team's staff has to leave that team first.
- **Managing staff:** staff members can remove other members, leave the team, and cancel pending invites. A team with no staff left can be claimed again by entering its Team ID or name.
- **What staff share:**
  - posting as the team;
  - the team inbox;
  - the **recruiting board**, a shared list of athletes added by Athlete ID or from a profile, with notes any staff member can edit. Each entry shows who added it and who last updated it;
  - a view of every staff member's visit requests and scheduled visits.
- **Contact info:** an athlete's contact info is visible to the whole staff once any staff member confirms a visit with them.
- **Team name changes:** staff who edit their own profile stay on their team. A corrected team name renames the team for everyone.
- Search athletes by name, school, city, or Athlete ID. Filter by sport, position, grad year, state, and minimum star ranking, and sort by national ranking.
- Watch highlights. Video views are counted, and an athlete's own views are not.
- **Visit calendar:** add open visit times with a date, start time, length, how many athletes can attend, and location or notes. A single time can be a one-on-one visit or a group event such as a junior day.
- **Private calendar, opened by Athlete ID:** a coach's calendar is never public. Coaches open it to specific athletes they're interested in by entering the athlete's **Athlete ID** and an optional message, either on the calendar page or from the athlete's profile, optionally mentioning the video that caught their eye. Only those athletes can see the coach's open times and request visits, so coaches aren't spammed with requests.
  - Athlete IDs match regardless of case. An athlete without an Athlete ID can't be given access until they add one.
  - An athlete has one open request or upcoming visit per coach.
  - Coaches confirm or decline each request on their dashboard. Confirming a time checks that it isn't full.
  - The calendar page lists the athletes with access and whether each has no request, a request waiting, or a scheduled visit. Coaches can close their calendar to an athlete at any time. This drops requests still waiting, and confirmed visits stay.
- See bookings on your calendar and dashboard. Times with confirmed visits can't be removed. Removing a time drops requests still waiting on it.
- Post photos (JPG, PNG, WebP, GIF) or videos with captions to your team's page. Posts appear in athletes' feeds.
- A team is one school's program in one sport, set up from the coach profile (see Team ID above). Coaches can delete their own posts.

**Privacy:** an athlete's email and phone stay hidden from a coach until that coach (or someone on their staff) confirms a visit with the athlete. Many athletes on a platform like this are minors, so contact is opt-in.

**Navigation:** the top bar holds only the core destinations: Feed, Messages, and Dashboard, plus Upload for athletes and Find athletes for coaches. The dashboard links to everything else: your profile, visit calendar, recruiting board, and team page with staff and posting.

**Reporting fraudulent accounts**
- Any signed-in user can report another athlete or coach from their profile. They pick a reason (fake identity, not really with the program, false stats, scam or spam, other) and can add details. Reporting the same account again updates the earlier report.
- When 3 or more different people have open reports on an account, its profile shows a warning to everyone who views it.
- Moderators, whose emails are listed in `ADMIN_EMAILS`, review open reports at `/reports`. Confirming marks the account as fraudulent and shows a stronger warning on its profile. Dismissing clears that one report.

## Tech stack

- Node.js 22.13 or newer with Express. Pages are rendered on the server with EJS.
- SQLite through Node's built-in `node:sqlite`, so there is no native database dependency.
- Multer handles uploads. Videos are stored on local disk and served with HTTP range support, so the player can seek.
- Passwords are hashed with scrypt. Sessions use `express-session` cookies set to `httpOnly` and `sameSite=lax`.

## Running it

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # restarts on file changes
npm test           # end-to-end tests (node:test)
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | random on each start | Signs session cookies. Set it so logins survive a restart. |
| `ADMIN_EMAILS` | none | Comma-separated emails of moderators who review fraud reports at `/reports`. |

Data is stored in `data/app.db` and uploaded videos in `uploads/`. Git ignores both.

## Project layout

```
src/
  app.js            Express app factory (configurable DB path, upload dir, limits)
  server.js         Entry point
  db.js             SQLite schema and migrations
  auth.js           Password hashing and auth/role/moderator middleware
  constants.js      Sports, states, allowed video types, report reasons
  paths.js          Safe redirect paths and profile URLs
  uploads.js        Shared upload middleware for videos and images
  calendar.js       Visit calendar time helpers (no database access)
  services/         Domain logic shared across routes, with no HTTP:
                    teams (team membership and creation rules), visits (slots, calendar access,
                    visit requests), messages (inbox access, unread counts), social (follow counts),
                    reports (fraud warnings)
  routes/           HTTP handlers, which use services but never import each other:
                    auth, profile, videos, athletes (search/profile), dashboard,
                    calendar (coach's visit times and who has access), visits (athletes' requests, coaches' answers),
                    feed (home feed, teams, team posts, likes, follows), people (follows, coach profiles),
                    messages (direct and team-inbox messaging), staff (team staff and shared recruiting board),
                    reports (fraud reports and moderation)
views/              EJS templates
public/styles.css   Styles (light and dark mode)
test/app.test.js    End-to-end tests
```

## Before going to production

- Video encoding: browsers play H.264 MP4 and WebM, but some phone uploads (for example HEVC `.mov` files from iPhones) won't play in every browser. Add an ffmpeg transcode step, and generate thumbnails in the same pass.
- Storage: move videos to object storage (S3, GCS, or R2) behind a CDN, and use direct-to-bucket uploads for large files.
- Sessions: replace the in-memory session store with a persistent one, such as Redis or SQLite.
- Security: add CSRF tokens, rate limiting on login and upload, email verification, and verification that coaches really work for the programs they list.
- Verification: rankings and Athlete IDs are self-reported. Consider verifying them against an official source or labeling them as self-reported.
- Staff: staff membership is managed by email, with no confirmation step and no roles. Any staff member can add or remove anyone. Consider staff admins, email verification, and an audit log for changes to the recruiting board.
- Teams: Team IDs and team names are self-reported. Check Team IDs against an official list of programs, and verify that coaches belong to the team they post as. Without a Team ID, "Notre Dame" and "University of Notre Dame" still become separate teams.
- Feed: comments, Stories-style highlights, notifications when a followed team posts, and liking without reloading the page.
- Visit calendar: times are entered and shown as campus-local time without a time zone. Add per-school time zones, calendar file (.ics) or Google Calendar invites, reminders, and a way for coaches to move or cancel booked visits with notice to the athlete. Consider recruiting-calendar rules for official and unofficial visits.
- Messaging safety: many athletes are minors. Add reporting and blocking, keep messages for moderation, and consider letting parents or guardians see messages and coaches' messaging rules (for example, NCAA recruiting contact periods).
- Messaging: new messages only appear after a page reload. Add live updates and email or push notifications.
- Product: saved athletes for coaches, email notifications for new visit requests, and reporting and moderation for uploaded content.
