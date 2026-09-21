# Brain anatomy display data

Source: https://storage.googleapis.com/flywire-data/codex/data/fafb/783/coordinates.csv.gz

The renderer uses the first supplied representative coordinate for each classified root ID (139255 points), not reconstructed neurites or individual synapse locations. Source IDs remain in the original gzip file. No random points or interpolated neurons were added.

The normalization follows DesktopFly's etl.py at commit 32b00011e83c3dc85fa3ea0b3934155b04f1635d: centre the source bounds, scale the longest axis to 20, invert image y/z axes. Unlike DesktopFly's 23210-point sample, positions.f32 includes every available classified point. metadata.json records bounds and alignment checks.

All 668 existing activity probes have corresponding source coordinates, with maximum normalized coordinate discrepancy below 0.0005 from upstream rounding. The pale layer is static anatomy; only the coloured probe layer represents the running model's activity. The anatomy table has 139255 entries while our paired simulation release has 138639 neurons; the display does not imply all background coordinates are simulated.

Regenerate with the workspace Python environment:

```powershell
. .\scripts\vision-env.ps1
& .venv-brain/Scripts/python.exe scripts/prepare-brain-view.py
```

FlyWire-derived data: CC BY-NC 4.0, see DATA_LICENSE.md. Credit Dorkenwald et al. and Schlegel et al. (Nature, 2024), FlyWire Consortium, and DesktopFly for the transform/reference implementation.
