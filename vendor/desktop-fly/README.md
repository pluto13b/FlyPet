# Reused body geometry

`point-cloud.js` additionally reuses the pointCloud function from the same commit's `windows/renderer/brain.js`, with a local module import and export. The existing MIT LICENSE covers this code. FlyPet supplies the panel integration and activity readout, using all available source coordinates instead of the upstream visual sample.

Source: https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/windows/src/flymodel.js

License: MIT, see LICENSE. Original copyright notices are retained there.

Only the code before `// MARK: - Behavior` was extracted. Changes: local three.js import; removed simulation/utility imports; replaced the fixed ankle angle dependency with a constant. The upstream Fly behavior class, neural engine and decision loop are **not used**. FlyPet supplies its own animation driver, neural simulation, sensing and behavior.

2026-09-19: exposed head/thorax/eyes references in the geometry return value. FlyPet's surface details and smooth animation remain in src/renderer/body-details.js and body.js.

