# Circuit provenance

Current runtime note: this small circuit now supplies the 668 local visualization probes and baseline tests only. The desktop pet runs the full graph under `whole-brain/` by default; it no longer runs this small graph as a second behavioral controller.

`circuit.json` downloaded on 2026-09-19 from:
https://raw.githubusercontent.com/DenisSergeevitch/desktop-fly/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/circuit.json

668 neurons; derived signed connectivity from FlyWire Codex FAFB v783. This is an upstream extracted circuit, not the full connectome and not an independently rebuilt raw dataset. Fractional signed weights in this derived file are used as supplied.

License: CC BY-NC 4.0 as specified by upstream; see DATA_LICENSE.md for attribution and scope. The MaleCNS files mentioned in that license were not downloaded or used in this baseline.

FlyPet's LIF implementation and sensory encoding are locally authored. Its current model parameters are in `src/core/brain.mjs`: dimensionless threshold 1, membrane time constant 20 ms, 1 ms steps, 3 ms refractory period, weight gain 0.0008, LC4/LPLC2→GF gain 6, excitation next tick and inhibitory transmission delayed 4 ms. These are explicit modeling choices, not measured physiology of the reconstructed specimen. No synapse signs are changed by FlyPet.
