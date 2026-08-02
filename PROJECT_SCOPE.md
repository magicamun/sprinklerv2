# Sprinkler Project Scope

## Purpose

This document defines the scope of the Sprinkler project inside the larger
Home Assistant `/config` workspace.

The Home Assistant workspace contains many files and components that are not
part of this project.

Only files and directories explicitly listed in this document belong to the
Sprinkler project.

## Main Subsystems

The project consists of three main subsystems:

### EToEngine

Weather data acquisition, provider integration, evapotranspiration (ETo),
forecast processing and orchestration of hydro calculations.

### Sprinkler

Irrigation scheduling and execution, including programs, queues, zones,
runtime adaptation and hardware control.

### HydroStore

Shared hydro-domain data and persistence used by both EToEngine and Sprinkler.

HydroStore is a shared subsystem. It must not be considered an implementation
detail of either EToEngine or Sprinkler.

## Scope Rules

When working on this project:

- Treat the file list below as the authoritative project scope.
- Do not modify files outside this scope unless explicitly instructed.
- Files outside the scope may only be read when necessary to understand an
  explicit dependency.
- Before modifying a file outside the scope, ask for approval.
- Ignore `ui/node_modules` completely.
- Treat generated or bundled files under `www/assets` as build artifacts when
  corresponding source files exist under `ui`.
- Prefer modifying source files rather than generated artifacts.

## Project Files

<!--
./pyscript
./pyscript/sprinkler.py
./pyscript/etoengine.py
./pyscript/openmeteo.py
./pyscript/raincollector.py
./pyscript/opensprinkler.py
./pyscript/sprinkler_zones.json
./pyscript/modules
./pyscript/modules/infra
./pyscript/modules/infra/store
./pyscript/modules/infra/store/hydrostore.py
./pyscript/modules/infra/http.py
./pyscript/modules/infra/queues
./pyscript/modules/infra/queues/base_queue.py
./pyscript/modules/infra/queues/manual_queue.py
./pyscript/modules/infra/queues/active_queue.py
./pyscript/modules/infra/queues/queue_entry.py
./pyscript/modules/infra/queues/program_queue.py
./pyscript/modules/infra/queues/program_block.py
./pyscript/modules/infra/queues/done_queue.py
./pyscript/modules/infra/providers
./pyscript/modules/infra/providers/provider_homeassistant.py
./pyscript/modules/infra/providers/provider_context.py
./pyscript/modules/infra/providers/provider_base.py
./pyscript/modules/infra/providers/provider_openmeteo.py
./pyscript/modules/infra/providers/provider_manager.py
./pyscript/modules/util
./pyscript/modules/util/datetime_utils.py
./pyscript/modules/sprinkler
./pyscript/modules/sprinkler/manual_queue_owner.py
./pyscript/modules/sprinkler/programs.py
./pyscript/modules/sprinkler/sprinkler_config.py
./pyscript/modules/sprinkler/events.py
./pyscript/modules/sprinkler/scheduler.py
./pyscript/modules/sprinkler/zones.py
./pyscript/modules/sprinkler/context.py
./pyscript/modules/sprinkler/program_engine.py
./www/assets/sprinkler-events-CxLMZHQA.js
./www/assets/sprinkler-events-CSrkG5hg.js
./www/assets/sprinkler-utils-mL3GiV5Z.js
./www/sprinklerv2
./www/sprinklerv2/sprinklerv2-timeline-card.js
./www/sprinklerv2/sprinklerv2-eto-card.js
./www/sprinklerv2/sprinklerv2-zones-card-v2.js
./www/sprinklerv2/sprinklerv2-utils.js
./www/sprinklerv2/favicon.svg
./www/sprinklerv2/sprinklerv2-programs-card-v2.js
./www/sprinklerv2/icons.svg
./sprinkler
./sprinkler/hydro.json
./sprinkler/eto.yaml
./sprinkler/programs.json
./sprinkler/zonesv2.json
./sprinkler/done_queue.jsonl
./ui
./ui/node_modules
./ui/node_modules/@tybys
./ui/node_modules/picomatch
./ui/node_modules/picomatch/index.js
./ui/node_modules/picomatch/README.md
./ui/node_modules/picomatch/posix.js
./ui/node_modules/picomatch/LICENSE
./ui/node_modules/picomatch/lib
./ui/node_modules/picomatch/lib/parse.js
./ui/node_modules/picomatch/lib/utils.js
./ui/node_modules/picomatch/lib/scan.js
./ui/node_modules/picomatch/lib/constants.js
./ui/node_modules/picomatch/lib/picomatch.js
./ui/node_modules/picomatch/package.json
./ui/node_modules/source-map-js
./ui/node_modules/source-map-js/source-map.js
./ui/node_modules/source-map-js/README.md
./ui/node_modules/source-map-js/source-map.d.ts
./ui/node_modules/source-map-js/LICENSE
./ui/node_modules/source-map-js/lib
./ui/node_modules/source-map-js/lib/source-map-consumer.d.ts
./ui/node_modules/source-map-js/lib/source-map-generator.d.ts
./ui/node_modules/source-map-js/lib/binary-search.js
./ui/node_modules/source-map-js/lib/quick-sort.js
./ui/node_modules/source-map-js/lib/base64.js
./ui/node_modules/source-map-js/lib/array-set.js
./ui/node_modules/source-map-js/lib/base64-vlq.js
./ui/node_modules/source-map-js/lib/source-node.d.ts
./ui/node_modules/source-map-js/lib/mapping-list.js
./ui/node_modules/source-map-js/lib/util.js
./ui/node_modules/source-map-js/lib/source-map-generator.js
./ui/node_modules/source-map-js/lib/source-node.js
./ui/node_modules/source-map-js/lib/source-map-consumer.js
./ui/node_modules/source-map-js/package.json
./ui/node_modules/detect-libc
./ui/node_modules/detect-libc/README.md
./ui/node_modules/detect-libc/LICENSE
./ui/node_modules/detect-libc/lib
./ui/node_modules/detect-libc/lib/detect-libc.js
./ui/node_modules/detect-libc/lib/elf.js
./ui/node_modules/detect-libc/lib/filesystem.js
./ui/node_modules/detect-libc/lib/process.js
./ui/node_modules/detect-libc/package.json
./ui/node_modules/detect-libc/index.d.ts
./ui/node_modules/tinyglobby
./ui/node_modules/tinyglobby/README.md
./ui/node_modules/tinyglobby/dist
./ui/node_modules/tinyglobby/dist/index.cjs
./ui/node_modules/tinyglobby/dist/index.d.cts
./ui/node_modules/tinyglobby/dist/index.d.mts
./ui/node_modules/tinyglobby/dist/index.mjs
./ui/node_modules/tinyglobby/LICENSE
./ui/node_modules/tinyglobby/package.json
./ui/node_modules/postcss
./ui/node_modules/postcss/README.md
./ui/node_modules/postcss/LICENSE
./ui/node_modules/postcss/lib
./ui/node_modules/postcss/lib/node.js
./ui/node_modules/postcss/lib/input.js
./ui/node_modules/postcss/lib/input.d.ts
./ui/node_modules/postcss/lib/warning.d.ts
./ui/node_modules/postcss/lib/comment.d.ts
./ui/node_modules/postcss/lib/parse.d.ts
./ui/node_modules/postcss/lib/postcss.d.ts
./ui/node_modules/postcss/lib/at-rule.js
./ui/node_modules/postcss/lib/list.js
./ui/node_modules/postcss/lib/fromJSON.d.ts
./ui/node_modules/postcss/lib/at-rule.d.ts
./ui/node_modules/postcss/lib/parse.js
./ui/node_modules/postcss/lib/terminal-highlight.js
./ui/node_modules/postcss/lib/postcss.mjs
./ui/node_modules/postcss/lib/container.d.ts
./ui/node_modules/postcss/lib/stringify.d.ts
./ui/node_modules/postcss/lib/stringifier.js
./ui/node_modules/postcss/lib/list.d.ts
./ui/node_modules/postcss/lib/warn-once.js
./ui/node_modules/postcss/lib/root.js
./ui/node_modules/postcss/lib/tokenize.js
./ui/node_modules/postcss/lib/result.js
./ui/node_modules/postcss/lib/stringify.js
./ui/node_modules/postcss/lib/declaration.d.ts
./ui/node_modules/postcss/lib/root.d.ts
./ui/node_modules/postcss/lib/document.js
./ui/node_modules/postcss/lib/container.js
./ui/node_modules/postcss/lib/processor.d.ts
./ui/node_modules/postcss/lib/rule.js
./ui/node_modules/postcss/lib/rule.d.ts
./ui/node_modules/postcss/lib/stringifier.d.ts
./ui/node_modules/postcss/lib/warning.js
./ui/node_modules/postcss/lib/postcss.d.mts
./ui/node_modules/postcss/lib/no-work-result.d.ts
./ui/node_modules/postcss/lib/css-syntax-error.d.ts
./ui/node_modules/postcss/lib/css-syntax-error.js
./ui/node_modules/postcss/lib/postcss.js
./ui/node_modules/postcss/lib/comment.js
./ui/node_modules/postcss/lib/document.d.ts
./ui/node_modules/postcss/lib/node.d.ts
./ui/node_modules/postcss/lib/parser.js
./ui/node_modules/postcss/lib/processor.js
./ui/node_modules/postcss/lib/map-generator.js
./ui/node_modules/postcss/lib/declaration.js
./ui/node_modules/postcss/lib/lazy-result.js
./ui/node_modules/postcss/lib/previous-map.js
./ui/node_modules/postcss/lib/symbols.js
./ui/node_modules/postcss/lib/fromJSON.js
./ui/node_modules/postcss/lib/result.d.ts
./ui/node_modules/postcss/lib/no-work-result.js
./ui/node_modules/postcss/lib/lazy-result.d.ts
./ui/node_modules/postcss/lib/previous-map.d.ts
./ui/node_modules/postcss/package.json
./ui/node_modules/fdir
./ui/node_modules/fdir/README.md
./ui/node_modules/fdir/dist
./ui/node_modules/fdir/dist/index.cjs
./ui/node_modules/fdir/dist/index.d.cts
./ui/node_modules/fdir/dist/index.d.mts
./ui/node_modules/fdir/dist/index.mjs
./ui/node_modules/fdir/LICENSE
./ui/node_modules/fdir/package.json
./ui/node_modules/nanoid
./ui/node_modules/nanoid/index.js
./ui/node_modules/nanoid/README.md
./ui/node_modules/nanoid/index.cjs
./ui/node_modules/nanoid/index.browser.js
./ui/node_modules/nanoid/index.d.cts
./ui/node_modules/nanoid/bin
./ui/node_modules/nanoid/bin/nanoid.cjs
./ui/node_modules/nanoid/nanoid.js
./ui/node_modules/nanoid/index.browser.cjs
./ui/node_modules/nanoid/non-secure
./ui/node_modules/nanoid/non-secure/index.js
./ui/node_modules/nanoid/non-secure/index.cjs
./ui/node_modules/nanoid/non-secure/package.json
./ui/node_modules/nanoid/non-secure/index.d.ts
./ui/node_modules/nanoid/LICENSE
./ui/node_modules/nanoid/package.json
./ui/node_modules/nanoid/url-alphabet
./ui/node_modules/nanoid/url-alphabet/index.js
./ui/node_modules/nanoid/url-alphabet/index.cjs
./ui/node_modules/nanoid/url-alphabet/package.json
./ui/node_modules/nanoid/index.d.ts
./ui/node_modules/nanoid/async
./ui/node_modules/nanoid/async/index.js
./ui/node_modules/nanoid/async/index.cjs
./ui/node_modules/nanoid/async/index.browser.js
./ui/node_modules/nanoid/async/index.browser.cjs
./ui/node_modules/nanoid/async/index.native.js
./ui/node_modules/nanoid/async/package.json
./ui/node_modules/nanoid/async/index.d.ts
./ui/node_modules/lightningcss
./ui/node_modules/lightningcss/node
./ui/node_modules/lightningcss/node/flags.js
./ui/node_modules/lightningcss/node/index.js
./ui/node_modules/lightningcss/node/browserslistToTargets.js
./ui/node_modules/lightningcss/node/index.js.flow
./ui/node_modules/lightningcss/node/targets.d.ts
./ui/node_modules/lightningcss/node/ast.d.ts
./ui/node_modules/lightningcss/node/index.mjs
./ui/node_modules/lightningcss/node/targets.js.flow
./ui/node_modules/lightningcss/node/index.d.ts
./ui/node_modules/lightningcss/node/composeVisitors.js
./ui/node_modules/lightningcss/node/ast.js.flow
./ui/node_modules/lightningcss/README.md
./ui/node_modules/lightningcss/LICENSE
./ui/node_modules/lightningcss/package.json
./ui/node_modules/@napi-rs
./ui/node_modules/vite
./ui/node_modules/vite/LICENSE.md
./ui/node_modules/vite/client.d.ts
./ui/node_modules/vite/types
./ui/node_modules/vite/types/importGlob.d.ts
./ui/node_modules/vite/types/metadata.d.ts
./ui/node_modules/vite/types/import-meta.d.ts
./ui/node_modules/vite/types/importMeta.d.ts
./ui/node_modules/vite/types/hmrPayload.d.ts
./ui/node_modules/vite/types/internal
./ui/node_modules/vite/types/internal/rollupTypeCompat.d.ts
./ui/node_modules/vite/types/internal/cssPreprocessorOptions.d.ts
./ui/node_modules/vite/types/internal/esbuildOptions.d.ts
./ui/node_modules/vite/types/internal/lightningcssOptions.d.ts
./ui/node_modules/vite/types/internal/terserOptions.d.ts
./ui/node_modules/vite/types/hot.d.ts
./ui/node_modules/vite/types/customEvent.d.ts
./ui/node_modules/vite/README.md
./ui/node_modules/vite/bin
./ui/node_modules/vite/bin/openChrome.js
./ui/node_modules/vite/bin/vite.js
./ui/node_modules/vite/dist
./ui/node_modules/vite/dist/node
./ui/node_modules/vite/dist/node/module-runner.d.ts
./ui/node_modules/vite/dist/node/internal.js
./ui/node_modules/vite/dist/node/index.js
./ui/node_modules/vite/dist/node/cli.js
./ui/node_modules/vite/dist/node/module-runner.js
./ui/node_modules/vite/dist/node/internal.d.ts
./ui/node_modules/vite/dist/node/chunks
./ui/node_modules/vite/dist/node/chunks/node.js
./ui/node_modules/vite/dist/node/chunks/optimizer.js
./ui/node_modules/vite/dist/node/chunks/config.js
./ui/node_modules/vite/dist/node/chunks/logger.js
./ui/node_modules/vite/dist/node/chunks/moduleRunnerTransport.d.ts
./ui/node_modules/vite/dist/node/chunks/dist.js
./ui/node_modules/vite/dist/node/chunks/postcss-import.js
./ui/node_modules/vite/dist/node/chunks/chunk.js
./ui/node_modules/vite/dist/node/chunks/preview.js
./ui/node_modules/vite/dist/node/chunks/lib.js
./ui/node_modules/vite/dist/node/chunks/build2.js
./ui/node_modules/vite/dist/node/chunks/build.js
./ui/node_modules/vite/dist/node/chunks/server.js
./ui/node_modules/vite/dist/node/index.d.ts
./ui/node_modules/vite/dist/client
./ui/node_modules/vite/dist/client/env.mjs
./ui/node_modules/vite/dist/client/client.mjs
./ui/node_modules/vite/package.json
./ui/node_modules/vite/misc
./ui/node_modules/vite/misc/true.js
./ui/node_modules/vite/misc/false.js
./ui/node_modules/.bin
./ui/node_modules/.bin/nanoid
./ui/node_modules/.bin/vite
./ui/node_modules/.bin/rolldown
./ui/node_modules/.vite-temp
./ui/node_modules/.vite
./ui/node_modules/.vite/deps
./ui/node_modules/.vite/deps/_metadata.json
./ui/node_modules/.vite/deps/package.json
./ui/node_modules/picocolors
./ui/node_modules/picocolors/picocolors.d.ts
./ui/node_modules/picocolors/README.md
./ui/node_modules/picocolors/types.d.ts
./ui/node_modules/picocolors/LICENSE
./ui/node_modules/picocolors/package.json
./ui/node_modules/picocolors/picocolors.js
./ui/node_modules/picocolors/picocolors.browser.js
./ui/node_modules/lightningcss-linux-x64-gnu
./ui/node_modules/lightningcss-linux-x64-gnu/README.md
./ui/node_modules/lightningcss-linux-x64-gnu/lightningcss.linux-x64-gnu.node
./ui/node_modules/lightningcss-linux-x64-gnu/LICENSE
./ui/node_modules/lightningcss-linux-x64-gnu/package.json
./ui/node_modules/@oxc-project
./ui/node_modules/@oxc-project/types
./ui/node_modules/@oxc-project/types/README.md
./ui/node_modules/@oxc-project/types/types.d.ts
./ui/node_modules/@oxc-project/types/LICENSE
./ui/node_modules/@oxc-project/types/package.json
./ui/node_modules/.package-lock.json
./ui/node_modules/rolldown
./ui/node_modules/rolldown/README.md
./ui/node_modules/rolldown/bin
./ui/node_modules/rolldown/bin/cli.mjs
./ui/node_modules/rolldown/dist
./ui/node_modules/rolldown/dist/plugins-index.d.mts
./ui/node_modules/rolldown/dist/config.d.mts
./ui/node_modules/rolldown/dist/get-log-filter.d.mts
./ui/node_modules/rolldown/dist/get-log-filter.mjs
./ui/node_modules/rolldown/dist/utils-index.mjs
./ui/node_modules/rolldown/dist/experimental-index.mjs
./ui/node_modules/rolldown/dist/parse-ast-index.mjs
./ui/node_modules/rolldown/dist/shared
./ui/node_modules/rolldown/dist/shared/constructors-DRe7RuMC.d.mts
./ui/node_modules/rolldown/dist/shared/watch-C0LwD8gl.mjs
./ui/node_modules/rolldown/dist/shared/logs-D80CXhvg.mjs
./ui/node_modules/rolldown/dist/shared/logging-C6h4g8dA.d.mts
./ui/node_modules/rolldown/dist/shared/prompt-BYQIwEjg.mjs
./ui/node_modules/rolldown/dist/shared/normalize-string-or-regex-BFB1QNW3.mjs
./ui/node_modules/rolldown/dist/shared/misc-DJYbNKZX.mjs
./ui/node_modules/rolldown/dist/shared/get-log-filter-semyr3Lj.d.mts
./ui/node_modules/rolldown/dist/shared/binding-ER32uZ22.mjs
./ui/node_modules/rolldown/dist/shared/resolve-tsconfig-gxOviCVx.mjs
./ui/node_modules/rolldown/dist/shared/rolldown-_ijnyNaK.mjs
./ui/node_modules/rolldown/dist/shared/rolldown-build-CL9PyQ2E.mjs
./ui/node_modules/rolldown/dist/shared/define-config-BkRKRADp.d.mts
./ui/node_modules/rolldown/dist/shared/parse-mIa2AT2F.mjs
./ui/node_modules/rolldown/dist/shared/constructors-BfnFojy3.mjs
./ui/node_modules/rolldown/dist/shared/transform-C_gBfjMR.d.mts
./ui/node_modules/rolldown/dist/shared/binding-CYVfiOV3.d.mts
./ui/node_modules/rolldown/dist/shared/error-D8cGyrC7.mjs
./ui/node_modules/rolldown/dist/shared/define-config-DJOr6Iwt.mjs
./ui/node_modules/rolldown/dist/shared/load-config-Ck3jSx73.mjs
./ui/node_modules/rolldown/dist/shared/bindingify-input-options-DVAZE22h.mjs
./ui/node_modules/rolldown/dist/cli.d.mts
./ui/node_modules/rolldown/dist/cli.mjs
./ui/node_modules/rolldown/dist/parallel-plugin.d.mts
./ui/node_modules/rolldown/dist/filter-index.mjs
./ui/node_modules/rolldown/dist/index.d.mts
./ui/node_modules/rolldown/dist/parallel-plugin.mjs
./ui/node_modules/rolldown/dist/parallel-plugin-worker.mjs
./ui/node_modules/rolldown/dist/experimental-runtime-types.d.ts
./ui/node_modules/rolldown/dist/config.mjs
./ui/node_modules/rolldown/dist/experimental-index.d.mts
./ui/node_modules/rolldown/dist/index.mjs
./ui/node_modules/rolldown/dist/plugins-index.mjs
./ui/node_modules/rolldown/dist/filter-index.d.mts
./ui/node_modules/rolldown/dist/parallel-plugin-worker.d.mts
./ui/node_modules/rolldown/dist/parse-ast-index.d.mts
./ui/node_modules/rolldown/dist/utils-index.d.mts
./ui/node_modules/rolldown/LICENSE
./ui/node_modules/rolldown/package.json
./ui/node_modules/@rolldown
./ui/node_modules/@rolldown/binding-linux-x64-gnu
./ui/node_modules/@rolldown/binding-linux-x64-gnu/README.md
./ui/node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node
./ui/node_modules/@rolldown/binding-linux-x64-gnu/package.json
./ui/node_modules/@rolldown/pluginutils
./ui/node_modules/@rolldown/pluginutils/README.md
./ui/node_modules/@rolldown/pluginutils/dist
./ui/node_modules/@rolldown/pluginutils/dist/index.js
./ui/node_modules/@rolldown/pluginutils/dist/filter
./ui/node_modules/@rolldown/pluginutils/dist/filter/simple-filters.d.ts
./ui/node_modules/@rolldown/pluginutils/dist/filter/filter-vite-plugins.js
./ui/node_modules/@rolldown/pluginutils/dist/filter/index.js
./ui/node_modules/@rolldown/pluginutils/dist/filter/composable-filters.d.ts
./ui/node_modules/@rolldown/pluginutils/dist/filter/composable-filters.js
./ui/node_modules/@rolldown/pluginutils/dist/filter/filter-vite-plugins.d.ts
./ui/node_modules/@rolldown/pluginutils/dist/filter/index.d.ts
./ui/node_modules/@rolldown/pluginutils/dist/filter/simple-filters.js
./ui/node_modules/@rolldown/pluginutils/dist/utils.d.ts
./ui/node_modules/@rolldown/pluginutils/dist/utils.js
./ui/node_modules/@rolldown/pluginutils/dist/index.d.ts
./ui/node_modules/@rolldown/pluginutils/LICENSE
./ui/node_modules/@rolldown/pluginutils/package.json
./ui/node_modules/@emnapi
./ui/public
./ui/public/favicon.svg
./ui/public/icons.svg
./ui/package-lock.json
./ui/dist
./ui/dist/sprinklerv2-zones-card.js
./ui/dist/sprinklerv2-timeline-card.js
./ui/dist/sprinklerv2-programs-card.js
./ui/dist/sprinklerv2-utils.js
./ui/dist/favicon.svg
./ui/dist/icons.svg
./ui/vite.config.js
./ui/src
./ui/src/assets
./ui/src/assets/hero.png
./ui/src/assets/javascript.svg
./ui/src/assets/vite.svg
./ui/src/sprinklerv2-base-card.js
./ui/src/sprinklerv2-timeline-card.js
./ui/src/sprinklerv2-eto-card.js
./ui/src/sprinklerv2-zones-card-v2.js
./ui/src/sprinklerv2-events.js
./ui/src/main.js
./ui/src/sprinklerv2-utils.js
./ui/src/sprinklerv2-programs-card-v2.js
./ui/src/counter.js
./ui/src/style.css
./ui/package.json
./ui/index.html
-->