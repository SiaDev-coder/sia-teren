# PROBLEME — SIA Teren

Format: problemă — cauză — rezolvare.

1. **huggingface.co, api.cloudflare.com, *.workers.dev blocate** — politica de rețea a mediului cloud (proxy 403). — Nu am căutat ocolișuri. Codul pentru model vocal și deploy e complet; pasul de mediu îi revine lui Ionuț (vezi raportul final).
2. **Varianta WASM pentru WebGPU depășește 25 MiB** (limita Cloudflare per fișier). — Livrare gzip + decompresie în worker (vezi DECIZII).
3. **typescript 7 incompatibil cu typescript-eslint** — folosit TypeScript 6.0.3.
