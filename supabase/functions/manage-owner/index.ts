import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization)
    return respond({ error: 'Unauthorized' }, 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return respond({ error: 'Unauthorized' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller } = await admin
    .from('profiles')
    .select('role,account_status')
    .eq('id', userData.user.id)
    .single();
  if (caller?.role !== 'emergency_admin' || caller.account_status !== 'active') {
    return respond({ error: 'Emergency Administrator access required' }, 403);
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? '');

    if (action === 'provision') {
      const username = String(body.username ?? '')
        .trim()
        .toLowerCase();
      const temporaryPassword = String(body.temporaryPassword ?? '');
      const ownerName = String(body.ownerName ?? '').trim();
      const flatId = body.role === 'emergency_admin' ? null : String(body.flatId ?? '');
      const role = body.role === 'emergency_admin' ? 'emergency_admin' : 'owner';
      if (
        !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(username) ||
        temporaryPassword.length < 12 ||
        !ownerName
      ) {
        return respond({ error: 'Invalid account details' }, 400);
      }
      const email = `${username}@owners.mukunda-enclave.invalid`;
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { username },
      });
      if (error || !created.user) throw error ?? new Error('Account creation failed');
      const { error: profileError } = await admin.from('profiles').insert({
        id: created.user.id,
        username,
        flat_id: flatId,
        owner_name: ownerName,
        role,
        account_status: 'active',
        must_change_password: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      await admin.from('audit_logs').insert({
        user_id: userData.user.id,
        action: 'account.provisioned',
        entity_type: 'profile',
        entity_id: created.user.id,
        new_values: { username, flat_id: flatId, role },
      });
      return respond({ id: created.user.id, username });
    }

    if (action === 'reset-password') {
      const profileId = String(body.profileId ?? '');
      const temporaryPassword = String(body.temporaryPassword ?? '');
      if (!profileId || temporaryPassword.length < 12)
        return respond({ error: 'Invalid reset request' }, 400);
      const { error } = await admin.auth.admin.updateUserById(profileId, {
        password: temporaryPassword,
      });
      if (error) throw error;
      await admin.from('profiles').update({ must_change_password: true }).eq('id', profileId);
      await admin.from('audit_logs').insert({
        user_id: userData.user.id,
        action: 'password.reset',
        entity_type: 'profile',
        entity_id: profileId,
        reason: String(body.reason ?? 'Emergency administrator reset'),
      });
      return respond({ reset: true });
    }

    if (action === 'set-status') {
      const profileId = String(body.profileId ?? '');
      const accountStatus = body.accountStatus === 'active' ? 'active' : 'inactive';
      if (!profileId || profileId === userData.user.id)
        return respond({ error: 'Invalid status change' }, 400);
      const { error } = await admin
        .from('profiles')
        .update({ account_status: accountStatus })
        .eq('id', profileId);
      if (error) throw error;
      await admin.from('audit_logs').insert({
        user_id: userData.user.id,
        action: `account.${accountStatus}`,
        entity_type: 'profile',
        entity_id: profileId,
        reason: String(body.reason ?? ''),
      });
      return respond({ accountStatus });
    }

    return respond({ error: 'Unsupported action' }, 400);
  } catch {
    return respond({ error: 'The account operation could not be completed' }, 400);
  }
});
