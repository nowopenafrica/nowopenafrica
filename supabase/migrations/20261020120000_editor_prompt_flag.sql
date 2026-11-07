/*
  # Editor instruction bar — operator switch

  The Studio canvas now carries an instruction bar: type "make the headline
  bigger" or "create a matching Story version" and the document changes. It
  is a parser, not a model — it runs entirely in the browser, calls no
  provider and no endpoint, and costs nothing per use.

  It is seeded ON for that reason. The kill-switch table's rule is that
  everything defaults on EXCEPT what spends money or reaches a customer, and
  this does neither. The switch exists so an operator can withdraw the
  surface if it confuses people, not because using it is expensive.

  Turning it off removes the bar. It removes no capability: every operation
  it performs is also available from the editor's own panels, and existing
  designs are untouched.

  `DO NOTHING` on conflict so a re-run never flips a live toggle back.

  Re-runnable.
*/

INSERT INTO public.feature_flags (key, label, description, enabled, default_when_unreachable) VALUES
  ('editor_prompt', 'Editor instruction bar',
   'The type-an-instruction bar under the Studio canvas. Browser-side parser; no model, no cost.',
   true, true)
ON CONFLICT (key) DO NOTHING;
