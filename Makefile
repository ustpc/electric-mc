# The extension's commands, from the top of the repository. See extension/Makefile.
# The notes server's are prefixed notes- (make notes-test, make notes-deploy);
# see backend/notes/Makefile.

.DEFAULT_GOAL := help

notes-%:
	@$(MAKE) --no-print-directory -C backend/notes $*

%:
	@$(MAKE) --no-print-directory -C extension $@
