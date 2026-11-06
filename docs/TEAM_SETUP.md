# Team workspace setup (Supabase)

The app works fully offline in each browser. The optional **team workspace** adds:

- **Shared assessments.** Saves use conflict detection, so nobody silently overwrites a teammate.
- **Roles.** Owner, editor, reviewer and viewer.
- **Comments** on the whole assessment or on a component, flow, boundary, threat or control. Comments update live.
- **Sign-off.** Each sign-off is bound to an immutable version snapshot and its server-computed SHA-256 (Appendix D: approval bound to payload).

The data lives in **your own Supabase project**. All access rules run in the database as row-level security (RLS). The browser app is never trusted to enforce them.

Setup takes about 10 minutes and works on Supabase's free plan.

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and click **New project**.
2. Pick an organization, a name (e.g. `threat-modeler`), a strong database password and a **region**.
   - Assessments describe confidential architecture, so choose the region your data policy requires.
   - Before storing real assessments, check the project against your organization's vendor and data-handling rules.

## 2. Create the tables and security rules

1. In the project, open **SQL Editor → New query**.
2. Paste the whole contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**. It is safe to run again after updates.
3. Optional: under **Database → Replication**, make sure `comments` is in the `supabase_realtime` publication. The script adds it when the publication exists. Without it, comments still refresh every 30 seconds.

## 3. Configure sign-in

The app signs people in with a one-time email link.

1. **Authentication → Providers → Email:** keep it enabled.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://charonn412.github.io/Threat-Modeling-App/`
   - **Redirect URLs:** add the same URL. Add `http://localhost:5173/` too if you run the app locally.
3. For production use, set up **custom SMTP** under **Authentication → Emails**. Supabase's built-in sender is rate-limited.
4. Optional: to restrict who can join, enable **Authentication → Sign In / Providers → Allow new users to sign up** only for your domain. Alternatively, invite users and disable open sign-ups.

## 4. Connect the app

Copy two values from **Project Settings → API**:

- **Project URL**, e.g. `https://abcdxyz.supabase.co`
- **Publishable key** (shown as `anon` or `sb_publishable_…`)

The publishable key is meant to be public. It only identifies the project, and RLS decides what each signed-in user can do. **Never** use the `service_role` / secret key in the app.

Then connect in one of two ways:

- **Per browser:** in the app, open ⚙ **Settings → Team workspace**, paste both values and click **Connect**.
- **For everyone, built in:**
  1. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables**.
  2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
  3. Re-run the **Deploy to GitHub Pages** workflow.

## 5. Use it

1. Everyone signs in once from the Home page with their work email. This creates their account.
2. Open an assessment and click **☁ Share … with the team**. You become its owner.
3. Click **👥** in the top bar and use **Members** to add colleagues by email:

   | Role | Can do |
   |---|---|
   | Editor | Edits the assessment |
   | Reviewer | Comments and signs off |
   | Viewer | Reads and comments |

4. **Comments:** in the 👥 panel, comments attach to whatever you have selected, such as a component, flow, threat or control.
5. **Sign-off:**
   1. An editor or owner clicks **Create version for sign-off**.
   2. Each approver chooses the role they sign as and records a decision.
   3. Sign-offs cannot be edited or deleted. If the assessment changes afterwards, the panel says so; create a new version and sign again.

**Conflicts.** If two people edit at once, the second save is rejected and a banner offers two options:

- **Load theirs:** your edits are kept as a separate local assessment.
- **Overwrite with mine.**

## What is enforced, and how it was tested

`supabase/tests/run.sh` starts a throwaway PostgreSQL 16, emulates Supabase's `auth` schema and API roles, applies the schema twice, and runs 39 checks. Among them:

- **Outsiders** cannot read, save, comment, delete or add themselves.
- **Editors** cannot take ownership, add members or delete.
- **Reviewers** cannot edit.
- **Stale saves** are rejected as conflicts.
- **Forged identities** are replaced by the server: owner, author, signer and the sign-off hash.
- **Sign-offs and versions** are immutable.
- **The last owner** cannot leave.
- **Anonymous** callers get nothing.

The app's client calls were tested against a simulated API, not a live Supabase project. Check the first real setup end to end.
