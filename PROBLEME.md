# PROBLEME — SIA Teren

Format: problemă — cauză — rezolvare.

1. **huggingface.co, api.cloudflare.com, *.workers.dev blocate** — politica de rețea a mediului cloud (proxy 403). — Nu am căutat ocolișuri. Codul pentru model vocal și deploy e complet; pasul de mediu îi revine lui Ionuț (vezi raportul final).
2. **Varianta WASM pentru WebGPU depășește 25 MiB** (limita Cloudflare per fișier). — Livrare gzip + decompresie în worker (vezi DECIZII).
3. **typescript 7 incompatibil cu typescript-eslint** — folosit TypeScript 6.0.3.
4. **WebKit: „Error preparing Blob/File data to be stored in object store”** la salvarea logo-ului/fotografiilor — binarele se stochează ca ArrayBuffer (vezi DECIZII, Fazele 2–3).
5. **Playwright WebKit + `setOffline(true)`**: reîncărcarea eșua („WebKit encountered an internal error”) deși service worker-ul era activ. Verificat manual: cu serverul oprit, WebKit încarcă aplicația din service worker. Testele offline opresc serverul (și pe Chromium folosesc și `setOffline`).
6. **Ecranul Setări interoga huggingface.co la deschidere** (pentru mărimea modelului) — contravine regulii „singura cerere de rețea: descărcarea explicită”. Mutat în fluxul butonului „Descarcă”.
7. **`waitForFunction` cu funcție async** întorcea imediat (Promise = valoare „adevărată”) → testul reîncărca înainte ca service worker-ul să fie activ. Înlocuit cu `navigator.serviceWorker.ready`.
8. **Săgeata „→” apărea ca „?” în PDF** — Noto Sans nu are glifa U+2192. Adăugată tabelă de înlocuitori (→ devine „->”, emoji eliminate) + test unitar.
9. **Chromium (Playwright) nu încărca fișiere din căi cu diacritice** (dosarul de rezultate al testului conținea „fără”) — evenimentul `change` venea cu listă goală. Testele folosesc acum căi ASCII în `/tmp`. Pe telefon numele fișierelor alese de utilizator nu sunt afectate (browserul primește fișierul, nu calea).
10. **Cursă în test**: după „Șterge proiectul” aplicația navighează la Proiecte; testul naviga la Coș înainte → ajungea înapoi pe Proiecte. Testul așteaptă acum confirmarea.
11. **Sesiunea s-a repornit (cod 137) la rularea testelor de voce cu 3 browsere în paralel** — testele de voce rulează cu `--workers=1`.
12. **`Content-Encoding: gzip` adăugat automat de server pentru `*.wasm.gz`** → redenumit `*.wasm.gzdata` + detecție după semnătură.
13. **E2E 6 nu poate rula aici**: huggingface.co blocat (403 la proxy). Testul există complet (descărcare → offline → transcriere fișier român → inserare în câmp) și se sare automat cu motivul afișat; rulează când mediul are acces.
