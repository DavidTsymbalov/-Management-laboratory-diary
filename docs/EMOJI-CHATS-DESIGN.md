# Emoji chats and purposeful motion

Preserve the current ink #080a0d, paper #e5dac3, selected surface #1a2330,
light white #ffffff and light ink #161a20. Keep Aktiv Grotesk / Inter. No rebrand.
The pupil diary becomes two clear destinations: results and emoji conversations.

Desktop: own name and results above a quiet journal; conversations use a pupil
list beside one thread. Phone: list → conversation with a visible back control,
scrollable history and a reachable eight-emoji composer. No fabricated online
indicators, no upload controls. Text messages share the same conversation. Existing avatars use initials.

    pupil name                              account / theme
    Diary       Chats (unread)
    results                       peers | selected emoji thread
                                  peers | eight emoji actions

The playful moment is the received emoji: 48 large copies spread across the whole
viewport over about four seconds. Effects use a body portal and never intercept touch or focus.
No background confetti, page shaking, floating decorative icons or timed onboarding.
Animation and chat blocking remain directly controllable by the recipient. Audio is removed.
An unopened conversation retains unread reactions. Opening it plays the latest unread
emoji once, including when it was received before login. Live reactions play only in
the selected visible conversation. Read history does not replay.

Motion map:
- Entry routes keep the existing square page transition.
- Theme change uses a 600 ms cover/reveal with actual square cells, no screenshot.
- Teacher tabs and Diary/Chats are lateral opacity transitions (180 ms).
- Class sorting preserves row identity; background refreshes stay quiet.
- Mobile peer list → conversation is hierarchical; the pupil avatar connects them.
- No Suspense data boundary exists in this client-backed app; no artificial skeleton.

The pupil picker is a searchable editable combobox with a listbox, keyboard
navigation, Escape/outside dismissal, checked selection and a scrollable phone list.
It replaces the OS selector, not the form around it.

Security: only verified pupil accounts (including pupil administrators) participate.
Teachers are neither senders nor recipients. Only participants can read a thread;
the pupil directory exposes names and own conversation metadata, never scores or
credentials. Send RPCs enforce emoji allowlist, idempotent retries, bilateral
blocking and rate limits. Read positions are private to their owner.

Review: avoid building an oversized generic messenger. Use the existing journal
palette and the actual eight reactions. The selected conversation and its composer
carry the interaction; the rest stays quiet. No audio assets or audio initialization remain.
