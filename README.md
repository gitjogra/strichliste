# Strichliste

Persönlicher Fitness-Habit-Tracker als Web-App (PWA) fürs Android-Handy.
Jeden Tag 3× Strength und 3× Mobility. Jede Übung ist ein Kreidestrich:

| Geste | Bedeutung |
|---|---|
| senkrecht wischen | 1 Strength-Übung (weißer Strich) |
| waagerecht wischen | 1 Mobility-Übung (blauer Strich) |
| Minus neben Strength / Mobility antippen | einen Strich dieser Art entfernen |

Ein volles Gitter (3 + 3) bekommt einen roten Kreis und zählt für die Serie.
Der Tag wechselt um 3 Uhr nachts. Mit den Pfeilen ‹ › oben springst du zum Vortag bzw. nächsten Tag,
über den Kalender kannst du direkt zu jedem vergangenen Tag springen.

## Projektstruktur

```
index.html              App-Gerüst (Heute, Kalender, Statistik)
css/style.css           Kreidetafel-Design
js/app.js               Ansichten und Verdrahtung
js/storage.js           lokaler Speicher, Tageswechsel, Export/Import
js/strokes.js           handgezeichnete SVG-Striche
js/gestures.js          Wischerkennung
js/stats.js             Serien und Quoten
js/sync.js              Supabase-Login (E-Mail-Link) und Synchronisation
js/config.js            Supabase-URL und anon key  ← hier eintragen
supabase/schema.sql     Tabelle + Zugriffsschutz für Supabase
sw.js, manifest.webmanifest, icons/   PWA (installierbar, offline)
tools/serve.ps1         lokaler Testserver
```

## Lokal testen

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```
Dann http://localhost:8080 öffnen.

## Supabase einrichten

Projekt: `strichliste` (Region Frankfurt), ID `amxjqvgcryabgidhyspb`.
Tabelle, Row Level Security und `js/config.js` sind bereits eingerichtet (siehe `supabase/schema.sql`).

Noch von Hand im Supabase-Dashboard:

1. **Einmal anmelden:** App öffnen → E-Mail eingeben → Link aus der Mail im **selben Browser** öffnen. Ohne eigenen SMTP-Server verschickt Supabase
   die Standard-Mail mit Link; die Vorlagen lassen sich dann nicht ändern. Das reicht aber.
2. **Registrierung sperren:** *Authentication → Sign In / Providers* → „Allow new users to sign up“ ausschalten.
   Danach kann sich niemand außer dir mehr anmelden.
3. **Nach dem Veröffentlichen:** *Authentication → URL Configuration* → Site URL auf die GitHub-Pages-Adresse
   setzen und dieselbe Adresse unter *Redirect URLs* eintragen – sonst führt der Login-Link nicht zur App.

## Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `strichliste`.
2. Alle Dateien dieses Ordners hochladen (per Git oder über *Add file → Upload files*).
3. *Settings → Pages* → Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → *Save*.
4. Nach ca. 1 Minute läuft die App unter `https://<dein-name>.github.io/strichliste/`.

## Aufs Handy installieren

Adresse in Chrome auf dem Android-Handy öffnen → Menü ⋮ → **„Zum Startbildschirm hinzufügen“ / „App installieren“**.
Die App startet dann im Vollbild und funktioniert auch offline.

## Updates

Nach Änderungen an Dateien in `sw.js` die Versionsnummer (`strichliste-v1` → `v2`) erhöhen,
damit das Handy die neue Version lädt. Die App aktualisiert sich spätestens beim zweiten Öffnen.

## Backup

Statistik → *Backup exportieren* lädt eine JSON-Datei herunter. Über *Backup importieren* lässt sie sich wiederherstellen.
