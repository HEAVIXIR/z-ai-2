# Iranian administrative city data

This file is a bundled, versioned data snapshot used by the HEAVIX location selector and the idempotent taxonomy seed.

- Upstream project: https://github.com/sajaddp/list-of-cities-in-Iran
- Upstream release: 3.1.2
- Official administrative source year: 1404 (Solar Hijri)
- Dataset used: `dist/json/cities-filtered.json` (real cities, excluding the separately classified 191 urban zones)
- Provinces: 31
- Upstream city records: 1,481
- Distinct city names selectable under the current province/name database key: 1,479
- Two duplicate city-name records occur within the same province but in different counties. The current HEAVIX City model does not represent counties, so identical province-local labels are deduplicated instead of creating indistinguishable dropdown choices.
- Upstream source workbook SHA-256: `e58107e6d478366f98042c3f25b2f27032363976f0ce25dab91fc55ea03ad1df`
- Upstream dataset license: GNU GPL version 3.0; see `LICENSE-iran-cities-GPL-3.0.txt`.

The upstream project states that its administrative division files are generated from the official workbook covering divisions through the end of Solar Hijri year 1404. It is an open-data software resource, not itself a government authority. For legal or regulatory reliance, consult current Ministry of Interior notices and replace this snapshot when a newer official source is verified.

The bundled records are grouped by province and imported through the existing `Country → Province → City` relational schema. City names are not treated as globally unique; their province relationship is authoritative. The seed uses additive upserts and does not delete records or overwrite existing city metadata.

Attribution: data compiled and published by the `sajaddp/list-of-cities-in-Iran` project. This bundled dataset is distributed under GPL-3.0 in accordance with the upstream repository's stated license.
