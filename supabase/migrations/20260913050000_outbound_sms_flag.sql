/*
  # Outbound SMS flag

  The outbound_email and outbound_whatsapp flags shipped with the kill-switch
  table, and ClaimReach's dry run reads them to report which channels are
  configured. SMS was never given one, so there was no operator control for it
  and the console reported "No sms provider is configured" from a literal empty
  map rather than from configuration.

  Outbound SMS spends money and reaches a customer, so it is inserted
  explicitly switched OFF — the table's column default is `true`, so a bare
  INSERT would report SMS as configured the moment this migration runs, which
  is the opposite of the truth. `DO NOTHING` on conflict means a re-run never
  flips the operator's live toggle; the seed guarantees presence, operators
  own the switch afterwards.

  Re-runnable.
*/

INSERT INTO public.feature_flags (key, label, description, enabled, default_when_unreachable) VALUES
  ('outbound_sms', 'Outbound SMS', 'Automation SMS messages.', false, false)
ON CONFLICT (key) DO NOTHING;