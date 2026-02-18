/**
 * schemas\validate-examples.js —  a validation script to test the examples against the schema using ajv:
 * 
 * Usage: cd e:\co\GRID\schemas; node validate-examples.js
 *
 * @script validate-examples
 * @version 0.1.0
 */
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Initialize AJV with additional formats
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load the schema
const schemaPath = path.join(__dirname, 'grid.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Compile the schema
const validate = ajv.compile(schema);

// Test each example file
const examplesDir = path.join(__dirname, 'examples');
const exampleFiles = ['minimal.grid', 'heartbeat.grid', 'mist-demo.grid'];

console.log('=== GRID Schema Validation ===\n');

exampleFiles.forEach(filename => {
    const filePath = path.join(examplesDir, filename);
    console.log(`Testing ${filename}:`);
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const valid = validate(data);
        
        if (valid) {
            console.log('✅ VALID - Schema validation passed');
        } else {
            console.log('❌ INVALID - Schema validation failed:');
            validate.errors.forEach(error => {
                console.log(`  - ${error.instancePath || 'root'}: ${error.message}`);
            });
        }
    } catch (parseError) {
        console.log(`❌ PARSE ERROR: ${parseError.message}`);
    }
    
    console.log('');
});

// Test breaking required fields
console.log('=== Testing Required Field Validation ===\n');

const minimalPath = path.join(examplesDir, 'minimal.grid');
const minimalData = JSON.parse(fs.readFileSync(minimalPath, 'utf8'));

const requiredFields = ['grid', 'version', 'meta', 'canvas', 'frames'];

requiredFields.forEach(field => {
    console.log(`Testing without required field '${field}':`);
    
    const testData = { ...minimalData };
    delete testData[field];
    
    const valid = validate(testData);
    if (!valid) {
        console.log('✅ CORRECTLY REJECTED - Missing required field detected');
    } else {
        console.log('❌ UNEXPECTEDLY ACCEPTED - Should have failed validation');
    }
});

console.log('\n=== Additional Properties Test ===\n');

// Test that unknown fields are preserved
const testData = { ...minimalData, 'unknownField': 'test', 'anotherUnknown': 42 };
const valid = validate(testData);

if (valid) {
    console.log('✅ ADDITIONAL PROPERTIES ACCEPTED - Forward compatibility confirmed');
    console.log(`Unknown fields preserved: unknownField="${testData.unknownField}", anotherUnknown=${testData.anotherUnknown}`);
} else {
    console.log('❌ ADDITIONAL PROPERTIES REJECTED - Forward compatibility issue');
}

console.log('\n=== Format Identifier & Version Check ===\n');

exampleFiles.forEach(filename => {
    const filePath = path.join(examplesDir, filename);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const hasGridFormat = data.grid === 'grid';
    const hasVersion = typeof data.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version);
    
    console.log(`${filename}:`);
    console.log(`  Format identifier ("grid"): ${hasGridFormat ? '✅' : '❌'} - ${data.grid}`);
    console.log(`  Version pattern: ${hasVersion ? '✅' : '❌'} - ${data.version}`);
});
