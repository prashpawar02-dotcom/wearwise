# Marketing image assets

Drop the following **public marketing** images here (they are NOT wardrobe
photos — user wardrobe photos always stay in the private Supabase `wardrobe`
bucket behind signed URLs, never in `/public`).

| Filename | Used by | Suggested content |
|---|---|---|
| `hero-outfit-flatlay.jpg` | landing hero / Best-Pick preview | A clean outfit flatlay on a neutral backdrop |
| `wardrobe-shelf.jpg` | landing "promise" panel | Folded clothes on a shelf, warm light |
| `outfit-women-smartcasual.jpg` | sample outfit (smart casual) | Women's smart-casual flatlay |
| `outfit-cold-layered.jpg` | sample outfit (layered / cold) | Knit + scarf + boots flatlay |
| `outfit-rainy-day.jpg` | sample outfit (rainy) | Trench + boots + umbrella flatlay |

Recommended: JPG, ~1200px on the long edge, optimised (<300 KB each).

Until these files exist, the UI renders a tasteful vector/gradient placeholder
(the signature Outfit Stack and garment tiles), so nothing appears broken.
Once you add the files, the components that accept an optional `image` prop will
use them automatically.
