# The notes server: test, build and deploy. Deploying needs the AWS CLI
# signed in to account 075439264285 and cargo-lambda; see README.md.

.DEFAULT_GOAL := help
.PHONY: help test build deploy

help: ## List the commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-20s %s\n", $$1, $$2}'

test: ## Run the tests (no AWS needed)
	cargo test

build: ## Build the Lambda zip for arm64 into target/lambda/bootstrap/
	cargo lambda build --release --arm64 --output-format zip

deploy: build ## Create or update the table, role, function and its URL (needs OWNERS=you@example.org)
	./deploy.sh
