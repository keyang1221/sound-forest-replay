# Sound Forest

Spatial replay and interaction data visualization for five interactive strings.

The original CSV repository remains private. This public repository contains the website and processed interaction events only: seconds within the day, string number and amplitude. It does not include the original CSV files, elapsed recording time, slope, pitch, local paths or credentials.

## Automatic updates

The Publish Sound Forest workflow checks the private `keyang1221/sound-forest-data` repository every five minutes, skips unchanged revisions, builds the public data and publishes GitHub Pages. GitHub can delay scheduled runs. A read-only repository-scoped token is required in the `SOUND_FOREST_DATA_READ_TOKEN` Actions secret; until configured, the initial snapshot remains available and scheduled data updates are skipped. Original CSV commits are never modified.

Source code changes on main also publish automatically. The private data checkout is never included in the Pages artifact. Only the generated `_site` directory is published. Derived snapshot commits keep a reproducible public copy and contain no raw CSV data.

## Local static preview

Serve this directory with a static HTTP server. No GitHub credentials are used in the browser.
