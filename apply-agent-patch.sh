#!/usr/bin/env bash
echo "=== Committing and pushing agent.js patch ==="
git add -A
git commit -m "fix: include mimeType/originalName in jobs/next response for print agent" || echo "(Nothing new to commit)"
git push
echo "DONE"
