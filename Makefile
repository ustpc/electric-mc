# The extension's commands, from the top of the repository. See extension/Makefile.
# The notes server's are prefixed notes- (make notes-test, make notes-deploy);
# see backend/notes/Makefile.
# make mc-queue USERID=you lists the Co-Chair "Awaiting AE Assignment" IDs
# (tools/mc-watch/mc_queue.py, run with uv).

.DEFAULT_GOAL := help

mc-queue:
	@test -n "$(USERID)" || { echo "usage: make mc-queue USERID=your-MC-user-id" >&2; exit 2; }
	@uv run tools/mc-watch/mc_queue.py $(USERID) $(ARGS)

notes-%:
	@$(MAKE) --no-print-directory -C backend/notes $*

%:
	@$(MAKE) --no-print-directory -C extension $@
