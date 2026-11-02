# Content Flow – Development Plan

Stand-alone web app for the digital team to run tasks from idea to posting: each task follows a flow of people who accept, start, close and pass it on.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React with TypeScript, built with Vite. TanStack Query handles data fetching and keeps the board fresh. |
| Backend | Node with TypeScript, running as Vercel Functions with the Hono framework. Zod checks incoming data. |
| Database | Neon Postgres, connected with Neon's serverless driver, which suits Vercel Functions. Drizzle ORM handles migrations. |
| Login | Email and password. Only the admin, mohammed@emqube.com, creates accounts. Sessions live in the database and travel in a secure cookie. |
| Deploy | One Vercel project: the built React app is served as static files and the API runs as Vercel Functions. A daily Vercel Cron job deletes completed tasks one year after completion. |
| Updates | The board refreshes itself every 20 seconds. Viewing is enough, so there are no notifications or websockets. |

## Data model

- **users:** name, email, password hash, initials, colour, role (admin or member) and an active flag.
- **clients** and **task\_types:** editable lists, so a new client does not need a developer.
- **tasks:** month, client, type, title, description, notes, owner, due date, media, priority rank and a version number.
- **task\_steps:** the flow. One row per person, with a position and a status (waiting, offered, to-do, active or done) plus accepted, started and closed timestamps.
- **templates** and **template\_steps:** the stored flows.
- **activity:** who did what and when, which gives a history for free.

## Rules enforced on the server

- Only the person holding a task can accept, start or close it.
- Anyone can pass a task on. Only the admin creates or deactivates accounts and manages clients and task types.
- Only the owner (or an admin) can edit the flow, and only for people who have not finished yet.
- The version number stops two people overwriting each other's change. The second person gets "someone just changed this" and the board refreshes.

## Build phases

1. **Foundation:** repo, Neon project with dev and production branches, migrations, login, the user list, and deployment, so it is live from day one.
2. **Core board:** task create and edit, the board columns per person, and accept, start, close and pass. Shown to the team first.
3. **Priority and filters:** ordering within a person's column, the Month, Owner, Client and Type filters, and the description box.
4. **Other views:** Tracker (the Excel grid), List and Templates.
5. **Import and clone:** the Excel upload with a preview before anything is created (the file is read in the browser and only the rows are sent to the server), and Clone month, which starts afresh by leaving descriptions blank. Both use the current sheet layout. Completed tasks show only the last 7 days on the board and are deleted a year after completion.
6. **Hardening:** tests for the flow rules, login rate limiting, backups (Neon point-in-time restore), error handling, and a short guide for the team.

Phases 1 to 3 give a usable app, and the team could start on it then. For one developer, the rough estimate is three to four weeks overall, to be tightened once the open choices below are settled.

## Things to watch

- **Vercel plan:** the free Hobby plan is limited to non-commercial use under Vercel's terms, so confirm it is acceptable for a company tool. Moving to Pro later needs no code changes.
- **Neon sleeping:** the free tier pauses the database after a few minutes idle, so the first load can take about a second. The paid tier can turn this off.
- **Deletion job:** one daily Vercel Cron job removes completed tasks older than a year, with their flow steps and history.
- **Dates:** store dates in Dubai time so "due today" is correct.
- **Delivery:** code is handed over as text in the chat, file by file at each phase, with an exact "run this and check that" list at the end of each phase.

## Decisions

Decided:

- Hosting: Vercel, on the free plan.
- Web address: the default Vercel address, no custom subdomain.
- Login: accounts created by the admin, mohammed@emqube.com.
- First sign-in: every new account starts with one shared temporary password, kept as a server setting rather than in the code, and the person must change it at first sign-in.
- Completed tasks: deleted one year after completion.
- Phones: mobile-friendly website only, no app install.
- Cloning a month: starts afresh, so descriptions are not copied.
