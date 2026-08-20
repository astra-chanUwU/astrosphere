# Image full-size links design

## Goal

Let visitors open the original version of every site image without making image-heavy posts visually noisy or automatically downloading high-resolution files.

## Design

- Update the shared `MediaFrame` component.
- Render a small, descriptive `Open full size` link below every image.
- Open the original media URL in a new tab with safe external-link attributes.
- Keep the existing image, caption, credit, audio, video, iframe, and embed behavior unchanged.
- Do not add a separate download control; the opened image can be saved with normal browser controls.

## Acceptance criteria

- Every `MediaFrame` image has an accessible full-size link.
- The link points to the image’s original `src` and opens in a separate tab.
- Non-image media does not receive the link.
- The site builds and tests successfully.
