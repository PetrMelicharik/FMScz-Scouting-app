# FM Scouts – pokyny pro projekt

Platí navíc k hlavnímu `Claude_lab/CLAUDE.md` (čeština, tykání, laické
vysvětlování, nejdřív návrh a souhlas, před přepsáním/smazáním se zeptat).

## Cíl projektu
Webová aplikace **FM Scouts.cz** pro skauting fotbalových hráčů pro tým.
Zobrazuje databázi hráčů, filtry, grafy, porovnání hráčů, tým týdne,
scouting tool, tvorbu reportů a osobní shortlist (seznam sledovaných hráčů).

## Technologie
- **Next.js 14 + React 18** (JavaScript, soubory `.jsx`). Next.js je framework
  na webové aplikace postavený na Reactu.
- **Recharts** – grafy. **xlsx** – čtení Excelu při buildu.
- **Supabase** – přihlášení uživatelů a ukládání shortlistu (databáze v cloudu).
  Tabulky chrání Row Level Security (každý vidí jen své řádky), SQL je ve
  složce `supabase/`. V `lib/supabaseClient.js` je jen veřejný "anon" klíč,
  ten tam být smí. Admin klíč (`service_role`) do kódu nikdy nedávat.
- **Vercel** – hosting. Každý push na GitHub spustí nové nasazení.
- **GitHub Actions** – automatické stahování fotek a log (viz níže).

## Repozitář a synchronizace
- GitHub: https://github.com/PetrMelicharik/FMScz-Scouting-app (větev `main`).
- Tato složka je `git clone` toho repa a je s ním propojená.
- **Před každou prací spusť `git pull`.** Na GitHub průběžně přibývají commity
  od robota (GitHub Actions, každé pondělí) a od Petra (nahrání souborů přes
  webové rozhraní, "Add files via upload").
- Na GitHub nic neposílej (`git push`) bez výslovného souhlasu, protože push
  rovnou nasadí novou verzi na Vercel pro celý tým.

## Zdroje dat
- `data/db.xlsx` – hlavní databáze hráčů. Generuje ji `python/build_db.py`
  (přepis Petrova notebooku `Documents\Python\fmscouts_footy_stats\db_creation.ipynb`,
  výstup musí zůstat stejný) z CSV v `data/footystats_csv/`.
- `data/footystats_csv/` – CSV z FootyStats, jedno na ligu (poslední stažená
  verze, starší jsou v `archiv/`). Není na GitHubu (`.gitignore`), jsou placená.
  Petr nestahuje vždy všechny ligy, takže se pro každou ligu použije poslední CSV.
- `python/ligy.csv` – seznam lig (začátek názvu CSV; název ligy; země).
  Pořadí řádků = pořadí v db.xlsx. Nová liga = nový řádek + ID ligy
  v `config/media-aliases.mjs`.
- `aktualizovat_databazi.bat` – poloautomat: git pull → import CSV ze Stažených
  → build_db.py → potvrzení → push db.xlsx.
- `data/tm_data.json` – údaje z Transfermarktu (pozice, tržní hodnota, smlouva,
  noha). Generuje ho `python/transfermarkt.py` (spouští se lokálně přes
  `aktualizovat_transfermarkt.bat`, ne na GitHubu – Transfermarkt scraping
  nepovoluje, je to Petrovo osobní použití). Čte soupisky klubů (kód soutěže
  `tm_kod` v `python/ligy.csv`, ruční ID klubů v `python/tm_kluby.csv`,
  ruční ID hráčů v `python/tm_hraci.csv`),
  cache v `data/tm_cache/` (není na GitHubu). Klíč = player_club_key, musí
  zůstat shodný s `lib/normalize.js`. Tempo dotazů (5–10 s) nezrychlovat.
  Původní verze: `Documents\Python\data_scout\transfm.ipynb`.
- `data/media-map.json`, `data/form-map.json`, `data/unmatched-report.json` –
  fotky/loga a forma hráčů z API-Football. Generuje je
  `scripts/fetch-media.mjs` přes GitHub Actions, ručně se needitují.
- `config/media-aliases.mjs` – ruční párování názvů lig/klubů, které se
  automaticky nespárovaly.
- `scripts/build-data.mjs` – při `npm run dev` / `npm run build` spojí vše výše
  do `public/data/players.json` (ten se necommituje, je v `.gitignore`).

## Struktura
- `app/` – stránky (každá podsložka = jedna URL): `databaze`, `databaze/[id]`
  (detail hráče), `grafy`, `porovnani`, `scouting-tool`, `shortlist`, `tym-tydne`.
- `components/` – hlavní obsah stránek (např. `DatabaseView.jsx`, `GrafyView.jsx`,
  `ReportBuilder.jsx`, `ScoutApp.jsx`).
- `lib/` – pomocné funkce (normalizace dat, metadata statistik, pizza grafy,
  shortlist, Supabase).
- `public/` – obrázky (logo, razítko).

## Spuštění lokálně
```
npm install   # jednou, stáhne knihovny do node_modules/
npm run dev   # spustí aplikaci na http://localhost:3000
```

## Pravidla pro tento projekt
- **Nikdy neodstraňuj žádnou funkci aplikace bez Petrova výslovného souhlasu.**
  Většinou se funkce upravují nebo přidávají nové. Když bude chtít něco
  odstranit, řekne to sám.
- **Měň jen to, co Petr zadá.** Všechno ostatní (vzhled, chování, texty,
  ostatní funkce a stránky) musí zůstat přesně tak, jak je. Žádné
  "vylepšení" ani úklid kódu navíc. Když úprava nevyhnutelně ovlivní i něco
  dalšího, nejdřív se zeptej.
- Výstupy a reporty pro kluby (např. z `ReportBuilder.jsx`) nesmí zmiňovat
  zdroje dat (Sofascore, Wyscout, Best11, Transfermarkt) ani obsahovat úvodní
  vysvětlivky.
- Komentáře v kódu piš česky.
- Některé soubory (např. `components/NavBar.jsx`) se v PowerShellu zobrazují
  s rozbitou diakritikou. Jsou v UTF-8, při úpravách to kódování zachovej.
