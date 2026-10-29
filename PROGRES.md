# PROGRES — SIA Teren

| Fază | Stare | Dovada |
|---|---|---|
| 0 Mediu și cercetare | ✅ | `DECIZII.md` (mediu, test rețea, tabel dependențe + licențe, decizii) |
| 1 Schelet: PWA, Dexie, rutare, layout, Setări | ✅ | `tests/e2e/01-shell-offline.spec.ts`: shell-ul pornește offline după reîncărcare + link adânc offline + manifest complet — trece pe Chromium (Pixel 7) și WebKit (iPhone 15) |
| 2 Proiecte + Raport zilnic | ✅ | Unit: `tests/unit/db.test.ts` (migrare v1→v2, unicitate dată, finalizare/redeschidere, copiere din ziua precedentă, Coș, amintire backup). E2E: `tests/e2e/02-flux-complet.spec.ts` — „aceeași dată deschide raportul existent; copiere; reîncărcare în mijlocul formularului” trece pe Chromium + WebKit |
| 3 Foto + adnotare + GPS | ✅ | E2E 1 (`02-flux-complet.spec.ts`): fotografie din butonul „Fotografie” → redimensionată 3000×2000 → 2048×1365 → adnotare săgeată + cerc + text, anulare pas → salvată ca strat separat → apare în PDF — trece pe Chromium + WebKit |
| 4 Constatări | ✅ | E2E 2 (`tests/e2e/03-constatari.spec.ts`): GPS ±8 m, foto „înainte” (2, inclusiv orientare EXIF 6 → 1200×1600) și „după”, stări Deschisă → În lucru → Rezolvată → Verificată cu istoric datat, filtre (stare, gravitate, responsabil, depășite), evidențiere depășite, PDF listă + CSV — trece pe Chromium + WebKit |
