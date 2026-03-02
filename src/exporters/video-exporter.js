// src/exporters/video-exporter.js

export function isVideoExportAvailable() {
    const g = typeof window !== 'undefined' ? window : global;
    return typeof g.VideoEncoder !== 'undefined' && typeof g.MP4Box !== 'undefined';
}

export function videoExportDefaults() {
    return {
        fps: 10,
        width: 640,
        height: 480,
        codec: 'avc1.42001e', // Baseline profile
        bitrate: 2000000,
    };
}

export async function gridToMp4(grid, renderer, opts = {}, onProgress = null) {
    if (!isVideoExportAvailable()) throw new Error('VideoEncoder or MP4Box not available');
    if (!renderer) throw new Error('Renderer required for video export');

    const { fps, width, height, codec, bitrate, musicMode, bpm = 120 } = { ...videoExportDefaults(), ...opts };

    const isMusic = musicMode === true;
    const subdivision = 4;
    const stepDuration = 60 / bpm / subdivision;
    const totalCols = grid.canvas?.width || 1;

    let numFrames = grid.frames.length;
    if (isMusic) {
        const totalSeconds = totalCols * stepDuration;
        numFrames = Math.ceil(totalSeconds * fps);
    }
    const g = typeof window !== 'undefined' ? window : global;

    return new Promise((resolve, reject) => {
        try {
            const mp4box = g.MP4Box.createFile();
            let videoTrackId = null;

            const initOutput = {
                output(chunk, metadata) {
                    if (videoTrackId === null) {
                        videoTrackId = mp4box.addTrack({
                            timescale: 1e6,
                            width: width,
                            height: height,
                            nb_samples: numFrames,
                            avcDecoderConfigRecord: metadata.decoderConfig ? metadata.decoderConfig.description : null,
                            hdlr: 'vide',
                            name: 'GRID Video Track'
                        });
                    }
                    const buffer = new ArrayBuffer(chunk.byteLength);
                    chunk.copyTo(buffer);
                    mp4box.addSample(videoTrackId, buffer, {
                        duration: 1e6 / fps,
                        dts: chunk.timestamp,
                        cts: chunk.timestamp,
                        is_sync: chunk.type === 'key'
                    });
                },
                error(e) { reject(e); }
            };

            const encoder = new g.VideoEncoder(initOutput);
            encoder.configure({ codec, width, height, bitrate, framerate: fps });

            let canvas, ctx;
            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(width, height);
                ctx = canvas.getContext('2d');
            } else if (typeof document !== 'undefined') {
                canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                ctx = canvas.getContext('2d');
            } else {
                throw new Error('Canvas not available for video export');
            }

            const savedIndex = renderer.current;
            let currentFrame = 0;

            const encodeNextFrame = async () => {
                try {
                    if (currentFrame >= numFrames) {
                        await encoder.flush();
                        if (typeof mp4box.flush === 'function') {
                            mp4box.flush(); // Required to generate moov box
                        }
                        const ds = new g.MP4Box.DataStream();
                        ds.endianness = g.MP4Box.DataStream.BIG_ENDIAN;
                        mp4box.write(ds);
                        let blobBuf = ds.buffer;
                        if (ds.position < blobBuf.byteLength) {
                            blobBuf = blobBuf.slice(0, ds.position);
                        }

                        renderer.goTo(savedIndex);
                        resolve(new Blob([blobBuf], { type: 'video/mp4' }));
                        return;
                    }

                    if (isMusic) {
                        if (renderer.current !== 0) renderer.goTo(0);
                        const timeMs = (currentFrame / fps) * 1000;
                        const col = Math.floor((timeMs / 1000) / stepDuration);
                        if (typeof renderer.setPlayheadColumn === 'function') {
                            renderer.setPlayheadColumn(col);
                        }
                    } else {
                        if (typeof renderer.setPlayheadColumn === 'function') {
                            renderer.setPlayheadColumn(-1);
                        }
                        renderer.goTo(currentFrame);
                    }
                    renderer.render();

                    if (ctx && renderer.canvas) {
                        // Draw renderer canvas scaled to our video dimensions
                        ctx.drawImage(renderer.canvas, 0, 0, width, height);
                    }

                    const vf = new g.VideoFrame(canvas, { timestamp: currentFrame * (1e6 / fps) });
                    encoder.encode(vf);
                    vf.close();

                    currentFrame++;
                    if (onProgress) onProgress(currentFrame, numFrames);

                    setTimeout(encodeNextFrame, 0); // Yield
                } catch (e) {
                    reject(e);
                }
            };

            encodeNextFrame();

        } catch (e) {
            reject(e);
        }
    });
}
