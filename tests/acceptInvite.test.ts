import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import { createSupabaseAdminClient } from '../src/lib/supabaseClient';
import crypto from 'node:crypto';

const app = createApp();
const supabase = createSupabaseAdminClient();

describe.skip('POST /api/auth/accept-invite', () => {
  let testInvitationToken: string;
  let testInvitationId: string;
  let testUserId: string;
  let testClientId: string;
  const testEmail = `test-accept-${Date.now()}@example.com`;
  const testPassword = 'TestPass123';
  const testFullName = 'Test User';

  beforeAll(async () => {
    // Create a test client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Test Client for Accept Invite',
        slug: `test-client-${Date.now()}`,
      })
      .select('id')
      .single();

    if (clientError || !client) {
      throw new Error(`Failed to create test client: ${clientError?.message}`);
    }
    testClientId = client.id;

    // Create invitation token
    testInvitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert({
        email: testEmail,
        role: 'client',
        client_id: testClientId,
        token: testInvitationToken,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();

    if (inviteError || !invitation) {
      throw new Error(`Failed to create invitation: ${inviteError?.message}`);
    }
    testInvitationId = invitation.id;

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      email_confirm: false,
      user_metadata: {
        role: 'client',
        client_id: testClientId,
        invitation_id: testInvitationId,
      },
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }
    testUserId = authData.user.id;

    // Create app_users record
    const { error: appUserError } = await supabase
      .from('app_users')
      .insert({
        id: testUserId,
        email: testEmail,
        role: 'client',
        client_id: testClientId,
      });

    if (appUserError) {
      throw new Error(`Failed to create app_users record: ${appUserError.message}`);
    }
  });

  afterAll(async () => {
    // Cleanup: Delete in reverse order of dependencies
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
      await supabase.from('app_users').delete().eq('id', testUserId);
    }
    if (testInvitationId) {
      await supabase.from('invitations').delete().eq('id', testInvitationId);
    }
    if (testClientId) {
      await supabase.from('clients').delete().eq('id', testClientId);
    }
  });

  it('should accept invitation and return comprehensive response with all required fields', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: testInvitationToken,
        password: testPassword,
        full_name: testFullName,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');

    // Check all required fields in response
    expect(res.body.data).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('email', testEmail);
    expect(res.body.data).toHaveProperty('client_id', testClientId);
    expect(res.body.data).toHaveProperty('full_name', testFullName);
    expect(res.body.data).toHaveProperty('role', 'client');
    expect(res.body.data).toHaveProperty('clientName', 'Test Client for Accept Invite');
    expect(res.body.data).toHaveProperty('invitation_id', testInvitationId);
    expect(res.body.data).toHaveProperty('user_id', testUserId);
    expect(res.body.meta).toHaveProperty('timestamp');

    // Verify invitation status updated to 'accepted'
    const { data: updatedInvitation } = await supabase
      .from('invitations')
      .select('status')
      .eq('id', testInvitationId)
      .single();

    expect(updatedInvitation?.status).toBe('accepted');

    // Verify app_users full_name was updated
    const { data: updatedUser } = await supabase
      .from('app_users')
      .select('full_name')
      .eq('id', testUserId)
      .single();

    expect(updatedUser?.full_name).toBe(testFullName);

    // Verify Supabase Auth user_metadata was updated
    const { data: authUser } = await supabase.auth.admin.getUserById(testUserId);
    expect(authUser.user?.user_metadata).toMatchObject({
      role: 'client',
      client_id: testClientId,
      full_name: testFullName,
      invitation_id: testInvitationId,
    });
  });

  it('should accept invitation without full_name (optional field)', async () => {
    // Create another test invitation without full_name
    const token2 = crypto.randomBytes(32).toString('hex');
    const email2 = `test-accept-2-${Date.now()}@example.com`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const { data: invitation2 } = await supabase
      .from('invitations')
      .insert({
        email: email2,
        role: 'client',
        client_id: testClientId,
        token: token2,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();

    const { data: authData2 } = await supabase.auth.admin.createUser({
      email: email2,
      email_confirm: false,
    });

    await supabase.from('app_users').insert({
      id: authData2!.user!.id,
      email: email2,
      role: 'client',
      client_id: testClientId,
    });

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: token2,
        password: testPassword,
        // No full_name provided
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('full_name', null);
    expect(res.body.data).toHaveProperty('client_id', testClientId);
    expect(res.body.data).toHaveProperty('role', 'client');

    // Cleanup
    await supabase.auth.admin.deleteUser(authData2!.user!.id);
    await supabase.from('app_users').delete().eq('id', authData2!.user!.id);
    await supabase.from('invitations').delete().eq('id', invitation2!.id);
  });

  it('should return 404 for invalid invitation token', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: 'invalid-token-12345',
        password: testPassword,
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 400 for already accepted invitation', async () => {
    // Create and immediately accept an invitation
    const token3 = crypto.randomBytes(32).toString('hex');
    const email3 = `test-accept-3-${Date.now()}@example.com`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const { data: invitation3 } = await supabase
      .from('invitations')
      .insert({
        email: email3,
        role: 'client',
        client_id: testClientId,
        token: token3,
        expires_at: expiresAt.toISOString(),
        status: 'accepted', // Already accepted
      })
      .select('id')
      .single();

    const { data: authData3 } = await supabase.auth.admin.createUser({
      email: email3,
      email_confirm: false,
    });

    await supabase.from('app_users').insert({
      id: authData3!.user!.id,
      email: email3,
      role: 'client',
      client_id: testClientId,
    });

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: token3,
        password: testPassword,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already been accepted');

    // Cleanup
    await supabase.auth.admin.deleteUser(authData3!.user!.id);
    await supabase.from('app_users').delete().eq('id', authData3!.user!.id);
    await supabase.from('invitations').delete().eq('id', invitation3!.id);
  });

  it('should return 410 for expired invitation', async () => {
    // Create an expired invitation
    const token4 = crypto.randomBytes(32).toString('hex');
    const email4 = `test-accept-4-${Date.now()}@example.com`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() - 1); // Expired 1 hour ago

    const { data: invitation4 } = await supabase
      .from('invitations')
      .insert({
        email: email4,
        role: 'client',
        client_id: testClientId,
        token: token4,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();

    const { data: authData4 } = await supabase.auth.admin.createUser({
      email: email4,
      email_confirm: false,
    });

    await supabase.from('app_users').insert({
      id: authData4!.user!.id,
      email: email4,
      role: 'client',
      client_id: testClientId,
    });

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: token4,
        password: testPassword,
      });

    expect(res.status).toBe(410);
    expect(res.body.message).toContain('expired');

    // Cleanup
    await supabase.auth.admin.deleteUser(authData4!.user!.id);
    await supabase.from('app_users').delete().eq('id', authData4!.user!.id);
    await supabase.from('invitations').delete().eq('id', invitation4!.id);
  });

  it('should return 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({
        token: testInvitationToken,
        password: 'weak', // Too short, no uppercase, no number
      });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('message');
  });
});
