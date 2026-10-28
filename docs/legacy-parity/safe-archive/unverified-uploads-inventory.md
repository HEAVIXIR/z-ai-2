# Unverified image upload inventory

- **Source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Classification:** UNVERIFIED_UPLOAD / SAFE_ARCHIVE
- **Policy:** No image bytes are copied into this repository by this record.

| Legacy path | Approximate size | Reported provenance | Disposition |
|---|---:|---|---|
| `upload/IMG_20260921_134636_188.jpg` | 46.1 KB | Camera JPG; used as source for legacy logo-processing scripts | Hold outside Git |
| `upload/IMG_20260921_134636_634.jpg` | 33.5 KB | Reported source for Mekanix logo | Hold outside Git |
| `upload/IMG_20260921_134636_663.jpg` | 24.5 KB | Reported alternate source for Mekanix logo | Hold outside Git |
| `upload/IMG_20260921_134636_703.jpg` | 23.3 KB | Provenance unclear | Hold outside Git |
| `upload/IMG_20260921_134636_839.jpg` | 12.4 KB | Reported source for Heavix logo | Hold outside Git |

The historical audit proposed recording SHA-256 and image dimensions from read-only metadata. This PR does not assert those values because they were not independently revalidated against the pinned archive during this change. Do not infer authenticity, ownership, licensing, or suitability from filenames or the prior script references.

Before any image is promoted to a production asset, establish provenance/licensing, review its content, generate a derivative through a reviewed reproducible process, and add the result in a separate focused PR.
