# FM Scouts.cz — skautovací aplikace

Next.js aplikace pro skauting fotbalových hráčů. Databáze hráčů žije jako
`data/db.xlsx` přímo v repozitáři; při každém nasazení se automaticky
převede na data, která aplikace zobrazuje.

## Jak to funguje

1. `data/db.xlsx` — Excel databáze hráčů (vygenerovaná tvým Python skriptem).
2. Doplňková data (nepovinná, když chybí, aplikace funguje dál, jen bez nich):
   - `data/tm_data.json` — pozice, tržní hodnota, smlouva a noha z lokálního
     Transfermarkt scraperu,
   - `data/media-map.json` a `data/form-map.json` — fotky, loga a forma hráčů
     z API-Football (viz sekce níže).
3. `scripts/build-data.mjs` — při každém `npm run build` (tedy i při každém
   nasazení na Vercelu) přečte `data/db.xlsx`, přimíchá k němu doplňková data
   a vygeneruje `public/data/players.json`.
4. Stránky aplikace (složka `app/`, obsah stránek je v `components/`):
   - **Home** (`/`) — úvodní stránka s přehledem (počet hráčů, lig, sezóna).
   - **Databáze** (`/databaze`, `DatabaseView.jsx`) — filtry a tabulka hráčů.
   - **Detail hráče** (`/databaze/[id]`) — profil hráče, podobní hráči
     a tvorba reportu (`ReportBuilder.jsx`).
   - **Grafy** (`/grafy`, `GrafyView.jsx`) — grafy a vizualizace statistik.
   - **Tým týdne** (`/tym-tydne`, `TymTydneView.jsx`) — nejlepší sestava.
   - **Porovnání hráčů** (`/porovnani`, `ComparePlayersView.jsx`).
   - **Scouting tool** (`/scouting-tool`, `ScoutingTool.jsx`).
   - **Shortlist** (`/shortlist`, `ShortlistView.jsx`) — osobní seznam
     sledovaných hráčů, vyžaduje přihlášení.

## Lokální spuštění

```bash
npm install
npm run dev
```

Aplikace poběží na http://localhost:3000.

## Nasazení na Vercel (propojené s GitHubem)

Aplikace už je nasazená z repozitáře
https://github.com/PetrMelicharik/FMScz-Scouting-app — každý push do větve
`main` automaticky spustí nové nasazení. Postup níže je jen pro případ, že
bys ji zakládal znovu od nuly.

1. **Vytvoř GitHub repozitář** a nahraj do něj celý obsah této složky
   (včetně `data/db.xlsx`).
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

1. Vygeneruj nový `db.xlsx` svým Python skriptem.
2. Nahraď jím soubor `data/db.xlsx` v repozitáři (přes `git push`,
   nebo přetažením souboru přímo v GitHub webovém rozhraní — funguje i to).
3. Vercel automaticky spustí nový build a za pár minut je nová databáze
   živá pro celý tým — nikdo nic dalšího dělat nemusí.

## Fotky hráčů, loga klubů a lig (API-Football)

Fotky/loga se stahují a párují s databází automaticky přes GitHub Actions —
nic se nespouští lokálně a API klíč nikdy neopustí GitHub.

**Jednorázové nastavení:**
1. V repozitáři na GitHubu: **Settings → Secrets and variables → Actions →
   New repository secret**.
2. Název: `API_FOOTBALL_KEY`, hodnota: tvůj klíč z
   [dashboard.api-football.com](https://dashboard.api-football.com/).

**Odtud už automaticky:**
- Workflow `.github/workflows/fetch-media.yml` běží každé pondělí, po
  nahrání nového `data/db.xlsx`, nebo ručně (záložka **Actions** →
  "Aktualizace fotek a log hráčů" → **Run workflow**).
- Stáhne loga lig/klubů a fotky hráčů z API-Football, spáruje je s tvou
  databází a výsledek (`data/media-map.json`) commitne zpátky do repa.
- Ten commit spustí nový Vercel build, který fotky/loga automaticky
  zapojí do zobrazených dat (`scripts/build-data.mjs` je při buildu
  přimíchá k příslušným hráčům/klubům/ligám).

**Když se něco nespáruje:** párování jmen lig a klubů je automatické
(fuzzy matching), ale u lig se sponzorskými názvy (např. "Hungarian Fizz
Liga") se nemusí trefit samo. Po doběhnutí workflow zkontroluj v záložce
Actions log běhu — vypisuje, kolik lig/klubů/hráčů se napárovalo. Chybějící
páry lze doplnit ručně do `config/media-aliases.mjs` (commitni jako
běžnou změnu) — příští běh workflow je použije.

## Přihlášení a shortlist (Supabase)

Přihlašování uživatelů a ukládání shortlistu zajišťuje
[Supabase](https://supabase.com) (databáze v cloudu).
- Připojení je v `lib/supabaseClient.js`. Je tam jen veřejný "anon" klíč,
  který být v kódu smí. Admin klíč (`service_role`) tam nikdy nepatří.
- Tabulky a pravidla přístupu jsou ve složce `supabase/` (`shortlist.sql`,
  `shortlist-v2.sql`). Pravidla (Row Level Security) zajišťují, že každý
  uživatel vidí jen svůj vlastní shortlist.

## Poznámka ke sdílení s týmem

Databáze hráčů je pro všechny stejná — všichni, kdo mají odkaz na
nasazenou verzi, vidí stejná data. Liší se jen osobní shortlist
přihlášeného uživatele. Pokud chceš přístup omezit jen na
tým, dá se na Vercelu zapnout ochranu heslem nebo přihlášením
(Vercel → Project Settings → Deployment Protection).
