# KolorLab BETA changelog

Each update gets a sequential `BETA-NNNN` number. Before changing the application, create a full source/config backup named `backups/KolorLab-BETA-NNNN.zip`, then record the update here and set `BETA_VERSION.txt` to that version.

## BETA-0028
- Changed color-catalog collection actions from “Compare” to “Add” / “Added”.
- Removed the separate selected-color comparison panel so the six-color picker is the only selected-color collection.
- Backup: `backups/KolorLab-BETA-0028.zip` (pre-update restore point)

## BETA-0027
- Removed the preset interior color combinations and replaced them with a picker card for up to six catalog shades.
- Added explicit add/remove actions, six collection slots, and a reserved panel for future color recommendations.
- Expanded the side-by-side selected-color comparison limit from four to six and renamed the mobile tab from palettes to picker.
- Backup: `backups/KolorLab-BETA-0027.zip` (pre-update restore point)

## BETA-0026
- Removed the interior-room image from the visualizer choices as requested; retained bathroom/interior surface coverage in the paint calculator.
- Backup: `backups/KolorLab-BETA-0026.zip` (pre-update restore point)

## BETA-0025
- Replaced generated surface previews with the user's smooth-wall, paintable-wallpaper, plaster, and interior photos, with color-tint overlays that preserve photo texture.
- Added a separate wallpaper preview mode and clarified that its coverage estimate uses the smooth-wall reference rate.
- Backup: `backups/KolorLab-BETA-0025.zip` (pre-update restore point)

## BETA-0024
- Added three PARADE paints for interior and facade projects with manufacturer-described coverage, tint bases, package sizes, and product pages.
- Added Dulux Matt, Easycare Kitchen Matt, and Weathershield Textured Masonry Paint using verified UK product pages; marked Russian availability, coverage, packages, and base compatibility as unconfirmed.
- Calculated available PARADE A/C package options separately and labeled package base selections in the volume breakdown.
- Made paint-brand filters data-driven and clarified when a dark shade's C-base compatibility is unconfirmed for the selected product.
- Backup: `backups/KolorLab-BETA-0024.zip` (pre-update restore point)

## BETA-0023
- Added a Tikkurila and DUFA paint product catalog with product purpose, finish, manufacturer coverage notes, supported surfaces, base-system details, and source links.
- Added product-aware coverage estimates, package optimization where pack sizes are confirmed, editable locally saved prices, and product details in project, print, and store order specifications.
- Kept product base nomenclature separate from shade tinting Base A/C and flagged estimates where product-specific surface coverage is unavailable.
- Backup: `backups/KolorLab-BETA-0023.zip` (pre-update restore point)

## BETA-0022
- Added DUFA 004–015 to Dufa Color Experience with the supplied HEX, RGB, LRV, Lab, LCh, and color-family metadata.
- Assigned Bases A/C according to the LRV and HEX saturation rule; all twelve shades are available with DUFA catalog filtering.
- Backup: `backups/KolorLab-BETA-0022.zip` (pre-update restore point)

## BETA-0021
- Added DUFA 003 to Dufa Color Experience with the supplied HEX, RGB, LRV, Lab, LCh, and yellow family metadata.
- Assigned white tinting Base A; the shade is available with DUFA catalog filtering.
- Backup: `backups/KolorLab-BETA-0021.zip` (pre-update restore point)

## BETA-0020
- Added DUFA 002 to Dufa Color Experience with the supplied HEX, RGB, LRV, Lab, LCh, and yellow family metadata.
- Assigned white tinting Base A; the shade is available with DUFA catalog filtering.
- Backup: `backups/KolorLab-BETA-0020.zip` (pre-update restore point)

## BETA-0019
- Added DUFA 001 from Dufa Color Experience with the supplied HEX, RGB, LRV, Lab, LCh, and yellow family metadata.
- Assigned white tinting Base A and added a dedicated DUFA catalog filter.
- Backup: `backups/KolorLab-BETA-0019.zip` (pre-update restore point)

## BETA-0018
- Corrected RAL 7040 to its confirmed white tinting Base A, preserving the general LRV/saturation rule for other shades.
- Backup: `backups/KolorLab-BETA-0018.zip` (pre-update restore point)

## BETA-0017
- Removed wood textures, wood-stain/oil calculation, and the associated Valtti and Osmo shades from the active catalog.
- Preserved older wood-finish project entries as archived records so existing saved projects remain visible.
- Replaced wood references in curated palettes, corrected tint bases using LRV and HSV saturation, and unified the base rule for generated Farrow & Ball colors.
- Increased desktop column spacing and styled the vertical scrollbars with the interface's purple palette.
- Backup: `backups/KolorLab-BETA-0017.zip` (pre-update restore point)

## BETA-0013
- Placed the color catalog in a dedicated right-side desktop column with its own scrollable results.
- Grouped paint calculation and ready-made palettes in the center column beside the visualizer.
- Kept catalog access as a slide-out drawer on mobile.
- Backup: `backups/KolorLab-BETA-0013.zip` (pre-update restore point)

## BETA-0014
- Added the supplied named, grayscale, primary, secondary, success, warning, and error color tokens as global CSS variables.
- Applied the purple primary scale to interface accents and connected success, warning, and error tokens to their corresponding status states.
- Backup: `backups/KolorLab-BETA-0014.zip` (pre-update restore point)

## BETA-0015
- Restyled the area range slider to match the purple primary menu, with a filled track and custom thumb across WebKit and Firefox.
- Added visible hover and keyboard-focus states while preserving the existing slider behavior.
- Backup: `backups/KolorLab-BETA-0015.zip` (pre-update restore point)

## BETA-0016
- Added six Valtti Plus Color catalog shades, three ready-made Valtti Plus Terrace Oil shades, and all ten Osmo Decking Oil shades.
- Marked approximate digital oil swatches and added a wood-finish calculator using product-specific coverage, coats, and package sizes without paint tint-base warnings.
- Linked product guidance and included base-free wood finishes correctly in project specifications.
- Backup: `backups/KolorLab-BETA-0016.zip` (pre-update restore point)

## BETA-0012
- Moved the color catalog into a spacious slide-out drawer styled consistently with the client/project panel.
- Added a persistent catalog button to the header and connected the mobile color tab to open the drawer.
- Kept catalog search, filters, color selection, comparison, and incremental loading available inside the drawer.
- Backup: `backups/KolorLab-BETA-0012.zip` (pre-update restore point)

## BETA-0011
- Reorganized the wide-screen workspace into three columns for visualization, paint calculation, and ready-made palettes.
- Constrained the workspace to the viewport and made the color results list the only independently vertically scrollable area.
- Added a palettes tab to the compact navigation and scoped incremental color loading to the catalog scroller.
- Backup: `backups/KolorLab-BETA-0011.zip` (pre-update restore point)

## BETA-0010
- Enlarged catalog badges on color cards and improved their contrast for easier reading.
- Backup: `backups/KolorLab-BETA-0010.zip` (pre-update restore point)

## BETA-0007
- Added Netlify build configuration for Vite (`npm run build`, publish `dist`, Node.js 20).
- Backup: `backups/KolorLab-BETA-0007.zip` (pre-update restore point)

## BETA-0006
- Restored a restrained frosted-glass effect to the client drawer and dimmed/softened the page behind it.
- Kept the drawer background mostly opaque for readable client/project details.
- Backup: `backups/KolorLab-BETA-0006.zip` (pre-update restore point)

## BETA-0005
- Removed the glass blur from the client drawer backdrop and increased its opacity so the main interface is clearly dimmed rather than visible through glass.
- Explicitly isolated and raised the opaque drawer panel above the backdrop.
- Backup: `backups/KolorLab-BETA-0005.zip` (pre-update restore point)

## BETA-0004
- Persisted client cards, active client, and project specifications in local browser storage; only phone suffixes are stored.
- Added a print-ready project specification that can be printed or saved as PDF.
- Added four curated room palettes with wall, accent, ceiling, and wood colors.
- Added side-by-side comparison for up to four catalog swatches and palette combinations.
- Added application suitability filters and badges for interior, facade, and wood using each color's catalog metadata.
- Backup: `backups/KolorLab-BETA-0004.zip` (pre-update restore point)

## BETA-0003
- Removed photo upload controls and photo-based matching from the interface.
- Removed uploaded-room-photo recoloring; the built-in room visualizer remains available.
- Made catalog labels larger, bolder, and more prominent inside color swatch cards.
- Backup: `backups/KolorLab-BETA-0003.zip` (pre-update restore point)

## BETA-0002
- Added a press-and-hold menu on color swatches with four closest alternatives from distinct other catalogs.
- Added right-click and keyboard context-menu access to the same alternatives.
- Displayed each alternative's catalog and estimated CIE76 similarity; selecting one applies it to the visualizer.
- Backup: `backups/KolorLab-BETA-0002.zip` (pre-update restore point)

## BETA-0001
- Added interior photo upload to the room visualizer.
- Added wall-area selection and recoloring while preserving photo lighting and texture.
- Kept the photo color-matching tool independent.
- Backup: `backups/KolorLab-BETA-0001.zip`
