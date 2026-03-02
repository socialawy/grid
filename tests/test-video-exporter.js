// tests/test-video-exporter.js

let passed = 0, failed = 0;
const results = [];

function assert(cond, msg) {
    if (cond) { passed++; results.push({ status: 'pass', name: msg }); }
    else { failed++; results.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

class MockVideoEncoder {
    constructor(init) { this.init = init; this.state = 'unconfigured'; }
    configure(opts) { this.state = 'configured'; this.opts = opts; }
    encode(vf) {
        const chunk = { byteLength: 10, timestamp: vf.timestamp, type: 'key', copyTo: (buf) => { } };
        const metadata = { decoderConfig: { description: new ArrayBuffer(2) } };
        this.init.output(chunk, metadata);
    }
    async flush() { this.state = 'flushed'; }
}

class MockVideoFrame {
    constructor(source, init) { this.timestamp = init.timestamp; }
    close() { }
}

const mockMP4Box = {
    createFile: () => ({
        addTrack: () => 1,
        addSample: () => { },
        write: (ds) => { ds.buffer = new ArrayBuffer(100); }
    }),
    DataStream: class { constructor() { } }
};

global.window = global.window || {};
global.window.VideoEncoder = MockVideoEncoder;
global.window.VideoFrame = MockVideoFrame;
global.window.MP4Box = mockMP4Box;
global.Blob = global.Blob || class Blob {
    constructor(arr, opts) { this.arr = arr; this.type = opts.type; }
};
global.document = {
    createElement: () => ({ getContext: () => ({ drawImage: () => { } }), width: 640, height: 480 })
};

import { gridToMp4, isVideoExportAvailable, videoExportDefaults } from '../src/exporters/video-exporter.js';

console.log('\n🧪 Video Exporter (Task 6.5)\n' + '='.repeat(50));

{
    assert(isVideoExportAvailable() === true, 'available when VideoEncoder and MP4Box exist');
}

{
    const d = videoExportDefaults();
    assert(d.fps === 10, 'default fps = 10');
    assert(d.codec === 'avc1.42001e', 'default codec');
}

{
    let progressCount = 0;
    const mockGrid = { frames: [{}, {}, {}], canvas: {}, meta: {}, project: {} };
    let currentIdx = 0;
    const mockRenderer = {
        current: 0,
        goTo: (idx) => { currentIdx = idx; },
        render: () => { },
        canvas: { width: 640, height: 480 } // Mock canvas
    };

    const blob = await gridToMp4(mockGrid, mockRenderer, {}, (curr, tot) => { progressCount++; });

    assert(blob instanceof global.Blob, 'returns a Blob');
    assert(blob.type === 'video/mp4', 'returns video/mp4 MIME type');
    assert(progressCount === 3, 'progress called for all frames');
}

// Check unavailability
{
    const saved = global.window.VideoEncoder;
    delete global.window.VideoEncoder;
    assert(isVideoExportAvailable() === false, 'unavailable when VideoEncoder missing');
    global.window.VideoEncoder = saved;
}

console.log(`\ntest-video-exporter.js: ${passed} passed, ${failed} failed\n`);
export { results, passed, failed };
