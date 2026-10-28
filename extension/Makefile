# Everyday commands for the Electric MC extension. Run "make" for the list.

.DEFAULT_GOAL := help
.PHONY: help update install build test typecheck check dev zip store clean ae-profiles install-log-host uninstall-log-host

help: ## List the commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-20s %s\n", $$1, $$2}'

update: ## Pull the latest code, install packages, and build
	git pull
	$(MAKE) build

# npm rewrites node_modules/.package-lock.json on every install, so packages
# are reinstalled only when package.json or the lock file changed.
node_modules/.package-lock.json: package.json package-lock.json
	npm install
	@touch $@

install: node_modules/.package-lock.json ## Install packages if they changed

build: install ## Build into build/chrome-mv3 (then reload it in chrome://extensions)
	npm run build

test: install ## Run the tests
	npm test

typecheck: install ## Check the TypeScript types
	npm run typecheck

check: typecheck test ## Typecheck and test

dev: install ## Run WXT in watch mode
	npm run dev

zip: install ## Zip a test build into build/
	npm run zip

store: install ## Zip the Chrome Web Store package into build/
	npm run zip:store

ae-profiles: install ## Build AE expertise profiles: make ae-profiles ROSTER=roster.json [IDS=ids.json] [ARGS=--all]
	node scripts/fetch-model.mjs
	npx tsx tools/ae-profiles/build.ts $(ROSTER) $(if $(IDS),--ids $(IDS)) $(ARGS)

install-log-host: ## Let test builds write the live log to ../var/electric-mc.log (macOS Chrome)
	python3 tools/log-host/install.py $(if $(EXT_ID),--ext-id $(EXT_ID))

uninstall-log-host: ## Unregister the live log helper
	python3 tools/log-host/install.py --uninstall

clean: ## Remove build output
	rm -rf build .wxt
