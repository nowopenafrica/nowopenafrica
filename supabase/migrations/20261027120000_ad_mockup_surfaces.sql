/*
  # Where the advertising surface sits inside a placement's own photograph

  The preview studio can already put artwork onto a quadrilateral in true
  perspective. What it could not do was use a REAL site photograph, because
  nothing in the database says where the board is inside the picture — and
  guessing would show a business their artwork on the wrong wall.

  `public.advertisements` carries an `image_url` for all 97 rows. This table
  adds the one missing fact: four corners, placed by a person looking at the
  photograph.

  ## Why four numbers and not a cropped image

  A crop is a rectangle, and a billboard photographed from the pavement is
  not one — its far edge is shorter than its near one. The four corners are
  what the homography in `src/lib/promote/surface.ts` solves from, so a
  surface configured here renders through exactly the same code as the drawn
  scenes. No second renderer, and no chance of the two disagreeing.

  ## Why fractions

  Stored as 0..1 of the image's own width and height, so the same record is
  correct for a thumbnail, a retina screen and a full-bleed preview. The
  drawn scenes already use this shape (`Quad`), which is why the studio can
  take either without caring which it got.

  ## Why a status

  A half-dragged surface is worse than none: it would put somebody's advert
  across a lamppost and look deliberate. Nothing is public until a person
  publishes it, and `is_staff()` is the only thing that can.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.ad_mockup_surfaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /** The placement this describes. One surface per advert, for now. */
  advert_id     uuid NOT NULL UNIQUE
                REFERENCES public.advertisements(id) ON DELETE CASCADE,

  /*
    The photograph the corners were placed against.

    Copied from the advert rather than read through it, because a surface is
    only correct for the image it was drawn on: if somebody replaces the
    advert's photo, the corners are stale and this records which picture
    they actually belong to.
  */
  image_url     text NOT NULL,

  /* Clockwise from top-left, as fractions of the image. */
  tl_x numeric NOT NULL CHECK (tl_x >= 0 AND tl_x <= 1),
  tl_y numeric NOT NULL CHECK (tl_y >= 0 AND tl_y <= 1),
  tr_x numeric NOT NULL CHECK (tr_x >= 0 AND tr_x <= 1),
  tr_y numeric NOT NULL CHECK (tr_y >= 0 AND tr_y <= 1),
  br_x numeric NOT NULL CHECK (br_x >= 0 AND br_x <= 1),
  br_y numeric NOT NULL CHECK (br_y >= 0 AND br_y <= 1),
  bl_x numeric NOT NULL CHECK (bl_x >= 0 AND bl_x <= 1),
  bl_y numeric NOT NULL CHECK (bl_y >= 0 AND bl_y <= 1),

  /** Anything the next person needs to know — "left face only", "crop at dusk". */
  note          text,

  /*
    Draft until a person says otherwise. A surface that is nearly right is
    not a surface, and the public preview must never show one.
  */
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published')),

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ad_mockup_surfaces IS
  'Four corners, as fractions of a placement photograph, marking where its advertising surface is. Solved into a homography by src/lib/promote/surface.ts — the same code the drawn scenes use.';

CREATE INDEX IF NOT EXISTS idx_ad_mockup_surfaces_published
  ON public.ad_mockup_surfaces (advert_id)
  WHERE status = 'published';

ALTER TABLE public.ad_mockup_surfaces ENABLE ROW LEVEL SECURITY;

/*
  A published surface is part of a public listing, so it is public. A draft
  is staff-only, because it is somebody mid-way through dragging corners.
*/
DROP POLICY IF EXISTS "Anyone can view published surfaces" ON public.ad_mockup_surfaces;
CREATE POLICY "Anyone can view published surfaces"
  ON public.ad_mockup_surfaces FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Staff view every surface" ON public.ad_mockup_surfaces;
CREATE POLICY "Staff view every surface"
  ON public.ad_mockup_surfaces FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "Staff manage surfaces" ON public.ad_mockup_surfaces;
CREATE POLICY "Staff manage surfaces"
  ON public.ad_mockup_surfaces FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());
