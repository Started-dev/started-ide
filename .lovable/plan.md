

# Add Extended Runtime Support

## Overview
Expand the runner service from 3 runtimes (Node.js, Python, Shell) to 15+ runtimes, covering Go, Rust, C, C++, PHP/Laravel, Dart/Flutter, Solidity, Ruby, Java, Swift, Kotlin, and more. This touches three layers: types, runner client templates, and the backend edge function.

## What Changes

### 1. Runtime Type Definitions (`src/types/runner.ts`)
- Expand the `RuntimeType` union from `'node' | 'python' | 'shell'` to include: `'go'`, `'rust'`, `'c'`, `'cpp'`, `'php'`, `'ruby'`, `'java'`, `'solidity'`, `'dart'`, `'swift'`, `'kotlin'`, `'r'`
- Add corresponding `RUNTIME_TEMPLATES` entries with appropriate default commands and setup commands for each language

### 2. Backend Command Handler (`supabase/functions/run-command/index.ts`)
- Add inline eval handlers for each new language where possible (basic `go run`, `rustc`, `gcc`, `g++`, `php -r`, `ruby -e`, `javac`, `solc`, `dart`, `swiftc`, `kotlinc`, `Rscript -e`)
- Since these run in a Deno edge function (serverless), full compilation isn't available -- but the function will:
  - Recognize the commands and provide accurate informational messages
  - Support inline eval syntax where feasible (e.g., `ruby -e "puts 'hello'"`, `php -r "echo 'hello';"`)
  - Update the `which` command to report available runtimes
  - Update the `packageManagers` and help text arrays to include `cargo`, `go`, `gem`, `composer`, `dart pub`, `pod`, `gradle`, `maven`, `mix`

### 3. Terminal UI (`src/components/ide/TerminalPanel.tsx`)
- Update the placeholder text to mention the expanded set of runtimes
- No structural changes needed -- the terminal already handles arbitrary commands

### 4. Runner Client (`src/lib/runner-client.ts`)
- No changes needed -- session management is runtime-agnostic

---

## Technical Details

### New Runtime Templates

| Runtime   | Type       | Default Command         | Setup Commands                        |
|-----------|------------|-------------------------|---------------------------------------|
| Go        | `go`       | `go run main.go`        | `go mod tidy`                         |
| Rust      | `rust`     | `cargo run`             | `cargo build`                         |
| C         | `c`        | `gcc main.c -o main && ./main` | (none)                         |
| C++       | `cpp`      | `g++ main.cpp -o main && ./main` | (none)                       |
| PHP       | `php`      | `php index.php`         | `composer install`                    |
| Ruby      | `ruby`     | `ruby main.rb`          | `bundle install`                      |
| Java      | `java`     | `javac Main.java && java Main` | (none)                          |
| Solidity  | `solidity` | `solc --bin contract.sol`| `npm install -g solc`                |
| Dart      | `dart`     | `dart run`              | `dart pub get`                        |
| Swift     | `swift`    | `swift main.swift`      | (none)                                |
| Kotlin    | `kotlin`   | `kotlinc main.kt -include-runtime -d main.jar && java -jar main.jar` | (none) |
| R         | `r`        | `Rscript main.R`        | (none)                                |

### Edge Function Changes
The `run-command` edge function will be extended with:
- New eval matchers for `ruby -e`, `php -r`, and `Rscript -e` (basic expression evaluation similar to existing `python -c` support)
- Expanded `which` command awareness for all new runtimes
- Updated help text listing all supported runtimes
- Updated package manager and build tool recognition arrays

### Files Modified
1. **`src/types/runner.ts`** -- Expand `RuntimeType` union and `RUNTIME_TEMPLATES` array
2. **`supabase/functions/run-command/index.ts`** -- Add eval handlers, update help text and command recognition
3. **`src/components/ide/TerminalPanel.tsx`** -- Update placeholder text

