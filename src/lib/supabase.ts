import { createClient } from '@supabase/supabase-js';

// Во фронтенде используется ТОЛЬКО публичный (publishable) ключ.
// Он безопасен: что можно делать с этим ключом, решают RLS-политики в базе.
// Секретный ключ (secret / service_role) сюда попадать не должен никогда.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  // Вход только по паролю, без ссылок-приглашений и OAuth: разбирать адрес страницы не нужно.
  { auth: { detectSessionInUrl: false } },
);
