/*
  # Capture phone number at signup

  users.phone already existed (editable from the Profile page) but was never
  populated at signup time. The registration form now collects it and passes
  it through Supabase Auth's signUp `options.data`, so this just teaches the
  existing handle_new_user() trigger to copy it into the profile row like it
  already does for `role`.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'business'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
