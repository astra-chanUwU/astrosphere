# Mephisto Art Essay Design

## Goal

Add Eduard von Grützner's *Mephisto* (1895) as a fuller historical essay in the Art sphere, with a five-image Faust/Mephisto gallery that can be expanded later.

## Content shape

The entry will be a published `essay` artifact using the existing `feature` layout. Grützner's painting will be the hero image and the four supplied companion images will be listed in `media`:

- Eduard von Grützner, *Mephisto* (1895)
- Ary Scheffer, *Faust and Marguerite*
- Max Klinger, a Faust-related print from *Intermezzi*
- Harry Clarke, an illustration for Goethe's *Faust*
- Eugène Delacroix, *Faust and Mephistopheles Flying over the Landscape*

The essay will move from Grützner's nineteenth-century Munich context and recurring interest in theatrical, literary, and comic subjects into a close reading of the red costume, feathered cap, direct gaze, forward lean, and sword. It will connect the image to Goethe's *Faust* without treating it as a literal book illustration, then use the companion gallery to show how Mephisto changes across painting, print, and illustration.

## Files and naming

Copy the five user-supplied files into `public/media/art/mephisto/` using these normalized names:

- `eduard-von-grutzner-mephisto-1895.png`
- `ary-scheffer-faust-and-marguerite.jpeg`
- `max-klinger-intermezzi-faust-print.jpg`
- `harry-clarke-goethes-faust-illustration.jpg`
- `eugene-delacroix-faust-and-mephistopheles-flying.jpg`

Create `src/content/artifacts/essays/mephisto-eduard-von-grutzner-1895.md` with root-relative media paths, descriptive alt text, credits identifying the supplied images, and the `art` sphere.

## Metadata

Use tags for `eduard-von-grutzner`, `mephisto`, `mephistopheles`, `faust`, `goethe`, `german-art`, and `nineteenth-century`. The entry will use the supplied title and image date, with Grützner as author. Where an exact collection or provenance is not established from the supplied files, credits and notes will avoid inventing one.

## Future expansion

No new collection type or route is needed. Additional Mephisto images can be appended to the artifact's `media` array or become related artifacts later if they warrant independent essays.

## Verification

Run the repository's content/build checks, including the publishing guard, and inspect the generated artifact route to confirm that all five media assets resolve and the gallery remains usable on narrow screens.
