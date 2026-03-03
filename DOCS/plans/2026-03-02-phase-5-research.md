# Phase 6 Research

## 📌 1) Transformers.js v3 – jsDelivr CDN URL

- The current stable npm release is:
 `@huggingface/transformers@3.8.1`, 
 and the CDN import is:
 `import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1' npm`

 - However, Transformers.js v4 (preview) launched on February 9, 2026, available via `npm i @huggingface/transformers@next` Hugging Face, with the v4 CDN URL being:
 `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-next.4` 
 GitHub. v3+ uses ES module root imports just fine.

## 📌 2) ONNX Runtime Web – CDN URL

- Best upscaler model: Sub-pixel CNN (ESPCN-like, from Shi et al., small size ~100KB, suitable for browser). Download from ONNX Model Zoo. ORT Web latest version: 1.24.2.
- CDN: `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/ort.min.js`

- GitHub: `https://github.com/onnx/models`

## 3. Gemini free tier rate limits — 

The situation is complicated because Google cut limits in December 2025, and the numbers vary by model. Here's the verified picture:

As of February 2026, Gemini 2.5 Flash free tier offers 10 RPM, 250,000 TPM, and 250 RPD. LaoZhang AI Blog
Flash-Lite provides 15 RPM and 1,000 RPD free. Tier 1 (just enable billing, no spend needed) jumps to 150–300 RPM and 1,500 RPD. LaoZhang AI Blog

- help.apiyi.com isn't an official source. The real context: in December 2025, Google slashed Flash from 250 to 20 RPD, but it has since stabilized back at 250 RPD. 

LaoZhang AI Blog observation that it's generous is correct — and Google's official docs now direct you to check AI Studio directly for current per-model limits, as they no longer publish a static table.

## Gemini Imagen 4 API endpoint generate image from text 2026

API call format: curl -X POST -H "Content-Type: application/json" -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict -d '{"instances": [{"prompt": "Your text prompt"}]}'  

ai.google.dev

- The official Google documentation confirms the current endpoint is https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict with instances[].prompt as the request body. Google AI The :predict suffix is the correct format for Imagen specifically — it's different from the :generateContent path used by Gemini text models

## 5. Semantic segmentation model (FastSAM-s)
- Model selection: FastSAM-s (YOLOv8-based, 23.7MB, real-time semantic segmentation variant). Suitable for browser via ONNX Runtime Web. Alternative: YOLOv8n-seg (6.7MB, instance segmentation close to semantic).  

docs.ultralytics.com

- FastSAM and YOLOv8n-seg are instance segmentation, not semantic segmentation. If strict semantic segmentation is needed, alternatives like SegFormer-B0 or DeepLabV3-MobileNet are more accurate choices. That said, for many browser use-cases the distinction is irrelevant in practice.




