# Decisions

## Preserve the prototype's working entry point during the audit

Phase 0 keeps the existing Vite layout and Supabase Auth. The active route tree and localStorage data layer can be verified in place. Moving the frontend or changing authentication during the audit would combine feature work with baseline verification.

## Keep existing Git history

The owner accepted the historical environment-file finding and is rotating the affected credentials. This phase keeps the file out of the index and leaves existing history intact, as directed.

## Use a local automation identity for the audit commit

Git has no configured author in this checkout. The audit commit uses a command-local Codex identity. This leaves repository settings and the owner’s authorship untouched.
