# Targets:
#   make test        differential tests under ASan and UBSan
#   make bench       benchmark against Boost.MultiIndex (needs BOOST_INC)
#   make examples    build and run examples/
#   make kinds       per-kind micro-benchmark and parameter sweeps
#   make playground  build the WebAssembly playground into playground/web (needs EMCC)
#   make serve       serve playground/web on http://localhost:8080
#
# On NixOS: BOOST_INC=$(nix build nixpkgs#boost.dev --no-link --print-out-paths)/include
#           EMCC=$(nix build nixpkgs#emscripten --no-link --print-out-paths)/bin/em++

CXX      ?= g++
CXXFLAGS ?= -std=c++23 -Wall -Wextra -Iinclude
BUILD    ?= build
EMCC     ?= em++
BOOST_INC ?=

.PHONY: all test bench kinds examples playground serve clean
all: test

$(BUILD):
	mkdir -p $(BUILD)

test: $(BUILD)
	$(CXX) $(CXXFLAGS) -O1 -g -fsanitize=address,undefined test/test.cpp -o $(BUILD)/test
	$(BUILD)/test

bench: $(BUILD)
	$(CXX) $(CXXFLAGS) -O2 -DNDEBUG $(if $(BOOST_INC),-I$(BOOST_INC)) bench/bench.cpp -o $(BUILD)/bench
	$(BUILD)/bench

kinds: $(BUILD)
	$(CXX) $(CXXFLAGS) -O2 -DNDEBUG bench/kinds.cpp -o $(BUILD)/kinds
	$(BUILD)/kinds

examples: $(BUILD)
	for e in quickstart custom_kind tuning event_log; do $(CXX) $(CXXFLAGS) -O2 examples/$$e.cpp -o $(BUILD)/$$e && $(BUILD)/$$e; done

playground:
	mkdir -p playground/web
	EM_CACHE=$(abspath $(BUILD))/emcache HOME=$(abspath $(BUILD))/emhome \
	$(EMCC) -std=c++23 -O2 -Iinclude playground/playground.cpp -o playground/web/multiview.js \
	  -sMODULARIZE=1 -sEXPORT_NAME=createMultiview -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,node \
	  -sEXPORTED_FUNCTIONS=_pg_reset,_pg_run,_pg_exec,_pg_explain,_pg_json,_pg_exec_json,_pg_results,_pg_set_copies,_pg_row,_malloc,_free \
	  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAPF64

serve:
	python3 playground/serve.py 8080

clean:
	rm -rf $(BUILD) playground/web/multiview.js playground/web/multiview.wasm
