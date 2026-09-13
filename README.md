# Dosier — skautovací aplikace

Next.js aplikace pro skauting fotbalových hráčů. Databáze hráčů žije jako
`data/players.xlsx` přímo v repozitáři; při každém nasazení se automaticky
převede na data, která aplikace zobrazuje.

## Jak to funguje

1. `data/players.xlsx` — Excel databáze hráčů (vygenerovaná tvým Python skriptem).
2. `scripts/build-data.mjs` — při každém `npm run build` (tedy i při každém
   nasazení na Vercelu) přečte `data/players.xlsx` a vygeneruje
   `public/data/players.json`.
3. Aplikace (`components/ScoutApp.jsx`) si tento JSON načte při startu a
   zobrazí filtrování, srovnání a žebříčky hráčů.

## Lokální spuštění

```bash
npm install
npm run dev
```

Aplikace poběží na http://localhost:3000.

## Nasazení na Vercel (propojené s GitHubem)

1. **Vytvoř GitHub repozitář** a nahraj do něj celý obsah této složky
   (včetně `data/players.xlsx`).
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<tvůj-účet>/<název-repa>.git
   git push -u origin main
   ```
2. Na [vercel.com](https://vercel.com) zvol **Add New → Project**, vyber
   tento GitHub repozitář. Vercel automaticky rozpozná Next.js — není
   potřeba nic nastavovat, klikni **Deploy**.
3. Po pár minutách dostaneš veřejnou URL (např. `nazev-repa.vercel.app`).

## Jak aktualizovat databázi

Kdykoliv budeš mít novou verzi dat:

1. Vygeneruj nový `players.xlsx` svým Python skriptem.
2. Nahraď jím soubor `data/players.xlsx` v repozitáři (přes `git push`,
   nebo přetažením souboru přímo v GitHub webovém rozhraní — funguje i to).
3. Vercel automaticky spustí nový build a za pár minut je nová databáze
   živá pro celý tým — nikdo nic dalšího dělat nemusí.

## Poznámka ke sdílení s týmem

Aplikace je čistě statická/read-only — všichni, kdo mají odkaz na
nasazenou verzi, vidí stejná data. Pokud chceš přístup omezit jen na
tým, dá se na Vercelu zapnout ochranu heslem nebo přihlášením
(Vercel → Project Settings → Deployment Protection).
