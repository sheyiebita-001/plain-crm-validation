'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function sendMagicLink(formData: FormData) {
  const email = formData.get('email');

  if (typeof email === 'string' && email.includes('@')) {
    const supabase = createClient();
    const origin =
      headers().get('origin') ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      'http://localhost:3000';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error('Magic link send failed', { email, message: error.message });
    }
  }

  redirect('/login?sent=1');
}
