# GRID Test Suite

## Unified Test Strategy

The GRID project uses a unified ESM-native test runner that can execute multiple test suites with a single command.

## Quick Start

```bash
# Run all test suites
npm test

# Run individual suites
npm run test:core      # GRID Core Library
npm run test:webgl2    # WebGL2 Modules
```

## Test Suites

### 1. GRID Core Library (`test-grid-core.js`)
- **Coverage**: 12 core tests covering essential grid-core.js functions
- **Environment**: Works in both Node.js (ESM) and browser
- **Focus**: Pure logic functions, serialization, validation, performance
- **Runtime**: ~0.03ms for 200×100 grid creation

### 2. WebGL2 Modules (`test-webgl2-modules.js`)  
- **Coverage**: 23 tests for font-atlas.js and instance-buffer.js
- **Environment**: Node.js only (font atlas skipped, requires browser)
- **Focus**: Font atlas generation, instance buffer building, performance
- **Runtime**: <2ms for 200×100 buffer builds

### 3. Schema Validation (`../schemas/validate-examples.js`)
- **Coverage**: JSON Schema validation for .grid format
- **Environment**: CommonJS (Node.js) 
- **Focus**: Schema compliance, example file validation
- **Status**: ✅ All 3 example files validate successfully

## Architecture

### ESM-Native Design
- Root `package.json` has `"type": "module"`
- All test files use ES modules and dynamic imports
- Zero external dependencies - inline assertion library
- Cross-platform compatibility (Windows, macOS, Linux)

### Unified Runner (`run-all.js`)
- Single entry point for all test suites
- Collects and aggregates results from each suite
- Provides formatted summary with pass/fail/skip counts
- Handles both ESM modules and CommonJS scripts

### Test Framework Features
- **Lightweight**: No external test dependencies
- **Async support**: Handles promises and async test functions
- **Cross-platform**: Works in Node.js and browsers
- **Performance aware**: Includes timing benchmarks
- **Comprehensive reporting**: Clear pass/fail indicators

## Results

Current test status:
- ✅ **GRID Core**: 12/12 tests passing (100%)
- ✅ **WebGL2 Modules**: 22/22 tests passing (100%), 1 skipped (browser only)
- ✅ **Schema Validation**: All example files validate
- 📊 **Overall**: 34 tests passing, 0 failing

## Browser Testing

For WebGL2 renderer tests (including font atlas):
```bash
npx serve .
# Navigate to: http://localhost:3000/tests/webgl2-test.html
```

## Adding New Tests

1. Create test file in `tests/` directory
2. Use inline assertion library (or import your own)
3. Export `results` object with `passed`, `failed`, `skipped` counts
4. Add to `suites` array in `run-all.js`
5. Follow existing naming conventions and patterns

## Performance Targets

- Grid creation (200×100): < 50ms ✅ (actual: ~0.03ms)
- Buffer build (200×100): < 10ms ✅ (actual: ~1.3ms)
- All tests should complete: < 5 seconds ✅ (actual: ~60ms)

The unified test strategy provides a solid foundation for Phase 1 development and future testing needs.
