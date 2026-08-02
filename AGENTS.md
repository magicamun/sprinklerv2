# Sprinkler Project Instructions

## Scope

These instructions apply to the Sprinkler project inside the Home Assistant
workspace.

The authoritative project scope is defined in:

    PROJECT_SCOPE.md

Read `PROJECT_SCOPE.md` before analyzing or modifying the project.

Do not modify files outside the defined project scope unless explicitly
instructed.

If a requested change appears to require modifications outside the project
scope, stop and ask before making those changes.


# System Architecture

The project consists of three main subsystems:

    EToEngine
        |
        | weather / ETo / forecast
        |
        v
    HydroStore
        ^
        |
        | hydro state / irrigation / soil
        |
    Sprinkler

HydroStore is shared by EToEngine and Sprinkler.

Do not treat HydroStore as an internal implementation detail of either
subsystem.


## EToEngine

EToEngine owns weather and ETo orchestration.

Its responsibilities include:

- deciding when observed weather data is collected,
- deciding when forecast data is collected,
- coordinating configured weather providers,
- triggering ETo calculations,
- triggering soil-water calculations where appropriate,
- projecting resulting Home Assistant sensors and chart data,
- lifecycle tasks related to the hydro/weather subsystem.

EToEngine should orchestrate operations rather than implement concrete
weather-source protocols.

Source-specific knowledge must not leak into EToEngine.


## ProviderManager

ProviderManager owns provider orchestration.

Its responsibilities are:

- creating configured providers,
- determining which providers are executed,
- dispatching observed updates,
- dispatching forecast updates.

Providers may expose synchronous or asynchronous operations.

ProviderManager must support both without forcing synchronous providers to
become asynchronous unnecessarily.

ProviderManager must not contain provider-specific interpretation logic.


## Providers

A provider owns its external data source.

Provider responsibilities include:

- knowing how its source is accessed,
- building source-specific requests,
- gathering source data,
- understanding source-specific response formats,
- source-specific interpretation,
- source-specific aggregation,
- source-specific unit conversion,
- normalizing source data into the canonical weather model.

Providers write canonical application data to HydroStore.

Provider-specific concepts, API fields and response formats must not leak into
EToEngine, ProviderManager or HydroStore.


## ProviderContext

ProviderContext supplies infrastructure dependencies to providers.

Providers should use dependencies exposed through ProviderContext instead of
directly depending on Pyscript or Home Assistant runtime implementation
details.

ProviderContext is an infrastructure/dependency boundary and should not
contain provider-specific business logic.


## HTTP Infrastructure

HTTP access for providers is exposed through the ProviderContext HTTP
abstraction.

Providers access HTTP through the ProviderContext HTTP abstraction.

JSON-based providers will typically use

    await ctx.http.get_json(...)

The provider determines:

- whether an HTTP request is required,
- which URL or parameters are required,
- how the returned data is interpreted.

The infrastructure determines:

- how blocking HTTP operations are executed safely,
- how those operations are moved outside the Home Assistant/Pyscript event
  loop.

Providers must not directly depend on:

- `task.executor`,
- Pyscript executor internals,
- blocking `requests` calls on the event loop.

Pyscript-specific execution details belong to the infrastructure boundary, not
to individual providers.


## Sprinkler

Sprinkler owns irrigation planning and execution.

Its responsibilities include:

- irrigation programs,
- ProgramEngine,
- scheduling,
- program queues,
- active/manual/done queues,
- zone execution,
- runtime duration calculation and adaptation,
- irrigation history,
- hardware abstraction and hardware control,
- runtime reasons and information required to explain irrigation decisions.

Sprinkler may consume hydro-domain data from HydroStore.

Sprinkler must not implement weather-provider-specific gathering or
interpretation logic.

Weather-source details belong to the ETo/provider subsystem.


## ProgramEngine

ProgramEngine owns program planning logic.

Keep pure planning and scheduling calculations separated from hardware
execution and Home Assistant infrastructure where possible.

ProgramEngine should operate on application/domain data rather than directly
accessing Home Assistant entities or services.


## HydroStore

HydroStore is the shared hydro-domain data subsystem used by both EToEngine
and Sprinkler.

Its responsibilities currently include storage and processing of data such as:

- observed weather values,
- forecast weather values,
- derived median values,
- derived current values,
- irrigation amounts,
- soil-water state,
- ETo-related values,
- hydro persistence.

HydroStore receives canonical application fields rather than provider-specific
response structures.

Canonical weather fields include, where applicable:

- `temp_c`
- `humidity_pct`
- `wind_ms`
- `sun_hours`
- `rain_mm`
- `eto_mm`
- `prob_pct`

HydroStore must not need to understand provider-specific API fields or response
formats from OpenMeteo, DWD, OpenWeather or Home Assistant weather
integrations.

Because HydroStore is shared by EToEngine and Sprinkler, changes to its public
interfaces must be treated carefully.

Before changing a HydroStore public interface:

1. identify all callers,
2. consider effects on both EToEngine and Sprinkler,
3. avoid changing the interface unless required by the task.

Do not redesign HydroStore merely because storage and domain calculations
currently coexist there unless such a redesign is explicitly requested.


# Dependency Rules

Prefer dependencies in this direction:

Home Assistant / Pyscript
          │
          ▼
      EToEngine
          │
          ▼
   ProviderManager
          │
          ▼
   ProviderContext
          │
          ▼
      Provider
          │
          ▼
     HydroStore

These arrows describe responsibility and dependency boundaries, not every
runtime call.

Avoid introducing reverse dependencies without explicit architectural
discussion.


# Async / Pyscript Rules

Pyscript functions and normal Python functions do not behave identically.

Be particularly careful around:

- Pyscript `EvalFuncVar`,
- Python coroutine functions,
- `task.executor`,
- Home Assistant's event loop.

Blocking operations must not run directly on the Home Assistant/Pyscript event
loop.

If a provider operation requires asynchronous infrastructure, propagate and
await the asynchronous result correctly through the call chain.

Do not convert unrelated synchronous code to async merely for consistency.

ProviderManager may bridge synchronous and asynchronous provider
implementations.

Do not pass Pyscript functions to `task.executor` where a native Python
callable is required.


# Logging

Logging should distinguish normal operation from diagnostic detail.

## INFO

INFO represents successful business-level operations.

Prefer one concise success message for a completed logical operation.

Example:

    provider=openmeteo action=observed_updated fields=temp_c,humidity_pct,wind_ms,rain_mm,eto_mm

Avoid:

- one INFO message per field,
- verbose persistence messages,
- raw HTTP data,
- repetitive start/end messages that provide no additional operational value.


## DEBUG

DEBUG is for diagnostic and implementation detail.

Appropriate DEBUG information includes:

- source entities and raw values,
- HTTP request URLs,
- provider dispatch,
- aggregation results,
- normalized canonical values,
- persistence operations,
- scheduling details useful for troubleshooting.

Do not log complete HTTP responses unless explicitly required for diagnosis.


## WARNING

WARNING is for recoverable problems such as:

- invalid source values,
- failed conversions,
- missing optional data,
- fallback behavior.

Include sufficient context such as provider, source, entity and field.


## Exceptions

Do not catch exceptions solely to log and immediately re-raise them unless the
additional log adds meaningful context.

Unexpected exceptions should normally propagate so that the original Pyscript
traceback remains available.

Do not silently suppress failures.


# Change Rules

When modifying the project:

1. Read `PROJECT_SCOPE.md` first.

2. Understand the relevant call chain before changing it.

3. Prefer small, clearly scoped changes.

4. Do not perform unrelated cleanup or refactoring.

5. Preserve existing public interfaces unless changing them is explicitly part
   of the requested task.

6. Do not modify another subsystem merely because an improvement there appears
   convenient.

7. If a task requires expanding its scope, stop and ask first.

8. Do not automatically fix unrelated bugs discovered during a task.
   Report them separately.

9. Before changing shared HydroStore behavior or interfaces, inspect callers
   from both EToEngine and Sprinkler.

10. Prefer existing architectural boundaries over introducing parallel
    mechanisms.

11. Do not duplicate source-specific gathering or normalization logic outside
    providers.

12. Do not modify generated UI artifacts when corresponding source files are
    available.

13. Do not modify `ui/node_modules`.

14. After implementation, inspect the resulting diff.

15. Report:
    - changed files,
    - changed methods/classes,
    - resulting call/data flow,
    - remaining known issues relevant to the task.

16. Run appropriate static checks or existing tests where possible.

17. Static correctness does not prove correct Pyscript runtime behavior.
    Runtime verification in Home Assistant may still be required.


# Analysis Rules

When asked to analyze existing code without changing it:

- do not make modifications,
- distinguish observed facts from recommendations,
- cite concrete files, classes and methods,
- trace actual call paths rather than assuming intended behavior,
- identify legacy and parallel implementations explicitly,
- do not treat discovered inconsistencies as permission to fix them.


# Refactoring Rules

Before performing a larger refactoring:

1. describe the current responsibility boundary,
2. describe the intended responsibility boundary,
3. identify affected files and public interfaces,
4. identify shared dependencies,
5. propose the smallest coherent change,
6. wait for approval when architectural boundaries are affected.

Architecture decisions should not be inferred solely from the existing code:
legacy code may intentionally be in the process of migration.

## Legacy Code

The project is currently migrating to a new architecture.

Legacy implementations may coexist with the target architecture.

When both implementations exist:

- identify both,
- prefer extending the target architecture,
- do not extend legacy implementations,
- do not remove legacy code unless explicitly requested,
- clearly distinguish current implementation from target architecture in analyses.