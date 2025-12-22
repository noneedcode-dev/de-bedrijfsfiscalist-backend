// src/services/invitationService.ts
import crypto from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../config/logger';
import { emailService } from '../lib/emailService';
import { AppError } from '../middleware/errorHandler';
import { DbAppUser, DbInvitation } from '../types/database';
import { env } from '../config/env';

export interface InviteUserParams {
  email: string;
  role: 'admin' | 'client';
  client_id?: string | null;
  full_name?: string | null;
  invited_by?: string;
  clientName?: string;
}

export interface InviteUserResult {
  user: DbAppUser;
  invitation: DbInvitation;
}

/**
 * Shared invitation service
 * Standardizes user invitation flow across all endpoints
 */
export class InvitationService {
  /**
   * Invite a new user with standardized flow
   * - Creates invitation record with token
   * - Creates Supabase Auth user (without sending Supabase email)
   * - Creates app_users record
   * - Sends custom invitation email
   */
  async inviteUser(
    supabase: SupabaseClient,
    params: InviteUserParams
  ): Promise<InviteUserResult> {
    const { email, role, client_id, full_name, invited_by, clientName } = params;

    // 1. Check if email already exists
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new AppError('Bu email adresi zaten kayıtlı', 400);
    }

    // 2. Generate invitation token (72 hours validity)
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // 3. Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert({
        email,
        role,
        client_id: role === 'client' ? client_id : null,
        invited_by: invited_by || null,
        token: inviteToken,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('*')
      .single();

    if (inviteError || !invitation) {
      throw new AppError(
        `Davetiye oluşturulamadı: ${inviteError?.message ?? 'Bilinmeyen hata'}`,
        500
      );
    }

    // 4. Create Supabase Auth user (without sending Supabase email)
    // We use createUser instead of inviteUserByEmail to avoid duplicate emails
    // User will be created in "invited" state and must set password via our custom flow
    const acceptUrl = `${env.frontendUrl}/accept-invite?token=${inviteToken}`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false, // User must confirm via our invitation flow
      user_metadata: {
        role,
        client_id: role === 'client' ? client_id : null,
        full_name: full_name ?? null,
        invitation_id: invitation.id,
      },
    });

    if (authError || !authData.user) {
      // Rollback: Delete invitation record
      await supabase.from('invitations').delete().eq('id', invitation.id);
      throw new AppError(
        `Supabase Auth kullanıcı oluşturulamadı: ${authError?.message}`,
        500
      );
    }

    // 5. Create app_users record
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .insert({
        id: authData.user.id, // Use Supabase Auth ID
        email,
        role,
        client_id: role === 'client' ? client_id : null,
        full_name: full_name ?? null,
      })
      .select('*')
      .single();

    if (userError || !userData) {
      // Rollback: Delete Auth user and invitation
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase.from('invitations').delete().eq('id', invitation.id);
      throw new AppError(
        `Kullanıcı kaydı oluşturulamadı: ${userError?.message ?? 'Bilinmeyen hata'}`,
        500
      );
    }

    // 6. Send custom invitation email (single source of truth)
    try {
      await emailService.sendInvitation({
        to: email,
        invitedBy: invited_by ? await this.getInviterName(supabase, invited_by) : 'Admin',
        clientName,
        acceptUrl,
        expiresInHours: 72,
      });
    } catch (emailError) {
      logger.error('Failed to send invitation email', { error: emailError, email });
      // Don't fail the request if email fails - user is already created
    }

    logger.info('User invited successfully', {
      userId: authData.user.id,
      email,
      role,
      invitationId: invitation.id,
    });

    return {
      user: userData as DbAppUser,
      invitation: invitation as DbInvitation,
    };
  }

  /**
   * Get inviter's full name for email
   */
  private async getInviterName(supabase: SupabaseClient, inviterId: string): Promise<string> {
    const { data } = await supabase
      .from('app_users')
      .select('full_name')
      .eq('id', inviterId)
      .single();
    
    return data?.full_name || 'Admin';
  }
}

// Export singleton instance
export const invitationService = new InvitationService();
