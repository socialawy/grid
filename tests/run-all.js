#!/usr/bin/env node

/**
 * run-all.js — Unified test runner for GRID project
 * ESM-native, zero dependencies, runs all test suites
 * 
 * Usage: node tests/run-all.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// MINI TEST RUNNER
// ============================================================

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let startTime = Date.now();

function logSuite(name) {
  console.log(`\n🧪 ${name}`);
  console.log('='.repeat(50));
}

function logSummary() {
  const duration = Date.now() - startTime;
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`⏭️  Skipped: ${totalSkipped}`);
  console.log(`⏱️  Duration: ${duration}ms`);

  if (totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);
  } else {
    console.log(`\n💥 ${totalFailed} test(s) failed!`);
    process.exit(1);
  }
}

// ============================================================
// TEST SUITE RUNNER
// ============================================================

async function runSuite(name, testFile, environment = 'node', cwd = null) {
  logSuite(name);

  try {
    if (environment === 'node') {
      // Dynamic import for ESM modules
      const module = await import(`./${testFile}`);
      if (module.results) {
        totalPassed += module.results.passed || 0;
        totalFailed += module.results.failed || 0;
        totalSkipped += module.results.skipped || 0;

        if (module.results.summary) {
          console.log(module.results.summary);
        }
      }
    } else if (environment === 'cjs') {
      // For CommonJS modules (like schema tests)
      const { execSync } = await import('child_process');
      const path = await import('path');
      try {
        // Use absolute paths to avoid path issues
        const targetDir = path.resolve(cwd || '.');
        const scriptPath = path.resolve(testFile);

        const output = execSync(`node "${scriptPath}"`, {
          encoding: 'utf8',
          cwd: targetDir,
          stdio: 'pipe'
        });

        console.log(output);

        // Parse results from output (simple heuristic)
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('✅')) totalPassed++;
          if (line.includes('❌')) totalFailed++;
          if (line.includes('⏭️')) totalSkipped++;
        }
      } catch (error) {
        console.log(`❌ Failed to run ${testFile}: ${error.message}`);
        totalFailed++;
      }
    }
  } catch (error) {
    console.log(`❌ Failed to load ${testFile}: ${error.message}`);
    totalFailed++;
  }
}

// ============================================================
// RUN ALL TESTS
// ============================================================

async function runAllTests() {
  console.log('🚀 GRID Test Runner — Starting all test suites...\n');

  // Test suites to run
  const suites = [
    {
      name: 'GRID Core Library',
      file: 'test-grid-core.js',
      environment: 'node'
    },
    {
      name: 'WebGL2 Modules (font-atlas, instance-buffer)',
      file: 'test-webgl2-modules.js',
      environment: 'node'
    },
    {
      name: 'Input System (key-bindings + input-system)',
      file: 'test-input-system.js',
      environment: 'node'
    },
    {
      name: 'Image Importer (imageToGrid + rgbToHex)',
      file: 'test-image-importer.js',
      environment: 'node'
    },
    {
      name: 'Generators v2 (10 generators, all 5 channels)',
      file: 'test-generators.js',
      environment: 'node'
    },
    {
      name: 'Serializer (compact, round-trip, migration, validation)',
      file: 'test-serializer.js',
      environment: 'node'
    },
    {
      name: 'OPFS Store (save, load, delete, list, exists)',
      file: 'test-opfs-store.js',
      environment: 'node'
    },
    {
      name: 'FS Access API (save, open, cascade, download fallback)',
      file: 'test-fs-access.js',
      environment: 'node'
    },
    {
      name: 'Music Mapper (Task 3.1 - grid to music events)',
      file: 'test-music-mapper.js',
      environment: 'node'
    },
    {
      name: 'Synth Engine (Task 3.2 - Web Audio synthesis layer)',
      file: 'test-synth-engine.js',
      environment: 'node'
    },
    {
      name: 'MIDI Output (Task 3.4 - Web MIDI scheduling)',
      file: 'test-midi-output.js',
      environment: 'node'
    },
    {
      name: 'Heightmap Engine (Task 4.1 - grid to heightmap conversion)',
      file: 'test-heightmap.js',
      environment: 'node'
    },
    {
      name: 'SVG Exporter (Task 6.1 - grid frame to vector SVG)',
      file: 'test-svg-exporter.js',
      environment: 'node'
    }
    // Schema validation temporarily skipped due to CJS/ESM compatibility issues
    // {
    //   name: 'Schema Validation',
    //   file: '../schemas/validate-examples.js',
    //   environment: 'cjs',
    //   cwd: '../schemas'
    // }
  ];

  // Run each suite
  for (const suite of suites) {
    await runSuite(suite.name, suite.file, suite.environment, suite.cwd);
  }

  // Final summary
  logSummary();
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Run all tests
runAllTests().catch(error => {
  console.error('\n💥 Test runner failed:', error);
  process.exit(1);
});
