# VPS Agent (Go) build pipeline
#
# Usage:
#   make help          Show available targets
#   make proto         Regenerate Go protobuf bindings (agent/pb/vps.pb.go, agent/pb/vps_grpc.pb.go)
#   make build         Build for the current host (CGO_ENABLED=1)
#   make build-linux   Cross-compile for Linux amd64
#   make build-windows Cross-compile for Windows amd64
#   make build-all     Build for both Linux and Windows
#   make test          Run unit tests with race detector and coverage
#   make vet           Run go vet
#   make clean         Remove build artifacts and coverage output
#
# Notes:
#   - CGO_ENABLED=1 is REQUIRED because github.com/creack/pty links against
#     platform C libraries (libutil on Linux/macOS). A pure-Go build will fail
#     to link on Unix targets.
#   - The `proto` target requires the Go protobuf plugins on $PATH:
#         go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#         go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
#     It regenerates:  agent/pb/vps.pb.go  and  agent/pb/vps_grpc.pb.go
#   - The `protoc` binary is read from ../protoc/bin/protoc (per AGENTS.md).

PROTO_ROOT := ../proto
PROTOC     := ../protoc/bin/protoc
GO         ?= go
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT     := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
LDFLAGS    := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT)

.DEFAULT_GOAL := help

.PHONY: help proto build build-linux build-windows build-all test vet clean

help: ## Show this help
	@echo "VPS Agent (Go) build pipeline"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

proto: ## Regenerate Go protobuf bindings into agent/pb/
	@echo "Regenerating Go protobuf bindings from $(PROTO_ROOT)/vps.proto..."
	@command -v protoc-gen-go >/dev/null 2>&1 || (echo "ERROR: protoc-gen-go not found. Install with: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest" && exit 1)
	@command -v protoc-gen-go-grpc >/dev/null 2>&1 || (echo "ERROR: protoc-gen-go-grpc not found. Install with: go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest" && exit 1)
	$(PROTOC) --go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		-I $(PROTO_ROOT) $(PROTO_ROOT)/vps.proto

build: proto ## Build for the current host (CGO_ENABLED=1)
	CGO_ENABLED=1 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o bin/agent .

build-linux: proto ## Cross-compile to bin/vps-agent-linux (linux/amd64)
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o bin/vps-agent-linux .

build-windows: proto ## Cross-compile to bin/vps-agent.exe (windows/amd64)
	CGO_ENABLED=1 GOOS=windows GOARCH=amd64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o bin/vps-agent.exe .

build-all: build-linux build-windows ## Build for both Linux and Windows
	@echo "Built for Linux and Windows in bin/"

test: ## Run all Go tests with race detector and coverage
	$(GO) test ./... -race -coverprofile=cover.out

vet: ## Run go vet
	$(GO) vet ./...

clean: ## Remove bin/ and cover.out
	rm -rf bin/ cover.out
