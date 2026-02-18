# 1. Ensure tests can find ESM — check/create root package.json with type:module
Create package.json with ES module type at project root

# 2. For browser test — serve the project
cd E:\co\GRID; npx serve . -p 3000
# Then open http://localhost:3000/tests/webgl2-test.html