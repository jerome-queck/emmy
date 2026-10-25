---
name: sign-in
description: Recover an expired sign-in in Emmy's actual environment. Prompt the owner in the current ChatGPT conversation, use a supported secure form or authentication handoff, preserve denials, and verify the intended account.
---

# Recover a sign-in

Use this when a protected read requires sign-in, SSO, password entry, or MFA. Read the actual service state first. Treat browser and connector authentication separately, even for the same account.

1. Verify the issuing service, actual executor, browser or connector, and intended account from the current owner source or existing private nonsecret recipe. Never guess a provider or username. Preserve the source and exact denied scope privately.
2. Prompt the owner promptly in this ChatGPT conversation. Name the service, account, environment, failure, and exact next action. Do not silently wait for the owner to discover the login screen. Use the supported secure password form when exposed. Otherwise use a supported authentication handoff. If neither exists, say so here and name the supported service UI action. Never request a password in ordinary chat.
3. Continue ordinary SSO. Use a supported remember-device or Stay signed in choice when appropriate. Do not weaken MFA or promise permanent login. Keep unrelated connector and Computer Use grants separate.
4. For an ordinary Authenticator OTP, prompt the owner here for the current code. Use it once only at the matching issuing-service login. Never replay an old code. Show a current Microsoft number matching challenge for owner approval. Do not approve it yourself.
5. Verify protected same-account content through the surface that needed recovery. A login page, account avatar alone, another service's SSO state, or a connector working elsewhere is insufficient. Use the smallest authorized meaningful read. Retain nonsecret source/account/surface/time and protected-content evidence privately.
6. Record scoped recovery in the existing responsibility journal. Tell the owner what recovered and what remains blocked. Later ordinary-turn use remains separate from installing or loading this skill.

Never persist passwords, tokens, OTPs, MFA seeds, challenge secrets, or secure-form values in files, notes, logs, journal receipts, command envelopes, fixtures, or transcripts. Do not copy a secret into the sign-in decision command. It accepts only nonsecret decision metadata. The parent uses a current ordinary OTP transiently in the authorized matching login UI.

Classify an attributable authentication response as `login-expired`. Preserve `denied-action`, `unavailable-tool`, `timeout`, and `unknown` separately. An uncertain action needs outcome inspection before retry. One retry is allowed only for a known-unexecuted action with materially relevant new authorization for the exact denied scope. A persistent denial stops that scope. A sign-in request never expands access.

`agent signin --file <private-nonsecret-envelope.json>` exercises this decision path. Its advisory output cannot authenticate a service, display a secure form, or grant access. Read [the fleet procedure](../../../docs/fleet-health.md) for its schema and parent-owned delivery boundary.
