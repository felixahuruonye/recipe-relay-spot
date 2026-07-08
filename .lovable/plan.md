# Implementation Plan

Big surface area, so I'm slicing into 4 workstreams. All ship in this pass.

## 1. Share-link 404 fix (`/api/share-profile`, `/api/share-post`)

Root cause candidates I'll verify with a live fetch against the deployed domain:
- Vercel not building `api/*.ts` (missing `@vercel/node` / edge runtime hint the deployment recognises).
- `vercel.json` rewrite regex accidentally swallowing `/api/*`.
- Missing `get_public_profile_preview` RPC referenced by `api/share-profile.ts`.

Actions:
- Verify `get_public_profile_preview` RPC exists in Supabase; if not, create it (SECURITY DEFINER, `search_path = public`) returning `username / avatar_url / bio` from `user_profiles` where `id::text LIKE code || '%'`.
- Tighten `vercel.json` to explicitly route `/api/share-post` and `/api/share-profile` to their functions and keep the SPA fallback for everything else.
- Add a top-level `package.json`-compatible export shape (`export default handler`) sanity-check on both files.
- Add a `public/api-health.txt` and a matching route in code so we can prove functions deploy.
- Instruct user (in final reply) to redeploy on Vercel — edge functions only appear after deploy.

## 2. Marketplace admin approval workflow

- Migration on `public.products`:
  - Add `approval_status TEXT NOT NULL DEFAULT 'pending'` (`pending | approved | rejected`), `approved_by UUID`, `approved_at TIMESTAMPTZ`, `rejection_reason TEXT`.
  - Set every existing row to `pending` (user chose "require approval for all").
  - Update RLS: public `SELECT` only where `approval_status = 'approved'`; owner can always see own; admins (via `has_role`) can see all.
- New admin RPCs: `admin_approve_product(p_id)`, `admin_reject_product(p_id, p_reason)`.
- New Admin tab `MarketplaceApprovalsTab.tsx` under `src/components/Admin/` with pending queue, approve/reject buttons, realtime refresh. Wire into `src/pages/Admin.tsx`.
- On `src/pages/Marketplace.tsx` seller submission: show toast "Submitted for review". Show a "Pending review" badge on the seller's own pending items in their profile.

## 3. Pause background media when Create Post opens

- Add a lightweight `MediaBusContext` (`src/contexts/MediaBusContext.tsx`) exposing `pauseAll()` + a global CustomEvent `lenory:media:pause-all`.
- `TikTokFeed` video/audio elements and any storyline audio listen for the event and call `.pause()`.
- `CreatePostWizard` fires `pauseAll()` on mount and again when the live camera stream initialises.

## 4. Chat Settings — Module A (per-chat) + Module B (global)

Schema additions:
- `chat_preferences` (per user + partner): `read_receipts_enabled`, `typing_indicator_enabled`, `muted_until`, `disappearing_duration`, `theme_key`, `is_archived`, `is_restricted`.
- `blocked_users` (blocker_id, blocked_id, created_at, reason).
- `message_delivery_prefs` (user_id, friends_of_friends, group_members, page_followers, others) — enum: `chats | requests | none`.
- `user_messaging_settings` (user_id, active_status_visible, notifications_enabled).
- Full GRANTs + RLS scoped to `auth.uid()`.

Routing (React Router):
- `/chat/settings` → Module B root (Page B1)
- `/chat/settings/requests` (B2), `/chat/settings/privacy` (B3), `/chat/settings/delivery` (B4), `/chat/settings/blocked` (B5), `/chat/settings/delivery/:target` (B6)
- `/chat/:partnerId/settings` → Module A root (A1)
- `/chat/:partnerId/settings/privacy` (A2), `/chat/:partnerId/settings/disappearing` (A3); theme picker is a bottom `Sheet` on A1 (A4).

UI entry points:
- Gear icon in `src/pages/Chat.tsx` header → `/chat/settings`.
- Info icon in `src/components/Chat/PrivateChat.tsx` header → `/chat/:partnerId/settings`.

Component files (new):
- `src/pages/ChatSettings/GlobalSettings.tsx` (B1)
- `src/pages/ChatSettings/MessageRequests.tsx` (B2)
- `src/pages/ChatSettings/GlobalPrivacy.tsx` (B3)
- `src/pages/ChatSettings/MessageDelivery.tsx` (B4)
- `src/pages/ChatSettings/BlockedAccounts.tsx` (B5)
- `src/pages/ChatSettings/DeliveryTarget.tsx` (B6)
- `src/pages/ChatSettings/ChatProfile.tsx` (A1, includes theme sheet A4)
- `src/pages/ChatSettings/ChatPrivacy.tsx` (A2)
- `src/pages/ChatSettings/DisappearingMessages.tsx` (A3)
- Shared: `src/components/ChatSettings/SettingsRow.tsx`, `ThemePickerSheet.tsx`.

All 3-dot "Restrict / Block / Report" actions reuse existing report modal + new `blocked_users` insert. "Learn more" links point to `/settings` (existing Help & FAQ per prior memory).

## Verification
- Curl both `/api/share-*` on the deployed domain after redeploy.
- Playwright smoke: open Create Post → confirm feed video is paused.
- Manual: list a product → confirm it disappears from public marketplace and appears in Admin approvals; approve → reappears.
- Manual: open Chats → gear → land on Module B; open a DM → info → land on Module A; toggle each pref and confirm DB row updates.

## Not in scope this pass
- Redesigning the existing chat message bubbles.
- Encryption key management UI on B3 (renders as a stubbed section with "Coming soon" — user can flesh out later).

Approve to proceed.