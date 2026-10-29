# Raport de re-verificare 4 — SIA Teren (commit `027dcf9`)

Data: 30.10.2026 · Verificator independent · Repo-ul nu a fost modificat (`git status` curat), iar serverul de previzualizare e oprit.

## Verdict

| Categorie | Număr dovedit |
|---|---|
| **Constatări critice** | **0** |
| **Constatări majore** | **0** |
| Minore deschise | 2: R-06 (limitare documentată, două ferestre) și R-07 (acord numeral în rezumatul restaurării) |
| Observații deschise | O-01, V-20, V-21, V-23 |
| **V-09** (E2E 6 / transcriere Whisper reală, offline) | **nedovedită**: depinde de huggingface.co, blocat în acest mediu |

## Starea constatărilor din runda anterioară

| ID | Severitate | Stare | Dovadă (Chromium și WebKit) |
|---|---|---|---|
| R-04 fotografie / notă vocală orfană în a doua fereastră | majoră | **Rezolvată** | s11 [W1]: foto total=1, legată de raportul existent=1, miniatură afișată în B; [W2]: notă legată=1, afișată=1. În plus, `assertOwnerEditable` refuză acum un raport sau o constatare inexistentă ori ștearsă. |
| R-05 PDF / Finalizează / Copiază eșuau la prima apăsare în B | minoră | **Rezolvată** | s12 [W3a]: PDF descărcat la prima apăsare; s13 [W10]: DB=„final”, insignă „Finalizat”, mesaj „Raport finalizat.”; [W11]: personal copiat=1, mesaj corect. |
| R-06 liste de rânduri editate în două ferestre (câștigă ultima) | minoră | **Rămâne** (documentată ca limitare) | s11 [W5]: `["Sudori","Topograf"]` — „Maistru” pierdut |
| V-01 … V-08, V-10 … V-19, V-22, R-01 … R-03 | — | **Rămân rezolvate** | sondaj s1, s2, s3, s3b, s8, s9 — vezi mai jos |
| O-01 „1.000” → 1 în cantitate (conversia e afișată ca „1,000”) | observație | Neschimbată | s9 [N12] |
| V-20 licența Zlib / ORT dev, V-21 ArrayBuffer, V-23 captură cu dată americană | observații | Neschimbate | — |

## Constatare nouă

| ID | Severitate | Cerință | Constatare | Cum se reproduce | Dovadă |
|---|---|---|---|---|---|
| R-07 | minoră | §5 română corectă | Rezumatul copiei la restaurare nu folosește acordul numeral: „1 proiecte, 1 rapoarte, 1 constatări, 1 fotografii”. | Restaurează o copie cu câte un singur element. `src/screens/Backup.tsx:120` | s3 [R-raport-incomplet]: „2 proiecte, 1 rapoarte, 1 constatări, 1 fotografii, 0 note vocale” |

## Sondaj de regresie (Chromium; s2, s11, s12, s13 și pe WebKit) — toate OK

- **Două ferestre:** s11 [W3b, W4, W4b, W6, W7, W8, W9] OK. Combinarea câmpurilor, refuzul după finalizare în altă fereastră, constatările și scenariul cu un singur tab merg.
- **Salvarea imediată:** s1 [E, E2], s2 (reîncărcare la 0/50/150/300/500 ms) → nimic pierdut.
- **Zi necompletată:** s9 [N1, N4, N4b, N9b] OK; fotografie, finalizare, tastare + finalizare imediată.
- **Navigare pe zile:** s1 [B] → nu se creează rapoarte goale.
- **Raport finalizat și Coș:** s3 [K1–K4] OK.
- **Copie de siguranță:** s3 [M1] → partajarea anulată nu schimbă „Ultima copie”.
- **Restaurare:** fișierele trunchiate, goale, străine sau cu dată invalidă dau mesaj clar; datele incomplete sunt normalizate (s3, s3b [R1, R2b]). Raportul nou după restaurare pe un profil nou se deschide normal (s3b [T]).
- **Transcriere întreruptă:** s3b [V1] → se poate relua.
- **„Copiază din ziua precedentă”** (s8 [B2]) și **confirmarea ștergerii de rânduri** (s8 [RW]) OK.
- **Export „Fotografii .zip” și mesajele de numărare:** s9 [N10, N10b] OK.
- **Ciorna constatării:** s9 [N11, N11b] OK.

## Rezultatele exacte ale comenzilor

| Comandă | Rezultat |
|---|---|
| `npm run build` | exit 0, fără erori sau avertismente TypeScript; `index-*.js` 142,96 KB gzip |
| `npm run lint` | exit 0, ESLint curat |
| `npx vitest run` | 5 fișiere, **34 de teste trecute**, 0 picate |
| `npx playwright test --workers=2` | **42 trecute, 0 picate, 6 sărite** (1,4 min) |

Testele sărite:
- E2E 6 pe android-chromium și pe iphone-webkit (huggingface.co blocat);
- pe WebKit, 4 teste marcate doar pentru Chromium: înregistrare cu microfon simulat, microfon refuzat, „fără acces la huggingface.co” și regresia V-08.

## Ce nu am putut verifica (neschimbat)

- **V-09:** E2E 6 / descărcarea modelului și transcrierea Whisper reală, offline (huggingface.co blocat).
- **Deploy-ul HTTPS** și testul offline pe URL-ul public (api.cloudflare.com blocat, fără token-uri).
- **Instalarea reală** pe Android și iPhone, **WebGPU** și **camera reală**.
- **Bannerul „Versiune nouă — Actualizează”** cu o a doua versiune publicată efectiv.
- **`npm run licenses`:** nu l-am rulat, pentru că rescrie `THIRD-PARTY-LICENSES.md` din repo.
