# The extension's commands, from the top of the repository. See extension/Makefile.
# The notes server's are prefixed notes- (make notes-test, make notes-deploy);
# see backend/notes/Makefile.
# make mc-queue [USERID=you] lists, downloads, and prints the Co-Chair "Awaiting AE Assignment" IDs
# (tools/mc-watch/mc_queue.py, run with uv); make mc-watch-test tests mc_store.py.
# make check-all runs every check and test there is; make install-hooks once per checkout.

.DEFAULT_GOAL := help

mc-queue:
	@uv run tools/mc-watch/mc_queue.py $(USERID) $(ARGS)

mc-watch-test:
	@uv run --with pytest --with keyring --with playwright --with psutil pytest -q tools/mc-watch

py-check: ## Lint (ruff) and type-check (pyright) the Python tools; settings in pyproject.toml
	uvx ruff check .
	uvx --with playwright --with psutil --with keyring --with pytest --with pillow pyright

check-real-data: ## Look for real MC data in tracked files (and, here, for anything named in var/)
	node tools/privacy/check-no-real-data.mjs

install-hooks: ## Check every commit and commit message for real MC data (git hooks in .githooks/)
	git config core.hooksPath .githooks
	@echo "Hooks installed: pre-commit and commit-msg run tools/privacy/check-no-real-data.mjs"

check-all: ## Everything CI runs, plus the local-only real-data tests: extension, notes server, Python tools
	@$(MAKE) --no-print-directory -C extension check
	@$(MAKE) --no-print-directory -C backend/notes test
	@$(MAKE) --no-print-directory py-check
	@$(MAKE) --no-print-directory mc-watch-test

notes-%:
	@$(MAKE) --no-print-directory -C backend/notes $*

%:
	@$(MAKE) --no-print-directory -C extension $@
