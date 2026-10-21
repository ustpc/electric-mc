# The extension's commands, from the top of the repository. See extension/Makefile.

.DEFAULT_GOAL := help

%:
	@$(MAKE) --no-print-directory -C extension $@
