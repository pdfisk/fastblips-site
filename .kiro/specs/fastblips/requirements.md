# Requirements Document

## Introduction

FastBlips is a development and deployment environment for building browser-based
applications using Crumb (FastBlips Basic) or MiniPy (a Python subset). Programs are
stored as records on a server database and run on a shared bytecode VM inside the browser
page.

This document captures requirements for the FastBlips development environment as a
complete, deployable platform. The three headline capabilities are:

1. **Standalone deployment** — apps can be packaged with an included runtime for
   distribution without depending on fastblips.com.
2. **Multi-target apps** — apps can be authored and previewed for mobile, desktop, or both
   from the same source.
3. **Library support** — apps can import and reuse shared FastBlips libraries stored in the
   database.

The existing foundation (VM, scheduler, widget toolkit, `?run=` deployment, database API)
is taken as implemented; these requirements cover the extensions and gaps needed to make
the platform complete.

---

## Glossary

- **BLIP**: Browser Loadable Interpreted Program — the unit of deployment: one Crumb or
  MiniPy source program plus any saved screens and composites it names.
- **Runtime**: The set of components needed to run a BLIP — the compiler(s), VM,
  scheduler, widget toolkit and host page.
- **Standalone Bundle**: A self-contained HTML file (or directory) that includes the
  runtime and one BLIP's compiled code, runnable without a network connection to
  fastblips.com.
- **App**: A BLIP that is published (has compiled code saved with its record) and is
  reachable via `?run=<name>`.
- **Library**: A named record in the database whose content is source code (Crumb or
  MiniPy) intended to be imported into other programs, not run directly.
- **Module**: A loaded library's compiled code, made available to an importing program
  through a resolved name.
- **Viewport**: The program's screen — the root widget that all other widgets are placed
  in.
- **Composite**: A reusable piece of screen (a widget tree) saved by name in the
  database.
- **Scheduler**: The cooperative time-slicer that runs multiple processes on the browser's
  single thread.
- **AppScreen**: The full-page surface on which a BLIP's `Print` output and widgets appear
  when run via `?run=` or a Launch window.
- **Package**: A named group of libraries and optional app records in the database,
  versioned together and importable as a unit.
- **Target**: The rendering environment for an app — `desktop`, `mobile`, or `both`.
- **PWA**: Progressive Web App — a browser app that can be installed to a home screen and
  run offline.
- **Space**: The owner-scoped namespace in which programs, screens and composites are
  stored (a user name, or `''` for the shared space).
- **IDE**: The FastBlips integrated development environment — the desktop playground page
  with editors, consoles, designer and database windows.

---

## Requirements

### Requirement 1: Standalone Deployment — Bundle Generation

**User Story:** As an app author, I want to export my app as a standalone file, so that I can distribute it without requiring end users to visit fastblips.com or have a live network connection.

#### Acceptance Criteria

1. WHEN an author triggers a standalone export for a named app record, THE Bundler SHALL produce a single self-contained HTML file that includes the compiled BLIP bytecode and the complete runtime (VM, scheduler, widget host, and theme).
2. THE Bundler SHALL embed the compiled bytecode from the record's `compiled_code` field and SHALL NOT include the program source code in the bundle unless the author explicitly opts in.
3. WHEN the standalone HTML file is opened in a browser without a network connection, THE Runtime SHALL begin executing the entry point and render the first frame within 3 seconds of the browser's `load` event firing.
4. IF the record has no compiled code saved, THEN THE Bundler SHALL report an error describing that the app must be compiled before export, and SHALL NOT produce a bundle.
5. THE Bundler SHALL stamp the bundle with the FastBlips runtime version and the export date-time in ISO 8601 UTC format so that the bundle's origin is identifiable.
6. WHEN the bundle is reproduced with the same source, compiled code and a fixed `SOURCE_DATE_EPOCH` environment variable, THE Bundler SHALL produce a byte-for-byte identical output file.
7. WHERE a desktop target is selected, THE Bundler SHALL size the AppScreen to 100% of the browser viewport width and height and SHALL re-apply that sizing whenever the viewport dimensions change.
8. WHERE a mobile target is selected, THE Bundler SHALL constrain the AppScreen to 360 × 640 logical pixels, centred horizontally and vertically in the browser viewport.
9. WHERE both targets are selected, THE Bundler SHALL use responsive layout: the AppScreen fills the window on desktop and is constrained to 360 × 640 logical pixels, centred, on a device whose shorter side is less than 600 logical pixels.

---

### Requirement 2: Standalone Deployment — PWA Packaging

**User Story:** As an app author, I want my standalone app to be installable on a user's home screen, so that it behaves like a native app on phones and desktops.

#### Acceptance Criteria

1. THE Bundler SHALL embed a Web App Manifest in every standalone bundle, setting the manifest `name` and `short_name` to the app record's name field, `start_url` to `"."`, and `scope` to `"."`.
2. WHEN the app record has an icon field set, THE Bundler SHALL include that icon in the manifest and in the bundle as a PNG image of at least 192×192 pixels; WHEN no icon is set, THE Bundler SHALL use the default FastBlips icon at the same minimum size.
3. THE Bundler SHALL include a Service Worker in the bundle that pre-caches all assets required to render the app UI — including the runtime bundle and the BLIP's compiled code — so that all cached assets are served from cache on subsequent loads regardless of network availability.
4. WHEN a user installs the bundled PWA and the device has no network connection, THE Service_Worker SHALL serve the cached runtime and compiled code so the app UI renders without displaying a network error.
5. THE Bundler SHALL set the manifest `display` field to `"standalone"` so that browser chrome is hidden when the app is launched from the home screen.

---

### Requirement 3: Multi-Target — Screen Size Awareness

**User Story:** As an app author, I want to query the screen dimensions and be notified when they change, so that my app can lay itself out correctly on desktop and mobile.

#### Acceptance Criteria

1. THE Runtime SHALL expose `ScreenWidth()` and `ScreenHeight()` as built-in functions that return the AppScreen's current width and height in logical pixels as integer Numbers greater than or equal to 0.
2. WHEN the AppScreen is resized (window resize or orientation change), THE Runtime SHALL queue a call to the Sub or function named by `OnResize(handlerName)` with the new width and height as its two arguments, where each argument is an integer Number greater than or equal to 0.
3. IF `OnResize` is called with a name that does not match any Sub or function in the running program, THEN THE Runtime SHALL report a runtime error at the line of the `OnResize` call and halt execution of the current statement without modifying any previously registered resize handler.
4. THE Runtime SHALL define `ScreenWidth()` and `ScreenHeight()` as built-in names in the Crumb and MiniPy compilers so that using them before calling `OnResize` does not produce a load error.
5. WHILE the AppScreen is hidden (the program is running in a console with no screen), THE Runtime SHALL return 0 for both `ScreenWidth()` and `ScreenHeight()`.
6. IF `OnResize` is called more than once during program execution, THEN THE Runtime SHALL replace the previously registered handler with the new handler name, so that only the most recently registered handler is called on subsequent resize events.
7. WHEN the AppScreen is resized, IF no handler has been registered via `OnResize`, THEN THE Runtime SHALL silently ignore the resize event without producing an error.

---

### Requirement 4: Multi-Target — Responsive Layout Helpers

**User Story:** As an app author, I want layout utilities that adapt my UI to the current screen, so that I do not have to write separate desktop and mobile programs.

#### Acceptance Criteria

1. THE Runtime SHALL expose a `ScreenTarget()` built-in that returns `"mobile"` when the screen's shorter side is less than 600 logical pixels, and `"desktop"` otherwise.
2. WHEN a widget's `setFlex(n)` method is called with `n` greater than 0 in an HPanel or VPanel, THE Widget_Host SHALL distribute the container's remaining space (container size minus the sum of all fixed-size children's sizes) proportionally among all flex-weighted children using the formula `n_i / Σn`, so the layout fills the container without fixed pixel sizes.
3. IF `setFlex(n)` is called with `n` less than or equal to 0, THEN THE Widget_Host SHALL report an error indicating that the flex value must be greater than 0 and SHALL NOT apply the flex constraint to the widget.
4. THE `fill()` method on any widget SHALL cause that widget to expand to fill both the full width and full height of its parent container's area, and THE Widget_Host SHALL re-apply this constraint whenever the parent is resized.
5. WHEN the screen target changes (the user rotates the device or resizes the browser window across the 600-pixel threshold), THE Runtime SHALL queue a call to the `OnResize` handler (Requirement 3.2) with the updated dimensions, deduplicating rapid threshold crossings within a 100ms window.

---

### Requirement 5: Multi-Target — Mobile Preview in the IDE

**User Story:** As an app author, I want to preview my app at phone dimensions in the IDE before deploying, so that I can verify the mobile layout without a real device.

#### Acceptance Criteria

1. THE IDE SHALL provide a Launch → Mobile menu item that opens the current program in a Launch window sized to exactly 360 × 640 logical pixels, matching the `?run=` mobile AppScreen.
2. THE IDE SHALL provide a Launch → Desktop menu item that opens the current program in a Launch window sized to the full available screen area, excluding OS taskbars and system chrome.
3. WHEN a Launch window is resized by the user dragging its border or corner, THE Runtime SHALL invoke the `OnResize` handler, if one is registered, passing the new width and height as integer values in logical pixels.
4. IF a Launch window is resized and no `OnResize` handler is registered, THEN THE Runtime SHALL complete the resize without error and update the displayed dimensions.
5. WHEN a Launch window is opened or resized, THE IDE SHALL update the Launch window's title bar to display the current AppScreen width and height as integer logical pixel values within 100 milliseconds of the resize completing.
6. WHERE a program calls `ScreenTarget()`, THE Runtime SHALL return the string `"mobile"` if the Launch window was opened via Launch → Mobile, or the string `"desktop"` if opened via Launch → Desktop, regardless of the physical screen size or the window's current dimensions.

---

### Requirement 6: Library Support — Library Records

**User Story:** As a developer, I want to publish reusable code as a named library in the database, so that other programs can import it without copying the source.

#### Acceptance Criteria

1. THE Database SHALL store library records in the same `apps` table as program records, distinguished by a `kind` field whose value is `"library"` (programs have `kind` equal to `"app"` or no `kind` field).
2. WHILE the Database window is open, THE IDE SHALL display library records in a dedicated section that is visually distinct from app records, with a label indicating they are libraries.
3. WHEN an author saves a record as a library, THE IDE SHALL set `kind` to `"library"` on the record.
4. WHILE a record has `kind` equal to `"library"`, THE IDE SHALL NOT display any execution controls (including Go and Run buttons) for that record.
5. THE Compiler SHALL accept a `kind: "library"` field on a compile request and SHALL produce a chunk whose entry point exports all top-level bindings declared in the source (variables, functions, and constants defined at the outermost scope) instead of executing them as statements.
6. IF a library record has no compiled code, THEN THE Runtime SHALL compile it on first import and cache the compiled chunk in memory until the host page is unloaded or the session context is destroyed.
7. IF a library fails to compile on first import, THEN THE Runtime SHALL report an error identifying the library name and the compilation error, and SHALL abort loading the importing program.

---

### Requirement 7: Library Support — Import Statement

**User Story:** As a developer, I want to import a named library into my Crumb or MiniPy program with a single statement, so that I can use shared functions and data without copying code.

#### Acceptance Criteria

1. THE Crumb_Compiler SHALL accept the syntax `Import "name"` as a top-level statement and SHALL make the library's exported names available in the importing program's top-level namespace, accessible from any statement in that program.
2. THE MiniPy_Compiler SHALL accept `import name` (where `name` resolves to a FastBlips library record) and SHALL make the library's exported names available as attributes of the module object, accessible from any statement in that program.
3. WHEN a library named in an `Import` statement is not found in the database, THE Compiler SHALL report a load error naming the missing library and SHALL halt compilation.
4. WHEN two libraries — or a library and the importing program — export or declare the same name, THE Compiler SHALL report a load error identifying the conflicting name and its two sources and SHALL halt compilation.
5. IF any `Import` statement in a program fails to resolve, THEN THE Runtime SHALL abort execution before any top-level statement in that program runs.
6. WHEN a program imports library L and calls an exported function F with valid arguments, THE Runtime SHALL return the same value as calling F in a standalone program that defines it directly.

---

### Requirement 8: Library Support — Packages

**User Story:** As a library author, I want to group related libraries into a named package, so that programs can import the whole package with one statement.

#### Acceptance Criteria

1. THE Database SHALL store package records in a `packages` table with fields `name`, `owner`, `description`, and a list of member library record names containing between 1 and 50 entries.
2. WHEN a Crumb program contains an `Import "package/name"` statement, THE Crumb_Compiler SHALL resolve each member library in the named package and make its symbols available to the program as if each member library had been imported individually.
3. WHEN a MiniPy program contains an `import package` statement, THE MiniPy_Compiler SHALL make each member library's symbols available under the namespace `package.<library_name>`, where `<library_name>` is the name of that member library as recorded in the package.
4. IF any member library within an imported package cannot be found or fails to load, THEN THE Compiler SHALL report a load error identifying the package name and the specific member library that failed, and SHALL not make any of the package's member libraries available to the program.
5. WHEN a package named in an `Import` statement is not found in the database, THE Compiler SHALL report a load error identifying the missing package name.
6. THE Package_Registry SHALL enforce that a package's member library names are unique within the package and that each member library name exists in the database, and SHALL report a validation error identifying the offending member name when a duplicate or non-existent member name is submitted.
7. THE Package_Registry SHALL enforce that each package name is unique across all packages in the database, and SHALL report a validation error identifying the conflicting name when a duplicate package name is submitted.

---

### Requirement 9: Library Support — Bundling with Libraries

**User Story:** As an app author, I want my standalone bundle to include all imported libraries, so that the app runs correctly offline without fetching library code.

#### Acceptance Criteria

1. WHEN the Bundler produces a standalone bundle for an app that imports one or more libraries, THE Bundler SHALL include the compiled bytecode of every library in the transitive import closure in the bundle.
2. IF the Bundler detects a circular import dependency during transitive resolution, THEN THE Bundler SHALL report an error identifying the cycle and SHALL NOT produce a bundle.
3. IF any imported library in the transitive closure has no compiled code, THEN THE Bundler SHALL report an error identifying that library by name and SHALL NOT produce a bundle.
4. THE Runtime in the bundle SHALL load imported libraries from the embedded bytecode and SHALL NOT make any network request while resolving a library import.
5. FOR ALL valid standalone bundles of the same app and library versions, the set of exported names available at runtime SHALL be identical to the set available when the same app is run via `?run=` with network access.

---

### Requirement 10: Access Control — App Ownership

**User Story:** As an app author, I want my published apps to be associated with my account, so that only I can edit or delete them while others can run them.

#### Acceptance Criteria

1. THE Database SHALL associate every app and library record with an owner field matching a valid user-name pattern (`[a-z0-9][a-z0-9_-]{1,29}`, case-insensitive).
2. WHEN an authenticated user requests to update or delete a record and the requesting user's name matches the record's owner field, THE Server SHALL permit the operation.
3. IF an authenticated user requests to update or delete a record and the requesting user's name does not match the record's owner field, THEN THE Server SHALL reject the request with an HTTP 403 response without modifying the record.
4. WHEN a client requests the `?run=<owner>/<name>` URL, THE Runtime SHALL load the app screens and composites from the named owner's space; IF no app matching the owner and name exists, THEN THE Server SHALL return an HTTP 404 response.
5. THE Server SHALL allow any client to read (`GET`) published app records regardless of ownership, so apps are publicly runnable by default.
6. WHERE an app record has a `public` field set to `false`, IF the requesting client is not authenticated as the record's owner, THEN THE Server SHALL return an HTTP 403 response for any read request on that record.

---

### Requirement 11: Deployment — Bytecode-Only Delivery

**User Story:** As an app author, I want my published app to be served as compiled bytecode so that it starts faster and the source is not exposed to end users.

#### Acceptance Criteria

1. THE Server SHALL store a `compiled_code` field on each app record, set by the IDE's Compile action, containing the serialised bytecode as a JSON string.
2. WHEN a `?run=` page loads an app that has a non-empty `compiled_code` field, THE Runtime SHALL execute the compiled bytecode directly and SHALL NOT run the compiler on the viewer's device.
3. IF the `compiled_code` field is present and the record's `content` (source) has been modified after the bytecode was compiled (as determined by comparing compile-time timestamp with source last-modified timestamp), THEN THE Runtime SHALL recompile from source and display a non-blocking warning before execution begins that the compiled code is stale.
4. THE Bytecode_Format SHALL include a version field and an opcode-table hash.
5. IF the VM encounters a chunk whose opcode-table hash does not match the running VM's hash, THEN THE VM SHALL refuse to execute that chunk and SHALL report a runtime error to the viewer identifying the version mismatch.
6. WHEN the IDE's Compile button is pressed, THE IDE SHALL compute the opcode-table hash of the current VM and store it alongside the serialised bytecode in `compiled_code`.
7. IF the IDE's Compile action fails, THEN THE IDE SHALL display an error message indicating the cause and SHALL leave the existing `compiled_code` field unchanged.

---

### Requirement 12: Deployment — Friendly URLs and App Metadata

**User Story:** As an app author, I want my app to have a human-readable URL and a title for sharing, so that links in messages and social previews look professional.

#### Acceptance Criteria

1. THE Server SHALL serve every app at `https://fastblips.com/app/<owner>/<name>` as an alias for `https://fastblips.com/?run=<owner>/<name>`, with the same runtime page, where `<owner>` and `<name>` each consist of 1 to 64 characters containing only alphanumeric characters, hyphens, or underscores.
2. IF the path segment `<owner>` or `<name>` contains characters outside the set of alphanumeric characters, hyphens, and underscores, or either segment is empty, THEN THE Server SHALL respond with an HTTP 400 error indicating the URL is invalid.
3. THE Runtime page SHALL set the browser tab title to the app's `name` field, truncated to 100 characters, when the app loads successfully.
4. WHEN the app record has an `icon_url` field, THE Runtime page SHALL set the page favicon to that URL.
5. THE Server SHALL include Open Graph meta tags (`og:title`, `og:description`) in the HTML served at `/app/<owner>/<name>`, populated from the record's `name` field (truncated to 100 characters) and optional `description` field (truncated to 300 characters).
6. IF the record has no `description` field, THEN THE Server SHALL use the text `"A FastBlips app"` as the `og:description` value.
7. IF no app record exists for the given `<owner>/<name>` path, THEN THE Server SHALL respond with an HTTP 404 error indicating the app was not found.

---

### Requirement 13: Parser and Serialiser — Bytecode Format

**User Story:** As a runtime implementer, I want a versioned, documented bytecode format, so that compiled chunks can be stored, loaded and validated reliably across runtime versions.

#### Acceptance Criteria

1. THE Bytecode_Serialiser SHALL encode a compiled chunk as a JSON object with fields: `version` (positive integer), `opcodeHash` (64-character lowercase hex string), `language` (string of 1–64 characters), `code` (array of 0–1,048,576 integers each in the range 0–255), `constants` (array of 0–65,536 entries each being a number, boolean, null, or string of at most 65,536 characters), `globalCount` (non-negative integer), `globalNames` (array of strings whose length equals `globalCount`, each name 1–256 characters), and `procedures` (array of 0–65,536 procedure descriptors).
2. THE Bytecode_Deserialiser SHALL parse a JSON string produced by the Bytecode_Serialiser and return a chunk object with all fields restored to their runtime types: integers as integers, strings as strings, and arrays as arrays with elements of the expected types.
3. FOR ALL valid chunk objects, parsing the JSON produced by serialising that chunk SHALL yield a chunk whose scalar fields (`version`, `opcodeHash`, `language`, `globalCount`) are equal to the originals and whose array fields (`code`, `constants`, `globalNames`, and procedure names) are element-wise identical to the originals.
4. IF the JSON string passed to the Bytecode_Deserialiser is not valid JSON, THEN THE Bytecode_Deserialiser SHALL return an error object describing the parse failure and SHALL NOT throw an unhandled exception.
5. IF the JSON object passed to the Bytecode_Deserialiser has a `version` field whose value is not a positive integer, THEN THE Bytecode_Deserialiser SHALL return an error object identifying the invalid field and SHALL NOT throw an unhandled exception.
6. IF the JSON object passed to the Bytecode_Deserialiser is missing any required field, THEN THE Bytecode_Deserialiser SHALL return an error object identifying the absent field by name and SHALL NOT throw an unhandled exception.
7. IF any field in the JSON object passed to the Bytecode_Deserialiser violates its type or bounds constraints (as specified in criterion 1), THEN THE Bytecode_Deserialiser SHALL return an error object identifying the invalid field and SHALL NOT throw an unhandled exception.
8. THE Bytecode_Serialiser SHALL produce the same JSON string for the same chunk on every call, with keys emitted in a fixed order and array elements in their original index order (deterministic serialisation), so that a stored hash of the compiled code can detect source changes.
