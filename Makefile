# The extension's commands, from the top of the repository. See extension/Makefile.
# The notes server's are prefixed notes- (make notes-test, make notes-deploy);
# see backend/notes/Makefile.
# make roster [TEAM=../cacm-opn-dashboard/data/team.yaml] writes var/roster.json for the Matrix window.
# make mc-queue [USERID=you] lists, downloads, and prints the Co-Chair "Awaiting AE Assignment" IDs
# (tools/mc-watch/mc_queue.py, run with uv); make mc-watch-test tests mc_store.py.

.DEFAULT_GOAL := help

TEAM ?= ../cacm-opn-dashboard/data/team.yaml

roster:
	@uv run tools/roster-export/export_roster.py $(TEAM) var/roster.json

mc-queue:
	@uv run tools/mc-watch/mc_queue.py $(USERID) $(ARGS)

mc-watch-test:
	@uv run --with pytest --with keyring --with playwright --with psutil pytest -q tools/mc-watch

notes-%:
	@$(MAKE) --no-print-directory -C backend/notes $*

%:
	@$(MAKE) --no-print-directory -C extension $@
